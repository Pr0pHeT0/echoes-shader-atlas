import * as THREE from "three/webgpu";
import {
  abs,
  dot,
  exp,
  floor,
  fract,
  length,
  max,
  mix,
  sRGBTransferEOTF,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import { AURORA_UNIFORM_DEFAULTS, EFFECT_PRESETS } from "../runtime-config";
import { clampDpr, makeShowcaseScene, syntheticAudio } from "../runtime-utils";
import type { EffectFrame, EffectInstance, EffectRuntimeContext } from "../types";

const PRESETS = EFFECT_PRESETS["aurora-field"];

type FloatNode = THREE.Node<"float">;
type Vec2Node = THREE.Node<"vec2">;

interface AuroraNodes {
  time: FloatNode;
  resolution: Vec2Node;
  verticalOffset: FloatNode;
  audioStrength: FloatNode;
  gameplayMix: FloatNode;
}

function hash21(point: Vec2Node): FloatNode {
  const fractional = fract(point.mul(vec2(123.34, 456.21)));
  const shifted = fractional.add(dot(fractional, fractional.add(45.32)));
  return fract(shifted.x.mul(shifted.y));
}

function valueNoise(point: Vec2Node): FloatNode {
  const cell = floor(point);
  const fractional = fract(point);
  const local = fractional.mul(fractional).mul(vec2(3).sub(fractional.mul(2)));
  const a = hash21(cell);
  const b = hash21(cell.add(vec2(1, 0)));
  const c = hash21(cell.add(vec2(0, 1)));
  const d = hash21(cell.add(vec2(1, 1)));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

function fbm(initialPoint: Vec2Node): FloatNode {
  let point = initialPoint;
  let value = valueNoise(point).mul(0.5);
  let amplitude = 0.25;

  for (let octave = 1; octave < 5; octave += 1) {
    point = point.mul(2.03).add(vec2(17.1, 9.2));
    value = value.add(valueNoise(point).mul(amplitude));
    amplitude *= 0.5;
  }

  return value;
}

function auroraBand(
  point: Vec2Node,
  time: FloatNode,
  offset: number,
  frequency: number,
  width: number,
): FloatNode {
  const distortion = fbm(vec2(point.x.mul(0.7).add(offset), time.mul(0.055).add(offset))).sub(0.5);
  const wave = sin(point.x.mul(frequency).add(time.mul(0.22)).add(offset * 4))
    .mul(0.11)
    .add(sin(point.x.mul(frequency * 0.43).sub(time.mul(0.14))).mul(0.07));
  const center = wave.add(offset).add(distortion.mul(0.26));
  const band = exp(abs(point.y.sub(center)).negate().div(width));
  const filaments = sin(point.x.mul(23).add(distortion.mul(11)).sub(time.mul(0.7))).mul(0.5).add(0.5);
  return band.mul(mix(0.58, 1, filaments));
}

function auroraFragment(nodes: AuroraNodes): THREE.Node<"vec4"> {
  const texCoord = uv();
  const aspect = nodes.resolution.x.div(max(nodes.resolution.y, 1));
  const centered = texCoord.sub(0.5);
  const point = vec2(centered.x.mul(aspect), centered.y);
  const auroraPoint = vec2(point.x, point.y.sub(nodes.verticalOffset));
  const upperMask = smoothstep(-0.52, -0.02, auroraPoint.y).mul(
    smoothstep(0.36, 0.58, auroraPoint.y).oneMinus(),
  );
  const cyanBand = auroraBand(auroraPoint, nodes.time, 0.11, 2.25, 0.095).mul(upperMask);
  const violetBand = auroraBand(auroraPoint, nodes.time.mul(0.88), 0.22, 1.72, 0.12).mul(upperMask);
  const deepBand = auroraBand(auroraPoint, nodes.time.mul(0.72), -0.02, 2.9, 0.075).mul(upperMask);
  const gameplayStrength = mix(1, nodes.audioStrength.mul(2.35).add(0.18), nodes.gameplayMix);

  let color: THREE.Node<"vec3"> = vec3(0.003, 0.006, 0.014);
  color = color.add(vec3(0.04, 0.65, 0.82).mul(cyanBand).mul(0.25).mul(gameplayStrength));
  color = color.add(vec3(0.33, 0.16, 0.72).mul(violetBand).mul(0.28).mul(gameplayStrength));
  color = color.add(vec3(0.04, 0.24, 0.42).mul(deepBand).mul(0.19).mul(gameplayStrength));

  const titlePoint = point.mul(vec2(0.62, 1.7));
  const titleGlow = exp(dot(titlePoint, titlePoint).mul(-3.2));
  color = color.add(vec3(0.025, 0.09, 0.16).mul(titleGlow));

  const vignette = smoothstep(0.18, 0.92, length(point.mul(vec2(0.72, 1)))).oneMinus();
  color = color.mul(vignette.mul(0.64).add(0.36));
  color = color.mul(mix(1, nodes.audioStrength.mul(1.25).add(0.62), nodes.gameplayMix));
  const gameplayTopFade = smoothstep(0.76, 0.84, texCoord.y);
  color = color.mul(mix(1, gameplayTopFade, nodes.gameplayMix));

  // The archived GLSL material wrote these numeric colors directly to the
  // sRGB canvas. Node materials render in the working color space before the
  // renderer's output transform, so decode once here to preserve that look.
  return vec4(sRGBTransferEOTF(color) as THREE.Node<"vec3">, 1);
}

class AuroraFieldRuntime implements EffectInstance {
  readonly id = "aurora-field" as const;
  readonly presets = PRESETS;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly time = uniform(AURORA_UNIFORM_DEFAULTS.uTime);
  private readonly resolution = uniform(new THREE.Vector2(1, 1));
  private readonly verticalOffset = uniform(AURORA_UNIFORM_DEFAULTS.uVerticalOffset);
  private readonly audioStrength = uniform(AURORA_UNIFORM_DEFAULTS.uAudioStrength);
  private readonly gameplayMix = uniform(AURORA_UNIFORM_DEFAULTS.uGameplayMix);
  private readonly material: THREE.MeshBasicNodeMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly reducedMotion: boolean;
  private audioGain = 0.7;
  private distance = 8;

  constructor(context: EffectRuntimeContext) {
    ({ scene: this.scene, camera: this.camera } = makeShowcaseScene(context.width, context.height));
    this.reducedMotion = context.reducedMotion;
    this.resolution.value.set(context.width, context.height);
    this.material = new THREE.MeshBasicNodeMaterial({
      depthTest: false,
      depthWrite: false,
    });
    this.material.fragmentNode = auroraFragment({
      time: this.time,
      resolution: this.resolution,
      verticalOffset: this.verticalOffset,
      audioStrength: this.audioStrength,
      gameplayMix: this.gameplayMix,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.z = -this.distance;
    this.mesh.renderOrder = -20;
    this.camera.add(this.mesh);
    this.resize(context.width, context.height, context.dpr);
    this.setPreset("quiet-drift");
  }

  update(frame: EffectFrame): void {
    const audio = syntheticAudio(frame.elapsed, frame.audio);
    this.time.value = this.reducedMotion ? 0 : frame.elapsed;
    const voiceStrength = audio.level * 0.72 + audio.mid * 0.18 + audio.treble * 0.1;
    this.audioStrength.value = THREE.MathUtils.clamp(voiceStrength * this.audioGain, 0, 1);
  }

  resize(width: number, height: number, dpr: number): void {
    clampDpr(dpr);
    const safeHeight = Math.max(1, height);
    const aspect = Math.max(1, width) / safeHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * this.distance;
    this.mesh.scale.set(frustumHeight * aspect, frustumHeight, 1);
    this.resolution.value.set(Math.max(1, width), safeHeight);
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    if (preset === "voice-lit") {
      this.verticalOffset.value = 0.02;
      this.gameplayMix.value = 1;
      this.audioGain = 1;
    } else if (preset === "midnight") {
      this.verticalOffset.value = 0.16;
      this.gameplayMix.value = 0;
      this.audioGain = 0.18;
    } else {
      this.verticalOffset.value = 0;
      this.gameplayMix.value = 0;
      this.audioGain = 0.7;
    }
  }

  dispose(): void {
    this.camera.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}

export function create(context: EffectRuntimeContext): EffectInstance {
  return new AuroraFieldRuntime(context);
}

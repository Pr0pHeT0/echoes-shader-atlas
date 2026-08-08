import * as THREE from "three/webgpu";
import {
  clamp,
  floor,
  fract,
  length,
  mix,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import { EFFECT_PRESETS, VOICE_UNIFORM_DEFAULTS } from "../runtime-config";
import { clampDpr, makeShowcaseScene, syntheticAudio } from "../runtime-utils";
import type { EffectFrame, EffectInstance, EffectRuntimeContext } from "../types";

const PRESETS = EFFECT_PRESETS["voice-wave-particles"];
const DISTANCE = 5;

type FloatNode = THREE.Node<"float">;
type Vec2Node = THREE.Node<"vec2">;

interface VoiceNodes {
  time: FloatNode;
  level: FloatNode;
  bass: FloatNode;
  mid: FloatNode;
  treble: FloatNode;
  enabled: FloatNode;
  opacity: FloatNode;
  waveStrength: FloatNode;
  particleStrength: FloatNode;
  bassStrength: FloatNode;
  midStrength: FloatNode;
  trebleStrength: FloatNode;
}

function hash21(point: Vec2Node): FloatNode {
  const fractional = fract(point.mul(vec2(123.34, 456.21)));
  const shifted = fractional.add(fractional.dot(fractional.add(45.32)));
  return fract(shifted.x.mul(shifted.y));
}

function waveY(
  x: FloatNode,
  offset: number,
  frequency: number,
  speed: number,
  amplitude: number,
  nodes: VoiceNodes,
): FloatNode {
  const bass = nodes.bass.mul(nodes.bassStrength);
  const mid = nodes.mid.mul(nodes.midStrength);
  const treble = nodes.treble.mul(nodes.trebleStrength);
  const voice = nodes.level.mul(0.6).add(mid.mul(0.5)).add(treble.mul(0.4));
  const primary = sin(x.mul(frequency).add(nodes.time.mul(speed)))
    .mul(amplitude)
    .mul(voice.mul(1.5).add(0.35))
    .mul(nodes.waveStrength);
  const secondary = sin(x.mul(frequency * 0.43).sub(nodes.time.mul(speed * 1.7)))
    .mul(amplitude * 0.48)
    .mul(bass.mul(1.5).add(0.2))
    .mul(nodes.waveStrength);
  return primary.add(secondary).add(offset);
}

function waveParticleLayer(
  texCoord: Vec2Node,
  offset: number,
  frequency: number,
  speed: number,
  amplitude: number,
  density: number,
  seedOffset: number,
  nodes: VoiceNodes,
): FloatNode {
  const column = floor(texCoord.x.mul(density));
  const seed = hash21(vec2(column, floor(seedOffset)));
  const x = column.add(0.5).add(seed.sub(0.5).mul(0.76)).div(density);
  const y = waveY(x, offset, frequency, speed, amplitude, nodes).add(
    seed.sub(0.5).mul(nodes.level.mul(0.15).add(0.05)),
  );
  const particleOffset = texCoord.sub(vec2(x, y)).mul(vec2(density * 0.16, 9));
  const particleUv = vec2(
    particleOffset.x.add(sin(nodes.time.mul(seed.mul(1.5).add(0.8)).add(seed.mul(6.2831))).mul(0.08)),
    particleOffset.y,
  );
  const treble = nodes.treble.mul(nodes.trebleStrength);
  const radius = seed.mul(0.01).add(treble.mul(0.016)).add(0.026);
  const dotShape = smoothstep(radius, radius.add(0.018), length(particleUv)).oneMinus();
  const gate = smoothstep(0.22, 0.94, seed.add(nodes.level.mul(0.5)).add(treble.mul(0.28)));
  return dotShape.mul(gate).mul(nodes.particleStrength);
}

function waveParticleField(texCoord: Vec2Node, nodes: VoiceNodes): FloatNode {
  const lowParticles = waveParticleLayer(texCoord, 0.12, 13, 1.6, 0.09, 210, 1, nodes);
  const midParticles = waveParticleLayer(texCoord, 0.17, 19, -1.15, 0.065, 236, 2, nodes);
  const highParticles = waveParticleLayer(texCoord, 0.22, 31, 2.4, 0.04, 268, 3, nodes);
  return lowParticles.add(midParticles.mul(0.9)).add(highParticles.mul(0.72));
}

function voiceFragment(nodes: VoiceNodes): THREE.Node<"vec4"> {
  const texCoord = uv();
  const bottomFade = smoothstep(0, 0.18, texCoord.y);
  const topFade = smoothstep(0.78, 1, texCoord.y).oneMinus();
  const edgeFade = smoothstep(0, 0.06, texCoord.x).mul(smoothstep(0.94, 1, texCoord.x).oneMinus());
  const fade = bottomFade.mul(topFade).mul(edgeFade);
  const bass = nodes.bass.mul(nodes.bassStrength);
  const mid = nodes.mid.mul(nodes.midStrength);
  const treble = nodes.treble.mul(nodes.trebleStrength);
  const particles = waveParticleField(texCoord, nodes).mul(
    nodes.level.mul(0.9).add(treble.mul(0.7)).add(0.35),
  );

  const deepInk = vec3(0.02, 0.09, 0.11);
  const cyan = vec3(0.18, 0.95, 1);
  const pearl = vec3(0.9, 0.98, 0.92);
  const amber = vec3(1, 0.62, 0.18);
  let color = deepInk.mul(bass.mul(0.18).add(0.1));
  color = color.add(mix(cyan, pearl, texCoord.y).mul(particles).mul(mid.mul(0.34).add(0.62)));
  color = color.add(amber.mul(particles).mul(treble).mul(0.35));

  const alpha = clamp(
    particles.mul(0.82).mul(fade).mul(nodes.opacity).mul(nodes.enabled),
    0,
    0.95,
  );
  return vec4(color, alpha);
}

class VoiceWaveRuntime implements EffectInstance {
  readonly id = "voice-wave-particles" as const;
  readonly presets = PRESETS;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly geometry = new THREE.PlaneGeometry(1, 1, 160, 20);
  private readonly time = uniform(VOICE_UNIFORM_DEFAULTS.uTime);
  private readonly level = uniform(VOICE_UNIFORM_DEFAULTS.uLevel);
  private readonly bass = uniform(VOICE_UNIFORM_DEFAULTS.uBass);
  private readonly mid = uniform(VOICE_UNIFORM_DEFAULTS.uMid);
  private readonly treble = uniform(VOICE_UNIFORM_DEFAULTS.uTreble);
  private readonly enabled = uniform(VOICE_UNIFORM_DEFAULTS.uEnabled);
  private readonly opacity = uniform(VOICE_UNIFORM_DEFAULTS.uOpacity);
  private readonly waveStrength = uniform(VOICE_UNIFORM_DEFAULTS.uWaveStrength);
  private readonly particleStrength = uniform(VOICE_UNIFORM_DEFAULTS.uParticleStrength);
  private readonly bassStrength = uniform(VOICE_UNIFORM_DEFAULTS.uBassStrength);
  private readonly midStrength = uniform(VOICE_UNIFORM_DEFAULTS.uMidStrength);
  private readonly trebleStrength = uniform(VOICE_UNIFORM_DEFAULTS.uTrebleStrength);
  private readonly resolution = uniform(new THREE.Vector2(1, 1));
  private readonly material: THREE.MeshBasicNodeMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly reducedMotion: boolean;
  private heightRatio = 0.32;

  constructor(context: EffectRuntimeContext) {
    ({ scene: this.scene, camera: this.camera } = makeShowcaseScene(context.width, context.height));
    this.reducedMotion = context.reducedMotion;
    this.resolution.value.set(context.width, context.height);
    this.material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.material.fragmentNode = voiceFragment({
      time: this.time,
      level: this.level,
      bass: this.bass,
      mid: this.mid,
      treble: this.treble,
      enabled: this.enabled,
      opacity: this.opacity,
      waveStrength: this.waveStrength,
      particleStrength: this.particleStrength,
      bassStrength: this.bassStrength,
      midStrength: this.midStrength,
      trebleStrength: this.trebleStrength,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 20;
    this.mesh.position.z = -DISTANCE;
    this.camera.add(this.mesh);
    this.setPreset("balanced");
    this.resize(context.width, context.height, context.dpr);
  }

  update(frame: EffectFrame): void {
    const audio = syntheticAudio(frame.elapsed, frame.audio);
    this.time.value = this.reducedMotion ? 0 : frame.elapsed;
    this.level.value = audio.level;
    this.bass.value = audio.bass;
    this.mid.value = audio.mid;
    this.treble.value = audio.treble;
  }

  resize(width: number, height: number, dpr: number): void {
    clampDpr(dpr);
    const safeHeight = Math.max(1, height);
    const aspect = Math.max(1, width) / safeHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * DISTANCE;
    const effectHeight = frustumHeight * this.heightRatio;
    this.mesh.scale.set(frustumHeight * aspect, effectHeight, 1);
    this.mesh.position.y = -frustumHeight * 0.5 + effectHeight * 0.52;
    this.resolution.value.set(Math.max(1, width), safeHeight);
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    this.opacity.value = 0.86;
    this.waveStrength.value = 1;
    this.particleStrength.value = 1;
    this.bassStrength.value = 1;
    this.midStrength.value = 1;
    this.trebleStrength.value = 1;
    this.heightRatio = 0.32;
    if (preset === "bass-current") {
      this.waveStrength.value = 1.22;
      this.bassStrength.value = 1.85;
      this.trebleStrength.value = 0.66;
      this.heightRatio = 0.38;
    } else if (preset === "treble-sparks") {
      this.opacity.value = 0.94;
      this.particleStrength.value = 1.32;
      this.bassStrength.value = 0.72;
      this.trebleStrength.value = 1.9;
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
  return new VoiceWaveRuntime(context);
}

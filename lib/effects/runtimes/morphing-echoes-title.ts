import * as THREE from "three";

import fragmentSource from "../../shaders/title/title-particles.frag.glsl?raw";
import vertexSource from "../../shaders/title/title-particles.vert.glsl?raw";
import { composeShader } from "../../shaders/compose";
import { loadFontFacesWithFallback } from "../font-loading";
import { seededValue } from "../geometry";
import { EFFECT_PRESETS, TITLE_UNIFORM_DEFAULTS } from "../runtime-config";
import { clampDpr, makeShowcaseScene, resolveParticleCount } from "../runtime-utils";
import type { EffectFrame, EffectInstance, EffectRuntimeContext } from "../types";

const PRESETS = EFFECT_PRESETS["morphing-echoes-title"];
const TEXT = "ECHOES";
const CANVAS_WIDTH = 1_600;
const CANVAS_HEIGHT = 320;
const WORLD_WIDTH = 7.6;
const FONT_HOLD_TIME = 12;
const FONT_MORPH_TIME = 2.4;
const FONT_VARIANT_COUNT = 5;

export const TITLE_FONT_FILES = [
  { family: "Echoes Oxanium", weight: 800, source: "/fonts/oxanium/Oxanium-Variable.ttf", descriptorWeight: "200 800" },
  { family: "Echoes Tektur", weight: 900, source: "/fonts/tektur/Tektur-Variable.ttf", descriptorWeight: "400 900" },
  { family: "Echoes Bruno Ace SC", weight: 400, source: "/fonts/bruno-ace-sc/BrunoAceSC-Regular.ttf", descriptorWeight: "400" },
  { family: "Echoes Chakra Petch", weight: 700, source: "/fonts/chakra-petch/ChakraPetch-Bold.ttf", descriptorWeight: "700" },
  { family: "Echoes Orbitron", weight: 900, source: "/fonts/orbitron/Orbitron-Variable.ttf", descriptorWeight: "400 900" },
] as const;

let fontLoadPromise: Promise<void> | undefined;

export function fontPhaseAt(elapsed: number): number {
  const stageDuration = FONT_HOLD_TIME + FONT_MORPH_TIME;
  const safeElapsed = Math.max(0, Number(elapsed) || 0);
  const absoluteStage = Math.floor(safeElapsed / stageDuration + 1e-9);
  const stage = absoluteStage % FONT_VARIANT_COUNT;
  const stageElapsed = Math.max(0, safeElapsed - absoluteStage * stageDuration);
  if (stageElapsed <= FONT_HOLD_TIME) return stage;
  return stage + Math.min(1, (stageElapsed - FONT_HOLD_TIME) / FONT_MORPH_TIME);
}

async function loadTitleFonts(): Promise<void> {
  if (!fontLoadPromise) {
    fontLoadPromise = loadFontFacesWithFallback(TITLE_FONT_FILES).then(() => undefined);
  }
  await fontLoadPromise;
}

interface TextParticleData {
  positions: Float32Array;
  targets: [Float32Array, Float32Array, Float32Array, Float32Array];
  seeds: Float32Array;
  layers: Float32Array;
  worldsMask: Float32Array;
  orbPositions: Float32Array;
  icosahedronPositions: Float32Array;
}

function sampleText(
  context: CanvasRenderingContext2D,
  definition: (typeof TITLE_FONT_FILES)[number],
  step: number,
): Float32Array {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  let fontSize = 238;
  context.font = `${definition.weight} ${fontSize}px "${definition.family}", sans-serif`;
  const maximumWidth = CANVAS_WIDTH - 180;
  const width = Math.max(1, context.measureText(TEXT).width);
  if (width > maximumWidth) fontSize *= maximumWidth / width;
  context.font = `${definition.weight} ${fontSize}px "${definition.family}", sans-serif`;
  context.fillText(TEXT, CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5);
  const pixels = context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
  const sampled: number[] = [];
  for (let y = 0; y < CANVAS_HEIGHT; y += step) {
    for (let x = 0; x < CANVAS_WIDTH; x += step) {
      if (pixels[(y * CANVAS_WIDTH + x) * 4 + 3] < 96) continue;
      sampled.push(x, y, 0);
    }
  }
  return new Float32Array(sampled);
}

function worldPoint(sample: Float32Array, sampleIndex: number, index: number, layer: number): [number, number, number] {
  const x = sample[sampleIndex * 3];
  const y = sample[sampleIndex * 3 + 1];
  const depth = (layer - 0.5) * 0.12 + (seededValue(index, 4) - 0.5) * 0.03;
  return [
    (x / CANVAS_WIDTH - 0.5) * WORLD_WIDTH + (seededValue(index, 2) - 0.5) * 0.018,
    (0.5 - y / CANVAS_HEIGHT) * (WORLD_WIDTH * CANVAS_HEIGHT / CANVAS_WIDTH)
      + (seededValue(index, 3) - 0.5) * 0.018,
    depth,
  ];
}

function createOrbPositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const progress = (index + 0.5) / count;
    const y = 1 - progress * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * goldenAngle;
    const shell = 0.82 + (seededValue(index, 9) - 0.5) * 0.09;
    positions[index * 3] = Math.cos(angle) * radiusAtY * shell;
    positions[index * 3 + 1] = y * shell;
    positions[index * 3 + 2] = Math.sin(angle) * radiusAtY * shell;
  }
  return positions;
}

function createIcosahedronPositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const indexed = new THREE.IcosahedronGeometry(0.86, 0);
  const geometry = indexed.index ? indexed.toNonIndexed() : indexed;
  const vertices = geometry.getAttribute("position");
  const faceCount = Math.floor(vertices.count / 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    const face = Math.min(faceCount - 1, Math.floor(seededValue(index, 12) * faceCount));
    a.fromBufferAttribute(vertices, face * 3);
    b.fromBufferAttribute(vertices, face * 3 + 1);
    c.fromBufferAttribute(vertices, face * 3 + 2);
    const root = Math.sqrt(seededValue(index, 13));
    const edge = seededValue(index, 14);
    const wa = 1 - root;
    const wb = root * (1 - edge);
    const wc = root * edge;
    positions[index * 3] = a.x * wa + b.x * wb + c.x * wc;
    positions[index * 3 + 1] = a.y * wa + b.y * wb + c.y * wc;
    positions[index * 3 + 2] = a.z * wa + b.z * wb + c.z * wc;
  }
  geometry.dispose();
  if (geometry !== indexed) indexed.dispose();
  return positions;
}

function createTextParticleData(maxCount: number): TextParticleData {
  if (typeof document === "undefined") throw new Error("Particle typography requires a browser canvas");
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Particle typography could not create a 2D canvas context");
  const step = maxCount <= 16_384 ? 6 : 4;
  const depthLayers = maxCount <= 16_384 ? 1 : 2;
  const samples = TITLE_FONT_FILES.map((definition) => sampleText(context, definition, step));
  const baseCount = samples[0].length / 3;
  const count = Math.max(1, Math.min(maxCount, baseCount * depthLayers));
  const positions = new Float32Array(count * 3);
  const targets = [
    new Float32Array(count * 3),
    new Float32Array(count * 3),
    new Float32Array(count * 3),
    new Float32Array(count * 3),
  ] as TextParticleData["targets"];
  const seeds = new Float32Array(count);
  const layers = new Float32Array(count);
  const worldsMask = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const expandedIndex = Math.min(baseCount * depthLayers - 1, Math.floor((index + 0.5) * baseCount * depthLayers / count));
    const baseIndex = Math.floor(expandedIndex / depthLayers);
    const layer = depthLayers === 1 ? 0.5 : (expandedIndex % depthLayers) / (depthLayers - 1);
    positions.set(worldPoint(samples[0], baseIndex, index, layer), index * 3);
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const targetSample = samples[targetIndex + 1];
      const targetCount = Math.max(1, targetSample.length / 3);
      const mapped = Math.min(targetCount - 1, Math.floor((baseIndex + 0.5) * targetCount / Math.max(1, baseCount)));
      targets[targetIndex].set(worldPoint(targetSample, mapped, index, layer), index * 3);
    }
    seeds[index] = seededValue(index);
    layers[index] = layer;
    worldsMask[index] = 1;
  }
  return {
    positions,
    targets,
    seeds,
    layers,
    worldsMask,
    orbPositions: createOrbPositions(count),
    icosahedronPositions: createIcosahedronPositions(count),
  };
}

class MorphingTitleRuntime implements EffectInstance {
  readonly id = "morphing-echoes-title" as const;
  readonly presets = PRESETS;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;
  private readonly group = new THREE.Group();
  private readonly reducedMotion: boolean;
  private reveal = 0;
  private currentPreset: (typeof PRESETS)[number] = "wordmark";
  private lastElapsed = 0;
  private presetStartedAt = 0;
  private previousPointer = new THREE.Vector2();
  private pointerEnergy = 0;
  private hasPointer = false;
  private viewportHeight = 1;
  private frustumWidth = 1;
  private frustumHeight = 1;

  constructor(context: EffectRuntimeContext, data: TextParticleData) {
    ({ scene: this.scene, camera: this.camera } = makeShowcaseScene(context.width, context.height));
    this.reducedMotion = context.reducedMotion;
    this.geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    this.geometry.setAttribute("aFontPositionTektur", new THREE.BufferAttribute(data.targets[0], 3));
    this.geometry.setAttribute("aFontPositionBruno", new THREE.BufferAttribute(data.targets[1], 3));
    this.geometry.setAttribute("aFontPositionChakra", new THREE.BufferAttribute(data.targets[2], 3));
    this.geometry.setAttribute("aFontPositionOrbitron", new THREE.BufferAttribute(data.targets[3], 3));
    this.geometry.setAttribute("aOrbPosition", new THREE.BufferAttribute(data.orbPositions, 3));
    this.geometry.setAttribute("aIcosahedronPosition", new THREE.BufferAttribute(data.icosahedronPositions, 3));
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(data.seeds, 1));
    this.geometry.setAttribute("aLayer", new THREE.BufferAttribute(data.layers, 1));
    this.geometry.setAttribute("aWorldsMask", new THREE.BufferAttribute(data.worldsMask, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: composeShader(vertexSource),
      fragmentShader: fragmentSource,
      uniforms: {
        uTime: { value: TITLE_UNIFORM_DEFAULTS.uTime },
        uReveal: { value: TITLE_UNIFORM_DEFAULTS.uReveal },
        uPixelRatio: { value: clampDpr(context.dpr) },
        uFontPhase: { value: TITLE_UNIFORM_DEFAULTS.uFontPhase },
        uPointer: { value: new THREE.Vector2(100, 100) },
        uPointerEnergy: { value: TITLE_UNIFORM_DEFAULTS.uPointerEnergy },
        uExplosion: { value: TITLE_UNIFORM_DEFAULTS.uExplosion },
        uOrb: { value: TITLE_UNIFORM_DEFAULTS.uOrb },
        uOrbOpacity: { value: TITLE_UNIFORM_DEFAULTS.uOrbOpacity },
        uIcosahedron: { value: TITLE_UNIFORM_DEFAULTS.uIcosahedron },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.scene.add(this.group);
    this.resize(context.width, context.height, context.dpr);
    this.setPreset("wordmark");
  }

  update(frame: EffectFrame): void {
    const delta = Math.min(Math.max(frame.delta, 0), 0.05);
    this.lastElapsed = frame.elapsed;
    const needsStaticReveal = frame.static && this.reveal === 0;
    this.reveal = this.reducedMotion || needsStaticReveal
      ? 1
      : Math.min(1, this.reveal + delta * 0.72);
    const shaderTime = this.reducedMotion ? 0 : frame.elapsed;
    this.material.uniforms.uTime.value = shaderTime;
    this.material.uniforms.uReveal.value = 1 - Math.pow(1 - this.reveal, 3);
    this.material.uniforms.uFontPhase.value = this.reducedMotion ? 0 : fontPhaseAt(frame.elapsed);

    if (this.currentPreset === "burst") {
      const progress = this.reducedMotion ? 0.72 : Math.min(1, (frame.elapsed - this.presetStartedAt) * 0.82);
      this.material.uniforms.uExplosion.value = progress;
    }
    if (frame.pointer && this.currentPreset === "wordmark" && !this.reducedMotion) {
      const pointer = new THREE.Vector2(frame.pointer.x, frame.pointer.y);
      const movement = this.hasPointer ? pointer.distanceTo(this.previousPointer) : 0;
      const velocity = movement / Math.max(delta, 1 / 120);
      const impulse = Math.min(1, velocity * 0.075);
      this.pointerEnergy = Math.max(impulse, this.pointerEnergy * Math.exp(-delta * 3.8));
      this.previousPointer.copy(pointer);
      this.hasPointer = true;
      this.material.uniforms.uPointer.value.set(
        pointer.x * this.frustumWidth * 0.5 / Math.max(0.001, this.group.scale.x),
        pointer.y * this.frustumHeight * 0.5 / Math.max(0.001, this.group.scale.y),
      );
      this.material.uniforms.uPointerEnergy.value = this.pointerEnergy;
    } else {
      this.pointerEnergy *= Math.exp(-delta * 3.8);
      this.material.uniforms.uPointerEnergy.value = this.pointerEnergy;
    }
    const orb = this.currentPreset === "orb" || this.currentPreset === "icosahedron" ? 1 : 0;
    this.group.rotation.y = Math.sin(shaderTime * 0.25) * 0.006 + orb * shaderTime * 0.085;
    this.group.rotation.x = Math.cos(shaderTime * 0.21) * 0.004 + Math.sin(shaderTime * 0.17) * orb * 0.045;
    this.group.rotation.z = Math.sin(shaderTime * 0.13) * orb * 0.018;
  }

  resize(width: number, height: number, dpr: number): void {
    const safeHeight = Math.max(1, height);
    const aspect = Math.max(1, width) / safeHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const cameraDistance = this.camera.position.z || 9;
    this.frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * cameraDistance;
    this.frustumWidth = this.frustumHeight * aspect;
    this.viewportHeight = safeHeight;
    const availableWidth = this.frustumWidth * 0.9;
    this.group.scale.setScalar(Math.min(1, availableWidth / WORLD_WIDTH));
    this.material.uniforms.uPixelRatio.value = clampDpr(dpr);
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    this.currentPreset = preset as (typeof PRESETS)[number];
    this.presetStartedAt = this.lastElapsed;
    const isOrb = preset === "orb" || preset === "icosahedron";
    this.material.uniforms.uOrb.value = isOrb ? 1 : 0;
    this.material.uniforms.uIcosahedron.value = preset === "icosahedron" ? 1 : 0;
    this.material.uniforms.uExplosion.value = 0;
    this.material.uniforms.uOrbOpacity.value = 1;
    this.material.blending = isOrb ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.material.depthWrite = isOrb;
    this.material.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
    this.scene.clear();
  }
}

export async function create(context: EffectRuntimeContext): Promise<EffectInstance> {
  await loadTitleFonts();
  const data = createTextParticleData(resolveParticleCount(context));
  return new MorphingTitleRuntime(context, data);
}

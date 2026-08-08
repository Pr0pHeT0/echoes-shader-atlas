import * as THREE from "three/webgpu";
import {
  attribute,
  clamp,
  cos,
  floor,
  fract,
  max,
  min,
  mix,
  modelViewMatrix,
  normalize,
  screenDPR,
  sin,
  smoothstep,
  sRGBTransferEOTF,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import { loadFontFacesWithFallback } from "../font-loading";
import { seededValue } from "../geometry";
import { EFFECT_PRESETS, TITLE_UNIFORM_DEFAULTS } from "../runtime-config";
import { clampDpr, makeShowcaseScene, resolveParticleCount } from "../runtime-utils";
import { simplexNoise4d } from "../tsl/simplex-noise-4d";
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
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly material: THREE.PointsNodeMaterial;
  private readonly points: THREE.Sprite;
  private readonly group = new THREE.Group();
  private readonly reducedMotion: boolean;
  private readonly timeNode = uniform(TITLE_UNIFORM_DEFAULTS.uTime).setName("uTime");
  private readonly revealNode = uniform(TITLE_UNIFORM_DEFAULTS.uReveal).setName("uReveal");
  private readonly pixelRatioNode = uniform(1).setName("uPixelRatio");
  private readonly fontPhaseNode = uniform(TITLE_UNIFORM_DEFAULTS.uFontPhase).setName("uFontPhase");
  private readonly pointerNode = uniform(new THREE.Vector2(100, 100)).setName("uPointer");
  private readonly pointerEnergyNode = uniform(TITLE_UNIFORM_DEFAULTS.uPointerEnergy).setName("uPointerEnergy");
  private readonly explosionNode = uniform(TITLE_UNIFORM_DEFAULTS.uExplosion).setName("uExplosion");
  private readonly orbNode = uniform(TITLE_UNIFORM_DEFAULTS.uOrb).setName("uOrb");
  private readonly orbOpacityNode = uniform(TITLE_UNIFORM_DEFAULTS.uOrbOpacity).setName("uOrbOpacity");
  private readonly icosahedronNode = uniform(TITLE_UNIFORM_DEFAULTS.uIcosahedron).setName("uIcosahedron");
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
    const count = data.positions.length / 3;

    // WebGPU point primitives are fixed at one pixel, so use PointsNodeMaterial's
    // instanced-sprite path to retain the original depth-scaled particle sizes.
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0.5, 0.5, 0,
      -0.5, 0.5, 0,
    ], 3));
    this.geometry.setAttribute("uv", new THREE.Float32BufferAttribute([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ], 2));
    // Keep the ten particle attributes in one vertex buffer. WebGPU guarantees
    // only eight vertex-buffer slots, while interleaved attributes retain the
    // same shader-facing names and values without consuming a slot apiece.
    const particleStride = 24;
    const particleData = new Float32Array(count * particleStride);
    for (let index = 0; index < count; index += 1) {
      const sourceOffset = index * 3;
      const targetOffset = index * particleStride;
      particleData.set(data.positions.subarray(sourceOffset, sourceOffset + 3), targetOffset);
      particleData.set(data.targets[0].subarray(sourceOffset, sourceOffset + 3), targetOffset + 3);
      particleData.set(data.targets[1].subarray(sourceOffset, sourceOffset + 3), targetOffset + 6);
      particleData.set(data.targets[2].subarray(sourceOffset, sourceOffset + 3), targetOffset + 9);
      particleData.set(data.targets[3].subarray(sourceOffset, sourceOffset + 3), targetOffset + 12);
      particleData.set(data.orbPositions.subarray(sourceOffset, sourceOffset + 3), targetOffset + 15);
      particleData.set(data.icosahedronPositions.subarray(sourceOffset, sourceOffset + 3), targetOffset + 18);
      particleData[targetOffset + 21] = data.seeds[index];
      particleData[targetOffset + 22] = data.layers[index];
      particleData[targetOffset + 23] = data.worldsMask[index];
    }
    const particleBuffer = new THREE.InstancedInterleavedBuffer(particleData, particleStride);
    this.geometry.setAttribute("aTitlePosition", new THREE.InterleavedBufferAttribute(particleBuffer, 3, 0));
    this.geometry.setAttribute("aFontPositionTektur", new THREE.InterleavedBufferAttribute(particleBuffer, 3, 3));
    this.geometry.setAttribute("aFontPositionBruno", new THREE.InterleavedBufferAttribute(particleBuffer, 3, 6));
    this.geometry.setAttribute("aFontPositionChakra", new THREE.InterleavedBufferAttribute(particleBuffer, 3, 9));
    this.geometry.setAttribute("aFontPositionOrbitron", new THREE.InterleavedBufferAttribute(particleBuffer, 3, 12));
    this.geometry.setAttribute("aOrbPosition", new THREE.InterleavedBufferAttribute(particleBuffer, 3, 15));
    this.geometry.setAttribute("aIcosahedronPosition", new THREE.InterleavedBufferAttribute(particleBuffer, 3, 18));
    this.geometry.setAttribute("aSeed", new THREE.InterleavedBufferAttribute(particleBuffer, 1, 21));
    this.geometry.setAttribute("aLayer", new THREE.InterleavedBufferAttribute(particleBuffer, 1, 22));
    this.geometry.setAttribute("aWorldsMask", new THREE.InterleavedBufferAttribute(particleBuffer, 1, 23));
    this.geometry.instanceCount = count;

    const titlePositionAttribute = attribute<"vec3">("aTitlePosition", "vec3");
    const fontPositionTektur = attribute<"vec3">("aFontPositionTektur", "vec3");
    const fontPositionBruno = attribute<"vec3">("aFontPositionBruno", "vec3");
    const fontPositionChakra = attribute<"vec3">("aFontPositionChakra", "vec3");
    const fontPositionOrbitron = attribute<"vec3">("aFontPositionOrbitron", "vec3");
    const orbPosition = attribute<"vec3">("aOrbPosition", "vec3");
    const icosahedronPosition = attribute<"vec3">("aIcosahedronPosition", "vec3");
    const seed = attribute<"float">("aSeed", "float");
    const layer = attribute<"float">("aLayer", "float");
    const worldsMask = attribute<"float">("aWorldsMask", "float");

    const fontSegment = floor(this.fontPhaseNode);
    const globalFontBlend = fract(this.fontPhaseNode);
    const worldsProgress = clamp(titlePositionAttribute.x.add(0.85).div(4.65), 0, 1);
    const fontDelay = worldsProgress.mul(0.22).add(seed.mul(0.1)).mul(worldsMask);
    const fontBlend = smoothstep(0, 1, clamp(globalFontBlend.sub(fontDelay).div(0.68), 0, 1));
    const fontFrom = fontSegment.lessThan(0.5).select(
      titlePositionAttribute,
      fontSegment.lessThan(1.5).select(
        fontPositionTektur,
        fontSegment.lessThan(2.5).select(
          fontPositionBruno,
          fontSegment.lessThan(3.5).select(fontPositionChakra, fontPositionOrbitron),
        ),
      ),
    );
    const fontTo = fontSegment.lessThan(0.5).select(
      fontPositionTektur,
      fontSegment.lessThan(1.5).select(
        fontPositionBruno,
        fontSegment.lessThan(2.5).select(
          fontPositionChakra,
          fontSegment.lessThan(3.5).select(fontPositionOrbitron, titlePositionAttribute),
        ),
      ),
    );
    const fontTransformPulse = sin(fontBlend.mul(Math.PI)).mul(worldsMask);
    const peelAngle = seed.mul(Math.PI * 6).add(fontBlend.mul(Math.PI));
    const titlePosition = mix(fontFrom, fontTo, fontBlend).add(vec3(
      cos(peelAngle).mul(fontTransformPulse).mul(0.075),
      sin(peelAngle).mul(fontTransformPulse).mul(0.105),
      seed.mul(0.62).add(0.2).mul(fontTransformPulse),
    ));

    const titleNoise = simplexNoise4d(vec4(
      titlePosition.xy.mul(0.72),
      titlePosition.z.mul(2.4).add(seed),
      this.timeNode.mul(0.16),
    ));
    const ribbon = sin(titlePosition.x.mul(1.85).sub(this.timeNode.mul(0.72)).add(seed.mul(4)));
    const flowingTitlePosition = titlePosition.add(vec3(
      titleNoise.mul(0.045),
      sin(this.timeNode.mul(0.85).add(seed.mul(13)).add(titlePosition.x.mul(1.3))).mul(0.028),
      titleNoise.mul(0.055).add(ribbon.mul(0.025)),
    ));

    const pointerDelta = titlePosition.xy.sub(this.pointerNode);
    const pointerDistance = pointerDelta.length();
    const pointerDirection = pointerDelta.div(max(pointerDistance, 0.001));
    const pointerField = smoothstep(0.18, 1.55, pointerDistance).oneMinus();
    const jiggle = sin(this.timeNode.mul(19).add(seed.mul(37)).add(titlePosition.x.mul(4.5)));
    const jiggleStrength = pointerField.mul(this.pointerEnergyNode);
    const pointerPosition = flowingTitlePosition.add(vec3(
      pointerDirection.x.mul(jiggle).mul(jiggleStrength).mul(0.105),
      pointerDirection.y.mul(jiggle).mul(jiggleStrength).mul(0.105)
        .add(cos(this.timeNode.mul(23).add(seed.mul(29))).mul(jiggleStrength).mul(0.052)),
      jiggle.mul(jiggleStrength).mul(0.12),
    ));

    const explosionEase = this.explosionNode.oneMinus().pow(3).oneMinus();
    const explosionAngle = seed.mul(Math.PI * 2).add(titlePosition.x.mul(0.34)).add(layer.mul(1.7));
    const explosionDirection = normalize(vec2(
      cos(explosionAngle).add(titlePosition.x.mul(0.12)),
      sin(explosionAngle).add(titlePosition.y.mul(0.42)),
    ));
    const explosionDistance = mix(1.6, 7.2, fract(seed.mul(17.73).add(layer.mul(0.31))));
    const explodedPosition = pointerPosition.add(vec3(
      explosionDirection.mul(explosionDistance).mul(explosionEase),
      seed.sub(0.5).mul(5).mul(explosionEase),
    ));

    const scatter = this.revealNode.oneMinus();
    const scatteredPosition = explodedPosition.add(vec3(
      cos(seed.mul(31)).mul(scatter).mul(layer.mul(1.8).add(0.4)),
      sin(seed.mul(47)).mul(scatter).mul(layer.mul(1.2).add(0.25)),
      seed.sub(0.5).mul(scatter).mul(4),
    ));

    const orbEase = this.orbNode.mul(this.orbNode).mul(this.orbNode.mul(2).oneMinus().add(2));
    const orbLifetime = fract(seed.add(this.timeNode.mul(0.12)));
    const orbLifeIn = smoothstep(0, 0.22, orbLifetime);
    const orbLifeOut = smoothstep(0.68, 1, orbLifetime).oneMinus();
    const orbLifeEnvelope = min(orbLifeIn, orbLifeOut);
    const activeOrbShape = mix(orbPosition, icosahedronPosition, this.icosahedronNode);
    const orbNormal = normalize(activeOrbShape.add(vec3(0.0001)));
    const orbBreath = sin(this.timeNode.mul(1.1).add(seed.mul(10))).mul(0.018);
    const orbRipple = simplexNoise4d(vec4(
      activeOrbShape.mul(1.8),
      this.timeNode.mul(0.18),
    )).mul(0.024);
    const orbFlowTime = this.timeNode.mul(0.1);
    const orbFlowSample = activeOrbShape.mul(0.72);
    const orbFlow = vec3(
      simplexNoise4d(vec4(orbFlowSample, orbFlowTime)),
      simplexNoise4d(vec4(orbFlowSample.add(1), orbFlowTime)),
      simplexNoise4d(vec4(orbFlowSample.add(2), orbFlowTime)),
    );
    const orbFlowMask = smoothstep(
      -0.2,
      0.8,
      simplexNoise4d(vec4(activeOrbShape.mul(0.9), orbFlowTime.add(1))),
    );
    const orbFlowDirection = normalize(orbFlow.add(vec3(0.0001)));
    const breathingOrb = activeOrbShape.mul(orbBreath.add(orbRipple).add(1))
      .add(orbFlowDirection.mul(orbFlowMask).mul(orbLifeEnvelope).mul(0.13))
      .add(orbNormal.mul(sin(orbLifetime.mul(Math.PI * 2))).mul(orbLifeEnvelope).mul(0.022));
    const transformed = mix(scatteredPosition, breathingOrb, orbEase);

    const viewPosition = modelViewMatrix.mul(vec4(transformed, 1));
    const depthScale = max(1, viewPosition.z.negate()).reciprocal().mul(9);
    const titlePointSize = mix(1.25, 2.5, seed)
      .mul(depthScale)
      .mul(this.explosionNode.mul(1.7).add(1));
    const orbLifeSize = mix(0.48, 1, orbLifeEnvelope);
    const orbPointSize = mix(1.5, 3.1, seed).mul(depthScale).mul(orbLifeSize);
    const fontPointScale = fontTransformPulse.mul(0.42).oneMinus();
    const pointSize = mix(titlePointSize, orbPointSize, orbEase)
      .mul(mix(1, 1.22, orbEase))
      .mul(mix(fontPointScale, 1, orbEase));

    const cyan = vec3(0.12, 0.86, 1);
    const pearl = vec3(0.92, 0.98, 1);
    const violet = vec3(0.5, 0.36, 1);
    const titleColor = mix(cyan, pearl, 0.38).mul(titleNoise.mul(0.04).add(0.96));
    const orbAccent = mix(cyan, violet, smoothstep(-0.82, 0.82, orbPosition.x));
    const orbSilver = mix(vec3(0.25, 0.3, 0.32), pearl, seed.mul(0.1).add(0.15));
    const orbColor = mix(
      mix(orbAccent, orbSilver, 0.88),
      mix(cyan, violet, seed.mul(0.24).add(0.42)),
      this.icosahedronNode.mul(0.55),
    );
    const particleColor = varying(mix(titleColor, orbColor, orbEase), "vTitleColor");
    const explosionFade = mix(1, 0.08, smoothstep(0.58, 1, this.explosionNode));
    const shapeOpacity = mix(explosionFade, 0.82, orbEase);
    const orbLifeAlpha = mix(0.46, 1, orbLifeEnvelope);
    const particleAlpha = varying(
      mix(0.42, 1, layer.oneMinus())
        .mul(this.revealNode)
        .mul(shapeOpacity)
        .mul(this.orbOpacityNode)
        .mul(mix(1, orbLifeAlpha, orbEase)),
      "vTitleAlpha",
    );
    const baseLight = sin(this.timeNode.mul(1.4).add(seed.mul(19))).mul(0.12).add(0.88);
    const orbShimmer = sin(
      this.timeNode.mul(2.1).add(seed.mul(31)).add(orbLifetime.mul(Math.PI * 2)),
    ).mul(0.22).add(0.78);
    const particleLight = varying(mix(baseLight, orbShimmer, orbEase), "vTitleLight");
    const particleOrb = varying(orbEase, "vTitleOrb");

    const point = uv().mul(2).sub(1);
    const radiusSquared = point.dot(point);
    const radius = radiusSquared.sqrt();
    const orbCoreRadius = mix(1, 0.72, particleOrb);
    const surfacePoint = point.div(orbCoreRadius);
    const surfaceRadiusSquared = min(surfacePoint.dot(surfacePoint), 1);
    const sphere = surfaceRadiusSquared.oneMinus().sqrt();
    const titleCore = smoothstep(0.05, 1, radiusSquared).oneMinus();
    const orbCore = smoothstep(orbCoreRadius.mul(0.82), orbCoreRadius, radius).oneMinus();
    const core = mix(titleCore, orbCore, particleOrb);
    const normal = normalize(vec3(surfacePoint, sphere));
    const lightDirection = normalize(vec3(-0.35, 0.7, 1));
    const diffuse = max(normal.dot(lightDirection), 0).mul(0.58).add(0.42);
    const halfDirection = normalize(lightDirection.add(vec3(0, 0, 1)));
    const glint = max(normal.dot(halfDirection), 0).pow(22);
    const halo = smoothstep(orbCoreRadius.mul(0.7), 1, radius).oneMinus().mul(particleOrb);
    const outputColor = particleColor.mul(diffuse).mul(particleLight)
      .add(vec3(0.65, 0.9, 1).mul(glint).mul(0.5))
      .add(vec3(0.12, 0.62, 1).mul(halo).mul(0.18));
    const surfaceAlpha = core.mul(0.68).add(0.32)
      .mul(particleAlpha)
      .mul(mix(1, orbCore, particleOrb));
    const outputAlpha = surfaceAlpha.add(halo.mul(particleAlpha).mul(0.11));
    const legacyOutputColor = sRGBTransferEOTF(vec3(outputColor)) as THREE.Node<"vec3">;

    this.pixelRatioNode.value = clampDpr(context.dpr);
    this.material = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      sizeAttenuation: false,
    });
    this.material.positionNode = transformed;
    // PointsNodeMaterial applies the renderer DPR internally. This ratio keeps
    // the explicit clamped-DPR contract of the archived GLSL shader.
    this.material.sizeNode = vec2(pointSize.mul(this.pixelRatioNode).div(max(screenDPR, 0.001)));
    this.material.maskNode = radiusSquared.lessThanEqual(1);
    // The archived raw fragment wrote display-coded values directly and did
    // not include Three's colorspace chunk. Decode here so the renderer's
    // output transform lands on the same visible RGB values.
    this.material.colorNode = vec4(legacyOutputColor, outputAlpha);

    this.points = new THREE.Sprite(this.material);
    this.points.geometry = this.geometry;
    this.points.count = count;
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
    this.timeNode.value = shaderTime;
    this.revealNode.value = 1 - Math.pow(1 - this.reveal, 3);
    this.fontPhaseNode.value = this.reducedMotion ? 0 : fontPhaseAt(frame.elapsed);

    if (this.currentPreset === "burst") {
      const progress = this.reducedMotion ? 0.72 : Math.min(1, (frame.elapsed - this.presetStartedAt) * 0.82);
      this.explosionNode.value = progress;
    }
    if (frame.pointer && this.currentPreset === "wordmark" && !this.reducedMotion) {
      const pointer = new THREE.Vector2(frame.pointer.x, frame.pointer.y);
      const movement = this.hasPointer ? pointer.distanceTo(this.previousPointer) : 0;
      const velocity = movement / Math.max(delta, 1 / 120);
      const impulse = Math.min(1, velocity * 0.075);
      this.pointerEnergy = Math.max(impulse, this.pointerEnergy * Math.exp(-delta * 3.8));
      this.previousPointer.copy(pointer);
      this.hasPointer = true;
      this.pointerNode.value.set(
        pointer.x * this.frustumWidth * 0.5 / Math.max(0.001, this.group.scale.x),
        pointer.y * this.frustumHeight * 0.5 / Math.max(0.001, this.group.scale.y),
      );
      this.pointerEnergyNode.value = this.pointerEnergy;
    } else {
      this.pointerEnergy *= Math.exp(-delta * 3.8);
      this.pointerEnergyNode.value = this.pointerEnergy;
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
    this.pixelRatioNode.value = clampDpr(dpr);
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    this.currentPreset = preset as (typeof PRESETS)[number];
    this.presetStartedAt = this.lastElapsed;
    const isOrb = preset === "orb" || preset === "icosahedron";
    this.orbNode.value = isOrb ? 1 : 0;
    this.icosahedronNode.value = preset === "icosahedron" ? 1 : 0;
    this.explosionNode.value = 0;
    this.orbOpacityNode.value = 1;
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

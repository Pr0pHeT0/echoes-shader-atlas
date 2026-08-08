import * as THREE from "three/webgpu";
import {
  Fn,
  abs,
  atan,
  cameraProjectionMatrix,
  cameraPosition,
  clamp,
  dot,
  floor,
  highpModelNormalViewMatrix,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  modelViewMatrix,
  modelWorldMatrixInverse,
  normalize,
  screenUV,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewportUV,
} from "three/tsl";

import {
  MATRIX_SDF_ATLAS_URL,
  MATRIX_SDF_GLYPHS,
  MATRIX_SDF_GRID_SIZE,
} from "../assets/matrix-binary-sdf";
import {
  createProceduralTerrain,
  createSegmentedTorusKnot,
  makeRandomIndices,
  seededValue,
} from "../geometry";
import {
  EFFECT_PRESETS,
  STYLIZED_MATERIALIZATION_DEFAULTS,
} from "../runtime-config";
import {
  clampDpr,
  makeShowcaseScene,
  resolveMaterializationPointSize,
  resolveParticleCount,
} from "../runtime-utils";
import type {
  EffectFrame,
  EffectInstance,
  EffectRuntimeContext,
} from "../types";

const PRESETS = EFFECT_PRESETS["stylized-materialization"];
const PRESET_TRANSITION_SECONDS = 0.5;
const INK_TARGET_LONG_EDGE = 1_280;
const CAMERA_FIT_PADDING = 1.12;
const BASE_CAMERA_DIRECTION = new THREE.Vector3(0, 0.02, 1).normalize();
const TERRAIN_CAMERA_DIRECTION = new THREE.Vector3(0, 0.28, 1).normalize();

type FloatNode = THREE.Node<"float">;
type Vec2Node = THREE.Node<"vec2">;
type Vec3Node = THREE.Node<"vec3">;
type Vec4Node = THREE.Node<"vec4">;

type StyleMix = [number, number, number];

function makeInstancedSprite(
  material: THREE.PointsNodeMaterial,
  count: number,
): THREE.Sprite {
  const sprite = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  sprite.geometry = sprite.geometry.clone();
  sprite.count = count;
  sprite.frustumCulled = false;
  return sprite;
}

function createPaperTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the ink paper texture.");

  context.fillStyle = "#e8e0ce";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 5_200; index += 1) {
    const x = seededValue(index, 211) * canvas.width;
    const y = seededValue(index, 223) * canvas.height;
    const radius = 0.18 + seededValue(index, 227) * 1.2;
    const warm = seededValue(index, 229) > 0.52;
    context.fillStyle = warm
      ? `rgba(116, 91, 62, ${0.012 + seededValue(index, 233) * 0.03})`
      : `rgba(50, 66, 61, ${0.008 + seededValue(index, 239) * 0.024})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.lineCap = "round";
  for (let index = 0; index < 190; index += 1) {
    const x = seededValue(index, 241) * canvas.width;
    const y = seededValue(index, 251) * canvas.height;
    const horizontal = seededValue(index, 257) > 0.34;
    const span = 22 + seededValue(index, 263) * 165;
    context.strokeStyle = `rgba(88, 71, 51, ${0.012 + seededValue(index, 269) * 0.027})`;
    context.lineWidth = 0.25 + seededValue(index, 271) * 0.72;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(
      x + (horizontal ? span : seededValue(index, 277) * 8 - 4),
      y + (horizontal ? seededValue(index, 281) * 8 - 4 : span),
    );
    context.stroke();
  }

  const paper = new THREE.CanvasTexture(canvas);
  paper.name = "Stylized materialization xuan paper";
  paper.colorSpace = THREE.SRGBColorSpace;
  paper.wrapS = THREE.RepeatWrapping;
  paper.wrapT = THREE.RepeatWrapping;
  paper.minFilter = THREE.LinearMipmapLinearFilter;
  paper.magFilter = THREE.LinearFilter;
  paper.generateMipmaps = true;
  paper.needsUpdate = true;
  return paper;
}

function makeStyleIndices(
  total: number,
  desired: number,
  stride: number,
  offset: number,
): Uint32Array {
  const count = Math.min(total, desired);
  const indices = new Uint32Array(count);
  const safeStride = stride | 1;
  for (let index = 0; index < count; index += 1) {
    indices[index] = (offset + index * safeStride) % total;
  }
  return indices;
}

function seededScalars(indices: Uint32Array, salt: number): Float32Array {
  return Float32Array.from(indices, (index) => seededValue(index, salt));
}

function vec3Attribute(values: Float32Array): Vec3Node {
  return instancedBufferAttribute<"vec3">(
    new THREE.InstancedBufferAttribute(values, 3),
    "vec3",
  );
}

function vec4Attribute(values: Float32Array): Vec4Node {
  return instancedBufferAttribute<"vec4">(
    new THREE.InstancedBufferAttribute(values, 4),
    "vec4",
  );
}

function cyberStrokeFragment(
  color: Vec3Node,
  variation: FloatNode,
  distribution: FloatNode,
  time: FloatNode,
  styleWeight: FloatNode,
  halo: boolean,
): THREE.Node<"vec4"> {
  return Fn(() => {
    const coordinate = uv().mul(2).sub(1);
    const along = abs(coordinate.x);
    const across = abs(coordinate.y);
    const endFade = smoothstep(0.72, 1, along).oneMinus();
    const width = halo
      ? smoothstep(0.1, 1, across).oneMinus()
      : smoothstep(0.08, 0.34, across).oneMinus();
    const breath = sin(time.mul(0.56).add(variation.mul(17))).mul(0.08).add(0.92);
    const alpha = width
      .mul(endFade)
      .mul(styleWeight)
      .mul(distribution)
      .mul(halo ? 0.28 : 0.96)
      .mul(breath);
    alpha.lessThan(halo ? 0.004 : 0.025).discard();
    const energy = halo ? width.mul(0.56) : width.mul(0.92).add(0.16);
    return vec4(color.mul(energy).mul(breath), alpha);
  })();
}

function matrixGlyphFragment(
  atlas: THREE.Texture,
  baseGlyph: FloatNode,
  laneSeed: FloatNode,
  changeSeed: FloatNode,
  cadenceSeed: FloatNode,
  flickerSeed: FloatNode,
  verticalCoordinate: FloatNode,
  time: FloatNode,
  styleWeight: FloatNode,
  halo: boolean,
): THREE.Node<"vec4"> {
  return Fn(() => {
    const laneHead = time
      .mul(mix(0.07, 0.14, cadenceSeed))
      .add(laneSeed.mul(7.3))
      .fract();
    const directDistance = abs(verticalCoordinate.sub(laneHead));
    const wrappedDistance = min(directDistance, directDistance.oneMinus());
    const head = smoothstep(0.02, 0.17, wrappedDistance).oneMinus();
    const bucket = floor(
      time.mul(mix(0.52, 0.9, cadenceSeed)).add(changeSeed.mul(31)),
    );
    const dynamicHash = sin(bucket.mul(12.9898).add(changeSeed.mul(78.233)))
      .mul(43_758.5453)
      .fract();
    const dynamicGlyph = floor(dynamicHash.mul(MATRIX_SDF_GLYPHS.length));
    const changesAtHead = head
      .mul(changeSeed.lessThan(0.1).select(1, 0));
    const glyphIndex = floor(mix(baseGlyph, dynamicGlyph, changesAtHead));
    const column = glyphIndex.mod(MATRIX_SDF_GRID_SIZE);
    const row = floor(glyphIndex.div(MATRIX_SDF_GRID_SIZE));
    const atlasUv = vec2(column, row).add(uv()).div(MATRIX_SDF_GRID_SIZE);
    const signedDistance = texture(atlas, atlasUv).r;
    const glyph = halo
      ? smoothstep(0.34, 0.54, signedDistance)
      : smoothstep(0.47, 0.54, signedDistance);
    const stablePulse = sin(
      time.mul(mix(1.3, 2.15, cadenceSeed)).add(flickerSeed.mul(83)),
    ).mul(0.06).add(0.94);
    const phosphor = mix(
      vec3(0.035, 0.34, 0.085),
      vec3(0.48, 1, 0.58),
      head.mul(0.78).add(0.18),
    );
    const alpha = glyph
      .mul(styleWeight)
      .mul(stablePulse)
      .mul(halo ? 0.24 : 0.96);
    alpha.lessThan(halo ? 0.003 : 0.025).discard();
    return vec4(phosphor.mul(glyph).mul(halo ? 0.62 : 1.12), alpha);
  })();
}

function depthDiscFragment(): THREE.Node<"vec4"> {
  return Fn(() => {
    const radius = length(uv().mul(2).sub(1));
    const coverage = smoothstep(0.72, 1, radius).oneMinus();
    coverage.lessThan(0.05).discard();
    return vec4(0, 0, 0, 1);
  })();
}

function inkDepositFragment(
  pigment: Vec3Node,
  opacity: FloatNode,
  washKind: FloatNode,
  shapeSeed: FloatNode,
): THREE.Node<"vec4"> {
  return Fn(() => {
    const coordinate = uv().mul(2).sub(1);
    const warp = vec2(
      sin(coordinate.y.mul(8.1).add(shapeSeed.mul(59))).mul(0.075),
      sin(coordinate.x.mul(7.2).sub(shapeSeed.mul(43))).mul(0.08),
    );
    const warped = coordinate.add(warp);
    const radius = length(warped.mul(vec2(
      mix(0.78, 1.2, shapeSeed),
      mix(0.84, 1.14, shapeSeed),
    )));
    const ragged = sin(coordinate.x.mul(17).add(shapeSeed.mul(113)))
      .mul(sin(coordinate.y.mul(19).sub(shapeSeed.mul(97))))
      .mul(mix(0.055, 0.13, washKind));
    const coverage = smoothstep(
      mix(0.68, 0.32, washKind),
      ragged.add(1),
      radius,
    ).oneMinus();
    const cell = floor(uv().mul(53).add(shapeSeed.mul(23)));
    const grain = sin(dot(cell, vec2(12.9898, 78.233))).mul(43_758.5453).fract();
    const granulation = mix(0.64, 1, grain);
    const alpha = coverage.mul(granulation).mul(opacity);
    alpha.lessThan(0.008).discard();
    return vec4(pigment, alpha);
  })();
}

function blurFragment(
  source: THREE.Texture,
  texelSize: Vec2Node,
  horizontal: boolean,
): THREE.Node<"vec4"> {
  return Fn(() => {
    const coordinate = viewportUV;
    const direction = horizontal
      ? vec2(texelSize.x, 0)
      : vec2(0, texelSize.y);
    const center = texture(source, coordinate).mul(0.227_027);
    const firstOffset = direction.mul(1.384_615);
    const secondOffset = direction.mul(3.230_769);
    return center
      .add(texture(source, coordinate.add(firstOffset)).mul(0.316_216))
      .add(texture(source, coordinate.sub(firstOffset)).mul(0.316_216))
      .add(texture(source, coordinate.add(secondOffset)).mul(0.070_27))
      .add(texture(source, coordinate.sub(secondOffset)).mul(0.070_27));
  })();
}

function smoothMix(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

class StylizedMaterializationRuntime implements EffectInstance {
  readonly id = "stylized-materialization" as const;
  readonly presets = PRESETS;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly renderer: THREE.WebGPURenderer;
  private readonly reducedMotion: boolean;
  private readonly constrained: boolean;
  private readonly terrainTarget: boolean;
  private readonly cameraDirection: THREE.Vector3;
  private readonly targetRadius: number;
  private readonly group = new THREE.Group();
  private readonly inkScene = new THREE.Scene();
  private readonly inkGroup = new THREE.Group();
  private readonly mainSprites: THREE.Sprite[] = [];
  private readonly mainMaterials: THREE.Material[] = [];
  private readonly inkSprites: THREE.Sprite[] = [];
  private readonly inkMaterials: THREE.Material[] = [];
  private readonly glyphAtlas: THREE.Texture;
  private readonly paperTexture: THREE.CanvasTexture;
  private readonly cyberCoreSprite: THREE.Sprite;
  private readonly cyberHaloSprite: THREE.Sprite;
  private readonly matrixDepthSprite: THREE.Sprite;
  private readonly matrixCoreSprite: THREE.Sprite;
  private readonly matrixHaloSprite: THREE.Sprite;
  private readonly inkDepositSprite: THREE.Sprite;
  private readonly inkDepositTarget: THREE.RenderTarget;
  private readonly inkBlurHorizontalTarget: THREE.RenderTarget;
  private readonly inkBlurVerticalTarget: THREE.RenderTarget;
  private readonly inkBlurHorizontalMaterial: THREE.MeshBasicNodeMaterial;
  private readonly inkBlurVerticalMaterial: THREE.MeshBasicNodeMaterial;
  private readonly blurQuad: THREE.QuadMesh;

  private readonly time = uniform(0);
  private readonly pointSize: FloatNode;
  private readonly cyberMix = uniform(1);
  private readonly matrixMix = uniform(0);
  private readonly inkMix = uniform(0);
  private readonly inkTexelSize = uniform(new THREE.Vector2(1, 1));

  private currentPreset: (typeof PRESETS)[number] = "cyberpunk-lines";
  private presetInitialized = false;
  private lastElapsed = 0;
  private transitionStartedAt = 0;
  private transitionActive = false;
  private transitionFrom: StyleMix = [1, 0, 0];
  private transitionTo: StyleMix = [1, 0, 0];
  private groupRotationY = 0;
  private inkPrepared = false;

  constructor(context: EffectRuntimeContext, glyphAtlas: THREE.Texture) {
    this.renderer = context.renderer;
    this.reducedMotion = context.reducedMotion;
    const count = resolveParticleCount(context);
    this.constrained = count <= 16_384;
    const requestedTarget = context.pointTarget ?? "base";
    const uploaded = requestedTarget === "uploaded"
      && context.pointCloud
      && context.pointCloud.count > 0
      && context.pointCloud.positions.length >= context.pointCloud.count * 3
      && context.pointCloud.normals.length >= context.pointCloud.count * 3
      && context.pointCloud.tangents.length >= context.pointCloud.count * 3
      && context.pointCloud.colors.length >= context.pointCloud.count * 3
      ? context.pointCloud
      : null;
    const terrain = requestedTarget === "terrain"
      ? createProceduralTerrain(count)
      : null;
    const knot = uploaded || terrain ? null : createSegmentedTorusKnot(count);
    this.terrainTarget = terrain !== null;
    const generatedTarget = terrain ?? knot!;
    const targetPositions = uploaded
      ? new Float32Array(count * 3)
      : generatedTarget.positions;
    const targetNormals = uploaded
      ? new Float32Array(count * 3)
      : generatedTarget.normals;
    const targetTangents = uploaded
      ? new Float32Array(count * 3)
      : generatedTarget.tangents;
    const targetColors = uploaded
      ? new Float32Array(count * 3)
      : generatedTarget.colors;

    if (uploaded) {
      for (let index = 0; index < count; index += 1) {
        const sourceIndex = index % uploaded.count;
        const sourceOffset = sourceIndex * 3;
        const targetOffset = index * 3;
        targetPositions.set(uploaded.positions.subarray(sourceOffset, sourceOffset + 3), targetOffset);
        targetNormals.set(uploaded.normals.subarray(sourceOffset, sourceOffset + 3), targetOffset);
        targetTangents.set(uploaded.tangents.subarray(sourceOffset, sourceOffset + 3), targetOffset);
        targetColors.set(uploaded.colors.subarray(sourceOffset, sourceOffset + 3), targetOffset);
      }
    }

    const boundsMinimum = new THREE.Vector3(Infinity, Infinity, Infinity);
    const boundsMaximum = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      boundsMinimum.x = Math.min(boundsMinimum.x, targetPositions[offset]);
      boundsMinimum.y = Math.min(boundsMinimum.y, targetPositions[offset + 1]);
      boundsMinimum.z = Math.min(boundsMinimum.z, targetPositions[offset + 2]);
      boundsMaximum.x = Math.max(boundsMaximum.x, targetPositions[offset]);
      boundsMaximum.y = Math.max(boundsMaximum.y, targetPositions[offset + 1]);
      boundsMaximum.z = Math.max(boundsMaximum.z, targetPositions[offset + 2]);
    }
    const targetCenter = boundsMinimum.add(boundsMaximum).multiplyScalar(0.5);
    let targetRadiusSquared = 0;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      targetPositions[offset] -= targetCenter.x;
      targetPositions[offset + 1] -= targetCenter.y;
      targetPositions[offset + 2] -= targetCenter.z;
      targetRadiusSquared = Math.max(
        targetRadiusSquared,
        targetPositions[offset] * targetPositions[offset]
          + targetPositions[offset + 1] * targetPositions[offset + 1]
          + targetPositions[offset + 2] * targetPositions[offset + 2],
      );
    }
    this.targetRadius = Math.max(Math.sqrt(targetRadiusSquared), 0.1);
    this.cameraDirection = (
      this.terrainTarget ? TERRAIN_CAMERA_DIRECTION : BASE_CAMERA_DIRECTION
    ).clone();
    ({ scene: this.scene, camera: this.camera } = makeShowcaseScene(
      context.width,
      context.height,
      this.cameraDirection.clone().multiplyScalar(this.targetRadius * 2.8),
    ));
    this.scene.background = null;

    const resolvedPointSize = uploaded
      ? resolveMaterializationPointSize(uploaded.triangleCount, uploaded.meshCount)
      : STYLIZED_MATERIALIZATION_DEFAULTS.size;
    this.pointSize = uniform(resolvedPointSize);
    this.glyphAtlas = glyphAtlas;
    this.paperTexture = createPaperTexture();

    const fullTargetPosition = vec3Attribute(targetPositions);

    const cyberIndices = makeRandomIndices(
      count,
      this.constrained ? 4_000 : 8_000,
      40_503,
    );
    const cyberTargetData = new Float32Array(cyberIndices.length * 4);
    const cyberTangentVariationData = new Float32Array(cyberIndices.length * 4);
    const cyberNormalDistributionData = new Float32Array(cyberIndices.length * 4);
    const cyberColorData = new Float32Array(cyberIndices.length * 4);
    const cyan = new THREE.Color(0x18e6ff);
    const magenta = new THREE.Color(0xff2bd6);
    const violet = new THREE.Color(0x7857ff);
    const lime = new THREE.Color(0xc8ff36);
    const orange = new THREE.Color(0xff7a2f);
    const cyberColor = new THREE.Color();
    cyberIndices.forEach((sourceIndex, index) => {
      const sourceOffset = sourceIndex * 3;
      const output = index * 4;
      const x = targetPositions[sourceOffset];
      const y = targetPositions[sourceOffset + 1];
      const z = targetPositions[sourceOffset + 2];
      cyberTargetData[output] = x;
      cyberTargetData[output + 1] = y;
      cyberTargetData[output + 2] = z;
      cyberTangentVariationData[output] = targetTangents[sourceOffset];
      cyberTangentVariationData[output + 1] = targetTangents[sourceOffset + 1];
      cyberTangentVariationData[output + 2] = targetTangents[sourceOffset + 2];
      cyberTangentVariationData[output + 3] = seededValue(sourceIndex, 409);
      cyberNormalDistributionData[output] = targetNormals[sourceOffset];
      cyberNormalDistributionData[output + 1] = targetNormals[sourceOffset + 1];
      cyberNormalDistributionData[output + 2] = targetNormals[sourceOffset + 2];
      cyberNormalDistributionData[output + 3] = seededValue(sourceIndex, 449);
      const region = Math.sin(x * 1.18 + z * 0.74)
        + Math.sin(y * 1.53 - x * 0.46) * 0.58;
      if (region < -0.42) cyberColor.copy(cyan).lerp(violet, seededValue(sourceIndex, 421) * 0.34);
      else if (region < 0.36) cyberColor.copy(violet).lerp(magenta, seededValue(sourceIndex, 431) * 0.58);
      else cyberColor.copy(magenta).lerp(cyan, seededValue(sourceIndex, 433) * 0.22);
      const accent = seededValue(sourceIndex, 439);
      if (accent > 0.955) cyberColor.lerp(accent > 0.982 ? orange : lime, 0.82);
      cyberColorData[output] = cyberColor.r * (
        0.7568 + targetColors[sourceOffset] * 0.12
      );
      cyberColorData[output + 1] = cyberColor.g * (
        0.7568 + targetColors[sourceOffset + 1] * 0.12
      );
      cyberColorData[output + 2] = cyberColor.b * (
        0.7568 + targetColors[sourceOffset + 2] * 0.12
      );
    });
    const cyberTarget = vec4Attribute(cyberTargetData).xyz;
    const cyberTangentVariation = vec4Attribute(cyberTangentVariationData);
    const cyberNormalDistribution = vec4Attribute(cyberNormalDistributionData);
    const cyberColorNode = vec4Attribute(cyberColorData);
    const cyberTangent = cyberTangentVariation.xyz;
    const cyberVariation = cyberTangentVariation.w;
    const cyberNormal = cyberNormalDistribution.xyz;
    const cyberDistributionSeed = cyberNormalDistribution.w;
    const cyberViewTangent = modelViewMatrix.mul(vec4(cyberTangent, 0)).xy;
    const cyberTangentConfidence = smoothstep(0.001, 0.08, length(cyberViewTangent));
    const cyberViewNormal = normalize(highpModelNormalViewMatrix.mul(cyberNormal));
    const cyberViewPosition = modelViewMatrix.mul(vec4(cyberTarget, 1)).xyz;
    const cyberViewDirection = normalize(cyberViewPosition.negate());
    const cyberContour = smoothstep(
      0.36,
      0.92,
      abs(dot(cyberViewNormal, cyberViewDirection)).oneMinus(),
    );
    const cyberRandomPresence = smoothstep(0.16, 0.86, cyberDistributionSeed);
    const cyberDistribution = min(
      mix(0.5, 0.8, cyberRandomPresence).add(cyberContour.mul(0.3)),
      1,
    );
    const cyberAngle = mix(
      cyberVariation.mul(Math.PI * 2),
      atan(cyberViewTangent.y, cyberViewTangent.x),
      cyberTangentConfidence,
    );
    const cyberDisplayColor = cyberColorNode.xyz;
    const cyberLength = mix(2.8, 8.4, cyberVariation)
      .mul(sin(this.time.mul(0.43).add(cyberVariation.mul(31))).mul(0.08).add(0.96));

    const cyberCoreMaterial = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NormalBlending,
      fog: false,
    });
    cyberCoreMaterial.positionNode = cyberTarget;
    cyberCoreMaterial.sizeNode = this.pointSize.mul(mix(0.74, 1.12, cyberVariation));
    cyberCoreMaterial.scaleNode = vec2(cyberLength, mix(0.18, 0.3, cyberVariation));
    cyberCoreMaterial.rotationNode = cyberAngle;
    cyberCoreMaterial.fragmentNode = cyberStrokeFragment(
      cyberDisplayColor,
      cyberVariation,
      cyberDistribution,
      this.time,
      this.cyberMix,
      false,
    );
    this.cyberCoreSprite = this.addMainSprite(cyberCoreMaterial, cyberIndices.length, 2);

    const cyberHaloMaterial = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    cyberHaloMaterial.positionNode = cyberTarget;
    cyberHaloMaterial.sizeNode = this.pointSize.mul(mix(0.76, 1.18, cyberVariation));
    cyberHaloMaterial.scaleNode = vec2(cyberLength.mul(1.04), mix(0.72, 1.08, cyberVariation));
    cyberHaloMaterial.rotationNode = cyberAngle;
    cyberHaloMaterial.fragmentNode = cyberStrokeFragment(
      cyberDisplayColor,
      cyberVariation,
      cyberDistribution,
      this.time,
      this.cyberMix,
      true,
    );
    this.cyberHaloSprite = this.addMainSprite(cyberHaloMaterial, cyberIndices.length, 3);

    const matrixDepthMaterial = new THREE.PointsNodeMaterial({
      transparent: false,
      depthWrite: true,
      depthTest: true,
      fog: false,
    });
    matrixDepthMaterial.colorWrite = false;
    const cameraInModelSpace = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
    const matrixShellDirection = normalize(
      fullTargetPosition.sub(cameraInModelSpace),
    );
    matrixDepthMaterial.positionNode = fullTargetPosition.add(
      matrixShellDirection.mul(0.045),
    );
    matrixDepthMaterial.sizeNode = max(this.pointSize, 0.025).mul(0.72);
    matrixDepthMaterial.fragmentNode = depthDiscFragment();
    this.matrixDepthSprite = this.addMainSprite(matrixDepthMaterial, count, 0);

    const matrixIndices = makeStyleIndices(
      count,
      this.constrained ? 2_500 : 5_000,
      36_667,
      7_919,
    );
    const matrixTargetData = new Float32Array(matrixIndices.length * 4);
    const matrixParametersA = new Float32Array(matrixIndices.length * 4);
    const matrixParametersB = new Float32Array(matrixIndices.length * 4);
    matrixIndices.forEach((sourceIndex, index) => {
      const sourceOffset = sourceIndex * 3;
      const offsetA = index * 4;
      matrixTargetData[offsetA] = targetPositions[sourceOffset];
      matrixTargetData[offsetA + 1] = targetPositions[sourceOffset + 1];
      matrixTargetData[offsetA + 2] = targetPositions[sourceOffset + 2];
      matrixParametersA[offsetA] = seededValue(sourceIndex, 509);
      matrixParametersA[offsetA + 1] = seededValue(sourceIndex, 521);
      matrixParametersA[offsetA + 2] = seededValue(sourceIndex, 523);
      const language = seededValue(sourceIndex, 541);
      matrixParametersB[offsetA] = language < 0.85
        ? (seededValue(sourceIndex, 547) < 0.5 ? 0 : 1)
        : 2 + Math.floor(
          seededValue(sourceIndex, 557) * (MATRIX_SDF_GLYPHS.length - 2),
        );
      matrixParametersB[offsetA + 1] = seededValue(sourceIndex, 563);
      matrixParametersB[offsetA + 2] = seededValue(sourceIndex, 569);
    });
    const matrixTarget = vec4Attribute(matrixTargetData).xyz;
    const matrixParameterNodeA = vec4Attribute(matrixParametersA);
    const matrixParameterNodeB = vec4Attribute(matrixParametersB);
    const matrixLaneSeed = matrixParameterNodeA.x;
    const matrixChangeSeed = matrixParameterNodeA.y;
    const matrixCadenceSeed = matrixParameterNodeA.z;
    const matrixGlyph = matrixParameterNodeB.x;
    const matrixSizeSeed = matrixParameterNodeB.y;
    const matrixFlickerSeed = matrixParameterNodeB.z;
    const matrixClipPosition = cameraProjectionMatrix
      .mul(modelViewMatrix)
      .mul(vec4(matrixTarget, 1));
    const matrixVerticalNode = matrixClipPosition.y
      .div(matrixClipPosition.w)
      .mul(0.5)
      .add(0.5);

    const matrixCoreMaterial = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NormalBlending,
      fog: false,
    });
    matrixCoreMaterial.positionNode = matrixTarget;
    matrixCoreMaterial.sizeNode = uniform(0.22).mul(mix(0.9, 1.14, matrixSizeSeed));
    matrixCoreMaterial.scaleNode = vec2(0.72, 1);
    matrixCoreMaterial.fragmentNode = matrixGlyphFragment(
      this.glyphAtlas,
      matrixGlyph,
      matrixLaneSeed,
      matrixChangeSeed,
      matrixCadenceSeed,
      matrixFlickerSeed,
      matrixVerticalNode,
      this.time,
      this.matrixMix,
      false,
    );
    this.matrixCoreSprite = this.addMainSprite(matrixCoreMaterial, matrixIndices.length, 2);

    const matrixHaloMaterial = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    matrixHaloMaterial.positionNode = matrixTarget;
    matrixHaloMaterial.sizeNode = uniform(0.26).mul(mix(0.92, 1.16, matrixSizeSeed));
    matrixHaloMaterial.scaleNode = vec2(0.76, 1.06);
    matrixHaloMaterial.fragmentNode = matrixGlyphFragment(
      this.glyphAtlas,
      matrixGlyph,
      matrixLaneSeed,
      matrixChangeSeed,
      matrixCadenceSeed,
      matrixFlickerSeed,
      matrixVerticalNode,
      this.time,
      this.matrixMix,
      true,
    );
    this.matrixHaloSprite = this.addMainSprite(matrixHaloMaterial, matrixIndices.length, 3);

    const inkIndices = makeStyleIndices(
      count,
      this.constrained ? 6_000 : 12_000,
      47_983,
      5_117,
    );
    const inkKindValues = seededScalars(inkIndices, 613);
    const inkTargetData = new Float32Array(inkIndices.length * 4);
    const inkParametersA = new Float32Array(inkIndices.length * 4);
    const inkParametersB = new Float32Array(inkIndices.length * 4);
    const sumi = new THREE.Color(0x07100e);
    const blueGray = new THREE.Color(0x3c5358);
    const celadon = new THREE.Color(0x526b60);
    inkIndices.forEach((sourceIndex, index) => {
      const wash = inkKindValues[index] > 0.74;
      const sourceOffset = sourceIndex * 3;
      const parameterOffsetA = index * 4;
      const x = targetPositions[sourceOffset];
      const y = targetPositions[sourceOffset + 1];
      const z = targetPositions[sourceOffset + 2];
      const clusterField = THREE.MathUtils.clamp(
        0.5 + (
          Math.sin(x * 1.37 + y * 0.72)
          + Math.sin(y * 1.81 - z * 0.63) * 0.72
          + Math.sin(z * 2.13 + x * 0.48) * 0.46
        ) / 4.36,
        0,
        1,
      );
      const clustered = THREE.MathUtils.smoothstep(clusterField, 0.24, 0.78);
      const clusterStrength = 0.07 + Math.pow(clustered, 1.45) * 0.93;
      inkTargetData[parameterOffsetA] = targetPositions[sourceOffset];
      inkTargetData[parameterOffsetA + 1] = targetPositions[sourceOffset + 1];
      inkTargetData[parameterOffsetA + 2] = targetPositions[sourceOffset + 2];
      inkParametersA[parameterOffsetA] = seededValue(sourceIndex, 607);
      inkParametersA[parameterOffsetA + 1] = wash ? 1 : 0;
      inkParametersA[parameterOffsetA + 2] = THREE.MathUtils.clamp(
        seededValue(sourceIndex, 617) * 0.68 + clusterStrength * 0.32,
        0,
        1,
      );
      inkParametersB[parameterOffsetA] = wash
        ? (0.07 + seededValue(sourceIndex, 619) * 0.11) * clusterStrength
        : (0.45 + seededValue(sourceIndex, 631) * 0.43) * clusterStrength;
      const color = wash
        ? blueGray.clone().lerp(celadon, seededValue(sourceIndex, 641) * 0.72)
        : sumi.clone().lerp(blueGray, seededValue(sourceIndex, 643) * 0.2);
      inkParametersB[parameterOffsetA + 1] = color.r;
      inkParametersB[parameterOffsetA + 2] = color.g;
      inkParametersB[parameterOffsetA + 3] = color.b;
    });
    const inkTarget = vec4Attribute(inkTargetData).xyz;
    const inkParameterNodeA = vec4Attribute(inkParametersA);
    const inkParameterNodeB = vec4Attribute(inkParametersB);
    const inkShapeSeed = inkParameterNodeA.x;
    const inkKind = inkParameterNodeA.y;
    const inkScale = inkParameterNodeA.z;
    const inkOpacity = inkParameterNodeB.x;
    const inkPigment = inkParameterNodeB.yzw;

    const inkDepositMaterial = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
      fog: false,
    });
    inkDepositMaterial.positionNode = inkTarget;
    inkDepositMaterial.sizeNode = this.pointSize
      .mul(mix(2.35, 8.2, inkKind))
      .mul(mix(0.72, 1.28, inkScale));
    inkDepositMaterial.scaleNode = vec2(
      mix(0.72, 1.34, inkShapeSeed),
      mix(0.76, 1.26, inkScale),
    );
    inkDepositMaterial.rotationNode = inkShapeSeed.mul(Math.PI * 2);
    inkDepositMaterial.fragmentNode = inkDepositFragment(
      inkPigment,
      inkOpacity,
      inkKind,
      inkShapeSeed,
    );
    this.inkDepositSprite = makeInstancedSprite(inkDepositMaterial, inkIndices.length);
    this.inkDepositSprite.renderOrder = 1;
    this.inkSprites.push(this.inkDepositSprite);
    this.inkMaterials.push(inkDepositMaterial);
    this.inkGroup.add(this.inkDepositSprite);
    this.inkScene.add(this.inkGroup);

    this.inkDepositTarget = new THREE.RenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.inkDepositTarget.texture.name = "Stylized materialization ink deposit";
    this.inkBlurHorizontalTarget = new THREE.RenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.inkBlurHorizontalTarget.texture.name = "Stylized materialization ink horizontal blur";
    this.inkBlurVerticalTarget = new THREE.RenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.inkBlurVerticalTarget.texture.name = "Stylized materialization ink vertical blur";

    this.inkBlurHorizontalMaterial = new THREE.MeshBasicNodeMaterial({
      depthWrite: false,
      depthTest: false,
      transparent: false,
    });
    this.inkBlurHorizontalMaterial.fragmentNode = blurFragment(
      this.inkDepositTarget.texture,
      this.inkTexelSize,
      true,
    );
    this.inkBlurVerticalMaterial = new THREE.MeshBasicNodeMaterial({
      depthWrite: false,
      depthTest: false,
      transparent: false,
    });
    this.inkBlurVerticalMaterial.fragmentNode = blurFragment(
      this.inkBlurHorizontalTarget.texture,
      this.inkTexelSize,
      false,
    );
    this.blurQuad = new THREE.QuadMesh(this.inkBlurHorizontalMaterial);

    const backgroundNode = Fn(() => {
      const paperUv = screenUV.mul(vec2(1.72, 1.16));
      const paper = texture(this.paperTexture, paperUv).rgb;
      const sharp = texture(this.inkDepositTarget.texture, screenUV);
      const blurred = texture(this.inkBlurVerticalTarget.texture, screenUV);
      const pooledEdge = max(sharp.a.sub(blurred.a.mul(0.78)), 0);
      const fiberCell = floor(screenUV.mul(vec2(683, 421)));
      const fiber = sin(dot(fiberCell, vec2(12.9898, 78.233))).mul(43_758.5453).fract();
      const washAlpha = min(
        blurred.a.mul(mix(0.84, 1.08, fiber)).add(pooledEdge.mul(0.22)),
        0.9,
      );
      const pooledPigment = mix(
        blurred.rgb,
        sharp.rgb,
        min(pooledEdge.mul(0.72), 0.36),
      );
      const absorption = vec3(1)
        .sub(washAlpha.mul(0.955))
        .add(pooledPigment.mul(0.86));
      const inkPaper = paper.mul(clamp(absorption, 0.04, 1));
      const cyberBackground = vec3(0.003, 0.005, 0.018);
      const matrixBackground = vec3(0.001, 0.012, 0.006);
      const composite = cyberBackground.mul(this.cyberMix)
        .add(matrixBackground.mul(this.matrixMix))
        .add(inkPaper.mul(this.inkMix));
      return vec4(composite, 1);
    })();
    this.scene.backgroundNode = backgroundNode;
    this.scene.add(this.group);
    this.resize(context.width, context.height, context.dpr);
    this.applyStyleVisibility();
  }

  private addMainSprite(
    material: THREE.PointsNodeMaterial,
    count: number,
    renderOrder: number,
  ): THREE.Sprite {
    const sprite = makeInstancedSprite(material, count);
    sprite.renderOrder = renderOrder;
    this.mainMaterials.push(material);
    this.mainSprites.push(sprite);
    this.group.add(sprite);
    return sprite;
  }

  private setMix(values: StyleMix): void {
    this.cyberMix.value = values[0];
    this.matrixMix.value = values[1];
    this.inkMix.value = values[2];
    this.applyStyleVisibility();
  }

  private currentMix(): StyleMix {
    return [
      Number(this.cyberMix.value) || 0,
      Number(this.matrixMix.value) || 0,
      Number(this.inkMix.value) || 0,
    ];
  }

  private applyStyleVisibility(): void {
    const cyberVisible = Number(this.cyberMix.value) > 0.001;
    const matrixVisible = Number(this.matrixMix.value) > 0.001;
    const matrixOcclusionVisible = Number(this.matrixMix.value) > 0.92;
    this.cyberCoreSprite.visible = cyberVisible;
    this.cyberHaloSprite.visible = cyberVisible;
    this.matrixDepthSprite.visible = matrixOcclusionVisible;
    this.matrixCoreSprite.visible = matrixVisible;
    this.matrixHaloSprite.visible = matrixVisible;
  }

  update(frame: EffectFrame): void {
    this.lastElapsed = frame.elapsed;
    if (this.transitionActive) {
      if (this.reducedMotion || frame.static === true) {
        this.setMix(this.transitionTo);
        this.transitionActive = false;
      } else {
        const progress = smoothMix(
          (frame.elapsed - this.transitionStartedAt) / PRESET_TRANSITION_SECONDS,
        );
        this.setMix([
          THREE.MathUtils.lerp(this.transitionFrom[0], this.transitionTo[0], progress),
          THREE.MathUtils.lerp(this.transitionFrom[1], this.transitionTo[1], progress),
          THREE.MathUtils.lerp(this.transitionFrom[2], this.transitionTo[2], progress),
        ]);
        if (progress >= 1) this.transitionActive = false;
      }
    }

    const shaderTime = this.reducedMotion ? 0 : frame.elapsed;
    const delta = this.reducedMotion ? 0 : Math.min(Math.max(frame.delta, 0), 0.05);
    this.time.value = shaderTime;

    const rotationSpeed = Number(this.cyberMix.value) * 0.082
      + Number(this.matrixMix.value) * 0.045
      + Number(this.inkMix.value) * 0.018;
    const targetMotionScale = this.terrainTarget ? 0.22 : 1;
    this.groupRotationY += delta * rotationSpeed * targetMotionScale;
    this.group.rotation.y = this.groupRotationY;
    this.group.rotation.x = Math.sin(shaderTime * 0.13) * (
      Number(this.inkMix.value) * 0.028
      + Number(this.matrixMix.value) * 0.045
      + Number(this.cyberMix.value) * 0.055
    ) * targetMotionScale;
    this.inkGroup.rotation.copy(this.group.rotation);
  }

  prepareRender(): void {
    if (this.inkPrepared && Number(this.inkMix.value) <= 0.001) return;
    const previousTarget = this.renderer.getRenderTarget();
    const previousClear = this.renderer.getClearColor(new THREE.Color());
    const previousAlpha = this.renderer.getClearAlpha();
    const previousAutoClear = this.renderer.autoClear;
    try {
      this.renderer.autoClear = true;
      this.renderer.setClearColor(0x000000, 0);

      this.renderer.setRenderTarget(this.inkDepositTarget);
      this.renderer.clear();
      this.renderer.render(this.inkScene, this.camera);

      this.renderer.setRenderTarget(this.inkBlurHorizontalTarget);
      this.renderer.clear();
      this.blurQuad.material = this.inkBlurHorizontalMaterial;
      this.blurQuad.render(this.renderer);

      this.renderer.setRenderTarget(this.inkBlurVerticalTarget);
      this.renderer.clear();
      this.blurQuad.material = this.inkBlurVerticalMaterial;
      this.blurQuad.render(this.renderer);
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setClearColor(previousClear, previousAlpha);
      this.renderer.autoClear = previousAutoClear;
    }
    this.inkPrepared = true;
  }

  resize(width: number, height: number, dpr: number): void {
    const safeHeight = Math.max(1, height);
    const aspect = Math.max(1, width) / safeHeight;
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * aspect);
    const fitFov = Math.min(verticalFov, horizontalFov);
    const cameraDistance = this.targetRadius
      / Math.sin(Math.max(fitFov * 0.5, 0.01))
      * CAMERA_FIT_PADDING;
    this.camera.aspect = aspect;
    this.camera.position.copy(this.cameraDirection).multiplyScalar(cameraDistance);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    const resolutionScale = this.constrained ? 0.25 : 0.5;
    const pixelRatio = clampDpr(dpr);
    let targetWidth = Math.max(1, Math.round(width * pixelRatio * resolutionScale));
    let targetHeight = Math.max(1, Math.round(height * pixelRatio * resolutionScale));
    const longEdge = Math.max(targetWidth, targetHeight);
    if (longEdge > INK_TARGET_LONG_EDGE) {
      const scale = INK_TARGET_LONG_EDGE / longEdge;
      targetWidth = Math.max(1, Math.round(targetWidth * scale));
      targetHeight = Math.max(1, Math.round(targetHeight * scale));
    }
    this.inkDepositTarget.setSize(targetWidth, targetHeight);
    this.inkBlurHorizontalTarget.setSize(targetWidth, targetHeight);
    this.inkBlurVerticalTarget.setSize(targetWidth, targetHeight);
    this.inkTexelSize.value.set(1 / targetWidth, 1 / targetHeight);
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    const nextPreset = preset as (typeof PRESETS)[number];
    const nextIndex = PRESETS.indexOf(nextPreset);
    const nextMix: StyleMix = [
      nextIndex === 0 ? 1 : 0,
      nextIndex === 1 ? 1 : 0,
      nextIndex === 2 ? 1 : 0,
    ];
    if (!this.presetInitialized) {
      this.presetInitialized = true;
      this.currentPreset = nextPreset;
      this.transitionFrom = nextMix;
      this.transitionTo = nextMix;
      this.setMix(nextMix);
      this.transitionActive = false;
      return;
    }
    if (this.currentPreset === nextPreset && !this.transitionActive) return;
    this.currentPreset = nextPreset;
    this.transitionFrom = this.currentMix();
    this.transitionTo = nextMix;
    this.transitionStartedAt = this.lastElapsed;
    if (this.reducedMotion) {
      this.setMix(nextMix);
      this.transitionActive = false;
    } else {
      this.transitionActive = true;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.inkScene.remove(this.inkGroup);
    this.mainSprites.forEach((sprite) => sprite.geometry.dispose());
    this.inkSprites.forEach((sprite) => sprite.geometry.dispose());
    this.mainMaterials.forEach((material) => material.dispose());
    this.inkMaterials.forEach((material) => material.dispose());
    this.inkBlurHorizontalMaterial.dispose();
    this.inkBlurVerticalMaterial.dispose();
    this.inkDepositTarget.dispose();
    this.inkBlurHorizontalTarget.dispose();
    this.inkBlurVerticalTarget.dispose();
    this.glyphAtlas.dispose();
    this.paperTexture.dispose();
    this.scene.backgroundNode = null;
    this.group.clear();
    this.inkGroup.clear();
    this.inkScene.clear();
    this.scene.clear();
  }
}

async function loadGlyphAtlas(): Promise<THREE.Texture> {
  const atlas = await new THREE.TextureLoader().loadAsync(MATRIX_SDF_ATLAS_URL);
  atlas.name = "Stylized materialization Matrix binary SDF atlas";
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.generateMipmaps = true;
  atlas.needsUpdate = true;
  return atlas;
}

export async function create(context: EffectRuntimeContext): Promise<EffectInstance> {
  const glyphAtlas = await loadGlyphAtlas();
  try {
    return new StylizedMaterializationRuntime(context, glyphAtlas);
  } catch (error) {
    glyphAtlas.dispose();
    throw error;
  }
}

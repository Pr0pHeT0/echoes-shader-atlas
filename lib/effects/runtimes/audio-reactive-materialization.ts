import * as THREE from "three/webgpu";
import {
  Fn,
  cos,
  cross,
  dot,
  instanceIndex,
  instancedArray,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  modelViewMatrix,
  normalize,
  pow,
  sRGBTransferEOTF,
  sin,
  smoothstep,
  sqrt,
  uniform,
  uv,
  varying,
  vec3,
  vec4,
} from "three/tsl";

import { createSegmentedTorusKnot, seededValue } from "../geometry";
import {
  MATERIALIZATION_ARRIVAL_ARC_MAX,
  MATERIALIZATION_ARRIVAL_ARC_MIN,
  MATERIALIZATION_ARRIVAL_STAGGER,
  MATERIALIZATION_ARRIVAL_WINDOW,
  MATERIALIZATION_BLOOM_NORMAL_LIFT_MAX,
  MATERIALIZATION_BLOOM_NORMAL_LIFT_MIN,
  MATERIALIZATION_MAX_POINT_FLARE,
  MATERIALIZATION_TRANSITION_VARIANTS,
  MATERIALIZATION_VORTEX_TURNS_MAX,
  MATERIALIZATION_VORTEX_TURNS_MIN,
  MATERIALIZATION_WAVE_NORMAL_LIFT,
  isMaterializationTransitionVariant,
  materializationSpatialPhase,
  materializationTransitionIndex,
} from "../materialization-transition-variants";
import type { MaterializationTransitionVariant } from "../materialization-transition-variants";
import {
  advanceMaterializationMotionCrossfade,
  advanceMaterializationMotionPhase,
  isMaterializationMotionVariant,
  MATERIALIZATION_BREATHE_AMPLITUDE,
  MATERIALIZATION_BREATHE_ANGULAR_SPEED,
  MATERIALIZATION_DRIFT_AMPLITUDE_MAX,
  MATERIALIZATION_DRIFT_AMPLITUDE_MIN,
  MATERIALIZATION_DRIFT_ANGULAR_SPEED,
  MATERIALIZATION_DRIFT_SECONDARY_RATIO,
  MATERIALIZATION_FLUTTER_BITANGENT_AMPLITUDE,
  MATERIALIZATION_FLUTTER_BITANGENT_SEED_SCALE,
  MATERIALIZATION_FLUTTER_BITANGENT_SPEED,
  MATERIALIZATION_FLUTTER_TANGENT_AMPLITUDE,
  MATERIALIZATION_FLUTTER_TANGENT_SPEED,
  MATERIALIZATION_MOTION_CROSSFADE_SECONDS,
  MATERIALIZATION_MOTION_MAX_OFFSET,
  MATERIALIZATION_MOTION_VARIANTS,
  MATERIALIZATION_ORBIT_AMPLITUDE_MAX,
  MATERIALIZATION_ORBIT_AMPLITUDE_MIN,
  MATERIALIZATION_ORBIT_ANGULAR_SPEED,
  MATERIALIZATION_RIPPLE_AMPLITUDE,
  MATERIALIZATION_RIPPLE_ANGULAR_SPEED,
  MATERIALIZATION_RIPPLE_RING_COUNT,
  MATERIALIZATION_TWIST_AMPLITUDE,
  MATERIALIZATION_TWIST_ANGULAR_SPEED,
  materializationMotionIndex,
} from "../materialization-motion";
import type { MaterializationMotionVariant } from "../materialization-motion";
import {
  advanceMaterializationProgress,
  initialMaterializationProgress,
  materializationTarget,
} from "../materialization-transition";
import type { MaterializationProgressTarget } from "../materialization-transition";
import { EFFECT_PRESETS, MATERIALIZATION_DEFAULTS } from "../runtime-config";
import {
  clampDpr,
  makeShowcaseScene,
  resolveMaterializationPointSize,
  resolveParticleCount,
} from "../runtime-utils";
import { simplexNoise4d } from "../tsl/simplex-noise-4d";
import type {
  EffectFrame,
  EffectInstance,
  EffectRuntimeContext,
} from "../types";

const PRESETS = EFFECT_PRESETS["audio-reactive-materialization"];
const SURFACE_FADE_START = 0.62;
const SURFACE_FADE_END = 0.94;
const LIVE_POINT_SCALE = 1.4;
const SETTLED_SHELL_SCALE = 0.45;
const SETTLED_SPARK_SCALE = 0.28;
const SETTLED_SPARK_LIFT = 0.018;
const SPATIAL_SEED_MIX = 0.15;

type FloatNode = THREE.Node<"float">;
type Vec3Node = THREE.Node<"vec3">;

function makeSpatialPhases(
  positions: Float32Array,
  arrivalSeeds: Float32Array,
): { height: Float32Array; radius: Float32Array } {
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  let minRadius = Number.POSITIVE_INFINITY;
  let maxRadius = Number.NEGATIVE_INFINITY;
  const radii = new Float32Array(arrivalSeeds.length);

  for (let index = 0; index < arrivalSeeds.length; index += 1) {
    const offset = index * 3;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    const radius = Math.hypot(x, y, z);
    radii[index] = radius;
    minHeight = Math.min(minHeight, y);
    maxHeight = Math.max(maxHeight, y);
    minRadius = Math.min(minRadius, radius);
    maxRadius = Math.max(maxRadius, radius);
  }

  const height = new Float32Array(arrivalSeeds.length);
  const radius = new Float32Array(arrivalSeeds.length);
  for (let index = 0; index < arrivalSeeds.length; index += 1) {
    const seed = arrivalSeeds[index];
    height[index] = materializationSpatialPhase(
      positions[index * 3 + 1],
      minHeight,
      maxHeight,
    ) ?? seed;
    radius[index] = materializationSpatialPhase(radii[index], minRadius, maxRadius) ?? seed;
  }
  return { height, radius };
}

function makeInstancedSprite(material: THREE.PointsNodeMaterial, count: number): THREE.Sprite {
  // Sprite's public type has not yet caught up with its runtime NodeMaterial support.
  const sprite = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  // The common renderer releases node-level attributes from the geometry's
  // dispose listener. Do not leave material-specific buffers on Sprite's
  // module-level shared quad, which intentionally lives for Three's lifetime.
  sprite.geometry = sprite.geometry.clone();
  sprite.count = count;
  sprite.frustumCulled = false;
  return sprite;
}

function disposeComputeOnlyStorage(
  renderer: THREE.WebGPURenderer,
  storage: THREE.StorageBufferNode<"vec4">,
): void {
  // r185 exposes no public per-storage-buffer disposal method. Render-visible
  // buffers are released by owned geometry disposal; this compute-only input
  // must go through the renderer's Attributes manager before renderer reuse.
  const attributes = (renderer as THREE.WebGPURenderer & {
    _attributes?: { delete(attribute: THREE.BufferAttribute): unknown };
  })._attributes;
  attributes?.delete(storage.value);
}

function sphereFragment(
  displayColor: Vec3Node,
  fogDepth: FloatNode,
  opacity: FloatNode | number = 1,
): THREE.Node<"vec4"> {
  const fogColorValue = new THREE.Color(0x03060d);
  const fogColor = vec3(fogColorValue.r, fogColorValue.g, fogColorValue.b);
  return Fn(() => {
    const coordinate = uv().mul(2).sub(1);
    const radiusSquared = dot(coordinate, coordinate);
    radiusSquared.greaterThan(1).discard();
    const normal = vec3(coordinate, sqrt(max(0, radiusSquared.oneMinus())));
    const lightDirection = normalize(vec3(0.5, 0.8, 1));
    const diffuse = max(dot(normal, lightDirection), 0);
    const halfDirection = normalize(lightDirection.add(vec3(0, 0, 1)));
    const specular = pow(max(dot(normal, halfDirection), 0), 32);
    const litColor = displayColor.mul(diffuse.mul(0.5).add(0.5)).add(vec3(0.05).mul(specular));
    const fogFactor = smoothstep(5.5, 12, fogDepth);
    return vec4(
      sRGBTransferEOTF(mix(litColor, fogColor, fogFactor)) as THREE.Node<"vec3">,
      opacity,
    );
  })();
}

class MaterializationRuntime implements EffectInstance {
  readonly id = "audio-reactive-materialization" as const;
  readonly presets = PRESETS;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGPURenderer;
  private readonly reducedMotion: boolean;
  private readonly group = new THREE.Group();
  private readonly material: THREE.PointsNodeMaterial;
  private readonly points: THREE.Sprite;
  private readonly sectionMeshes: Array<THREE.Mesh | THREE.Sprite> = [];
  private readonly sectionMaterials: THREE.Material[] = [];
  private readonly sectionGeometries: THREE.BufferGeometry[] = [];
  private readonly particles: THREE.StorageBufferNode<"vec4">;
  private readonly initialParticles: THREE.StorageBufferNode<"vec4">;
  private readonly base: THREE.StorageBufferNode<"vec4">;
  private readonly computeNode: THREE.ComputeNode;
  private readonly resetComputeNode: THREE.ComputeNode;

  private readonly time = uniform(0);
  private readonly deltaTime = uniform(0);
  private readonly flowFieldInfluence = uniform(MATERIALIZATION_DEFAULTS.flowFieldInfluence);
  private readonly flowFieldStrength = uniform(MATERIALIZATION_DEFAULTS.flowFieldStrength);
  private readonly flowFieldFrequency = uniform(MATERIALIZATION_DEFAULTS.flowFieldFrequency);
  private readonly audioLevel = uniform(0);
  private readonly bass = uniform(0);
  private readonly mid = uniform(0);
  private readonly treble = uniform(0);
  private readonly shaderEnabled = uniform(1);
  private readonly flowEnabled = uniform(1);
  private readonly midFlowTimeEnabled = uniform(0);
  private readonly midFlowTimeStrength = uniform(MATERIALIZATION_DEFAULTS.midFlowTimeStrength);
  private readonly bassFlowInfluenceEnabled = uniform(0);
  private readonly bassFlowInfluenceStrength = uniform(MATERIALIZATION_DEFAULTS.bassFlowInfluenceStrength);
  private readonly trebleFlowFrequencyEnabled = uniform(0);
  private readonly trebleFlowFrequencyStrength = uniform(MATERIALIZATION_DEFAULTS.trebleFlowFrequencyStrength);
  private readonly audioGateEnabled = uniform(0);
  private readonly audioGateLow = uniform(MATERIALIZATION_DEFAULTS.audioGateLow);
  private readonly audioGateHigh = uniform(MATERIALIZATION_DEFAULTS.audioGateHigh);
  private readonly audioGateBassMix = uniform(MATERIALIZATION_DEFAULTS.audioGateBassMix);
  private readonly bassFlowStrengthEnabled = uniform(0);
  private readonly bassFlowStrength = uniform(MATERIALIZATION_DEFAULTS.bassFlowStrength);
  private readonly audioFlowEnabled = uniform(0);
  private readonly audioFlowStrength = uniform(MATERIALIZATION_DEFAULTS.audioFlowStrength);
  private readonly returnEnabled = uniform(1);
  private readonly returnStrength = uniform(MATERIALIZATION_DEFAULTS.returnStrength);
  private readonly coalescenceProgress = uniform(0);
  private readonly transitionVariantIndex = uniform(0);
  private readonly previousMotionVariantIndex = uniform(0);
  private readonly motionVariantIndex = uniform(0);
  private readonly previousMotionPhase = uniform(0);
  private readonly motionPhase = uniform(0);
  private readonly motionCrossfadeProgress = uniform(1);
  private readonly bassRadialEnabled = uniform(0);
  private readonly bassRadialPhase = uniform(MATERIALIZATION_DEFAULTS.bassRadialPhase);
  private readonly bassRadialStrength = uniform(MATERIALIZATION_DEFAULTS.bassRadialStrength);
  private readonly trebleSizeEnabled = uniform(0);
  private readonly trebleSizeStrength = uniform(MATERIALIZATION_DEFAULTS.trebleSizeStrength);
  private readonly pointSize: FloatNode;

  private currentPreset: (typeof PRESETS)[number] = "dormant";
  private currentTransitionVariant: MaterializationTransitionVariant =
    MATERIALIZATION_TRANSITION_VARIANTS[0];
  private currentMotionVariant: MaterializationMotionVariant = MATERIALIZATION_MOTION_VARIANTS[0];
  private transitionProgress = 0;
  private transitionTarget: MaterializationProgressTarget = 0;
  private previousMotionPhaseSeconds = 0;
  private motionPhaseSeconds = 0;
  private motionCrossfadeProgressValue = 1;
  private pendingMotionVariant: MaterializationMotionVariant | null = null;
  private resetPending = false;

  constructor(context: EffectRuntimeContext) {
    this.renderer = context.renderer;
    this.reducedMotion = context.reducedMotion;
    this.currentTransitionVariant = isMaterializationTransitionVariant(context.transitionVariant)
      ? context.transitionVariant
      : MATERIALIZATION_TRANSITION_VARIANTS[0];
    this.currentMotionVariant = isMaterializationMotionVariant(context.motionVariant)
      ? context.motionVariant
      : MATERIALIZATION_MOTION_VARIANTS[0];
    this.transitionVariantIndex.value = materializationTransitionIndex(
      this.currentTransitionVariant,
    );
    this.previousMotionVariantIndex.value = materializationMotionIndex(
      this.currentMotionVariant,
    );
    this.motionVariantIndex.value = materializationMotionIndex(this.currentMotionVariant);
    ({ scene: this.scene, camera: this.camera } = makeShowcaseScene(
      context.width,
      context.height,
      new THREE.Vector3(0, 0.15, 6.8),
    ));
    this.scene.fog = new THREE.Fog(0x03060d, 5.5, 12);
    this.scene.add(new THREE.HemisphereLight(0xc8f8ff, 0x160d28, 1.35));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 4, 5);
    this.scene.add(keyLight);

    const count = resolveParticleCount(context);
    const uploaded = context.pointCloud
      && context.pointCloud.count > 0
      && context.pointCloud.positions.length >= context.pointCloud.count * 3
      && context.pointCloud.normals.length >= context.pointCloud.count * 3
      && context.pointCloud.tangents.length >= context.pointCloud.count * 3
      && context.pointCloud.colors.length >= context.pointCloud.count * 3
      ? context.pointCloud
      : null;
    const knot = uploaded ? null : createSegmentedTorusKnot(count);
    const targetPositions = uploaded ? new Float32Array(count * 3) : knot!.positions;
    const targetNormals = uploaded ? new Float32Array(count * 3) : knot!.normals;
    const targetTangents = uploaded ? new Float32Array(count * 3) : knot!.tangents;
    const targetColors = uploaded ? new Float32Array(count * 3) : knot!.colors;
    if (uploaded) {
      for (let index = 0; index < count; index += 1) {
        const sourceIndex = index % uploaded.count;
        const sourceOffset = sourceIndex * 3;
        const targetOffset = index * 3;
        targetPositions[targetOffset] = uploaded.positions[sourceOffset];
        targetPositions[targetOffset + 1] = uploaded.positions[sourceOffset + 1];
        targetPositions[targetOffset + 2] = uploaded.positions[sourceOffset + 2];
        targetNormals[targetOffset] = uploaded.normals[sourceOffset];
        targetNormals[targetOffset + 1] = uploaded.normals[sourceOffset + 1];
        targetNormals[targetOffset + 2] = uploaded.normals[sourceOffset + 2];
        targetTangents[targetOffset] = uploaded.tangents[sourceOffset];
        targetTangents[targetOffset + 1] = uploaded.tangents[sourceOffset + 1];
        targetTangents[targetOffset + 2] = uploaded.tangents[sourceOffset + 2];
        targetColors[targetOffset] = uploaded.colors[sourceOffset];
        targetColors[targetOffset + 1] = uploaded.colors[sourceOffset + 1];
        targetColors[targetOffset + 2] = uploaded.colors[sourceOffset + 2];
      }
    }

    const baseData = new Float32Array(count * 4);
    const particleData = new Float32Array(count * 4);
    const sizes = new Float32Array(count);
    const arrivalSeeds = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const positionOffset = index * 3;
      const storageOffset = index * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = targetPositions[positionOffset + channel];
        baseData[storageOffset + channel] = value;
        particleData[storageOffset + channel] = value;
      }
      const azimuth = seededValue(index, 71) * Math.PI * 2;
      const vertical = seededValue(index, 73) * 2 - 1;
      const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      const radius = 0.65 + seededValue(index, 79) * 1.35;
      particleData[storageOffset] += Math.cos(azimuth) * horizontal * radius;
      particleData[storageOffset + 1] += vertical * radius;
      particleData[storageOffset + 2] += Math.sin(azimuth) * horizontal * radius;
      const lifetime = seededValue(index, 41);
      baseData[storageOffset + 3] = lifetime;
      particleData[storageOffset + 3] = lifetime;
      sizes[index] = seededValue(index, 43);
      arrivalSeeds[index] = seededValue(index, 83);
    }
    const spatialPhases = makeSpatialPhases(targetPositions, arrivalSeeds);
    const particleTraits = new Float32Array(count * 4);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 4;
      particleTraits[offset] = sizes[index];
      particleTraits[offset + 1] = arrivalSeeds[index];
      particleTraits[offset + 2] = spatialPhases.height[index];
      particleTraits[offset + 3] = spatialPhases.radius[index];
    }

    this.particles = instancedArray(particleData, "vec4").setName("MaterializationParticles");
    this.initialParticles = instancedArray(particleData.slice(), "vec4")
      .setName("MaterializationInitialParticles")
      .toReadOnly();
    this.base = instancedArray(baseData, "vec4").setName("MaterializationBase").toReadOnly();

    this.resetComputeNode = Fn(() => {
      const particleElement = this.particles.element(instanceIndex);
      particleElement.assign(vec4(this.initialParticles.element(instanceIndex)));
    })().compute(count, [64]).setName("Materialization deterministic scatter reset");

    this.computeNode = Fn(() => {
      const particleElement = this.particles.element(instanceIndex);
      const particle = vec4(particleElement).toVar();
      const base = vec4(this.base.element(instanceIndex)).toVar();
      const time = this.time.mul(0.2).add(
        this.mid.mul(this.midFlowTimeStrength).mul(this.midFlowTimeEnabled).mul(this.shaderEnabled),
      );
      const noiseStrength = simplexNoise4d(vec4(base.xyz.mul(0.7), time.add(1)));
      const influence = this.flowFieldInfluence.sub(0.5).mul(-2).sub(
        this.bass
          .mul(this.bassFlowInfluenceStrength)
          .mul(this.bassFlowInfluenceEnabled)
          .mul(this.shaderEnabled),
      );
      const strength = smoothstep(influence, 1, noiseStrength);
      const frequency = this.flowFieldFrequency.add(
        this.treble
          .mul(this.trebleFlowFrequencyStrength)
          .mul(this.trebleFlowFrequencyEnabled)
          .mul(this.shaderEnabled),
      );
      const flowPoint = particle.xyz.mul(frequency);
      const flowField = normalize(vec3(
        simplexNoise4d(vec4(flowPoint, time)),
        simplexNoise4d(vec4(flowPoint.add(1), time)),
        simplexNoise4d(vec4(flowPoint.add(2), time)),
      ));

      const audioInput = this.audioLevel.add(this.bass.mul(this.audioGateBassMix));
      const audioActivity = mix(
        1,
        smoothstep(this.audioGateLow, this.audioGateHigh, audioInput),
        this.audioGateEnabled,
      );
      const bassStrength = this.bass
        .mul(this.bassFlowStrength)
        .mul(this.bassFlowStrengthEnabled)
        .mul(this.shaderEnabled);
      const audioStrength = audioInput
        .mul(this.audioFlowStrength)
        .mul(this.audioFlowEnabled)
        .mul(this.shaderEnabled);
      const currentStrength = this.flowFieldStrength
        .add(bassStrength)
        .add(audioStrength)
        .mul(audioActivity)
        .mul(this.flowEnabled)
        .mul(this.shaderEnabled);
      particle.xyz.addAssign(flowField.mul(this.deltaTime).mul(strength).mul(currentStrength));
      particle.xyz.addAssign(
        base.xyz
          .sub(particle.xyz)
          .mul(this.deltaTime)
          .mul(this.returnStrength)
          .mul(this.returnEnabled)
          .mul(this.shaderEnabled),
      );
      particleElement.assign(particle);
    })().compute(count, [64]).setName("Materialization flow field");

    const pointSize = uploaded
      ? resolveMaterializationPointSize(uploaded.triangleCount, uploaded.meshCount)
      : MATERIALIZATION_DEFAULTS.size;
    this.pointSize = uniform(pointSize);
    const particle = this.particles.toAttribute();
    const particleColor = instancedBufferAttribute<"vec3">(
      new THREE.InstancedBufferAttribute(targetColors, 3),
      "vec3",
    );
    const particleTrait = instancedBufferAttribute<"vec4">(
      new THREE.InstancedBufferAttribute(particleTraits, 4),
      "vec4",
    );
    const targetPosition = instancedBufferAttribute<"vec3">(
      new THREE.InstancedBufferAttribute(targetPositions, 3),
      "vec3",
    );
    const targetNormal = instancedBufferAttribute<"vec3">(
      new THREE.InstancedBufferAttribute(targetNormals, 3),
      "vec3",
    );
    const targetTangent = instancedBufferAttribute<"vec3">(
      new THREE.InstancedBufferAttribute(targetTangents, 3),
      "vec3",
    );
    const particleSize = particleTrait.x;
    const arrivalSeed = particleTrait.y;
    const heightPhase = particleTrait.z;
    const radialPhase = particleTrait.w;
    const bloomArrivalOrder = mix(radialPhase, arrivalSeed, SPATIAL_SEED_MIX);
    const waveArrivalOrder = mix(heightPhase, arrivalSeed, SPATIAL_SEED_MIX);
    const arrivalOrder = this.transitionVariantIndex.lessThan(1.5).select(
      arrivalSeed,
      this.transitionVariantIndex.lessThan(2.5).select(bloomArrivalOrder, waveArrivalOrder),
    );
    const arrivalStart = arrivalOrder.mul(MATERIALIZATION_ARRIVAL_STAGGER);
    const arrival = smoothstep(
      arrivalStart,
      arrivalStart.add(MATERIALIZATION_ARRIVAL_WINDOW),
      this.coalescenceProgress,
    );
    const arrivalEnvelope = sin(arrival.mul(Math.PI));
    const tangentCross = cross(targetNormal, targetTangent);
    const bitangent = tangentCross.div(max(length(tangentCross), 1e-7));
    const arcAngle = arrivalSeed.mul(Math.PI * 2);
    const arcDirection = targetTangent.mul(cos(arcAngle)).add(bitangent.mul(sin(arcAngle)));
    const arcStrength = mix(
      MATERIALIZATION_ARRIVAL_ARC_MIN,
      MATERIALIZATION_ARRIVAL_ARC_MAX,
      arrivalSeed,
    )
      .mul(arrivalEnvelope);
    const linearPosition = mix(particle.xyz, targetPosition, arrival);
    const organicPosition = linearPosition
      .add(arcDirection.mul(arcStrength));

    const vortexTurns = mix(
      MATERIALIZATION_VORTEX_TURNS_MIN,
      MATERIALIZATION_VORTEX_TURNS_MAX,
      arrivalSeed,
    );
    const vortexAngle = arrival.mul(vortexTurns).mul(Math.PI * 2);
    const vortexCosine = cos(vortexAngle);
    const vortexSine = sin(vortexAngle);
    const vortexSource = vec3(
      particle.x.mul(vortexCosine).sub(particle.z.mul(vortexSine)),
      particle.y,
      particle.x.mul(vortexSine).add(particle.z.mul(vortexCosine)),
    );
    const vortexPosition = mix(vortexSource, targetPosition, arrival);

    const bloomNormalLift = mix(
      MATERIALIZATION_BLOOM_NORMAL_LIFT_MIN,
      MATERIALIZATION_BLOOM_NORMAL_LIFT_MAX,
      arrivalSeed,
    ).mul(arrivalEnvelope);
    const bloomPosition = linearPosition.add(targetNormal.mul(bloomNormalLift));

    const wavePhaseAngle = heightPhase.mul(Math.PI * 2).sub(arrival.mul(Math.PI * 2));
    const waveOscillation = sin(wavePhaseAngle);
    const waveCrest = max(waveOscillation, 0).mul(arrivalEnvelope);
    const wavePosition = linearPosition.add(
      targetNormal
        .mul(waveOscillation)
        .mul(arrivalEnvelope)
        .mul(MATERIALIZATION_WAVE_NORMAL_LIFT),
    );
    const convergencePosition = this.transitionVariantIndex.lessThan(0.5).select(
      organicPosition,
      this.transitionVariantIndex.lessThan(1.5).select(
        vortexPosition,
        this.transitionVariantIndex.lessThan(2.5).select(bloomPosition, wavePosition),
      ),
    );
    const surfaceMix = smoothstep(
      SURFACE_FADE_START,
      SURFACE_FADE_END,
      this.coalescenceProgress,
    );

    const continuousMotionOffset = (
      variantIndex: FloatNode,
      phase: FloatNode,
    ): Vec3Node => {
      const seededAngle = arrivalSeed.mul(Math.PI * 2);
      const motionNormal = targetNormal.div(max(length(targetNormal), 1e-7));
      const motionTangent = targetTangent.div(max(length(targetTangent), 1e-7));

      const driftAmplitude = mix(
        MATERIALIZATION_DRIFT_AMPLITUDE_MIN,
        MATERIALIZATION_DRIFT_AMPLITUDE_MAX,
        arrivalSeed,
      );
      const driftAngle = phase.mul(MATERIALIZATION_DRIFT_ANGULAR_SPEED).add(seededAngle);
      const driftOffset = motionTangent
        .mul(cos(driftAngle))
        .mul(driftAmplitude)
        .add(
          bitangent
            .mul(sin(driftAngle))
            .mul(driftAmplitude)
            .mul(MATERIALIZATION_DRIFT_SECONDARY_RATIO),
        );

      const horizontalRadius = vec3(targetPosition.x, 0, targetPosition.z);
      const horizontalRadiusLength = length(horizontalRadius);
      const horizontalRadial = horizontalRadius.div(max(horizontalRadiusLength, 1e-7));
      const orbitTangent = vec3(horizontalRadial.z.negate(), 0, horizontalRadial.x);
      const horizontalTargetTangent = vec3(motionTangent.x, 0, motionTangent.z);
      const fallbackOrbitTangent = horizontalTargetTangent.div(
        max(length(horizontalTargetTangent), 1e-7),
      );
      const safeOrbitTangent = horizontalRadiusLength.greaterThan(1e-7).select(
        orbitTangent,
        fallbackOrbitTangent,
      );
      const orbitAmplitude = mix(
        MATERIALIZATION_ORBIT_AMPLITUDE_MIN,
        MATERIALIZATION_ORBIT_AMPLITUDE_MAX,
        arrivalSeed,
      );
      const orbitAngle = phase.mul(MATERIALIZATION_ORBIT_ANGULAR_SPEED).add(seededAngle);
      const orbitOffset = horizontalRadial
        .mul(sin(orbitAngle))
        .add(safeOrbitTangent.mul(cos(orbitAngle)))
        .mul(orbitAmplitude);

      const breatheOffset = motionNormal
        .mul(sin(phase.mul(MATERIALIZATION_BREATHE_ANGULAR_SPEED).add(seededAngle)))
        .mul(MATERIALIZATION_BREATHE_AMPLITUDE);
      const rippleOffset = motionNormal
        .mul(sin(
          radialPhase
            .mul(Math.PI * 2 * MATERIALIZATION_RIPPLE_RING_COUNT)
            .sub(phase.mul(MATERIALIZATION_RIPPLE_ANGULAR_SPEED)),
        ))
        .mul(MATERIALIZATION_RIPPLE_AMPLITUDE);
      const twistOffset = safeOrbitTangent
        .mul(sin(
          phase
            .mul(MATERIALIZATION_TWIST_ANGULAR_SPEED)
            .add(heightPhase.mul(Math.PI * 2)),
        ))
        .mul(MATERIALIZATION_TWIST_AMPLITUDE);
      const flutterOffset = motionTangent
        .mul(sin(phase.mul(MATERIALIZATION_FLUTTER_TANGENT_SPEED).add(seededAngle)))
        .mul(MATERIALIZATION_FLUTTER_TANGENT_AMPLITUDE)
        .add(
          bitangent
            .mul(sin(
              phase
                .mul(MATERIALIZATION_FLUTTER_BITANGENT_SPEED)
                .add(seededAngle.mul(MATERIALIZATION_FLUTTER_BITANGENT_SEED_SCALE)),
            ))
            .mul(MATERIALIZATION_FLUTTER_BITANGENT_AMPLITUDE),
        );

      return variantIndex.lessThan(0.5).select(
        driftOffset,
        variantIndex.lessThan(1.5).select(
          orbitOffset,
          variantIndex.lessThan(2.5).select(
            breatheOffset,
            variantIndex.lessThan(3.5).select(
              rippleOffset,
              variantIndex.lessThan(4.5).select(twistOffset, flutterOffset),
            ),
          ),
        ),
      ) as Vec3Node;
    };

    const previousMotionOffset = continuousMotionOffset(
      this.previousMotionVariantIndex,
      this.previousMotionPhase,
    );
    const currentMotionOffset = continuousMotionOffset(
      this.motionVariantIndex,
      this.motionPhase,
    );
    const motionCrossfadeMix = smoothstep(0, 1, this.motionCrossfadeProgress);
    const blendedMotionOffset = mix(
      previousMotionOffset,
      currentMotionOffset,
      motionCrossfadeMix,
    );
    const continuousMotionScale = min(
      1,
      max(length(blendedMotionOffset), 1e-7)
        .reciprocal()
        .mul(MATERIALIZATION_MOTION_MAX_OFFSET),
    );
    const continuousMotion = blendedMotionOffset
      .mul(continuousMotionScale)
      .mul(surfaceMix.oneMinus())
      .mul(this.reducedMotion ? 0 : 1);
    const liftedPosition = convergencePosition.add(continuousMotion).add(
      targetNormal.mul(surfaceMix).mul(SETTLED_SPARK_LIFT),
    );
    const distance = length(liftedPosition);
    const direction = normalize(liftedPosition.add(vec3(1e-7)));
    const radialStrength = sin(distance.mul(10).sub(this.bass.mul(this.bassRadialPhase)))
      .mul(this.bass)
      .mul(this.bassRadialStrength)
      .mul(this.shaderEnabled)
      .mul(this.bassRadialEnabled);
    const displayPosition = liftedPosition.add(direction.mul(radialStrength));
    const fogDepth = varying(modelViewMatrix.mul(vec4(displayPosition, 1)).z.negate());
    const trebleScale = this.treble
      .mul(this.trebleSizeStrength)
      .mul(this.shaderEnabled)
      .mul(this.trebleSizeEnabled)
      .add(1);
    const organicFlare = arrivalEnvelope.mul(MATERIALIZATION_MAX_POINT_FLARE - 1).add(1);
    const vortexFlare = arrivalEnvelope.mul(0.32).add(1);
    const bloomFlare = arrivalEnvelope.mul(MATERIALIZATION_MAX_POINT_FLARE - 1).add(1);
    const waveFlare = waveCrest.mul(0.4).add(arrivalEnvelope.mul(0.08)).add(1);
    const transientFlare = this.transitionVariantIndex.lessThan(0.5).select(
      organicFlare,
      this.transitionVariantIndex.lessThan(1.5).select(
        vortexFlare,
        this.transitionVariantIndex.lessThan(2.5).select(bloomFlare, waveFlare),
      ),
    );
    const displaySize = mix(0.65, 1, particleSize)
      .mul(this.pointSize)
      .mul(trebleScale)
      .mul(transientFlare)
      .mul(mix(1, SETTLED_SPARK_SCALE, surfaceMix))
      .mul(LIVE_POINT_SCALE);
    const transientAccent = this.transitionVariantIndex.lessThan(0.5).select(
      vec3(0.78, 0.96, 1),
      this.transitionVariantIndex.lessThan(1.5).select(
        vec3(0.72, 0.58, 1),
        this.transitionVariantIndex.lessThan(2.5).select(
          vec3(0.9, 1, 1),
          vec3(0.45, 0.94, 1),
        ),
      ),
    );
    const transientAccentStrength = this.transitionVariantIndex.lessThan(0.5).select(
      arrivalEnvelope.mul(0.42),
      this.transitionVariantIndex.lessThan(1.5).select(
        arrivalEnvelope.mul(0.36),
        this.transitionVariantIndex.lessThan(2.5).select(
          arrivalEnvelope.mul(0.48),
          waveCrest.mul(0.44).add(arrivalEnvelope.mul(0.08)),
        ),
      ),
    );
    const animatedColor = mix(particleColor, transientAccent, transientAccentStrength);
    const displayColor = mix(
      animatedColor,
      particleColor,
      surfaceMix,
    ).add(
      vec3(0.78, 0.96, 1).sub(particleColor).mul(surfaceMix.mul(0.12)),
    );

    this.material = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.material.positionNode = displayPosition;
    this.material.sizeNode = displaySize;
    this.material.fragmentNode = sphereFragment(displayColor, fogDepth);
    this.points = makeInstancedSprite(this.material, count);
    this.points.renderOrder = 2;
    this.group.add(this.points);

    if (uploaded) {
      const positionNode = instancedBufferAttribute<"vec3">(
        new THREE.InstancedBufferAttribute(targetPositions, 3),
        "vec3",
      );
      const colorNode = instancedBufferAttribute<"vec3">(
        new THREE.InstancedBufferAttribute(targetColors, 3),
        "vec3",
      );
      const shellFogDepth = varying(modelViewMatrix.mul(vec4(positionNode, 1)).z.negate());
      const material = new THREE.PointsNodeMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false,
      });
      material.positionNode = positionNode;
      material.sizeNode = uniform(pointSize * SETTLED_SHELL_SCALE);
      material.fragmentNode = sphereFragment(
        colorNode,
        shellFogDepth,
        surfaceMix.mul(0.96),
      );
      const points = makeInstancedSprite(material, count);
      points.renderOrder = 0;
      this.sectionMeshes.push(points);
      this.sectionMaterials.push(material);
      this.sectionGeometries.push(points.geometry);
      this.group.add(points);
    } else {
      const sectionColors = [0x1edbff, 0x45c7ef, 0x6d8cf1, 0x805cff];
      knot!.sections.forEach((section, index) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(section.positions, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(section.normals, 3));
        const material = new THREE.MeshStandardNodeMaterial({
          color: sectionColors[index],
          roughness: 0.34,
          metalness: 0.5,
          side: THREE.DoubleSide,
          depthWrite: true,
          depthTest: true,
        });
        material.alphaHash = true;
        material.opacityNode = surfaceMix;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 0;
        this.sectionMeshes.push(mesh);
        this.sectionMaterials.push(material);
        this.sectionGeometries.push(geometry);
        this.group.add(mesh);
      });
    }
    this.scene.add(this.group);
    this.resize(context.width, context.height, context.dpr);
    this.setPreset("dormant");
  }

  private syncMotionUniforms(): void {
    this.previousMotionPhase.value = this.previousMotionPhaseSeconds;
    this.motionPhase.value = this.motionPhaseSeconds;
    this.motionCrossfadeProgress.value = this.motionCrossfadeProgressValue;
  }

  private beginMotionCrossfade(motionVariant: MaterializationMotionVariant): void {
    this.previousMotionVariantIndex.value = this.motionVariantIndex.value;
    this.previousMotionPhaseSeconds = this.motionPhaseSeconds;
    this.motionVariantIndex.value = materializationMotionIndex(motionVariant);
    this.motionPhaseSeconds = 0;
    this.motionCrossfadeProgressValue = 0;
  }

  private advanceContinuousMotion(activeDelta: number): void {
    let remainingDelta = activeDelta;

    while (remainingDelta > 0) {
      if (this.motionCrossfadeProgressValue >= 1) {
        if (this.pendingMotionVariant) {
          const pendingMotionVariant = this.pendingMotionVariant;
          this.pendingMotionVariant = null;
          this.beginMotionCrossfade(pendingMotionVariant);
          continue;
        }

        this.previousMotionPhaseSeconds = advanceMaterializationMotionPhase(
          this.previousMotionPhaseSeconds,
          remainingDelta,
        );
        this.motionPhaseSeconds = advanceMaterializationMotionPhase(
          this.motionPhaseSeconds,
          remainingDelta,
        );
        remainingDelta = 0;
        continue;
      }

      const secondsToCompletion = (
        1 - this.motionCrossfadeProgressValue
      ) * MATERIALIZATION_MOTION_CROSSFADE_SECONDS;
      const step = Math.min(remainingDelta, secondsToCompletion);
      this.previousMotionPhaseSeconds = advanceMaterializationMotionPhase(
        this.previousMotionPhaseSeconds,
        step,
      );
      this.motionPhaseSeconds = advanceMaterializationMotionPhase(
        this.motionPhaseSeconds,
        step,
      );
      this.motionCrossfadeProgressValue = advanceMaterializationMotionCrossfade(
        this.motionCrossfadeProgressValue,
        step,
      );
      remainingDelta -= step;

      if (this.motionCrossfadeProgressValue >= 1 && this.pendingMotionVariant) {
        const pendingMotionVariant = this.pendingMotionVariant;
        this.pendingMotionVariant = null;
        this.beginMotionCrossfade(pendingMotionVariant);
      }
    }

    this.syncMotionUniforms();
  }

  update(frame: EffectFrame): void {
    if (this.resetPending) {
      this.renderer.compute(this.resetComputeNode);
      this.resetPending = false;
    }
    const activeMotionDelta = this.reducedMotion || frame.static
      ? 0
      : Math.max(0, Number.isFinite(frame.delta) ? frame.delta : 0);
    this.advanceContinuousMotion(activeMotionDelta);
    this.transitionProgress = advanceMaterializationProgress(
      this.transitionProgress,
      this.transitionTarget,
      frame.delta,
      this.reducedMotion,
    );
    this.coalescenceProgress.value = this.transitionProgress;
    const shaderTime = this.reducedMotion ? 0 : frame.elapsed;
    const delta = this.reducedMotion ? 0 : Math.min(Math.max(frame.delta, 0), 0.05);
    this.time.value = shaderTime;
    this.deltaTime.value = delta;
    const fullySettled = this.transitionProgress >= 1 && this.transitionTarget >= 1;
    if (delta > 0 && this.shaderEnabled.value > 0 && !fullySettled) {
      this.renderer.compute(this.computeNode);
    }
    this.group.rotation.y = shaderTime * 0.1;
    this.group.rotation.x = Math.sin(shaderTime * 0.23) * 0.08;
  }

  resize(width: number, height: number, dpr: number): void {
    clampDpr(dpr);
    const safeHeight = Math.max(1, height);
    this.camera.aspect = Math.max(1, width) / safeHeight;
    this.camera.updateProjectionMatrix();
  }

  setTransitionVariant(transitionVariant: MaterializationTransitionVariant): void {
    if (!isMaterializationTransitionVariant(transitionVariant)) return;
    this.currentTransitionVariant = transitionVariant;
    this.transitionVariantIndex.value = materializationTransitionIndex(transitionVariant);
    this.currentPreset = "materialize";
    this.transitionTarget = 1;
    this.transitionProgress = this.reducedMotion ? 1 : 0;
    this.coalescenceProgress.value = this.transitionProgress;
    this.shaderEnabled.value = 1;
    this.flowEnabled.value = 1;
    this.flowFieldStrength.value = MATERIALIZATION_DEFAULTS.flowFieldStrength;
    this.resetPending = !this.reducedMotion;
  }

  setMotionVariant(
    motionVariant: MaterializationMotionVariant,
    crossfade = true,
  ): void {
    if (!isMaterializationMotionVariant(motionVariant)) return;
    const motionVariantIndex = materializationMotionIndex(motionVariant);
    this.currentMotionVariant = motionVariant;

    if (!crossfade || this.reducedMotion) {
      this.pendingMotionVariant = null;
      this.previousMotionVariantIndex.value = motionVariantIndex;
      this.motionVariantIndex.value = motionVariantIndex;
      this.previousMotionPhaseSeconds = 0;
      this.motionPhaseSeconds = 0;
      this.motionCrossfadeProgressValue = 1;
    } else if (this.motionCrossfadeProgressValue <= 0) {
      // The outgoing mode still has full weight, so the unseen destination can
      // be replaced immediately without changing the rendered position.
      this.pendingMotionVariant = null;
      this.motionVariantIndex.value = motionVariantIndex;
      this.motionPhaseSeconds = 0;
    } else if (this.motionCrossfadeProgressValue < 1) {
      // A two-slot shader cannot snapshot an arbitrary per-particle blend.
      // Retain the currently visible fade and let the latest requested mode
      // retarget from its exact endpoint instead of introducing a position pop.
      this.pendingMotionVariant = motionVariant;
      return;
    } else {
      this.pendingMotionVariant = null;
      this.beginMotionCrossfade(motionVariant);
    }

    this.syncMotionUniforms();
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    const previousPreset = this.currentPreset;
    const shouldResetScatter = preset === "dormant"
      && previousPreset !== "dormant"
      && this.transitionProgress > 0
      && !this.reducedMotion;
    this.currentPreset = preset as (typeof PRESETS)[number];
    const previousWasTransition = previousPreset === "materialize" || previousPreset === "dissolve";
    const nextIsTransition = this.currentPreset === "materialize" || this.currentPreset === "dissolve";
    if (!previousWasTransition && nextIsTransition) {
      this.transitionProgress = initialMaterializationProgress(
        this.currentPreset,
        this.reducedMotion,
      );
    } else if (!nextIsTransition) {
      this.transitionProgress = 0;
    }
    this.transitionTarget = materializationTarget(this.currentPreset);
    if (this.reducedMotion) this.transitionProgress = this.transitionTarget;
    this.coalescenceProgress.value = this.transitionProgress;
    const enabled = preset === "dormant" ? 0 : 1;
    this.shaderEnabled.value = enabled;
    this.flowEnabled.value = enabled;
    this.flowFieldStrength.value = preset === "pulse" ? 3.15 : MATERIALIZATION_DEFAULTS.flowFieldStrength;
    if (shouldResetScatter) this.resetPending = true;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.resetComputeNode.dispose();
    this.computeNode.dispose();
    disposeComputeOnlyStorage(this.renderer, this.initialParticles);
    disposeComputeOnlyStorage(this.renderer, this.base);
    this.points.geometry.dispose();
    this.sectionGeometries.forEach((geometry) => geometry.dispose());
    this.material.dispose();
    this.sectionMaterials.forEach((material) => material.dispose());
    this.group.clear();
    this.scene.clear();
  }
}

export function create(context: EffectRuntimeContext): EffectInstance {
  return new MaterializationRuntime(context);
}

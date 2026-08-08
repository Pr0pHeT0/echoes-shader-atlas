import * as THREE from "three/webgpu";
import {
  Fn,
  dot,
  instanceIndex,
  instancedArray,
  instancedBufferAttribute,
  length,
  max,
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
const SECTION_COUNT = 4;

type FloatNode = THREE.Node<"float">;
type Vec3Node = THREE.Node<"vec3">;

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
  private readonly base: THREE.StorageBufferNode<"vec4">;
  private readonly computeNode: THREE.ComputeNode;

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
  private readonly materializedSectionCount = uniform(0);
  private readonly bassRadialEnabled = uniform(0);
  private readonly bassRadialPhase = uniform(MATERIALIZATION_DEFAULTS.bassRadialPhase);
  private readonly bassRadialStrength = uniform(MATERIALIZATION_DEFAULTS.bassRadialStrength);
  private readonly trebleSizeEnabled = uniform(0);
  private readonly trebleSizeStrength = uniform(MATERIALIZATION_DEFAULTS.trebleSizeStrength);
  private readonly pointSize: FloatNode;

  private currentPreset: (typeof PRESETS)[number] = "materialize";
  private lastElapsed = 0;
  private presetStartedAt = 0;
  private presetStartPending = false;

  constructor(context: EffectRuntimeContext) {
    this.renderer = context.renderer;
    this.reducedMotion = context.reducedMotion;
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
      && context.pointCloud.colors.length >= context.pointCloud.count * 3
      && context.pointCloud.sections.length >= context.pointCloud.count
      ? context.pointCloud
      : null;
    const knot = uploaded ? null : createSegmentedTorusKnot(count);
    const targetPositions = uploaded ? new Float32Array(count * 3) : knot!.positions;
    const targetColors = uploaded ? new Float32Array(count * 3) : knot!.colors;
    const targetSections = uploaded ? new Float32Array(count) : knot!.particleSections;
    if (uploaded) {
      for (let index = 0; index < count; index += 1) {
        const sourceIndex = index % uploaded.count;
        const sourceOffset = sourceIndex * 3;
        const targetOffset = index * 3;
        targetPositions[targetOffset] = uploaded.positions[sourceOffset];
        targetPositions[targetOffset + 1] = uploaded.positions[sourceOffset + 1];
        targetPositions[targetOffset + 2] = uploaded.positions[sourceOffset + 2];
        targetColors[targetOffset] = uploaded.colors[sourceOffset];
        targetColors[targetOffset + 1] = uploaded.colors[sourceOffset + 1];
        targetColors[targetOffset + 2] = uploaded.colors[sourceOffset + 2];
        targetSections[index] = THREE.MathUtils.clamp(Math.floor(uploaded.sections[sourceIndex]), 0, 3);
      }
    }

    const baseData = new Float32Array(count * 4);
    const particleData = new Float32Array(count * 4);
    const sizes = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const positionOffset = index * 3;
      const storageOffset = index * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = targetPositions[positionOffset + channel];
        baseData[storageOffset + channel] = value;
        particleData[storageOffset + channel] = value;
      }
      if (uploaded) {
        const azimuth = seededValue(index, 71) * Math.PI * 2;
        const vertical = seededValue(index, 73) * 2 - 1;
        const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
        const radius = 0.65 + seededValue(index, 79) * 1.35;
        particleData[storageOffset] += Math.cos(azimuth) * horizontal * radius;
        particleData[storageOffset + 1] += vertical * radius;
        particleData[storageOffset + 2] += Math.sin(azimuth) * horizontal * radius;
      }
      const lifetime = seededValue(index, 41);
      baseData[storageOffset + 3] = lifetime;
      particleData[storageOffset + 3] = lifetime;
      sizes[index] = seededValue(index, 43);
    }

    this.particles = instancedArray(particleData, "vec4").setName("MaterializationParticles");
    this.base = instancedArray(baseData, "vec4").setName("MaterializationBase").toReadOnly();

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
    const particleSize = instancedBufferAttribute<"float">(
      new THREE.InstancedBufferAttribute(sizes, 1),
      "float",
    );
    const particleSection = instancedBufferAttribute<"float">(
      new THREE.InstancedBufferAttribute(targetSections, 1),
      "float",
    );
    const distance = length(particle.xyz);
    const direction = normalize(particle.xyz.add(vec3(1e-7)));
    const radialStrength = sin(distance.mul(10).sub(this.bass.mul(this.bassRadialPhase)))
      .mul(this.bass)
      .mul(this.bassRadialStrength)
      .mul(this.shaderEnabled)
      .mul(this.bassRadialEnabled);
    const displayPosition = particle.xyz.add(direction.mul(radialStrength));
    const fogDepth = varying(modelViewMatrix.mul(vec4(displayPosition, 1)).z.negate());
    const sectionVisible = particleSection.greaterThanEqual(this.materializedSectionCount);
    const trebleScale = this.treble
      .mul(this.trebleSizeStrength)
      .mul(this.shaderEnabled)
      .mul(this.trebleSizeEnabled)
      .add(1);
    const displaySize = mix(0.65, 1, particleSize)
      .mul(this.pointSize)
      .mul(trebleScale)
      .mul(2);

    this.material = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.material.positionNode = displayPosition;
    this.material.sizeNode = sectionVisible.select(displaySize, 0);
    this.material.fragmentNode = sphereFragment(particleColor, fogDepth);
    this.points = makeInstancedSprite(this.material, count);
    this.group.add(this.points);

    if (uploaded) {
      const sectionPositions: number[][] = [[], [], [], []];
      const sectionColors: number[][] = [[], [], [], []];
      for (let index = 0; index < count; index += 1) {
        const section = targetSections[index];
        const offset = index * 3;
        sectionPositions[section].push(
          targetPositions[offset],
          targetPositions[offset + 1],
          targetPositions[offset + 2],
        );
        sectionColors[section].push(
          targetColors[offset],
          targetColors[offset + 1],
          targetColors[offset + 2],
        );
      }
      sectionPositions.forEach((positions, index) => {
        const positionsArray = new Float32Array(positions);
        const colorsArray = new Float32Array(sectionColors[index]);
        const positionNode = instancedBufferAttribute<"vec3">(
          new THREE.InstancedBufferAttribute(positionsArray, 3),
          "vec3",
        );
        const colorNode = instancedBufferAttribute<"vec3">(
          new THREE.InstancedBufferAttribute(colorsArray, 3),
          "vec3",
        );
        const material = new THREE.PointsNodeMaterial({
          transparent: true,
          depthWrite: true,
          depthTest: true,
          fog: true,
        });
        material.positionNode = positionNode;
        material.sizeNode = uniform(pointSize * 0.64);
        material.fragmentNode = vec4(colorNode, 0.96);
        const points = makeInstancedSprite(material, positionsArray.length / 3);
        points.visible = false;
        this.sectionMeshes.push(points);
        this.sectionMaterials.push(material);
        this.sectionGeometries.push(points.geometry);
        this.group.add(points);
      });
    } else {
      const sectionColors = [0x1edbff, 0x45c7ef, 0x6d8cf1, 0x805cff];
      knot!.sections.forEach((section, index) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(section.positions, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(section.normals, 3));
        const material = new THREE.MeshStandardMaterial({
          color: sectionColors[index],
          roughness: 0.34,
          metalness: 0.5,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        this.sectionMeshes.push(mesh);
        this.sectionMaterials.push(material);
        this.sectionGeometries.push(geometry);
        this.group.add(mesh);
      });
    }
    this.scene.add(this.group);
    this.resize(context.width, context.height, context.dpr);
    this.setPreset("materialize");
  }

  private setMaterializedSectionCount(count: number): void {
    const safeCount = THREE.MathUtils.clamp(Math.floor(count), 0, SECTION_COUNT);
    this.materializedSectionCount.value = safeCount;
    this.sectionMeshes.forEach((mesh, index) => { mesh.visible = index < safeCount; });
  }

  update(frame: EffectFrame): void {
    this.lastElapsed = frame.elapsed;
    if (this.presetStartPending) {
      this.presetStartedAt = frame.elapsed;
      this.presetStartPending = false;
    }
    const localElapsed = Math.max(0, frame.elapsed - this.presetStartedAt);
    if (this.currentPreset === "materialize") {
      this.setMaterializedSectionCount(this.reducedMotion ? SECTION_COUNT : Math.floor(localElapsed * 1.15));
    } else if (this.currentPreset === "dissolve") {
      this.setMaterializedSectionCount(this.reducedMotion ? 0 : SECTION_COUNT - Math.floor(localElapsed * 1.15));
    }
    const shaderTime = this.reducedMotion ? 0 : frame.elapsed;
    const delta = this.reducedMotion ? 0 : Math.min(Math.max(frame.delta, 0), 0.05);
    this.time.value = shaderTime;
    this.deltaTime.value = delta;
    if (delta > 0 && this.shaderEnabled.value > 0) this.renderer.compute(this.computeNode);
    this.group.rotation.y = shaderTime * 0.1;
    this.group.rotation.x = Math.sin(shaderTime * 0.23) * 0.08;
  }

  resize(width: number, height: number, dpr: number): void {
    clampDpr(dpr);
    const safeHeight = Math.max(1, height);
    this.camera.aspect = Math.max(1, width) / safeHeight;
    this.camera.updateProjectionMatrix();
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    this.currentPreset = preset as (typeof PRESETS)[number];
    this.presetStartedAt = this.lastElapsed;
    this.presetStartPending = true;
    const enabled = preset === "dormant" ? 0 : 1;
    this.shaderEnabled.value = enabled;
    this.flowEnabled.value = enabled;
    this.flowFieldStrength.value = preset === "pulse" ? 3.15 : MATERIALIZATION_DEFAULTS.flowFieldStrength;
    if (preset === "dissolve") this.setMaterializedSectionCount(SECTION_COUNT);
    else this.setMaterializedSectionCount(0);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.computeNode.dispose();
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

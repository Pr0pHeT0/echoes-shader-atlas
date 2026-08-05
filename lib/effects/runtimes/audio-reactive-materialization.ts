import * as THREE from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";

import computeSource from "../../shaders/materialization/materialization.compute.glsl?raw";
import fragmentShader from "../../shaders/materialization/materialization.frag.glsl?raw";
import vertexShader from "../../shaders/materialization/materialization.vert.glsl?raw";
import { composeShader } from "../../shaders/compose";
import { createSegmentedTorusKnot, seededValue } from "../geometry";
import { EFFECT_PRESETS, MATERIALIZATION_DEFAULTS } from "../runtime-config";
import { clampDpr, makeShowcaseScene, resolveParticleCount, syntheticAudio } from "../runtime-utils";
import type { AudioMetrics, EffectFrame, EffectInstance, EffectRuntimeContext } from "../types";

const PRESETS = EFFECT_PRESETS["audio-reactive-materialization"];
const SECTION_COUNT = 4;

class MaterializationRuntime implements EffectInstance {
  readonly id = "audio-reactive-materialization" as const;
  readonly presets = PRESETS;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly reducedMotion: boolean;
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;
  private readonly sectionMeshes: THREE.Mesh[] = [];
  private readonly sectionMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly gpgpu: GPUComputationRenderer;
  private readonly particlesVariable: ReturnType<GPUComputationRenderer["addVariable"]>;
  private readonly baseTexture: THREE.DataTexture;
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
    const knot = createSegmentedTorusKnot(count);
    const textureSize = Math.ceil(Math.sqrt(count));
    this.gpgpu = new GPUComputationRenderer(textureSize, textureSize, this.renderer);
    this.baseTexture = this.gpgpu.createTexture();
    const particlesTexture = this.gpgpu.createTexture();
    const baseData = this.baseTexture.image!.data as Float32Array;
    const particleData = particlesTexture.image!.data as Float32Array;
    for (let index = 0; index < textureSize * textureSize; index += 1) {
      const textureOffset = index * 4;
      if (index >= count) continue;
      const positionOffset = index * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        baseData[textureOffset + channel] = knot.positions[positionOffset + channel];
        particleData[textureOffset + channel] = knot.positions[positionOffset + channel];
      }
      const lifetime = seededValue(index, 41);
      baseData[textureOffset + 3] = lifetime;
      particleData[textureOffset + 3] = lifetime;
    }
    this.particlesVariable = this.gpgpu.addVariable("uParticles", composeShader(computeSource), particlesTexture);
    this.gpgpu.setVariableDependencies(this.particlesVariable, [this.particlesVariable]);
    const computeUniforms = this.particlesVariable.material.uniforms;
    computeUniforms.uTime = { value: 0 };
    computeUniforms.uDeltaTime = { value: 0 };
    computeUniforms.uBase = { value: this.baseTexture };
    computeUniforms.uFlowFieldInfluence = { value: MATERIALIZATION_DEFAULTS.flowFieldInfluence };
    computeUniforms.uFlowFieldStrength = { value: MATERIALIZATION_DEFAULTS.flowFieldStrength };
    computeUniforms.uFlowFieldFrequency = { value: MATERIALIZATION_DEFAULTS.flowFieldFrequency };
    computeUniforms.uAudioLevel = { value: 0 };
    computeUniforms.uBass = { value: 0 };
    computeUniforms.uMid = { value: 0 };
    computeUniforms.uTreble = { value: 0 };
    computeUniforms.uShaderEnabled = { value: 1 };
    computeUniforms.uFlowEnabled = { value: 1 };
    computeUniforms.uMidFlowTimeEnabled = { value: 1 };
    computeUniforms.uMidFlowTimeStrength = { value: MATERIALIZATION_DEFAULTS.midFlowTimeStrength };
    computeUniforms.uBassFlowInfluenceEnabled = { value: 1 };
    computeUniforms.uBassFlowInfluenceStrength = { value: MATERIALIZATION_DEFAULTS.bassFlowInfluenceStrength };
    computeUniforms.uTrebleFlowFrequencyEnabled = { value: 1 };
    computeUniforms.uTrebleFlowFrequencyStrength = { value: MATERIALIZATION_DEFAULTS.trebleFlowFrequencyStrength };
    computeUniforms.uAudioGateEnabled = { value: 1 };
    computeUniforms.uAudioGateLow = { value: MATERIALIZATION_DEFAULTS.audioGateLow };
    computeUniforms.uAudioGateHigh = { value: MATERIALIZATION_DEFAULTS.audioGateHigh };
    computeUniforms.uAudioGateBassMix = { value: MATERIALIZATION_DEFAULTS.audioGateBassMix };
    computeUniforms.uBassFlowStrengthEnabled = { value: 1 };
    computeUniforms.uBassFlowStrength = { value: MATERIALIZATION_DEFAULTS.bassFlowStrength };
    computeUniforms.uAudioFlowEnabled = { value: 1 };
    computeUniforms.uAudioFlowStrength = { value: MATERIALIZATION_DEFAULTS.audioFlowStrength };
    computeUniforms.uReturnEnabled = { value: 1 };
    computeUniforms.uReturnStrength = { value: MATERIALIZATION_DEFAULTS.returnStrength };
    const initError = this.gpgpu.init();
    particlesTexture.dispose();
    if (initError) {
      this.gpgpu.dispose();
      this.baseTexture.dispose();
      throw new Error(initError);
    }

    const particleUvs = new Float32Array(count * 2);
    const sizes = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      particleUvs[index * 2] = (index % textureSize + 0.5) / textureSize;
      particleUvs[index * 2 + 1] = (Math.floor(index / textureSize) + 0.5) / textureSize;
      sizes[index] = seededValue(index, 43);
    }
    this.geometry.setDrawRange(0, count);
    this.geometry.setAttribute("aParticlesUv", new THREE.BufferAttribute(particleUvs, 2));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(knot.colors, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute("aSection", new THREE.BufferAttribute(knot.particleSections, 1));
    const dpr = clampDpr(context.dpr);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        ...THREE.UniformsLib.fog,
        uSize: { value: MATERIALIZATION_DEFAULTS.size },
        uResolution: { value: new THREE.Vector2(context.width * dpr, context.height * dpr) },
        uParticlesTexture: { value: this.gpgpu.getCurrentRenderTarget(this.particlesVariable).texture },
        uMaterializedSectionCount: { value: 0 },
        uAudioLevel: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uShaderEnabled: { value: 1 },
        uBassRadialEnabled: { value: 1 },
        uBassRadialPhase: { value: MATERIALIZATION_DEFAULTS.bassRadialPhase },
        uBassRadialStrength: { value: MATERIALIZATION_DEFAULTS.bassRadialStrength },
        uTrebleSizeEnabled: { value: 1 },
        uTrebleSizeStrength: { value: MATERIALIZATION_DEFAULTS.trebleSizeStrength },
      },
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    const sectionColors = [0x1edbff, 0x45c7ef, 0x6d8cf1, 0x805cff];
    knot.sections.forEach((section, index) => {
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
      this.group.add(mesh);
    });
    this.scene.add(this.group);
    this.resize(context.width, context.height, context.dpr);
    this.setPreset("materialize");
  }

  private setAudio(audio: AudioMetrics): void {
    const computeUniforms = this.particlesVariable.material.uniforms;
    const renderUniforms = this.material.uniforms;
    computeUniforms.uAudioLevel.value = audio.level;
    computeUniforms.uBass.value = audio.bass;
    computeUniforms.uMid.value = audio.mid;
    computeUniforms.uTreble.value = audio.treble;
    renderUniforms.uAudioLevel.value = audio.level;
    renderUniforms.uBass.value = audio.bass;
    renderUniforms.uMid.value = audio.mid;
    renderUniforms.uTreble.value = audio.treble;
  }

  private setMaterializedSectionCount(count: number): void {
    const safeCount = THREE.MathUtils.clamp(Math.floor(count), 0, SECTION_COUNT);
    this.material.uniforms.uMaterializedSectionCount.value = safeCount;
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
    const audio = syntheticAudio(shaderTime, frame.audio);
    this.setAudio(audio);
    const computeUniforms = this.particlesVariable.material.uniforms;
    computeUniforms.uTime.value = shaderTime;
    computeUniforms.uDeltaTime.value = delta;
    if (delta > 0 && computeUniforms.uShaderEnabled.value > 0) this.gpgpu.compute();
    this.material.uniforms.uParticlesTexture.value = this.gpgpu.getCurrentRenderTarget(this.particlesVariable).texture;
    this.group.rotation.y = shaderTime * 0.1 + audio.bass * 0.12;
    this.group.rotation.x = Math.sin(shaderTime * 0.23) * 0.08 + audio.mid * 0.08;
  }

  resize(width: number, height: number, dpr: number): void {
    const safeHeight = Math.max(1, height);
    this.camera.aspect = Math.max(1, width) / safeHeight;
    this.camera.updateProjectionMatrix();
    const safeDpr = clampDpr(dpr);
    this.material.uniforms.uResolution.value.set(Math.max(1, width) * safeDpr, safeHeight * safeDpr);
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    this.currentPreset = preset as (typeof PRESETS)[number];
    this.presetStartedAt = this.lastElapsed;
    this.presetStartPending = true;
    const computeUniforms = this.particlesVariable.material.uniforms;
    const enabled = preset === "dormant" ? 0 : 1;
    computeUniforms.uShaderEnabled.value = enabled;
    computeUniforms.uFlowEnabled.value = enabled;
    this.material.uniforms.uShaderEnabled.value = enabled;
    computeUniforms.uFlowFieldStrength.value = preset === "pulse" ? 3.15 : MATERIALIZATION_DEFAULTS.flowFieldStrength;
    computeUniforms.uAudioFlowStrength.value = preset === "pulse" ? 0.38 : MATERIALIZATION_DEFAULTS.audioFlowStrength;
    this.material.uniforms.uBassRadialStrength.value = preset === "pulse" ? 0.065 : MATERIALIZATION_DEFAULTS.bassRadialStrength;
    this.material.uniforms.uTrebleSizeStrength.value = preset === "pulse" ? 0.18 : MATERIALIZATION_DEFAULTS.trebleSizeStrength;
    if (preset === "dissolve") this.setMaterializedSectionCount(SECTION_COUNT);
    else this.setMaterializedSectionCount(0);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
    this.sectionMeshes.forEach((mesh) => mesh.geometry.dispose());
    this.sectionMaterials.forEach((material) => material.dispose());
    this.group.clear();
    this.gpgpu.dispose();
    this.baseTexture.dispose();
    this.scene.clear();
  }
}

export function create(context: EffectRuntimeContext): EffectInstance {
  return new MaterializationRuntime(context);
}

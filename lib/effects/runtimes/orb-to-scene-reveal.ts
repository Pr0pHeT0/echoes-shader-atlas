import * as THREE from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";

import computeSource from "../../shaders/orb/orb-to-scene.compute.glsl?raw";
import fragmentShader from "../../shaders/orb/orb-to-scene.frag.glsl?raw";
import vertexShader from "../../shaders/orb/orb-to-scene.vert.glsl?raw";
import { composeShader } from "../../shaders/compose";
import { createProceduralTerrain, seededValue } from "../geometry";
import { EFFECT_PRESETS, ORB_TO_SCENE_DEFAULTS } from "../runtime-config";
import { clampDpr, makeShowcaseScene, resolveParticleCount } from "../runtime-utils";
import type { EffectFrame, EffectInstance, EffectRuntimeContext } from "../types";

const PRESETS = EFFECT_PRESETS["orb-to-scene-reveal"];

class OrbToSceneRuntime implements EffectInstance {
  readonly id = "orb-to-scene-reveal" as const;
  readonly presets = PRESETS;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly reducedMotion: boolean;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;
  private readonly gpgpu: GPUComputationRenderer;
  private readonly particlesVariable: ReturnType<GPUComputationRenderer["addVariable"]>;
  private readonly baseTexture: THREE.DataTexture;
  private currentPreset: (typeof PRESETS)[number] = "orbit";
  private lastElapsed = 0;
  private presetStartedAt = 0;
  private presetStartPending = false;

  constructor(context: EffectRuntimeContext) {
    this.renderer = context.renderer;
    this.reducedMotion = context.reducedMotion;
    ({ scene: this.scene, camera: this.camera } = makeShowcaseScene(
      context.width,
      context.height,
      new THREE.Vector3(0, 2.35, 8.6),
    ));
    this.scene.fog = new THREE.Fog(0x03060d, 7.5, 15.5);
    const count = resolveParticleCount(context);
    const terrain = createProceduralTerrain(count);
    const textureSize = Math.ceil(Math.sqrt(count));
    this.gpgpu = new GPUComputationRenderer(textureSize, textureSize, this.renderer);
    this.baseTexture = this.gpgpu.createTexture();
    const particlesTexture = this.gpgpu.createTexture();
    const baseData = this.baseTexture.image!.data as Float32Array;
    const particleData = particlesTexture.image!.data as Float32Array;
    for (let index = 0; index < textureSize * textureSize; index += 1) {
      const textureOffset = index * 4;
      if (index >= count) {
        baseData[textureOffset + 3] = 1;
        particleData[textureOffset + 3] = 1;
        continue;
      }
      const positionOffset = index * 3;
      const lifetime = seededValue(index, 23);
      for (let channel = 0; channel < 3; channel += 1) {
        baseData[textureOffset + channel] = terrain.positions[positionOffset + channel];
        particleData[textureOffset + channel] = terrain.positions[positionOffset + channel];
      }
      baseData[textureOffset + 3] = lifetime;
      particleData[textureOffset + 3] = lifetime;
    }
    this.particlesVariable = this.gpgpu.addVariable("uParticles", composeShader(computeSource), particlesTexture);
    this.gpgpu.setVariableDependencies(this.particlesVariable, [this.particlesVariable]);
    const computeUniforms = this.particlesVariable.material.uniforms;
    computeUniforms.uTime = { value: 0 };
    computeUniforms.uDeltaTime = { value: 0 };
    computeUniforms.uBase = { value: this.baseTexture };
    computeUniforms.uFlowFieldInfluence = { value: ORB_TO_SCENE_DEFAULTS.flowFieldInfluence };
    computeUniforms.uFlowFieldStrength = { value: ORB_TO_SCENE_DEFAULTS.flowFieldStrength };
    computeUniforms.uFlowFieldFrequency = { value: ORB_TO_SCENE_DEFAULTS.flowFieldFrequency };
    const initError = this.gpgpu.init();
    particlesTexture.dispose();
    if (initError) {
      this.gpgpu.dispose();
      this.baseTexture.dispose();
      throw new Error(initError);
    }

    const particleUvs = new Float32Array(count * 2);
    const sizes = new Float32Array(count);
    const revealSeeds = new Float32Array(count);
    const orbPositions = new Float32Array(count * 3);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < count; index += 1) {
      particleUvs[index * 2] = (index % textureSize + 0.5) / textureSize;
      particleUvs[index * 2 + 1] = (Math.floor(index / textureSize) + 0.5) / textureSize;
      sizes[index] = seededValue(index, 29);
      revealSeeds[index] = seededValue(index, 31);
      const progress = (index + 0.5) / count;
      const orbY = 1 - progress * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - orbY * orbY));
      const angle = index * goldenAngle;
      const shell = 0.82 + (sizes[index] - 0.5) * 0.09;
      orbPositions[index * 3] = Math.cos(angle) * radiusAtY * shell;
      orbPositions[index * 3 + 1] = orbY * shell;
      orbPositions[index * 3 + 2] = Math.sin(angle) * radiusAtY * shell;
    }
    this.geometry.setDrawRange(0, count);
    this.geometry.setAttribute("aParticlesUv", new THREE.BufferAttribute(particleUvs, 2));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(terrain.colors, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute("aRevealSeed", new THREE.BufferAttribute(revealSeeds, 1));
    this.geometry.setAttribute("aOrbPosition", new THREE.BufferAttribute(orbPositions, 3));
    const dpr = clampDpr(context.dpr);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        ...THREE.UniformsLib.fog,
        uSize: { value: ORB_TO_SCENE_DEFAULTS.size },
        uResolution: { value: new THREE.Vector2(context.width * dpr, context.height * dpr) },
        uParticlesTexture: { value: this.gpgpu.getCurrentRenderTarget(this.particlesVariable).texture },
        uReveal: { value: ORB_TO_SCENE_DEFAULTS.reveal },
        uTime: { value: 0 },
        uPixelRatio: { value: dpr },
        uPointSizeScale: { value: 1 },
        uInitialPopulation: { value: ORB_TO_SCENE_DEFAULTS.initialPopulation },
      },
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.resize(context.width, context.height, context.dpr);
    this.setPreset("orbit");
  }

  update(frame: EffectFrame): void {
    this.lastElapsed = frame.elapsed;
    if (this.presetStartPending) {
      this.presetStartedAt = frame.elapsed;
      this.presetStartPending = false;
    }
    const delta = this.reducedMotion ? 0 : Math.min(Math.max(frame.delta, 0), 0.05);
    let reveal = this.material.uniforms.uReveal.value as number;
    if (this.currentPreset === "reveal") {
      const linear = this.reducedMotion ? 1 : Math.min(1, Math.max(0, frame.elapsed - this.presetStartedAt) * 0.52);
      reveal = 1 - Math.pow(1 - linear, 3);
      this.material.uniforms.uReveal.value = reveal;
    }
    const shaderTime = this.reducedMotion ? 0 : frame.elapsed;
    this.material.uniforms.uTime.value = shaderTime;
    const uniforms = this.particlesVariable.material.uniforms;
    uniforms.uTime.value = shaderTime;
    uniforms.uDeltaTime.value = delta;
    if (delta > 0) this.gpgpu.compute();
    this.material.uniforms.uParticlesTexture.value = this.gpgpu.getCurrentRenderTarget(this.particlesVariable).texture;
    const flowRotation = this.currentPreset === "flow" ? shaderTime * 0.045 : 0;
    this.points.rotation.y = flowRotation * reveal;
  }

  resize(width: number, height: number, dpr: number): void {
    const safeHeight = Math.max(1, height);
    this.camera.aspect = Math.max(1, width) / safeHeight;
    this.camera.updateProjectionMatrix();
    const safeDpr = clampDpr(dpr);
    this.material.uniforms.uResolution.value.set(Math.max(1, width) * safeDpr, safeHeight * safeDpr);
    this.material.uniforms.uPixelRatio.value = safeDpr;
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    this.currentPreset = preset as (typeof PRESETS)[number];
    this.presetStartedAt = this.lastElapsed;
    this.presetStartPending = true;
    const computeUniforms = this.particlesVariable.material.uniforms;
    if (preset === "flow") {
      this.material.uniforms.uReveal.value = 1;
      this.material.uniforms.uInitialPopulation.value = 1;
      computeUniforms.uFlowFieldStrength.value = 2.2;
      computeUniforms.uFlowFieldFrequency.value = 0.7;
    } else {
      this.material.uniforms.uReveal.value = 0;
      this.material.uniforms.uInitialPopulation.value = 0.32;
      computeUniforms.uFlowFieldStrength.value = ORB_TO_SCENE_DEFAULTS.flowFieldStrength;
      computeUniforms.uFlowFieldFrequency.value = ORB_TO_SCENE_DEFAULTS.flowFieldFrequency;
    }
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.gpgpu.dispose();
    this.baseTexture.dispose();
    this.scene.clear();
  }
}

export function create(context: EffectRuntimeContext): EffectInstance {
  return new OrbToSceneRuntime(context);
}

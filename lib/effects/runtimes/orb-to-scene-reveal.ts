import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  dot,
  fract,
  instanceIndex,
  instancedArray,
  instancedBufferAttribute,
  max,
  mix,
  mod,
  modelViewMatrix,
  normalize,
  pow,
  sRGBTransferEOTF,
  sin,
  smoothstep,
  sqrt,
  step,
  uniform,
  uv,
  varying,
  vec3,
  vec4,
} from "three/tsl";

import { createProceduralTerrain, seededValue } from "../geometry";
import { EFFECT_PRESETS, ORB_TO_SCENE_DEFAULTS } from "../runtime-config";
import { clampDpr, makeShowcaseScene, resolveParticleCount } from "../runtime-utils";
import { simplexNoise4d } from "../tsl/simplex-noise-4d";
import type { EffectFrame, EffectInstance, EffectRuntimeContext } from "../types";

const PRESETS = EFFECT_PRESETS["orb-to-scene-reveal"];

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

class OrbToSceneRuntime implements EffectInstance {
  readonly id = "orb-to-scene-reveal" as const;
  readonly presets = PRESETS;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGPURenderer;
  private readonly reducedMotion: boolean;
  private readonly material: THREE.PointsNodeMaterial;
  private readonly points: THREE.Sprite;
  private readonly particles: THREE.StorageBufferNode<"vec4">;
  private readonly base: THREE.StorageBufferNode<"vec4">;
  private readonly computeNode: THREE.ComputeNode;

  private readonly time = uniform(0);
  private readonly deltaTime = uniform(0);
  private readonly flowFieldInfluence = uniform(ORB_TO_SCENE_DEFAULTS.flowFieldInfluence);
  private readonly flowFieldStrength = uniform(ORB_TO_SCENE_DEFAULTS.flowFieldStrength);
  private readonly flowFieldFrequency = uniform(ORB_TO_SCENE_DEFAULTS.flowFieldFrequency);
  private readonly reveal = uniform(ORB_TO_SCENE_DEFAULTS.reveal);
  private readonly initialPopulation = uniform(ORB_TO_SCENE_DEFAULTS.initialPopulation);
  private readonly pointSize = uniform(ORB_TO_SCENE_DEFAULTS.size);
  private readonly pointSizeScale = uniform(1);
  private readonly viewportHeight = uniform(1);

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
    const baseData = new Float32Array(count * 4);
    const particleData = new Float32Array(count * 4);
    const sizes = new Float32Array(count);
    const revealSeeds = new Float32Array(count);
    const orbPositions = new Float32Array(count * 3);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let index = 0; index < count; index += 1) {
      const positionOffset = index * 3;
      const storageOffset = index * 4;
      const lifetime = seededValue(index, 23);
      for (let channel = 0; channel < 3; channel += 1) {
        const value = terrain.positions[positionOffset + channel];
        baseData[storageOffset + channel] = value;
        particleData[storageOffset + channel] = value;
      }
      baseData[storageOffset + 3] = lifetime;
      particleData[storageOffset + 3] = lifetime;

      sizes[index] = seededValue(index, 29);
      revealSeeds[index] = seededValue(index, 31);
      const progress = (index + 0.5) / count;
      const orbY = 1 - progress * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - orbY * orbY));
      const angle = index * goldenAngle;
      const shell = 0.82 + (sizes[index] - 0.5) * 0.09;
      orbPositions[positionOffset] = Math.cos(angle) * radiusAtY * shell;
      orbPositions[positionOffset + 1] = orbY * shell;
      orbPositions[positionOffset + 2] = Math.sin(angle) * radiusAtY * shell;
    }

    this.particles = instancedArray(particleData, "vec4").setName("OrbParticles");
    this.base = instancedArray(baseData, "vec4").setName("OrbBase").toReadOnly();

    this.computeNode = Fn(() => {
      const particleElement = this.particles.element(instanceIndex);
      const particle = vec4(particleElement).toVar();
      const base = vec4(this.base.element(instanceIndex)).toVar();
      const time = this.time.mul(0.1);

      If(particle.w.greaterThanEqual(1), () => {
        particle.w.assign(mod(particle.w, 1));
        particle.xyz.assign(base.xyz);
      }).Else(() => {
        const noiseStrength = simplexNoise4d(vec4(base.xyz.mul(0.7), time.add(1)));
        const influence = this.flowFieldInfluence.sub(0.5).mul(-2);
        const strength = smoothstep(influence, 1, noiseStrength);
        const flowPoint = particle.xyz.mul(this.flowFieldFrequency);
        const flowField = normalize(vec3(
          simplexNoise4d(vec4(flowPoint, time)),
          simplexNoise4d(vec4(flowPoint.add(1), time)),
          simplexNoise4d(vec4(flowPoint.add(2), time)),
        ));
        particle.xyz.addAssign(
          flowField.mul(this.deltaTime).mul(strength).mul(this.flowFieldStrength),
        );
        particle.w.addAssign(this.deltaTime.mul(0.35));
      });

      particleElement.assign(particle);
    })().compute(count, [64]).setName("Orb flow field");

    const particle = this.particles.toAttribute();
    const color = instancedBufferAttribute<"vec3">(
      new THREE.InstancedBufferAttribute(terrain.colors, 3),
      "vec3",
    );
    const size = instancedBufferAttribute<"float">(
      new THREE.InstancedBufferAttribute(sizes, 1),
      "float",
    );
    const revealSeed = instancedBufferAttribute<"float">(
      new THREE.InstancedBufferAttribute(revealSeeds, 1),
      "float",
    );
    const orbPosition = instancedBufferAttribute<"vec3">(
      new THREE.InstancedBufferAttribute(orbPositions, 3),
      "vec3",
    );
    const revealEase = this.reveal.mul(this.reveal).mul(this.reveal.mul(-2).add(3));
    const revealedPosition = mix(orbPosition, particle.xyz, revealEase);
    const fogDepth = varying(modelViewMatrix.mul(vec4(revealedPosition, 1)).z.negate());
    const fogColorValue = new THREE.Color(0x03060d);
    const fogColor = vec3(fogColorValue.r, fogColorValue.g, fogColorValue.b);

    const sizeIn = smoothstep(0, 0.6, particle.w);
    const sizeOut = smoothstep(0.6, 1, particle.w).oneMinus();
    const lifetimeSize = sizeIn.min(sizeOut);
    // PointsNodeMaterial's sprite path uses Three's standard half-viewport scale.
    // The archived shader used the full viewport height, hence the factor of two.
    const scenePointSize = lifetimeSize.mul(size).mul(this.pointSize).mul(2);
    const orbLifeIn = smoothstep(0, 0.22, particle.w);
    const orbLifeOut = smoothstep(0.68, 1, particle.w).oneMinus();
    const orbLifeEnvelope = orbLifeIn.min(orbLifeOut);
    const orbLifeSize = mix(0.48, 1, orbLifeEnvelope);
    const orbPixelSize = mix(1.5, 3.1, size).mul(18).div(max(this.viewportHeight, 1)).mul(orbLifeSize);

    const pearl = vec3(0.92, 0.98, 1);
    const orbSilver = mix(vec3(0.25, 0.3, 0.32), pearl, size.mul(0.1).add(0.15));
    const orbAccent = mix(
      vec3(0.12, 0.86, 1),
      vec3(0.5, 0.36, 1),
      smoothstep(-0.82, 0.82, orbPosition.x),
    );
    const orbColor = mix(orbAccent, orbSilver, 0.88);
    const orbShimmer = sin(this.time.mul(2.1).add(size.mul(31)).add(particle.w.mul(Math.PI * 2)))
      .mul(0.22)
      .add(0.78);
    const displayColor = mix(orbColor.mul(orbShimmer), color, revealEase);
    const activePopulation = mix(this.initialPopulation, 1, revealEase);
    const populationOpacity = smoothstep(activePopulation, activePopulation.add(0.018), revealSeed).oneMinus();
    const orbLayerOpacity = mix(0.42, 1, step(0.5, fract(size.mul(17.73))));
    const orbLifeAlpha = mix(0.46, 1, orbLifeEnvelope);
    const opacity = populationOpacity.mul(
      mix(orbLayerOpacity.mul(0.82).mul(orbLifeAlpha), 1, revealEase),
    );

    this.material = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.material.positionNode = revealedPosition;
    this.material.sizeNode = mix(orbPixelSize, scenePointSize, revealEase).mul(this.pointSizeScale);
    this.material.fragmentNode = Fn(() => {
      const coordinate = uv().mul(2).sub(1);
      const radiusSquared = dot(coordinate, coordinate);
      radiusSquared.greaterThan(1).discard();

      const normal = vec3(coordinate, sqrt(max(0, radiusSquared.oneMinus())));
      const viewDirection = vec3(0, 0, 1);
      const orbLightDirection = normalize(vec3(-0.35, 0.7, 1));
      const orbDiffuse = max(dot(normal, orbLightDirection), 0).mul(0.58).add(0.42);
      const orbHalfDirection = normalize(orbLightDirection.add(viewDirection));
      const orbGlint = pow(max(dot(normal, orbHalfDirection), 0), 22);
      const orbLitColor = displayColor.mul(orbDiffuse).add(vec3(0.65, 0.9, 1).mul(orbGlint).mul(0.5));

      const sceneLightDirection = normalize(vec3(0.5, 0.8, 1));
      const sceneDiffuse = max(dot(normal, sceneLightDirection), 0);
      const sceneHalfDirection = normalize(sceneLightDirection.add(viewDirection));
      const sceneSpecular = pow(max(dot(normal, sceneHalfDirection), 0), 32);
      const sceneLitColor = displayColor.mul(sceneDiffuse.mul(0.5).add(0.5)).add(vec3(0.05).mul(sceneSpecular));
      const litColor = mix(orbLitColor, sceneLitColor, revealEase);
      const fogFactor = smoothstep(7.5, 15.5, fogDepth);
      const foggedColor = mix(litColor, fogColor, fogFactor);
      const orbAlphaProfile = smoothstep(0.05, 1, radiusSquared).oneMinus().mul(0.68).add(0.32);
      const alphaProfile = mix(orbAlphaProfile, 1, revealEase);
      return vec4(
        sRGBTransferEOTF(foggedColor) as THREE.Node<"vec3">,
        opacity.mul(alphaProfile),
      );
    })();

    this.points = makeInstancedSprite(this.material, count);
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
    let reveal = this.reveal.value;
    if (this.currentPreset === "reveal") {
      const linear = this.reducedMotion ? 1 : Math.min(1, Math.max(0, frame.elapsed - this.presetStartedAt) * 0.52);
      reveal = 1 - Math.pow(1 - linear, 3);
      this.reveal.value = reveal;
    }
    const shaderTime = this.reducedMotion ? 0 : frame.elapsed;
    this.time.value = shaderTime;
    this.deltaTime.value = delta;
    if (delta > 0) this.renderer.compute(this.computeNode);
    const flowRotation = this.currentPreset === "flow" ? shaderTime * 0.045 : 0;
    this.points.rotation.y = flowRotation * reveal;
  }

  resize(width: number, height: number, dpr: number): void {
    clampDpr(dpr);
    const safeHeight = Math.max(1, height);
    this.camera.aspect = Math.max(1, width) / safeHeight;
    this.camera.updateProjectionMatrix();
    this.viewportHeight.value = safeHeight;
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    this.currentPreset = preset as (typeof PRESETS)[number];
    this.presetStartedAt = this.lastElapsed;
    this.presetStartPending = true;
    if (preset === "flow") {
      this.reveal.value = 1;
      this.initialPopulation.value = 1;
      this.flowFieldStrength.value = 2.2;
      this.flowFieldFrequency.value = 0.7;
    } else {
      this.reveal.value = 0;
      this.initialPopulation.value = 0.32;
      this.flowFieldStrength.value = ORB_TO_SCENE_DEFAULTS.flowFieldStrength;
      this.flowFieldFrequency.value = ORB_TO_SCENE_DEFAULTS.flowFieldFrequency;
    }
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.computeNode.dispose();
    disposeComputeOnlyStorage(this.renderer, this.base);
    this.points.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}

export function create(context: EffectRuntimeContext): EffectInstance {
  return new OrbToSceneRuntime(context);
}

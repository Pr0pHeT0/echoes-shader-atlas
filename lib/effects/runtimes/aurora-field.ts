import * as THREE from "three";

import fragmentShader from "../../shaders/aurora/aurora-field.frag.glsl?raw";
import vertexShader from "../../shaders/shared/fullscreen.vert.glsl?raw";
import { AURORA_UNIFORM_DEFAULTS, EFFECT_PRESETS } from "../runtime-config";
import { clampDpr, makeShowcaseScene, syntheticAudio } from "../runtime-utils";
import type { EffectFrame, EffectInstance, EffectRuntimeContext } from "../types";

const PRESETS = EFFECT_PRESETS["aurora-field"];

class AuroraFieldRuntime implements EffectInstance {
  readonly id = "aurora-field" as const;
  readonly presets = PRESETS;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly reducedMotion: boolean;
  private audioGain = 0.7;
  private distance = 8;

  constructor(context: EffectRuntimeContext) {
    ({ scene: this.scene, camera: this.camera } = makeShowcaseScene(context.width, context.height));
    this.reducedMotion = context.reducedMotion;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: AURORA_UNIFORM_DEFAULTS.uTime },
        uResolution: { value: new THREE.Vector2(context.width, context.height) },
        uVerticalOffset: { value: AURORA_UNIFORM_DEFAULTS.uVerticalOffset },
        uAudioStrength: { value: AURORA_UNIFORM_DEFAULTS.uAudioStrength },
        uGameplayMix: { value: AURORA_UNIFORM_DEFAULTS.uGameplayMix },
      },
      depthTest: false,
      depthWrite: false,
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
    this.material.uniforms.uTime.value = this.reducedMotion ? 0 : frame.elapsed;
    const voiceStrength = audio.level * 0.72 + audio.mid * 0.18 + audio.treble * 0.1;
    this.material.uniforms.uAudioStrength.value = THREE.MathUtils.clamp(voiceStrength * this.audioGain, 0, 1);
  }

  resize(width: number, height: number, dpr: number): void {
    clampDpr(dpr);
    const safeHeight = Math.max(1, height);
    const aspect = Math.max(1, width) / safeHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * this.distance;
    this.mesh.scale.set(frustumHeight * aspect, frustumHeight, 1);
    this.material.uniforms.uResolution.value.set(Math.max(1, width), safeHeight);
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    if (preset === "voice-lit") {
      this.material.uniforms.uVerticalOffset.value = 0.02;
      this.material.uniforms.uGameplayMix.value = 1;
      this.audioGain = 1;
    } else if (preset === "midnight") {
      this.material.uniforms.uVerticalOffset.value = 0.16;
      this.material.uniforms.uGameplayMix.value = 0;
      this.audioGain = 0.18;
    } else {
      this.material.uniforms.uVerticalOffset.value = 0;
      this.material.uniforms.uGameplayMix.value = 0;
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

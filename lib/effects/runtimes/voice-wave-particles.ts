import * as THREE from "three";

import vertexShader from "../../shaders/shared/fullscreen.vert.glsl?raw";
import fragmentShader from "../../shaders/voice/voice-wave.frag.glsl?raw";
import { EFFECT_PRESETS, VOICE_UNIFORM_DEFAULTS } from "../runtime-config";
import { clampDpr, makeShowcaseScene, syntheticAudio } from "../runtime-utils";
import type { EffectFrame, EffectInstance, EffectRuntimeContext } from "../types";

const PRESETS = EFFECT_PRESETS["voice-wave-particles"];
const DISTANCE = 5;

class VoiceWaveRuntime implements EffectInstance {
  readonly id = "voice-wave-particles" as const;
  readonly presets = PRESETS;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly geometry = new THREE.PlaneGeometry(1, 1, 160, 20);
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly reducedMotion: boolean;
  private heightRatio = 0.32;

  constructor(context: EffectRuntimeContext) {
    ({ scene: this.scene, camera: this.camera } = makeShowcaseScene(context.width, context.height));
    this.reducedMotion = context.reducedMotion;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: VOICE_UNIFORM_DEFAULTS.uTime },
        uLevel: { value: VOICE_UNIFORM_DEFAULTS.uLevel },
        uBass: { value: VOICE_UNIFORM_DEFAULTS.uBass },
        uMid: { value: VOICE_UNIFORM_DEFAULTS.uMid },
        uTreble: { value: VOICE_UNIFORM_DEFAULTS.uTreble },
        uEnabled: { value: VOICE_UNIFORM_DEFAULTS.uEnabled },
        uOpacity: { value: VOICE_UNIFORM_DEFAULTS.uOpacity },
        uWaveStrength: { value: VOICE_UNIFORM_DEFAULTS.uWaveStrength },
        uParticleStrength: { value: VOICE_UNIFORM_DEFAULTS.uParticleStrength },
        uBassStrength: { value: VOICE_UNIFORM_DEFAULTS.uBassStrength },
        uMidStrength: { value: VOICE_UNIFORM_DEFAULTS.uMidStrength },
        uTrebleStrength: { value: VOICE_UNIFORM_DEFAULTS.uTrebleStrength },
        uResolution: { value: new THREE.Vector2(context.width, context.height) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
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
    this.material.uniforms.uTime.value = this.reducedMotion ? 0 : frame.elapsed;
    this.material.uniforms.uLevel.value = audio.level;
    this.material.uniforms.uBass.value = audio.bass;
    this.material.uniforms.uMid.value = audio.mid;
    this.material.uniforms.uTreble.value = audio.treble;
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
    this.material.uniforms.uResolution.value.set(Math.max(1, width), safeHeight);
  }

  setPreset(preset: string): void {
    if (!PRESETS.includes(preset as (typeof PRESETS)[number])) return;
    const uniforms = this.material.uniforms;
    uniforms.uOpacity.value = 0.86;
    uniforms.uWaveStrength.value = 1;
    uniforms.uParticleStrength.value = 1;
    uniforms.uBassStrength.value = 1;
    uniforms.uMidStrength.value = 1;
    uniforms.uTrebleStrength.value = 1;
    this.heightRatio = 0.32;
    if (preset === "bass-current") {
      uniforms.uWaveStrength.value = 1.22;
      uniforms.uBassStrength.value = 1.85;
      uniforms.uTrebleStrength.value = 0.66;
      this.heightRatio = 0.38;
    } else if (preset === "treble-sparks") {
      uniforms.uOpacity.value = 0.94;
      uniforms.uParticleStrength.value = 1.32;
      uniforms.uBassStrength.value = 0.72;
      uniforms.uTrebleStrength.value = 1.9;
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

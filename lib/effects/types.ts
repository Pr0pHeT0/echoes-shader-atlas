import type * as THREE from "three";

export const EFFECT_IDS = [
  "aurora-field",
  "voice-wave-particles",
  "morphing-echoes-title",
  "orb-to-scene-reveal",
  "audio-reactive-materialization",
] as const;

export type EffectId = (typeof EFFECT_IDS)[number];

export interface AudioMetrics {
  level: number;
  bass: number;
  mid: number;
  treble: number;
}

export interface EffectPointer {
  /** Horizontal normalized device coordinate in the inclusive range [-1, 1]. */
  x: number;
  /** Vertical normalized device coordinate in the inclusive range [-1, 1]. */
  y: number;
}

export interface MaterializationPointCloud {
  positions: Float32Array;
  colors: Float32Array;
  sections: Float32Array;
  count: number;
  meshCount: number;
  triangleCount: number;
}

export interface EffectFrame {
  elapsed: number;
  delta: number;
  /** True for a deliberate redraw while animation is paused or disabled. */
  static?: boolean;
  pointer?: EffectPointer | null;
  audio?: Partial<AudioMetrics> | null;
}

export interface EffectRuntimeContext {
  /** One renderer is owned by ShaderStage and shared across effect instances. */
  renderer: THREE.WebGLRenderer;
  width: number;
  height: number;
  /** Device-pixel ratio, already capped by ShaderStage. Runtimes cap it again at 1.5. */
  dpr: number;
  /** Requested budget. Runtimes clamp this to 16K/64K policy limits. */
  particleCount: number;
  reducedMotion: boolean;
  /** Optional browser-local geometry target for the materialization runtime. */
  pointCloud?: MaterializationPointCloud | null;
}

export interface EffectInstance {
  readonly id: EffectId;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly presets: readonly string[];
  update(frame: EffectFrame): void;
  resize(width: number, height: number, dpr: number): void;
  setPreset(preset: string): void;
  dispose(): void;
}

export type EffectFactory = (
  context: EffectRuntimeContext,
) => EffectInstance | Promise<EffectInstance>;

export type ShaderSourceStage = "vertex" | "fragment" | "compute" | "include";

export interface EffectShaderSource {
  label: string;
  stage: ShaderSourceStage;
  path: string;
  source: string;
}

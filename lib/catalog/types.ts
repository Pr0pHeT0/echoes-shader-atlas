export type EffectId =
  | "aurora-field"
  | "voice-wave-particles"
  | "morphing-echoes-title"
  | "orb-to-scene-reveal"
  | "audio-reactive-materialization";

export type EffectFamily =
  | "Procedural Backdrop"
  | "Audio Visualization"
  | "Particle Typography"
  | "Point-cloud Transition"
  | "GPGPU Materialization";

export type EffectStatus = "active" | "archived";

export type ShaderStage = "vertex" | "fragment" | "compute" | "include";

export type ShaderSourceKind = "file" | "inline";

export interface EffectAccent {
  primary: string;
  secondary: string;
  wash: string;
}

export interface EffectPresetMeta {
  id: string;
  label: string;
  description: string;
}

export interface EffectStat {
  label: string;
  value: string;
}

export interface ShaderSourceUnit {
  id: string;
  label: string;
  stage: ShaderStage;
  stageLabel: string;
  sourceKind: ShaderSourceKind;
  sourcePath: string;
  sourceSymbol: string | null;
  extractedPath: string;
  shared: boolean;
}

/**
 * JSON-safe catalog data. Runtime implementations are addressed by key rather
 * than embedded as functions so this object can cross the server/client edge.
 */
export interface ShaderEffectMeta {
  id: EffectId;
  slug: EffectId;
  index: number;
  name: string;
  shortName: string;
  family: EffectFamily;
  status: EffectStatus;
  statusLabel: string;
  eyebrow: string;
  summary: string;
  description: string;
  drivers: readonly string[];
  techniques: readonly string[];
  primitives: readonly string[];
  runtime: EffectId;
  sourceUnits: readonly ShaderSourceUnit[];
  presets: readonly EffectPresetMeta[];
  accent: EffectAccent;
  stats: readonly EffectStat[];
}

export interface EffectFilters {
  family?: EffectFamily | "all";
  status?: EffectStatus | "all";
  driver?: string | "all";
}

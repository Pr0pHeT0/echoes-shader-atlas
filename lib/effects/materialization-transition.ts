import type { EFFECT_PRESETS } from "./runtime-config";

type ConfiguredDuration =
  typeof import("./runtime-config").MATERIALIZATION_TRANSITION_DURATION_SECONDS;

// The type annotation keeps this dependency-free test helper aligned with the
// public runtime constant without introducing a local runtime import.
const TRANSITION_DURATION_SECONDS: ConfiguredDuration = 3.5;

export type MaterializationPreset =
  (typeof EFFECT_PRESETS)["audio-reactive-materialization"][number];

export type MaterializationProgressTarget = 0 | 1;

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function materializationTarget(
  preset: MaterializationPreset,
): MaterializationProgressTarget {
  return preset === "materialize" ? 1 : 0;
}

export function initialMaterializationProgress(
  preset: MaterializationPreset,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return materializationTarget(preset);
  return preset === "dissolve" ? 1 : 0;
}

export function advanceMaterializationProgress(
  progress: number,
  target: MaterializationProgressTarget,
  deltaSeconds: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return target;

  const current = clampProgress(progress);
  const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  const step = safeDelta / TRANSITION_DURATION_SECONDS;
  return target === 1
    ? Math.min(1, current + step)
    : Math.max(0, current - step);
}

import type { EffectId } from "./types";

export const EFFECT_PRESETS = Object.freeze({
  "aurora-field": Object.freeze(["quiet-drift", "voice-lit", "midnight"] as const),
  "voice-wave-particles": Object.freeze(["balanced", "bass-current", "treble-sparks"] as const),
  "morphing-echoes-title": Object.freeze(["wordmark", "orb", "icosahedron", "burst"] as const),
  "orb-to-scene-reveal": Object.freeze(["orbit", "reveal", "flow"] as const),
  "audio-reactive-materialization": Object.freeze(["dormant", "materialize", "pulse", "dissolve"] as const),
  "stylized-materialization": Object.freeze(["cyberpunk-lines", "matrix-ascii", "ink-wash"] as const),
} as const satisfies Record<EffectId, readonly string[]>);

export const AURORA_UNIFORM_DEFAULTS = Object.freeze({
  uTime: 0,
  uVerticalOffset: 0,
  uAudioStrength: 0,
  uGameplayMix: 0,
});

export const VOICE_UNIFORM_DEFAULTS = Object.freeze({
  uTime: 0,
  uLevel: 0,
  uBass: 0,
  uMid: 0,
  uTreble: 0,
  uEnabled: 1,
  uOpacity: 0.86,
  uWaveStrength: 1,
  uParticleStrength: 1,
  uBassStrength: 1,
  uMidStrength: 1,
  uTrebleStrength: 1,
});

export const TITLE_UNIFORM_DEFAULTS = Object.freeze({
  uTime: 0,
  uReveal: 0,
  uFontPhase: 0,
  uPointerEnergy: 0,
  uExplosion: 0,
  uOrb: 0,
  uOrbOpacity: 1,
  uIcosahedron: 0,
});

export const ORB_TO_SCENE_DEFAULTS = Object.freeze({
  size: 0.05,
  flowFieldInfluence: 0.5,
  flowFieldStrength: 1.2,
  flowFieldFrequency: 0.5,
  reveal: 0,
  initialPopulation: 0.001,
});

export const MATERIALIZATION_DEFAULTS = Object.freeze({
  size: 0.07,
  flowFieldInfluence: 0.5,
  flowFieldStrength: 2,
  flowFieldFrequency: 0.5,
  shaderEnabled: true,
  flowEnabled: true,
  midFlowTimeStrength: 0.08,
  bassFlowInfluenceStrength: 0.18,
  trebleFlowFrequencyStrength: 0.35,
  audioGateLow: 0.03,
  audioGateHigh: 0.2,
  audioGateBassMix: 0.95,
  bassFlowStrength: 0.45,
  audioFlowStrength: 0.12,
  returnStrength: 0.08,
  bassRadialPhase: 0.8,
  bassRadialStrength: 0.02,
  trebleSizeStrength: 0.05,
});

export const STYLIZED_MATERIALIZATION_DEFAULTS = Object.freeze({
  size: 0.058,
});

export const EFFECT_UNIFORM_DEFAULTS = Object.freeze({
  "aurora-field": AURORA_UNIFORM_DEFAULTS,
  "voice-wave-particles": VOICE_UNIFORM_DEFAULTS,
  "morphing-echoes-title": TITLE_UNIFORM_DEFAULTS,
  "orb-to-scene-reveal": ORB_TO_SCENE_DEFAULTS,
  "audio-reactive-materialization": MATERIALIZATION_DEFAULTS,
  "stylized-materialization": STYLIZED_MATERIALIZATION_DEFAULTS,
} as const satisfies Record<EffectId, Readonly<Record<string, number | boolean>>>);

import type {
  EffectFactory,
  EffectId,
  EffectInstance,
  EffectRuntimeContext,
} from "./types";

export const lazyEffectFactories: Record<EffectId, () => Promise<EffectFactory>> = {
  "aurora-field": async () => (await import("./runtimes/aurora-field")).create,
  "voice-wave-particles": async () => (await import("./runtimes/voice-wave-particles")).create,
  "morphing-echoes-title": async () => (await import("./runtimes/morphing-echoes-title")).create,
  "orb-to-scene-reveal": async () => (await import("./runtimes/orb-to-scene-reveal")).create,
  "audio-reactive-materialization": async () => (await import("./runtimes/audio-reactive-materialization")).create,
};

export async function createEffectRuntime(
  effectId: EffectId,
  context: EffectRuntimeContext,
): Promise<EffectInstance> {
  const load = lazyEffectFactories[effectId];
  if (!load) throw new Error(`Unknown shader effect: ${String(effectId)}`);
  const factory = await load();
  return factory(context);
}

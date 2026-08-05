import assert from "node:assert/strict";
import test from "node:test";

import { loadFontFacesWithFallback } from "../lib/effects/font-loading.ts";
import {
  EFFECT_PRESETS,
  EFFECT_UNIFORM_DEFAULTS,
} from "../lib/effects/runtime-config.ts";
import {
  ShaderStageController,
  selectStageParticleCount,
} from "../lib/effects/stage-controller.ts";
import { shaderEffects } from "../lib/catalog/effects.ts";

class FakeEventTarget {
  listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event = new Event(type, { cancelable: true })) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakeCanvas extends FakeEventTarget {
  constructor(context = {}) {
    super();
    this.context = context;
  }

  getContext(type) {
    assert.equal(type, "webgl2");
    return this.context;
  }
}

class FakeEnvironment {
  nowValue = 1_000;
  hidden = false;
  reducedMotion = false;
  mobile = false;
  devicePixelRatio = 2;
  hardwareConcurrency = 8;
  saveData = false;
  nextFrameId = 1;
  frames = new Map();
  windowTarget = new FakeEventTarget();
  canceledFrames = [];
  observer = {
    observed: [],
    disconnected: 0,
    observe: (target) => { this.observer.observed.push(target); },
    disconnect: () => { this.observer.disconnected += 1; },
  };

  now = () => this.nowValue;

  requestAnimationFrame = (callback) => {
    const id = this.nextFrameId;
    this.nextFrameId += 1;
    this.frames.set(id, callback);
    return id;
  };

  cancelAnimationFrame = (id) => {
    this.canceledFrames.push(id);
    this.frames.delete(id);
  };

  isDocumentHidden = () => this.hidden;

  matchMedia = (query) => ({
    matches: query.includes("prefers-reduced-motion") ? this.reducedMotion : this.mobile,
  });

  addWindowListener = (type, listener) => this.windowTarget.addEventListener(type, listener);

  removeWindowListener = (type, listener) => this.windowTarget.removeEventListener(type, listener);

  createResizeObserver = () => this.observer;

  runNextFrame(afterMilliseconds) {
    this.nowValue += afterMilliseconds;
    const next = this.frames.entries().next().value;
    assert.ok(next, "an animation frame should be scheduled");
    const [id, callback] = next;
    this.frames.delete(id);
    callback(this.nowValue);
  }
}

function makeRenderer() {
  const renderer = {
    pixelRatios: [],
    sizes: [],
    renders: 0,
    renderListDisposals: 0,
    disposals: 0,
    setPixelRatio(value) { this.pixelRatios.push(value); },
    setSize(width, height, updateStyle) { this.sizes.push([width, height, updateStyle]); },
    render() { this.renders += 1; },
    renderLists: {
      dispose: () => { renderer.renderListDisposals += 1; },
    },
    dispose() { this.disposals += 1; },
  };
  return renderer;
}

function makeRuntime(id) {
  const resources = { geometry: 0, material: 0, renderTarget: 0 };
  return {
    id,
    scene: {},
    camera: {},
    presets: EFFECT_PRESETS[id],
    updates: [],
    resizes: [],
    selectedPresets: [],
    disposals: 0,
    resources,
    update(frame) { this.updates.push(frame); },
    resize(...values) { this.resizes.push(values); },
    setPreset(value) { this.selectedPresets.push(value); },
    dispose() {
      this.disposals += 1;
      resources.geometry += 1;
      resources.material += 1;
      resources.renderTarget += 1;
    },
  };
}

function makeHarness({ context = {}, reducedMotion = false } = {}) {
  const environment = new FakeEnvironment();
  environment.reducedMotion = reducedMotion;
  const canvas = new FakeCanvas(context);
  const host = { getBoundingClientRect: () => ({ width: 801.4, height: 449.6, left: 10, top: 20 }) };
  const renderer = makeRenderer();
  const runtimes = [];
  const contexts = [];
  const statuses = [];
  const controller = new ShaderStageController({
    effectId: "aurora-field",
    quality: "auto",
    host,
    canvas,
    environment,
    preset: "quiet-drift",
    createRenderer: () => renderer,
    createEffect: async (id, runtimeContext) => {
      contexts.push(runtimeContext);
      const runtime = makeRuntime(id);
      runtimes.push(runtime);
      return runtime;
    },
    onStatus: (status) => statuses.push(status),
  });
  return { controller, environment, canvas, host, renderer, runtimes, contexts, statuses };
}

test("controller mounts, switches effects, and releases every owned resource on unmount", async () => {
  const harness = makeHarness();
  assert.equal(await harness.controller.mount(), true);
  const first = harness.runtimes[0];

  assert.equal(harness.canvas.listenerCount("webglcontextlost"), 1);
  assert.equal(harness.canvas.listenerCount("webglcontextrestored"), 1);
  assert.equal(harness.environment.windowTarget.listenerCount("resize"), 1);
  assert.equal(harness.environment.windowTarget.listenerCount("pointermove"), 1);
  assert.equal(harness.environment.frames.size, 1);
  assert.deepEqual(harness.renderer.sizes.at(-1), [801, 450, false]);
  assert.deepEqual(first.selectedPresets, ["quiet-drift"]);
  assert.deepEqual(first.resizes.at(-1), [801, 450, 1.5]);
  assert.equal(harness.renderer.renders, 1, "mount draws a static frame before the RAF loop");

  harness.environment.runNextFrame(50);
  harness.environment.runNextFrame(50);
  assert.equal(first.updates.at(-1).elapsed, 0.1);

  assert.equal(await harness.controller.switchEffect("orb-to-scene-reveal", "reveal"), true);
  const second = harness.runtimes[1];
  assert.equal(first.disposals, 1);
  assert.deepEqual(first.resources, { geometry: 1, material: 1, renderTarget: 1 });
  assert.deepEqual(second.selectedPresets, ["reveal"]);
  assert.equal(harness.renderer.disposals, 0, "effect switches reuse the stage renderer");
  assert.equal(harness.renderer.renders, 4, "effect switches replace stale canvas pixels immediately");
  harness.environment.runNextFrame(16);
  assert.equal(second.updates.at(-1).elapsed, 0.016, "each effect starts from its own timeline");

  harness.environment.windowTarget.dispatch("resize");
  assert.deepEqual(second.resizes.at(-1), [801, 450, 1.5]);
  harness.controller.dispose();

  assert.equal(second.disposals, 1);
  assert.deepEqual(second.resources, { geometry: 1, material: 1, renderTarget: 1 });
  assert.equal(harness.renderer.renderListDisposals, 1);
  assert.equal(harness.renderer.disposals, 1);
  assert.equal(harness.environment.observer.disconnected, 1);
  assert.equal(harness.environment.frames.size, 0);
  assert.equal(harness.environment.windowTarget.listenerCount("resize"), 0);
  assert.equal(harness.environment.windowTarget.listenerCount("pointermove"), 0);
  assert.equal(harness.environment.windowTarget.listenerCount("pointerout"), 0);
  assert.equal(harness.environment.windowTarget.listenerCount("blur"), 0);
  assert.equal(harness.canvas.listenerCount("webglcontextlost"), 0);
  assert.equal(harness.canvas.listenerCount("webglcontextrestored"), 0);

  harness.controller.dispose();
  assert.equal(second.disposals, 1, "dispose is idempotent");
  assert.equal(harness.renderer.disposals, 1);
});

test("a lazily loaded runtime receives the latest host size", async () => {
  const environment = new FakeEnvironment();
  const canvas = new FakeCanvas();
  const renderer = makeRenderer();
  const runtime = makeRuntime("morphing-echoes-title");
  let bounds = { width: 400, height: 240 };
  const host = { getBoundingClientRect: () => bounds };
  let releaseRuntime;
  const pendingRuntime = new Promise((resolve) => { releaseRuntime = resolve; });
  let creationSize;
  const controller = new ShaderStageController({
    effectId: "morphing-echoes-title",
    quality: "low",
    host,
    canvas,
    environment,
    createRenderer: () => renderer,
    createEffect: async (_id, context) => {
      creationSize = [context.width, context.height];
      return pendingRuntime;
    },
    onStatus: () => {},
  });

  const mounted = controller.mount();
  bounds = { width: 960, height: 540 };
  environment.windowTarget.dispatch("resize");
  releaseRuntime(runtime);
  assert.equal(await mounted, true);
  assert.deepEqual(creationSize, [400, 240]);
  assert.deepEqual(runtime.resizes.at(-1), [960, 540, 1.5]);
  controller.dispose();
});

test("WebGL2 unavailability selects the accessible static fallback without allocating GPU work", async () => {
  const harness = makeHarness({ context: null });
  assert.equal(await harness.controller.mount(), false);
  assert.deepEqual(harness.statuses, [{
    loading: false,
    failure: "WebGL2 is not available in this browser.",
  }]);
  assert.equal(harness.runtimes.length, 0);
  assert.equal(harness.environment.frames.size, 0);
  assert.equal(harness.canvas.listenerCount("webglcontextlost"), 0);
  harness.controller.dispose();
  assert.equal(harness.renderer.disposals, 0);
});

test("context loss stops rendering and restoration rebuilds the effect before resuming", async () => {
  const harness = makeHarness();
  await harness.controller.mount();
  const first = harness.runtimes[0];
  harness.environment.runNextFrame(16);
  assert.equal(first.updates.length, 2);

  const event = harness.canvas.dispatch("webglcontextlost");
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.environment.frames.size, 0);
  assert.match(harness.statuses.at(-1).failure, /context was lost/i);

  harness.environment.nowValue += 20_000;
  harness.canvas.dispatch("webglcontextrestored");
  await new Promise((resolve) => setImmediate(resolve));
  const restored = harness.runtimes[1];
  assert.equal(first.disposals, 1);
  assert.ok(restored);
  assert.equal(harness.statuses.at(-1).failure, null);
  assert.equal(harness.environment.frames.size, 1);

  harness.environment.runNextFrame(16);
  assert.ok(restored.updates[0].elapsed < 0.1, "lost time is excluded from animation elapsed time");
  harness.controller.dispose();
});

test("paused, hidden, and reduced-motion frames never accumulate disabled wall time", async () => {
  const harness = makeHarness();
  await harness.controller.mount();
  const runtime = harness.runtimes[0];

  harness.environment.runNextFrame(16);
  assert.equal(runtime.updates.at(-1).elapsed, 0.016);
  harness.controller.setPaused(true);
  harness.environment.runNextFrame(5_000);
  harness.controller.setPaused(false);
  harness.environment.runNextFrame(16);
  assert.equal(runtime.updates.at(-1).elapsed, 0.032);

  harness.environment.hidden = true;
  harness.environment.runNextFrame(9_000);
  harness.environment.hidden = false;
  harness.environment.runNextFrame(16);
  assert.equal(runtime.updates.at(-1).elapsed, 0.048);
  harness.controller.dispose();

  const reduced = makeHarness({ reducedMotion: true });
  await reduced.controller.mount();
  reduced.controller.setSyntheticAudio(true);
  const frozenAudio = reduced.runtimes[0].updates.at(-1).audio;
  assert.equal(reduced.contexts[0].reducedMotion, true);
  assert.equal(reduced.environment.frames.size, 0, "reduced motion disables the continuous RAF loop");
  assert.equal(reduced.runtimes[0].updates.at(-1).delta, 0);
  assert.equal(reduced.runtimes[0].updates.at(-1).elapsed, 0);
  assert.equal(reduced.runtimes[0].updates.at(-1).static, true);
  assert.deepEqual(
    reduced.runtimes[0].updates.at(-1).audio,
    frozenAudio,
    "reduced motion freezes the synthetic signal as well as shader time",
  );
  reduced.controller.dispose();
});

test("paused presets and manual signals redraw without advancing animation time", async () => {
  const harness = makeHarness();
  await harness.controller.mount();
  const runtime = harness.runtimes[0];
  harness.controller.setPaused(true);
  const elapsed = runtime.updates.at(-1).elapsed;
  const rendersBeforeChanges = harness.renderer.renders;

  harness.controller.setPreset("voice-lit");
  harness.controller.setSyntheticAudio(false);
  harness.controller.setAudio({ level: 1, bass: 0.8, mid: 0.6, treble: 0.4 });

  assert.equal(harness.renderer.renders, rendersBeforeChanges + 3);
  assert.equal(runtime.updates.at(-1).elapsed, elapsed);
  assert.equal(runtime.updates.at(-1).delta, 0);
  assert.equal(runtime.updates.at(-1).static, true);
  assert.deepEqual(runtime.updates.at(-1).audio, {
    level: 1,
    bass: 0.8,
    mid: 0.6,
    treble: 0.4,
  });
  harness.controller.dispose();
});

test("window-level pointer tracking reaches the shader through overlays and is cleaned up", async () => {
  const harness = makeHarness();
  await harness.controller.mount();
  const runtime = harness.runtimes[0];

  harness.environment.windowTarget.dispatch("pointermove", { clientX: 410.7, clientY: 244.8 });
  harness.environment.runNextFrame(16);
  assert.ok(Math.abs(runtime.updates.at(-1).pointer.x) < 0.001);
  assert.ok(Math.abs(runtime.updates.at(-1).pointer.y) < 0.001);

  harness.environment.windowTarget.dispatch("pointerout", { relatedTarget: null });
  harness.environment.runNextFrame(16);
  assert.equal(runtime.updates.at(-1).pointer, null);
  harness.controller.dispose();
  assert.equal(harness.environment.windowTarget.listenerCount("pointermove"), 0);
});

test("font loading failure is absorbed so canvas typography can use its CSS fallback", async () => {
  const definitions = [{
    family: "Echoes Test",
    weight: 700,
    source: "/fonts/test.ttf",
    descriptorWeight: "400 900",
  }];
  let added = 0;
  let fontSetLoads = 0;
  class FailedFontFace {
    async load() {
      throw new Error("font request rejected");
    }
  }
  const loaded = await loadFontFacesWithFallback(definitions, {
    FontFace: FailedFontFace,
    fonts: {
      add: () => { added += 1; },
      load: async () => { fontSetLoads += 1; },
    },
  });

  assert.equal(loaded, false);
  assert.equal(added, 0);
  assert.equal(fontSetLoads, 0);
});

test("preset and uniform registries exactly cover the five catalog runtimes", () => {
  const ids = shaderEffects.map((effect) => effect.id);
  assert.deepEqual(Object.keys(EFFECT_PRESETS), ids);
  assert.deepEqual(Object.keys(EFFECT_UNIFORM_DEFAULTS), ids);
  for (const effect of shaderEffects) {
    assert.deepEqual(EFFECT_PRESETS[effect.id], effect.presets.map((preset) => preset.id));
    assert.ok(Object.isFrozen(EFFECT_PRESETS[effect.id]));
    assert.ok(Object.isFrozen(EFFECT_UNIFORM_DEFAULTS[effect.id]));
    for (const value of Object.values(EFFECT_UNIFORM_DEFAULTS[effect.id])) {
      assert.ok(typeof value === "boolean" || Number.isFinite(value));
    }
  }

  assert.deepEqual(EFFECT_UNIFORM_DEFAULTS["aurora-field"], {
    uTime: 0,
    uVerticalOffset: 0,
    uAudioStrength: 0,
    uGameplayMix: 0,
  });
  assert.equal(EFFECT_UNIFORM_DEFAULTS["voice-wave-particles"].uOpacity, 0.86);
  assert.equal(EFFECT_UNIFORM_DEFAULTS["morphing-echoes-title"].uOrbOpacity, 1);
  assert.equal(EFFECT_UNIFORM_DEFAULTS["orb-to-scene-reveal"].initialPopulation, 0.001);
  assert.equal(EFFECT_UNIFORM_DEFAULTS["audio-reactive-materialization"].audioGateBassMix, 0.95);
});

test("automatic quality applies constrained-device and save-data limits", () => {
  const environment = new FakeEnvironment();
  assert.equal(selectStageParticleCount("low", environment), 16_384);
  assert.equal(selectStageParticleCount("high", environment), 65_536);
  assert.equal(selectStageParticleCount("auto", environment), 65_536);
  environment.hardwareConcurrency = 4;
  assert.equal(selectStageParticleCount("auto", environment), 16_384);
  environment.hardwareConcurrency = 8;
  environment.saveData = true;
  assert.equal(selectStageParticleCount("auto", environment), 16_384);
});

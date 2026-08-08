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

class FakeCanvas extends FakeEventTarget {}

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
    initCalls: 0,
    pixelRatios: [],
    sizes: [],
    renders: 0,
    disposals: 0,
    lostEvents: [],
    async init() { this.initCalls += 1; },
    setPixelRatio(value) { this.pixelRatios.push(value); },
    setSize(width, height, updateStyle) { this.sizes.push([width, height, updateStyle]); },
    render() { this.renders += 1; },
    onDeviceLost(info) { this.lostEvents.push(info); },
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

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function makeHarness({
  rendererError = null,
  rendererFactory = () => makeRenderer(),
  reducedMotion = false,
  pointCloud = null,
  pointTarget,
} = {}) {
  const environment = new FakeEnvironment();
  environment.reducedMotion = reducedMotion;
  const canvas = new FakeCanvas();
  const host = { getBoundingClientRect: () => ({ width: 801.4, height: 449.6, left: 10, top: 20 }) };
  const renderer = rendererFactory(0);
  const renderers = [];
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
    pointCloud,
    pointTarget,
    createRenderer: () => {
      if (rendererError) throw rendererError;
      const nextRenderer = renderers.length === 0 ? renderer : rendererFactory(renderers.length);
      renderers.push(nextRenderer);
      return nextRenderer;
    },
    createEffect: async (id, runtimeContext) => {
      contexts.push(runtimeContext);
      const runtime = makeRuntime(id);
      runtimes.push(runtime);
      return runtime;
    },
    onStatus: (status) => statuses.push(status),
  });
  return { controller, environment, canvas, host, renderer, renderers, runtimes, contexts, statuses };
}

test("browser-local point targets reach the runtime and survive WebGPU renderer restoration", async () => {
  const pointCloud = {
    positions: new Float32Array([0, 0, 0]),
    normals: new Float32Array([0, 1, 0]),
    tangents: new Float32Array([1, 0, 0]),
    colors: new Float32Array([0, 1, 1]),
    sections: new Float32Array([0]),
    count: 1,
    meshCount: 1,
    triangleCount: 1,
  };
  const harness = makeHarness({ pointCloud, pointTarget: "uploaded" });
  await harness.controller.mount();
  assert.equal(harness.contexts[0].pointCloud, pointCloud);
  assert.equal(harness.contexts[0].pointTarget, "uploaded");

  harness.renderer.onDeviceLost({
    api: "WebGPU",
    message: "test loss",
    reason: "unknown",
    originalEvent: null,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.contexts[1].pointCloud, pointCloud);
  assert.equal(harness.contexts[1].pointTarget, "uploaded");
  harness.controller.dispose();
});

test("controller mounts, switches effects, and releases every owned resource on unmount", async () => {
  const harness = makeHarness();
  assert.equal(await harness.controller.mount(), true);
  const first = harness.runtimes[0];

  assert.equal(harness.renderer.initCalls, 1);
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
  assert.equal(harness.renderer.disposals, 1);
  assert.equal(harness.environment.observer.disconnected, 1);
  assert.equal(harness.environment.frames.size, 0);
  assert.equal(harness.environment.windowTarget.listenerCount("resize"), 0);
  assert.equal(harness.environment.windowTarget.listenerCount("pointermove"), 0);
  assert.equal(harness.environment.windowTarget.listenerCount("pointerout"), 0);
  assert.equal(harness.environment.windowTarget.listenerCount("blur"), 0);

  harness.controller.dispose();
  assert.equal(second.disposals, 1, "dispose is idempotent");
  assert.equal(harness.renderer.disposals, 1);
});

test("prepareRender runs exactly between update and render for static and animated frames", async () => {
  const harness = makeHarness();
  await harness.controller.mount();
  const runtime = harness.runtimes[0];
  const calls = [];
  const originalUpdate = runtime.update.bind(runtime);
  const originalRender = harness.renderer.render.bind(harness.renderer);

  runtime.update = (frame) => {
    calls.push("update");
    originalUpdate(frame);
  };
  runtime.prepareRender = () => { calls.push("prepareRender"); };
  harness.renderer.render = (...values) => {
    calls.push("render");
    originalRender(...values);
  };

  harness.controller.setPaused(true);
  assert.deepEqual(calls, ["update", "prepareRender", "render"]);

  calls.length = 0;
  harness.controller.setPaused(false);
  calls.length = 0;
  harness.environment.runNextFrame(16);
  assert.deepEqual(calls, ["update", "prepareRender", "render"]);

  harness.controller.dispose();
});

test("effect switches requested during renderer initialization are applied after initialization", async () => {
  const initializationStarted = deferred();
  const releaseInitialization = deferred();
  const harness = makeHarness({
    rendererFactory: () => {
      const renderer = makeRenderer();
      renderer.init = async function init() {
        this.initCalls += 1;
        initializationStarted.resolve();
        await releaseInitialization.promise;
      };
      return renderer;
    },
  });

  const mounted = harness.controller.mount();
  await initializationStarted.promise;
  assert.equal(
    await harness.controller.switchEffect("voice-wave-particles", "bass-current"),
    false,
    "the switch is queued while no renderer is published",
  );
  releaseInitialization.resolve();

  assert.equal(await mounted, true);
  assert.equal(harness.runtimes.length, 1);
  assert.equal(harness.runtimes[0].id, "voice-wave-particles");
  assert.deepEqual(harness.runtimes[0].selectedPresets, ["bass-current"]);
  harness.controller.dispose();
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
  assert.deepEqual(creationSize, [960, 540]);
  assert.deepEqual(runtime.resizes.at(-1), [960, 540, 1.5]);
  controller.dispose();
});

test("renderer initialization failure selects the accessible static fallback without allocating GPU work", async (t) => {
  t.mock.method(console, "error", () => {});
  const harness = makeHarness({ rendererError: new Error("no compatible GPU backend") });
  assert.equal(await harness.controller.mount(), false);
  assert.deepEqual(harness.statuses, [{
    loading: false,
    failure: "The WebGPU/WebGL2 renderer could not be initialized in this browser.",
  }]);
  assert.equal(harness.runtimes.length, 0);
  assert.equal(harness.environment.frames.size, 0);
  harness.controller.dispose();
  assert.equal(harness.renderer.disposals, 0);
});

test("WebGL2 loss stops rendering and selects the accessible reload fallback", async () => {
  const harness = makeHarness();
  await harness.controller.mount();
  const first = harness.runtimes[0];
  harness.environment.runNextFrame(16);
  assert.equal(first.updates.length, 2);

  harness.renderer.onDeviceLost({
    api: "WebGL",
    message: "test loss",
    reason: null,
    originalEvent: null,
  });
  assert.equal(harness.environment.frames.size, 0);
  assert.match(harness.statuses.at(-1).failure, /WebGL2 context was lost/i);

  assert.match(harness.statuses.at(-1).failure, /reload the page/i);
  assert.equal(first.disposals, 0);
  assert.equal(harness.renderers.length, 1);
  assert.equal(harness.environment.frames.size, 0);
  harness.controller.dispose();
});

test("WebGPU device loss rebuilds immediately without waiting for a WebGL event", async () => {
  const harness = makeHarness();
  await harness.controller.mount();
  const first = harness.runtimes[0];

  harness.renderer.onDeviceLost({
    api: "WebGPU",
    message: "adapter reset",
    reason: "unknown",
    originalEvent: null,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(first.disposals, 1);
  assert.equal(harness.renderer.disposals, 1);
  assert.equal(harness.renderers.length, 2);
  assert.equal(harness.runtimes.length, 2);
  assert.equal(harness.statuses.at(-1).failure, null);
  assert.equal(harness.environment.frames.size, 1);
  harness.controller.dispose();
});

test("a WebGPU replacement lost during initialization is discarded and retried", async () => {
  const replacementStarted = deferred();
  const releaseReplacement = deferred();
  const harness = makeHarness({
    rendererFactory: (index) => {
      const renderer = makeRenderer();
      if (index === 1) {
        renderer.init = async function init() {
          this.initCalls += 1;
          replacementStarted.resolve();
          await releaseReplacement.promise;
        };
      }
      return renderer;
    },
  });
  await harness.controller.mount();

  harness.renderer.onDeviceLost({
    api: "WebGPU",
    message: "first adapter reset",
    reason: "unknown",
    originalEvent: null,
  });
  await replacementStarted.promise;
  const lostReplacement = harness.renderers[1];
  lostReplacement.onDeviceLost({
    api: "WebGPU",
    message: "replacement reset during init",
    reason: "unknown",
    originalEvent: null,
  });
  releaseReplacement.resolve();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.renderers.length, 3);
  assert.equal(lostReplacement.disposals, 1);
  assert.equal(harness.runtimes.length, 2, "no effect is created for the lost replacement");
  assert.equal(harness.contexts[1].renderer, harness.renderers[2]);
  assert.equal(harness.statuses.at(-1).failure, null);
  assert.equal(harness.environment.frames.size, 1);
  harness.controller.dispose();
});

test("a WebGPU loss during initial initialization retries before mounting listeners", async () => {
  const initializationStarted = deferred();
  const releaseInitialization = deferred();
  const harness = makeHarness({
    rendererFactory: (index) => {
      const renderer = makeRenderer();
      if (index === 0) {
        renderer.init = async function init() {
          this.initCalls += 1;
          initializationStarted.resolve();
          await releaseInitialization.promise;
        };
      }
      return renderer;
    },
  });

  const mounted = harness.controller.mount();
  await initializationStarted.promise;
  harness.renderer.onDeviceLost({
    api: "WebGPU",
    message: "reset during initial init",
    reason: "unknown",
    originalEvent: null,
  });
  releaseInitialization.resolve();

  assert.equal(await mounted, true);
  assert.equal(harness.renderers.length, 2);
  assert.equal(harness.renderer.disposals, 1);
  assert.equal(harness.environment.windowTarget.listenerCount("resize"), 1);
  assert.equal(harness.environment.windowTarget.listenerCount("pointermove"), 1);
  assert.equal(harness.environment.frames.size, 1);
  harness.controller.dispose();
});

test("unmount during a pending WebGPU rebuild removes every window listener", async () => {
  const replacementStarted = deferred();
  const releaseReplacement = deferred();
  const harness = makeHarness({
    rendererFactory: (index) => {
      const renderer = makeRenderer();
      if (index === 1) {
        renderer.init = async function init() {
          this.initCalls += 1;
          replacementStarted.resolve();
          await releaseReplacement.promise;
        };
      }
      return renderer;
    },
  });
  await harness.controller.mount();

  harness.renderer.onDeviceLost({
    api: "WebGPU",
    message: "adapter reset",
    reason: "unknown",
    originalEvent: null,
  });
  await replacementStarted.promise;
  const pendingReplacement = harness.renderers[1];
  harness.controller.dispose();

  assert.equal(harness.environment.windowTarget.listenerCount("resize"), 0);
  assert.equal(harness.environment.windowTarget.listenerCount("pointermove"), 0);
  assert.equal(harness.environment.windowTarget.listenerCount("pointerout"), 0);
  assert.equal(harness.environment.windowTarget.listenerCount("blur"), 0);
  releaseReplacement.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pendingReplacement.disposals, 1);
});

test("a first-render failure disposes the candidate effect and leaves the RAF loop safe", async (t) => {
  t.mock.method(console, "error", () => {});
  const harness = makeHarness();
  await harness.controller.mount();
  const originalRender = harness.renderer.render.bind(harness.renderer);
  let failNextRender = true;
  harness.renderer.render = () => {
    if (failNextRender) {
      failNextRender = false;
      throw new Error("pipeline compilation failed");
    }
    originalRender();
  };

  assert.equal(await harness.controller.switchEffect("voice-wave-particles", "balanced"), false);
  const failedRuntime = harness.runtimes[1];
  assert.equal(failedRuntime.disposals, 1);
  assert.match(harness.statuses.at(-1).failure, /could not be prepared/i);
  assert.doesNotThrow(() => harness.environment.runNextFrame(16));
  assert.equal(failedRuntime.updates.length, 1, "the failed runtime is no longer used by RAF");

  harness.controller.dispose();
  assert.equal(failedRuntime.disposals, 1, "the failed runtime is not disposed twice");
});

test("paused, hidden, and reduced-motion frames never accumulate disabled wall time", async () => {
  const harness = makeHarness();
  await harness.controller.mount();
  const runtime = harness.runtimes[0];

  harness.environment.runNextFrame(16);
  assert.equal(runtime.updates.at(-1).elapsed, 0.016);
  harness.controller.setPaused(true);
  const pausedRendersBeforeResize = harness.renderer.renders;
  harness.environment.windowTarget.dispatch("resize");
  assert.equal(
    harness.renderer.renders,
    pausedRendersBeforeResize + 1,
    "a paused stage redraws after its render targets are resized",
  );
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
  const reducedRendersBeforeResize = reduced.renderer.renders;
  reduced.environment.windowTarget.dispatch("resize");
  assert.equal(
    reduced.renderer.renders,
    reducedRendersBeforeResize + 1,
    "a reduced-motion stage redraws after its render targets are resized",
  );
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

test("preset and uniform registries exactly cover every catalog runtime", () => {
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

import assert from "node:assert/strict";
import test from "node:test";

import {
  MATERIALIZATION_ARRIVAL_STAGGER,
  MATERIALIZATION_ARRIVAL_WINDOW,
  MATERIALIZATION_MAX_POINT_FLARE,
  MATERIALIZATION_TRANSITION_VARIANTS,
  isMaterializationTransitionVariant,
  materializationArrivalEnvelope,
  materializationArrivalProgress,
  materializationArrivalStart,
  materializationPointFlare,
  materializationSpatialPhase,
  materializationTrajectoryPosition,
  materializationTransitionIndex,
  materializationTransitionReplay,
} from "../lib/effects/materialization-transition-variants.ts";

test("materialization transition variants have stable IDs and indices", () => {
  assert.deepEqual(MATERIALIZATION_TRANSITION_VARIANTS, [
    "organic-arc",
    "spiral-vortex",
    "radial-bloom",
    "traveling-wave",
  ]);
  assert.equal(Object.isFrozen(MATERIALIZATION_TRANSITION_VARIANTS), true);

  MATERIALIZATION_TRANSITION_VARIANTS.forEach((variant, index) => {
    assert.equal(isMaterializationTransitionVariant(variant), true);
    assert.equal(materializationTransitionIndex(variant), index);
  });
  assert.equal(isMaterializationTransitionVariant("gentle-drift"), false);
  assert.equal(isMaterializationTransitionVariant("unknown"), false);
  assert.equal(isMaterializationTransitionVariant(null), false);
  assert.equal(materializationTransitionIndex("unknown"), 0);
});

test("selecting an active transition still replays Materialize and unpauses", () => {
  const activeVariant = "organic-arc";
  const replay = materializationTransitionReplay(activeVariant);
  assert.deepEqual(replay, {
    transitionVariant: activeVariant,
    preset: "materialize",
    paused: false,
    replayTokenIncrement: 1,
  });
});

test("arrival timing stays within the shared twelve-percent spread", () => {
  assert.equal(MATERIALIZATION_ARRIVAL_STAGGER, 0.12);
  assert.equal(MATERIALIZATION_ARRIVAL_WINDOW, 0.88);

  for (const seed of [-1, 0, 0.25, 0.5, 0.75, 1, 2, Number.NaN]) {
    const start = materializationArrivalStart(seed);
    assert.equal(Number.isFinite(start), true);
    assert.ok(start >= 0);
    assert.ok(start <= MATERIALIZATION_ARRIVAL_STAGGER);
  }
});

test("spatial ordering blends with seeds and degenerate ranges fall back", () => {
  assert.equal(materializationSpatialPhase(5, 0, 10), 0.5);
  assert.equal(materializationSpatialPhase(-5, 0, 10), 0);
  assert.equal(materializationSpatialPhase(15, 0, 10), 1);

  const seed = 0.25;
  const seededStart = seed * MATERIALIZATION_ARRIVAL_STAGGER;
  assert.equal(
    materializationArrivalStart(seed, materializationSpatialPhase(5, 5, 5)),
    seededStart,
  );
  assert.equal(
    materializationArrivalStart(
      seed,
      materializationSpatialPhase(5, 5, 5.0000001),
    ),
    seededStart,
  );
  assert.equal(
    materializationArrivalStart(seed, materializationSpatialPhase(5, 10, 0)),
    seededStart,
  );
  assert.equal(
    materializationArrivalStart(
      seed,
      materializationSpatialPhase(Number.NaN, 0, 10),
    ),
    seededStart,
  );
  assert.equal(materializationArrivalStart(seed, 0.75), 0.09);
  assert.equal(materializationArrivalStart(seed, 0.75, 0), seededStart);
  assert.equal(materializationArrivalStart(seed, 0.75, 0.5), 0.06);
  assert.equal(
    materializationArrivalStart(seed, 0.75, Number.NaN),
    seededStart,
  );
});

test("arrival progress and transient envelope return to both endpoints", () => {
  const earliestStart = materializationArrivalStart(0);
  const latestStart = materializationArrivalStart(1);

  assert.equal(materializationArrivalProgress(0, earliestStart), 0);
  assert.equal(materializationArrivalProgress(1, earliestStart), 1);
  assert.equal(materializationArrivalProgress(0, latestStart), 0);
  assert.equal(materializationArrivalProgress(1, latestStart), 1);
  assert.equal(materializationArrivalEnvelope(0), 0);
  assert.equal(materializationArrivalEnvelope(1), 0);

  for (let step = 0; step <= 100; step += 1) {
    const arrival = materializationArrivalProgress(step / 100, latestStart);
    const envelope = materializationArrivalEnvelope(arrival);
    assert.equal(Number.isFinite(arrival), true);
    assert.equal(Number.isFinite(envelope), true);
    assert.ok(arrival >= 0 && arrival <= 1);
    assert.ok(envelope >= 0 && envelope <= 1);
  }
});

test("point flare is finite and never exceeds the tuned cap", () => {
  assert.equal(MATERIALIZATION_MAX_POINT_FLARE, 1.5);
  assert.equal(materializationPointFlare(0), 1);
  assert.equal(materializationPointFlare(1), MATERIALIZATION_MAX_POINT_FLARE);
  assert.equal(materializationPointFlare(-1), 1);
  assert.equal(materializationPointFlare(20), MATERIALIZATION_MAX_POINT_FLARE);
  assert.equal(materializationPointFlare(Number.NaN), 1);
});

test("every transition path is finite and exact at shared endpoints", () => {
  const source = [1.3, -0.7, 0.4];
  const target = [-0.2, 0.9, 0.8];
  const normal = [0, 0.6, 0.8];
  const tangent = [1, 0, 0];

  for (const variant of MATERIALIZATION_TRANSITION_VARIANTS) {
    for (const seed of [0, 0.37, 1]) {
      assert.deepEqual(materializationTrajectoryPosition(variant, {
        source,
        target,
        normal,
        tangent,
        seed,
        arrival: 0,
        heightPhase: 0.25,
      }), source);
      assert.deepEqual(materializationTrajectoryPosition(variant, {
        source,
        target,
        normal,
        tangent,
        seed,
        arrival: 1,
        heightPhase: 0.25,
      }), target);

      for (let step = 1; step < 20; step += 1) {
        const position = materializationTrajectoryPosition(variant, {
          source,
          target,
          normal,
          tangent,
          seed,
          arrival: step / 20,
          heightPhase: 0.25,
        });
        assert.equal(position.length, 3);
        assert.equal(position.every(Number.isFinite), true);
      }
    }
  }
});

test("vortex reference orbits the model-space vertical axis", () => {
  const position = materializationTrajectoryPosition("spiral-vortex", {
    source: [2, 0, 0],
    target: [0, 0, 0],
    normal: [0, 1, 0],
    tangent: [1, 0, 0],
    seed: 0,
    arrival: 0.25,
    heightPhase: 0,
  });

  assert.ok(position[0] < 0);
  assert.ok(position[2] > 0);
  assert.equal(position[1], 0);
});

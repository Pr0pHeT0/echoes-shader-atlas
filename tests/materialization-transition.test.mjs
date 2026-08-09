import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceMaterializationProgress,
  initialMaterializationProgress,
  materializationTarget,
} from "../lib/effects/materialization-transition.ts";
import { MATERIALIZATION_TRANSITION_DURATION_SECONDS } from "../lib/effects/runtime-config.ts";

test("materialization transition reaches each endpoint in exactly 3.5 active seconds", () => {
  assert.equal(MATERIALIZATION_TRANSITION_DURATION_SECONDS, 3.5);

  const halfMaterialized = advanceMaterializationProgress(0, 1, 1.75, false);
  assert.equal(halfMaterialized, 0.5);
  assert.equal(advanceMaterializationProgress(halfMaterialized, 1, 1.75, false), 1);

  const halfDissolved = advanceMaterializationProgress(1, 0, 1.75, false);
  assert.equal(halfDissolved, 0.5);
  assert.equal(advanceMaterializationProgress(halfDissolved, 0, 1.75, false), 0);
});

test("materialization transition clamps progress and elapsed time", () => {
  assert.equal(advanceMaterializationProgress(0.9, 1, 30, false), 1);
  assert.equal(advanceMaterializationProgress(0.1, 0, 30, false), 0);
  assert.equal(advanceMaterializationProgress(4, 0, 0, false), 1);
  assert.equal(advanceMaterializationProgress(-4, 1, 0, false), 0);
  assert.equal(advanceMaterializationProgress(0.4, 1, -1, false), 0.4);
  assert.equal(advanceMaterializationProgress(0.4, 1, Number.NaN, false), 0.4);
});

test("retargeting reverses from the current scalar without a jump", () => {
  const forward = advanceMaterializationProgress(0, materializationTarget("materialize"), 1.4, false);
  assert.ok(Math.abs(forward - 0.4) < 1e-12);

  const reversed = advanceMaterializationProgress(forward, materializationTarget("dissolve"), 0.7, false);
  assert.ok(Math.abs(reversed - 0.2) < 1e-12);

  const resumed = advanceMaterializationProgress(reversed, materializationTarget("materialize"), 0.35, false);
  assert.ok(Math.abs(resumed - 0.3) < 1e-12);
});

test("initial progress starts materialize unresolved and dissolve settled", () => {
  assert.equal(initialMaterializationProgress("materialize", false), 0);
  assert.equal(initialMaterializationProgress("dissolve", false), 1);
  assert.equal(initialMaterializationProgress("dormant", false), 0);
  assert.equal(initialMaterializationProgress("pulse", false), 0);
});

test("zero active delta pauses transition progress", () => {
  assert.equal(advanceMaterializationProgress(0.375, 1, 0, false), 0.375);
  assert.equal(advanceMaterializationProgress(0.625, 0, 0, false), 0.625);
});

test("reduced motion snaps every preset to its appropriate endpoint", () => {
  assert.equal(initialMaterializationProgress("materialize", true), 1);
  assert.equal(initialMaterializationProgress("dissolve", true), 0);
  assert.equal(initialMaterializationProgress("dormant", true), 0);
  assert.equal(initialMaterializationProgress("pulse", true), 0);
  assert.equal(advanceMaterializationProgress(0.2, 1, 0, true), 1);
  assert.equal(advanceMaterializationProgress(0.8, 0, 0, true), 0);
});

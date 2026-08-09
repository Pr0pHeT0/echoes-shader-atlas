import assert from "node:assert/strict";
import test from "node:test";

import {
  MATERIALIZATION_BREATHE_AMPLITUDE,
  MATERIALIZATION_DRIFT_AMPLITUDE_MAX,
  MATERIALIZATION_DRIFT_AMPLITUDE_MIN,
  MATERIALIZATION_FLUTTER_BITANGENT_AMPLITUDE,
  MATERIALIZATION_FLUTTER_TANGENT_AMPLITUDE,
  MATERIALIZATION_MOTION_CROSSFADE_SECONDS,
  MATERIALIZATION_MOTION_MAX_OFFSET,
  MATERIALIZATION_MOTION_VARIANTS,
  MATERIALIZATION_ORBIT_AMPLITUDE_MAX,
  MATERIALIZATION_ORBIT_AMPLITUDE_MIN,
  MATERIALIZATION_RIPPLE_AMPLITUDE,
  MATERIALIZATION_TWIST_AMPLITUDE,
  advanceMaterializationMotionCrossfade,
  advanceMaterializationMotionPhase,
  isMaterializationMotionVariant,
  materializationMotionCrossfadeMix,
  materializationMotionCrossfadeWeights,
  materializationMotionIndex,
  materializationMotionOffset,
} from "../lib/effects/materialization-motion.ts";

const BASE_INPUT = Object.freeze({
  target: [0.8, 0.25, -0.6],
  normal: [0, 0.6, 0.8],
  tangent: [1, 0, 0],
  seed: 0.37,
  heightPhase: 0.62,
  radiusPhase: 0.41,
  phaseSeconds: 1.75,
  surfaceMix: 0,
  reducedMotion: false,
});

test("continuous materialization motions have stable IDs and uniform indices", () => {
  assert.deepEqual(MATERIALIZATION_MOTION_VARIANTS, [
    "gentle-drift",
    "orbital-current",
    "surface-breathe",
    "radial-ripple",
    "helical-twist",
    "tangent-flutter",
  ]);
  assert.equal(Object.isFrozen(MATERIALIZATION_MOTION_VARIANTS), true);

  MATERIALIZATION_MOTION_VARIANTS.forEach((variant, index) => {
    assert.equal(isMaterializationMotionVariant(variant), true);
    assert.equal(materializationMotionIndex(variant), index);
  });
  assert.equal(isMaterializationMotionVariant("organic-arc"), false);
  assert.equal(isMaterializationMotionVariant("unknown"), false);
  assert.equal(isMaterializationMotionVariant(null), false);
  assert.equal(materializationMotionIndex("unknown"), 0);
});

test("authored amplitudes stay within the shared displacement cap", () => {
  assert.equal(MATERIALIZATION_MOTION_MAX_OFFSET, 0.16);
  assert.deepEqual([
    MATERIALIZATION_DRIFT_AMPLITUDE_MIN,
    MATERIALIZATION_DRIFT_AMPLITUDE_MAX,
  ], [0.06, 0.11]);
  assert.deepEqual([
    MATERIALIZATION_ORBIT_AMPLITUDE_MIN,
    MATERIALIZATION_ORBIT_AMPLITUDE_MAX,
  ], [0.08, 0.14]);
  assert.equal(MATERIALIZATION_BREATHE_AMPLITUDE, 0.1);
  assert.equal(MATERIALIZATION_RIPPLE_AMPLITUDE, 0.12);
  assert.equal(MATERIALIZATION_TWIST_AMPLITUDE, 0.12);
  assert.ok(
    Math.hypot(
      MATERIALIZATION_FLUTTER_TANGENT_AMPLITUDE,
      MATERIALIZATION_FLUTTER_BITANGENT_AMPLITUDE,
    ) < MATERIALIZATION_MOTION_MAX_OFFSET,
  );
});

test("motion phases advance only by active time", () => {
  assert.equal(advanceMaterializationMotionPhase(0, 1.25), 1.25);
  assert.equal(advanceMaterializationMotionPhase(1.25, 0), 1.25);
  assert.equal(advanceMaterializationMotionPhase(1.25, -2), 1.25);
  assert.equal(
    advanceMaterializationMotionPhase(1.25, Number.NaN),
    1.25,
  );
  assert.equal(advanceMaterializationMotionPhase(Number.NaN, 0.5), 0.5);
});

test("crossfades complete in exactly 400ms of active time", () => {
  assert.equal(MATERIALIZATION_MOTION_CROSSFADE_SECONDS, 0.4);
  const halfway = advanceMaterializationMotionCrossfade(0, 0.2);
  assert.equal(halfway, 0.5);
  assert.equal(advanceMaterializationMotionCrossfade(halfway, 0), halfway);
  assert.equal(advanceMaterializationMotionCrossfade(halfway, 0.2), 1);
  assert.equal(advanceMaterializationMotionCrossfade(0.9, 5), 1);
  assert.equal(advanceMaterializationMotionCrossfade(0.4, -1), 0.4);
  assert.equal(
    advanceMaterializationMotionCrossfade(0.4, Number.NaN),
    0.4,
  );
});

test("crossfade weights are smooth, complementary, and endpoint exact", () => {
  assert.equal(materializationMotionCrossfadeMix(0), 0);
  assert.equal(materializationMotionCrossfadeMix(0.5), 0.5);
  assert.equal(materializationMotionCrossfadeMix(1), 1);
  assert.deepEqual(materializationMotionCrossfadeWeights(0), {
    from: 1,
    to: 0,
  });
  assert.deepEqual(materializationMotionCrossfadeWeights(1), {
    from: 0,
    to: 1,
  });

  for (let step = 0; step <= 40; step += 1) {
    const weights = materializationMotionCrossfadeWeights(step / 40);
    assert.equal(Number.isFinite(weights.from), true);
    assert.equal(Number.isFinite(weights.to), true);
    assert.ok(weights.from >= 0 && weights.from <= 1);
    assert.ok(weights.to >= 0 && weights.to <= 1);
    assert.ok(Math.abs(weights.from + weights.to - 1) < 1e-12);
  }
});

test("all motion references remain finite and bounded across seeds and time", () => {
  for (const variant of MATERIALIZATION_MOTION_VARIANTS) {
    for (const seed of [-1, 0, 0.37, 1, 2, Number.NaN]) {
      for (const phaseSeconds of [0, 0.125, 3.5, 90, Number.NaN]) {
        const offset = materializationMotionOffset(variant, {
          ...BASE_INPUT,
          seed,
          phaseSeconds,
        });
        assert.equal(offset.length, 3);
        assert.equal(offset.every(Number.isFinite), true);
        assert.ok(
          Math.hypot(...offset) <= MATERIALIZATION_MOTION_MAX_OFFSET + 1e-12,
          `${variant} exceeded the motion cap`,
        );
      }
    }
  }
});

test("continuous motion is exactly zero when settled or reduced", () => {
  for (const variant of MATERIALIZATION_MOTION_VARIANTS) {
    assert.deepEqual(materializationMotionOffset(variant, {
      ...BASE_INPUT,
      surfaceMix: 1,
    }), [0, 0, 0]);
    assert.deepEqual(materializationMotionOffset(variant, {
      ...BASE_INPUT,
      reducedMotion: true,
    }), [0, 0, 0]);
  }
});

test("surface visibility linearly fades an otherwise unchanged motion", () => {
  for (const variant of MATERIALIZATION_MOTION_VARIANTS) {
    const unresolved = materializationMotionOffset(variant, BASE_INPUT);
    const halfway = materializationMotionOffset(variant, {
      ...BASE_INPUT,
      surfaceMix: 0.5,
    });
    halfway.forEach((value, index) => {
      assert.ok(Math.abs(value - unresolved[index] * 0.5) < 1e-12);
    });
  }
});

test("degenerate particle frames fail safely without non-finite offsets", () => {
  for (const variant of MATERIALIZATION_MOTION_VARIANTS) {
    const offset = materializationMotionOffset(variant, {
      target: [0, Number.NaN, 0],
      normal: [0, 0, 0],
      tangent: [Number.POSITIVE_INFINITY, 0, 0],
      seed: Number.NaN,
      heightPhase: Number.NaN,
      radiusPhase: Number.NaN,
      phaseSeconds: Number.POSITIVE_INFINITY,
      surfaceMix: Number.NaN,
      reducedMotion: false,
    });
    assert.equal(offset.every(Number.isFinite), true);
    assert.ok(Math.hypot(...offset) <= MATERIALIZATION_MOTION_MAX_OFFSET);
  }
});

test("Orbit and Twist use the horizontal target tangent on the vertical axis", () => {
  const axialInput = {
    ...BASE_INPUT,
    target: [0, 2, 0],
    tangent: [1, 1, 0],
    seed: 0,
    phaseSeconds: 0,
    heightPhase: 0.25,
  };

  const orbitOffset = materializationMotionOffset("orbital-current", axialInput);
  assert.ok(Math.abs(orbitOffset[0] - MATERIALIZATION_ORBIT_AMPLITUDE_MIN) < 1e-12);
  assert.equal(orbitOffset[1], 0);
  assert.equal(orbitOffset[2], 0);

  const twistOffset = materializationMotionOffset("helical-twist", axialInput);
  assert.ok(Math.abs(twistOffset[0] - MATERIALIZATION_TWIST_AMPLITUDE) < 1e-12);
  assert.equal(twistOffset[1], 0);
  assert.equal(twistOffset[2], 0);
});

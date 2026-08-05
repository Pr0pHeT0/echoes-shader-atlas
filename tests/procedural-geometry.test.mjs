import assert from "node:assert/strict";
import test from "node:test";

import {
  createProceduralTerrain,
  createSegmentedTorusKnot,
  seededValue,
} from "../lib/effects/geometry.ts";

function assertFinite(values) {
  for (const value of values) assert.ok(Number.isFinite(value));
}

test("seeded terrain is deterministic, finite, and preserves the requested point count", () => {
  assert.equal(seededValue(12, 47), seededValue(12, 47));
  assert.ok(seededValue(12, 47) >= 0 && seededValue(12, 47) < 1);

  const first = createProceduralTerrain(257.9, 47);
  const second = createProceduralTerrain(257.9, 47);
  const alternate = createProceduralTerrain(257.9, 48);

  assert.equal(first.count, 257);
  assert.equal(first.positions.length, 257 * 3);
  assert.equal(first.colors.length, 257 * 3);
  assert.deepEqual(first.positions, second.positions);
  assert.deepEqual(first.colors, second.colors);
  assert.notDeepEqual(first.positions, alternate.positions);
  assertFinite(first.positions);
  assertFinite(first.colors);
});

test("segmented torus knot is deterministic and partitions particles into four sections", () => {
  const first = createSegmentedTorusKnot(512);
  const second = createSegmentedTorusKnot(512);

  assert.equal(first.count, 512);
  assert.equal(first.positions.length, 512 * 3);
  assert.equal(first.colors.length, 512 * 3);
  assert.equal(first.particleSections.length, 512);
  assert.equal(first.sections.length, 4);
  assert.deepEqual(first.positions, second.positions);
  assert.deepEqual(first.colors, second.colors);
  assert.deepEqual(first.particleSections, second.particleSections);
  assert.deepEqual(new Set(first.particleSections), new Set([0, 1, 2, 3]));
  for (const section of first.sections) {
    assert.ok(section.positions.length > 0);
    assert.equal(section.positions.length, section.normals.length);
    assert.equal(section.positions.length % 3, 0);
    assertFinite(section.positions);
    assertFinite(section.normals);
  }
});

test("procedural replacement generators clamp unusable counts to one point", () => {
  assert.equal(createProceduralTerrain(0).count, 1);
  assert.equal(createSegmentedTorusKnot(Number.NaN).count, 1);
});

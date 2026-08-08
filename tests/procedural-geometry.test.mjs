import assert from "node:assert/strict";
import test from "node:test";

import {
  createProceduralTerrain,
  createSegmentedTorusKnot,
  makeRandomIndices,
  seededValue,
} from "../lib/effects/geometry.ts";

function assertFinite(values) {
  for (const value of values) assert.ok(Number.isFinite(value));
}

function assertOrthonormalFrames(normals, tangents, count, tolerance = 1e-5) {
  assert.equal(normals.length, count * 3);
  assert.equal(tangents.length, count * 3);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const nx = normals[offset];
    const ny = normals[offset + 1];
    const nz = normals[offset + 2];
    const tx = tangents[offset];
    const ty = tangents[offset + 1];
    const tz = tangents[offset + 2];
    assert.ok([nx, ny, nz, tx, ty, tz].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) <= tolerance);
    assert.ok(Math.abs(Math.hypot(tx, ty, tz) - 1) <= tolerance);
    assert.ok(Math.abs(nx * tx + ny * ty + nz * tz) <= tolerance);
  }
}

test("seeded terrain is deterministic, finite, and preserves the requested point count", () => {
  assert.equal(seededValue(12, 47), seededValue(12, 47));
  assert.ok(seededValue(12, 47) >= 0 && seededValue(12, 47) < 1);

  const first = createProceduralTerrain(257.9, 47);
  const second = createProceduralTerrain(257.9, 47);
  const alternate = createProceduralTerrain(257.9, 48);

  assert.equal(first.count, 257);
  assert.equal(first.positions.length, 257 * 3);
  assert.equal(first.normals.length, 257 * 3);
  assert.equal(first.tangents.length, 257 * 3);
  assert.equal(first.colors.length, 257 * 3);
  assert.equal(first.particleSections.length, 257);
  assert.deepEqual(first.positions, second.positions);
  assert.deepEqual(first.normals, second.normals);
  assert.deepEqual(first.tangents, second.tangents);
  assert.deepEqual(first.colors, second.colors);
  assert.deepEqual(first.particleSections, second.particleSections);
  assert.notDeepEqual(first.positions, alternate.positions);
  assert.notDeepEqual(first.normals, alternate.normals);
  assert.notDeepEqual(first.tangents, alternate.tangents);
  assertFinite(first.positions);
  assertFinite(first.normals);
  assertFinite(first.tangents);
  assertFinite(first.colors);
  assertOrthonormalFrames(first.normals, first.tangents, first.count);
  assert.deepEqual(new Set(first.particleSections), new Set([0, 1, 2, 3]));
});

test("segmented torus knot is deterministic and partitions particles into four sections", () => {
  const first = createSegmentedTorusKnot(512);
  const second = createSegmentedTorusKnot(512);

  assert.equal(first.count, 512);
  assert.equal(first.positions.length, 512 * 3);
  assert.equal(first.normals.length, 512 * 3);
  assert.equal(first.tangents.length, 512 * 3);
  assert.equal(first.colors.length, 512 * 3);
  assert.equal(first.particleSections.length, 512);
  assert.equal(first.sections.length, 4);
  assert.deepEqual(first.positions, second.positions);
  assert.deepEqual(first.normals, second.normals);
  assert.deepEqual(first.tangents, second.tangents);
  assert.deepEqual(first.colors, second.colors);
  assert.deepEqual(first.particleSections, second.particleSections);
  assert.deepEqual(new Set(first.particleSections), new Set([0, 1, 2, 3]));
  assertOrthonormalFrames(first.normals, first.tangents, first.count);
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

test("random index samples are deterministic, unique, and unbiased by array stride", () => {
  const first = makeRandomIndices(37, 19, 401);
  const second = makeRandomIndices(37, 19, 401);
  const alternate = makeRandomIndices(37, 19, 409);

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, alternate);
  assert.equal(first.length, 19);
  assert.equal(new Set(first).size, first.length);
  assert.ok(first.every((index) => index >= 0 && index < 37));
  assert.deepEqual(makeRandomIndices(5, 20, 401).toSorted(), Uint32Array.from([0, 1, 2, 3, 4]));
  assert.equal(makeRandomIndices(Number.NaN, 12, 401).length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  CONSTRAINED_PARTICLE_COUNT,
  FULL_PARTICLE_COUNT,
  MAX_DPR,
  MATERIALIZATION_POINT_SIZE_MAX,
  MATERIALIZATION_POINT_SIZE_MIN,
  clampAudio,
  clampDpr,
  disposeObjectTree,
  resolveMaterializationPointSize,
  resolveParticleCount,
  syntheticAudio,
} from "../lib/effects/runtime-utils.ts";

test("caps pixel density and particle budgets for both quality profiles", () => {
  assert.equal(MAX_DPR, 1.5);
  assert.equal(clampDpr(3), 1.5);
  assert.equal(clampDpr(0.1), 0.5);
  assert.equal(clampDpr(Number.NaN), 1);

  assert.equal(resolveParticleCount({ particleCount: 100_000, reducedMotion: false }), FULL_PARTICLE_COUNT);
  assert.equal(
    resolveParticleCount({ particleCount: 100_000, reducedMotion: true }),
    CONSTRAINED_PARTICLE_COUNT,
  );
  assert.equal(resolveParticleCount({ particleCount: 8_192.9, reducedMotion: false }), 8_192);
  assert.equal(resolveParticleCount({ particleCount: -1, reducedMotion: false }), 1_024);
});

test("materialization point size decreases deterministically with model complexity", () => {
  const simple = resolveMaterializationPointSize(12, 1);
  const detailed = resolveMaterializationPointSize(25_000, 12);
  const maximum = resolveMaterializationPointSize(1_000_000, 512);

  assert.ok(simple > detailed);
  assert.ok(detailed > maximum);
  assert.equal(maximum, MATERIALIZATION_POINT_SIZE_MIN);
  assert.equal(resolveMaterializationPointSize(0, 0), MATERIALIZATION_POINT_SIZE_MAX);
  assert.equal(resolveMaterializationPointSize(Number.NaN, Number.POSITIVE_INFINITY), MATERIALIZATION_POINT_SIZE_MAX);
  assert.equal(resolveMaterializationPointSize(25_000, 12), detailed);
});

test("synthetic audio is deterministic, bounded, and accepts manual overrides", () => {
  const first = syntheticAudio(12.5);
  const second = syntheticAudio(12.5);

  assert.deepEqual(first, second);
  for (const value of Object.values(first)) {
    assert.ok(value >= 0 && value <= 1);
  }
  assert.deepEqual(clampAudio({ level: 9, bass: -4, mid: 0.25, treble: Number.NaN }), {
    level: 1,
    bass: 0,
    mid: 0.25,
    treble: 0,
  });
  assert.deepEqual(syntheticAudio(999, { bass: 2 }), {
    level: 0,
    bass: 1,
    mid: 0,
    treble: 0,
  });
});

test("runtime cleanup disposes geometries and all materials before clearing the scene", () => {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const firstMaterial = new THREE.PointsMaterial();
  const secondMaterial = new THREE.PointsMaterial();
  const disposals = { geometry: 0, firstMaterial: 0, secondMaterial: 0 };

  geometry.dispose = () => { disposals.geometry += 1; };
  firstMaterial.dispose = () => { disposals.firstMaterial += 1; };
  secondMaterial.dispose = () => { disposals.secondMaterial += 1; };
  root.add(new THREE.Points(geometry, [firstMaterial, secondMaterial]));

  disposeObjectTree(root);

  assert.deepEqual(disposals, { geometry: 1, firstMaterial: 1, secondMaterial: 1 });
  assert.equal(root.children.length, 0);
});

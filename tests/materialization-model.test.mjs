import assert from "node:assert/strict";
import test from "node:test";

import {
  MATERIALIZATION_MODEL_MAX_BYTES,
  MaterializationModelError,
  createMaterializationPointCloudFromFile,
  createMaterializationPointCloudFromGlb,
} from "../lib/effects/materialization-model.ts";

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BINARY_CHUNK = 0x004e4942;

function makeGlb(document, binary = new Uint8Array()) {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const binaryLength = Math.ceil(binary.byteLength / 4) * 4;
  const includeBinary = binary.byteLength > 0;
  const totalLength = 12 + 8 + jsonLength + (includeBinary ? 8 + binaryLength : 0);
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, GLB_JSON_CHUNK, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(json, 20);
  if (includeBinary) {
    const offset = 20 + jsonLength;
    view.setUint32(offset, binaryLength, true);
    view.setUint32(offset + 4, GLB_BINARY_CHUNK, true);
    bytes.set(binary, offset + 8);
  }
  return buffer;
}

function makeTwoNodeTriangleGlb() {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  return makeGlb({
    asset: { version: "2.0" },
    buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    accessors: [{
      bufferView: 0,
      componentType: 5126,
      count: 3,
      type: "VEC3",
      min: [0, 0, 0],
      max: [1, 1, 0],
    }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    nodes: [{ mesh: 0 }, { mesh: 0, translation: [2, 0, 0] }],
    scenes: [{ nodes: [0, 1] }],
    scene: 0,
  }, new Uint8Array(positions.buffer));
}

test("GLB geometry is sampled deterministically, normalized, and divided into four sections", async () => {
  const glb = makeTwoNodeTriangleGlb();
  const first = await createMaterializationPointCloudFromGlb(glb, 4_096);
  const second = await createMaterializationPointCloudFromGlb(glb, 4_096);

  assert.equal(first.count, 4_096);
  assert.equal(first.meshCount, 2);
  assert.equal(first.triangleCount, 2);
  assert.deepEqual(first.positions, second.positions);
  assert.deepEqual(first.colors, second.colors);
  assert.deepEqual(first.sections, second.sections);
  assert.ok([...first.positions].every(Number.isFinite));
  assert.ok([...first.colors].every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  assert.deepEqual([...new Set(first.sections)].sort(), [0, 1, 2, 3]);
  assert.deepEqual([...new Set(first.sections.slice(0, 1_024))].sort(), [0, 1, 2, 3]);

  const xs = [];
  const ys = [];
  for (let index = 0; index < first.count; index += 1) {
    xs.push(first.positions[index * 3]);
    ys.push(first.positions[index * 3 + 1]);
  }
  assert.ok(Math.max(...xs) - Math.min(...xs) > 3.6, "world transforms contribute to normalized bounds");
  assert.ok(Math.max(...ys) - Math.min(...ys) < 1.4, "uniform scale preserves the source aspect ratio");
});

test("the importer rejects external resources and unsupported geometry compression before parsing", async () => {
  const external = makeGlb({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 12, uri: "external.bin" }],
  });
  await assert.rejects(
    createMaterializationPointCloudFromGlb(external, 16),
    (error) => error instanceof MaterializationModelError && error.code === "external",
  );

  const compressed = makeGlb({
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_draco_mesh_compression"],
  });
  await assert.rejects(
    createMaterializationPointCloudFromGlb(compressed, 16),
    (error) => error instanceof MaterializationModelError && error.code === "compression",
  );
});

test("file validation is bounded and keeps the conversion local", async () => {
  await assert.rejects(
    createMaterializationPointCloudFromFile({
      name: "scene.gltf",
      size: 1,
      arrayBuffer: async () => new ArrayBuffer(1),
    }),
    (error) => error instanceof MaterializationModelError && error.code === "format",
  );
  await assert.rejects(
    createMaterializationPointCloudFromFile({
      name: "empty.glb",
      size: 0,
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
    (error) => error instanceof MaterializationModelError && error.code === "empty",
  );
  await assert.rejects(
    createMaterializationPointCloudFromFile({
      name: "huge.glb",
      size: MATERIALIZATION_MODEL_MAX_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
    (error) => error instanceof MaterializationModelError && error.code === "size",
  );
});

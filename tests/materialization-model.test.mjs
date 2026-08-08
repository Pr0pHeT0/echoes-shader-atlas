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

function makeColoredTriangleGlb({ baseColorFactor, vertexColor = null }) {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const colors = vertexColor
    ? new Float32Array([...vertexColor, ...vertexColor, ...vertexColor])
    : null;
  const binary = new Uint8Array(positions.byteLength + (colors?.byteLength ?? 0));
  binary.set(new Uint8Array(positions.buffer), 0);
  if (colors) binary.set(new Uint8Array(colors.buffer), positions.byteLength);

  const bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }];
  const accessors = [{
    bufferView: 0,
    componentType: 5126,
    count: 3,
    type: "VEC3",
    min: [0, 0, 0],
    max: [1, 1, 0],
  }];
  const attributes = { POSITION: 0 };
  if (colors) {
    bufferViews.push({
      buffer: 0,
      byteOffset: positions.byteLength,
      byteLength: colors.byteLength,
    });
    accessors.push({
      bufferView: 1,
      componentType: 5126,
      count: 3,
      type: "VEC3",
      min: [0, 0, 0],
      max: [1, 1, 1],
    });
    attributes.COLOR_0 = 1;
  }

  return makeGlb({
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews,
    accessors,
    materials: [{ pbrMetallicRoughness: { baseColorFactor } }],
    meshes: [{ primitives: [{ attributes, material: 0, mode: 4 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }, binary);
}

function makeFramedTriangleGlb({ normals = null, tangents = null, node = {} } = {}) {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const chunks = [positions];
  if (normals) chunks.push(new Float32Array(normals));
  if (tangents) chunks.push(new Float32Array(tangents));
  const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const binary = new Uint8Array(byteLength);
  const bufferViews = [];
  const accessors = [];
  const attributes = {};
  let byteOffset = 0;

  function addAttribute(name, values, type, min, max) {
    const bufferView = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: values.byteLength });
    const accessor = {
      bufferView,
      componentType: 5126,
      count: 3,
      type,
      ...(min ? { min } : {}),
      ...(max ? { max } : {}),
    };
    accessors.push(accessor);
    attributes[name] = accessors.length - 1;
    binary.set(new Uint8Array(values.buffer, values.byteOffset, values.byteLength), byteOffset);
    byteOffset += values.byteLength;
  }

  addAttribute("POSITION", chunks[0], "VEC3", [0, 0, 0], [1, 1, 0]);
  let chunk = 1;
  if (normals) addAttribute("NORMAL", chunks[chunk++], "VEC3");
  if (tangents) addAttribute("TANGENT", chunks[chunk], "VEC4");

  return makeGlb({
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews,
    accessors,
    meshes: [{ primitives: [{ attributes, mode: 4 }] }],
    nodes: [{ mesh: 0, ...node }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }, binary);
}

function assertColor(pointCloud, expected, tolerance = 1e-6) {
  for (let index = 0; index < pointCloud.colors.length; index += 3) {
    assert.ok(Math.abs(pointCloud.colors[index] - expected[0]) <= tolerance);
    assert.ok(Math.abs(pointCloud.colors[index + 1] - expected[1]) <= tolerance);
    assert.ok(Math.abs(pointCloud.colors[index + 2] - expected[2]) <= tolerance);
  }
}

function assertOrthonormalFrames(pointCloud, tolerance = 1e-5) {
  assert.equal(pointCloud.normals.length, pointCloud.count * 3);
  assert.equal(pointCloud.tangents.length, pointCloud.count * 3);
  for (let index = 0; index < pointCloud.count; index += 1) {
    const offset = index * 3;
    const normal = pointCloud.normals.subarray(offset, offset + 3);
    const tangent = pointCloud.tangents.subarray(offset, offset + 3);
    assert.ok([...normal, ...tangent].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...normal) - 1) <= tolerance);
    assert.ok(Math.abs(Math.hypot(...tangent) - 1) <= tolerance);
    assert.ok(Math.abs(
      normal[0] * tangent[0]
      + normal[1] * tangent[1]
      + normal[2] * tangent[2]
    ) <= tolerance);
  }
}

function assertFrame(pointCloud, expectedNormal, expectedTangent, tolerance = 1e-5) {
  for (let index = 0; index < pointCloud.count; index += 1) {
    const offset = index * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      assert.ok(Math.abs(pointCloud.normals[offset + channel] - expectedNormal[channel]) <= tolerance);
      assert.ok(Math.abs(pointCloud.tangents[offset + channel] - expectedTangent[channel]) <= tolerance);
    }
  }
}

test("GLB geometry is sampled deterministically, normalized, and divided into four sections", async () => {
  const glb = makeTwoNodeTriangleGlb();
  const first = await createMaterializationPointCloudFromGlb(glb, 4_096);
  const second = await createMaterializationPointCloudFromGlb(glb, 4_096);

  assert.equal(first.count, 4_096);
  assert.equal(first.meshCount, 2);
  assert.equal(first.triangleCount, 2);
  assert.deepEqual(first.positions, second.positions);
  assert.deepEqual(first.normals, second.normals);
  assert.deepEqual(first.tangents, second.tangents);
  assert.deepEqual(first.colors, second.colors);
  assert.deepEqual(first.sections, second.sections);
  assert.ok([...first.positions].every(Number.isFinite));
  assert.ok([...first.colors].every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  assertOrthonormalFrames(first);
  assertFrame(first, [0, 0, 1], [1, 0, 0]);
  assertColor(first, [1, 1, 1]);
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

test("GLB points preserve base-material color and multiply interpolated RGB vertex color", async () => {
  const materialOnly = await createMaterializationPointCloudFromGlb(
    makeColoredTriangleGlb({ baseColorFactor: [0.2, 0.3, 0.4, 1] }),
    64,
  );
  assertColor(materialOnly, [0.2, 0.3, 0.4]);

  const vertexAndMaterial = await createMaterializationPointCloudFromGlb(
    makeColoredTriangleGlb({
      baseColorFactor: [0.4, 0.8, 0.5, 1],
      vertexColor: [0.5, 0.25, 1],
    }),
    64,
  );
  assertColor(vertexAndMaterial, [0.2, 0.2, 0.5]);
});

test("GLB points barycentrically interpolate normals and tangents into orthonormal frames", async () => {
  const diagonal = Math.SQRT1_2;
  const pointCloud = await createMaterializationPointCloudFromGlb(makeFramedTriangleGlb({
    normals: [
      0, 0, 1,
      0, diagonal, diagonal,
      diagonal, 0, diagonal,
    ],
    tangents: [
      1, 0, 0, 1,
      1, 0, 0, 1,
      0, 1, 0, 1,
    ],
  }), 96);

  assertOrthonormalFrames(pointCloud);
  for (let index = 0; index < pointCloud.count; index += 1) {
    const offset = index * 3;
    const weightB = pointCloud.positions[offset] / 3.8 + 0.5;
    const weightC = pointCloud.positions[offset + 1] / 3.8 + 0.5;
    const weightA = 1 - weightB - weightC;
    const expectedNormal = [
      weightC * diagonal,
      weightB * diagonal,
      weightA + (weightB + weightC) * diagonal,
    ];
    const normalLength = Math.hypot(...expectedNormal);
    for (let channel = 0; channel < 3; channel += 1) expectedNormal[channel] /= normalLength;

    const expectedTangent = [weightA + weightB, weightC, 0];
    const tangentDot = expectedTangent[0] * expectedNormal[0]
      + expectedTangent[1] * expectedNormal[1]
      + expectedTangent[2] * expectedNormal[2];
    for (let channel = 0; channel < 3; channel += 1) {
      expectedTangent[channel] -= expectedNormal[channel] * tangentDot;
    }
    const tangentLength = Math.hypot(...expectedTangent);
    for (let channel = 0; channel < 3; channel += 1) expectedTangent[channel] /= tangentLength;

    for (let channel = 0; channel < 3; channel += 1) {
      assert.ok(Math.abs(pointCloud.normals[offset + channel] - expectedNormal[channel]) <= 1e-5);
      assert.ok(Math.abs(pointCloud.tangents[offset + channel] - expectedTangent[channel]) <= 1e-5);
    }
  }
});

test("GLB frame transforms use inverse-transpose normals and transformed tangent directions", async () => {
  const rotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
  const node = { rotation, scale: [2, 3, 0.5] };
  const supplied = await createMaterializationPointCloudFromGlb(makeFramedTriangleGlb({
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    tangents: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
    node,
  }), 64);
  assertOrthonormalFrames(supplied);
  assertFrame(supplied, [1, 0, 0], [0, 0, -1]);

  const fallback = await createMaterializationPointCloudFromGlb(makeFramedTriangleGlb({
    normals: new Array(9).fill(0),
    tangents: new Array(12).fill(0),
    node,
  }), 64);
  assertOrthonormalFrames(fallback);
  assertFrame(fallback, [1, 0, 0], [0, 1, 0]);
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

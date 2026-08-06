import type {
  BufferAttribute,
  InterleavedBufferAttribute,
  Mesh,
  Object3D,
} from "three";
import type { MaterializationPointCloud } from "./types";

export const MATERIALIZATION_MODEL_MAX_BYTES = 20 * 1024 * 1024;
export const MATERIALIZATION_MODEL_POINT_COUNT = 65_536;
export const MATERIALIZATION_MODEL_MAX_TRIANGLES = 1_000_000;

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BINARY_CHUNK = 0x004e4942;
const TARGET_LONGEST_DIMENSION = 3.8;
const REJECTED_GEOMETRY_EXTENSIONS = new Map([
  ["KHR_draco_mesh_compression", "Draco"],
  ["EXT_meshopt_compression", "Meshopt"],
  ["EXT_mesh_gpu_instancing", "GPU instancing"],
]);

export type MaterializationModelErrorCode =
  | "format"
  | "empty"
  | "size"
  | "external"
  | "compression"
  | "complexity"
  | "geometry"
  | "degenerate"
  | "parse"
  | "memory";

export class MaterializationModelError extends Error {
  readonly code: MaterializationModelErrorCode;

  constructor(code: MaterializationModelErrorCode, message: string) {
    super(message);
    this.name = "MaterializationModelError";
    this.code = code;
  }
}

interface GlbBuffer {
  byteLength?: number;
  uri?: string;
}

interface GlbImage {
  uri?: string;
  bufferView?: number;
}

interface GlbAccessor {
  count?: number;
}

interface GlbPrimitive {
  attributes?: Record<string, number>;
  indices?: number;
  material?: number;
  targets?: unknown;
  extensions?: Record<string, unknown>;
}

interface GlbMesh {
  primitives?: GlbPrimitive[];
}

interface GlbNode {
  camera?: number;
  skin?: number;
  extensions?: Record<string, unknown>;
}

interface GlbDocument {
  asset?: { version?: string };
  accessors?: GlbAccessor[];
  buffers?: GlbBuffer[];
  images?: GlbImage[];
  meshes?: GlbMesh[];
  nodes?: GlbNode[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  animations?: unknown[];
  cameras?: unknown[];
  extensions?: Record<string, unknown>;
  materials?: unknown[];
  samplers?: unknown[];
  skins?: unknown[];
  textures?: unknown[];
}

interface ParsedGlb {
  document: GlbDocument;
  binaryChunk: Uint8Array | null;
}

type GeometryAttribute = BufferAttribute | InterleavedBufferAttribute;

interface SampleSurface {
  mesh: Mesh;
  position: GeometryAttribute;
  color: GeometryAttribute | null;
  index: BufferAttribute | null;
  triangleIndices: Uint32Array;
  cumulativeAreas: Float64Array;
  startArea: number;
  area: number;
}

function fail(code: MaterializationModelErrorCode, message: string): never {
  throw new MaterializationModelError(code, message);
}

function parseGlb(arrayBuffer: ArrayBuffer): ParsedGlb {
  if (arrayBuffer.byteLength === 0) fail("empty", "This file is empty. Choose another GLB.");
  if (arrayBuffer.byteLength < 20) {
    fail("format", "Choose a binary glTF 2.0 file ending in .glb.");
  }

  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
    fail("format", "Choose a binary glTF 2.0 file ending in .glb.");
  }
  if (view.getUint32(8, true) !== arrayBuffer.byteLength) {
    fail("parse", "We could not read this GLB. It may be damaged or use an unsupported extension.");
  }

  let offset = 12;
  let document: GlbDocument | null = null;
  let binaryChunk: Uint8Array | null = null;
  while (offset + 8 <= arrayBuffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > arrayBuffer.byteLength) {
      fail("parse", "We could not read this GLB. It may be damaged or use an unsupported extension.");
    }
    if (chunkType === GLB_JSON_CHUNK && document === null) {
      try {
        const text = new TextDecoder().decode(new Uint8Array(arrayBuffer, chunkStart, chunkLength)).trim();
        document = JSON.parse(text) as GlbDocument;
      } catch {
        fail("parse", "We could not read this GLB. It may be damaged or use an unsupported extension.");
      }
    } else if (chunkType === GLB_BINARY_CHUNK && binaryChunk === null) {
      binaryChunk = new Uint8Array(arrayBuffer, chunkStart, chunkLength);
    }
    offset = chunkEnd;
  }

  if (offset !== arrayBuffer.byteLength) {
    fail("parse", "We could not read this GLB. It may be damaged or use an unsupported extension.");
  }

  if (!document || document.asset?.version !== "2.0") {
    fail("format", "Choose a binary glTF 2.0 file ending in .glb.");
  }
  return { document, binaryChunk };
}

function inspectDocument(document: GlbDocument): void {
  if ((document.nodes?.length ?? 0) > 2_048 || (document.meshes?.length ?? 0) > 512) {
    fail(
      "complexity",
      "This model is too complex to prepare safely in the browser. Export a lighter static GLB and try again.",
    );
  }
  const serializedDocument = JSON.stringify(document);
  for (const [extension, label] of REJECTED_GEOMETRY_EXTENSIONS) {
    if (serializedDocument.includes(`"${extension}"`)) {
      fail(
        "compression",
        `This GLB uses ${label}, which this local importer cannot decode. Export an uncompressed GLB and try again.`,
      );
    }
  }
  const hasExternalUri = [
    ...(document.buffers ?? []).map((entry) => entry.uri),
    ...(document.images ?? []).map((entry) => entry.uri),
  ].some((uri) => typeof uri === "string" && !uri.startsWith("data:"));
  if (hasExternalUri || (document.buffers?.length ?? 0) > 1) {
    fail(
      "external",
      "This GLB references files outside itself. Export a self-contained GLB and try again.",
    );
  }

  const accessors = document.accessors ?? [];
  let estimatedTriangles = 0;
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      const accessorCount = accessorIndex === undefined ? 0 : accessors[accessorIndex]?.count ?? 0;
      estimatedTriangles += Math.floor(accessorCount / 3);
    }
  }
  if (estimatedTriangles > MATERIALIZATION_MODEL_MAX_TRIANGLES) {
    fail(
      "complexity",
      "This model is too complex to prepare safely in the browser. Export a lighter static GLB and try again.",
    );
  }
}

function createGeometryOnlyGlb(parsed: ParsedGlb): ArrayBuffer {
  const document = JSON.parse(JSON.stringify(parsed.document)) as GlbDocument;
  delete document.images;
  delete document.textures;
  delete document.samplers;
  delete document.materials;
  delete document.animations;
  delete document.cameras;
  delete document.skins;
  delete document.extensions;
  document.extensionsUsed = [];
  document.extensionsRequired = [];
  for (const node of document.nodes ?? []) {
    delete node.camera;
    delete node.skin;
    delete node.extensions;
  }
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      delete primitive.material;
      delete primitive.targets;
      delete primitive.extensions;
    }
  }

  const encodedJson = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(encodedJson.byteLength / 4) * 4;
  const binaryLength = parsed.binaryChunk ? Math.ceil(parsed.binaryChunk.byteLength / 4) * 4 : 0;
  const totalLength = 12 + 8 + jsonLength + (parsed.binaryChunk ? 8 + binaryLength : 0);
  const output = new ArrayBuffer(totalLength);
  const outputView = new DataView(output);
  const outputBytes = new Uint8Array(output);
  outputView.setUint32(0, GLB_MAGIC, true);
  outputView.setUint32(4, 2, true);
  outputView.setUint32(8, totalLength, true);
  outputView.setUint32(12, jsonLength, true);
  outputView.setUint32(16, GLB_JSON_CHUNK, true);
  outputBytes.fill(0x20, 20, 20 + jsonLength);
  outputBytes.set(encodedJson, 20);
  if (parsed.binaryChunk) {
    const binaryHeaderOffset = 20 + jsonLength;
    outputView.setUint32(binaryHeaderOffset, binaryLength, true);
    outputView.setUint32(binaryHeaderOffset + 4, GLB_BINARY_CHUNK, true);
    outputBytes.set(parsed.binaryChunk, binaryHeaderOffset + 8);
  }
  return output;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function findTriangle(cumulativeAreas: Float64Array, target: number): number {
  let low = 0;
  let high = cumulativeAreas.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (target < cumulativeAreas[middle]) high = middle;
    else low = middle + 1;
  }
  return low;
}

function disposeScene(root: Object3D): void {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<{ dispose(): void }>();
  const textures = new Set<{ dispose(): void; source?: { data?: unknown } }>();
  root.traverse((object) => {
    const renderable = object as Object3D & {
      geometry?: { dispose(): void };
      material?: { dispose(): void } | Array<{ dispose(): void }>;
    };
    if (renderable.geometry) geometries.add(renderable.geometry);
    const objectMaterials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material ? [renderable.material] : [];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value && typeof value === "object" && "isTexture" in value && value.isTexture) {
          textures.add(value as unknown as { dispose(): void; source?: { data?: unknown } });
        }
      }
    }
  });
  for (const texture of textures) {
    const image = texture.source?.data as { close?: () => void } | undefined;
    image?.close?.();
    texture.dispose();
  }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  root.clear();
}

function readVertex(
  attribute: GeometryAttribute,
  index: number,
  target: { set(x: number, y: number, z: number): unknown },
): void {
  target.set(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
}

export async function createMaterializationPointCloudFromGlb(
  arrayBuffer: ArrayBuffer,
  pointCount = MATERIALIZATION_MODEL_POINT_COUNT,
): Promise<MaterializationPointCloud> {
  const safePointCount = Math.floor(pointCount);
  if (!Number.isFinite(safePointCount) || safePointCount < 1 || safePointCount > MATERIALIZATION_MODEL_POINT_COUNT) {
    throw new RangeError(`pointCount must be between 1 and ${MATERIALIZATION_MODEL_POINT_COUNT}`);
  }
  const parsed = parseGlb(arrayBuffer);
  inspectDocument(parsed.document);
  const geometryOnlyGlb = createGeometryOnlyGlb(parsed);
  const [{ GLTFLoader }, THREE] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three"),
  ]);

  let scene: Object3D | null = null;
  try {
    const gltf = await new GLTFLoader().parseAsync(geometryOnlyGlb, "");
    scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const surfaces: SampleSurface[] = [];
    const vertexA = new THREE.Vector3();
    const vertexB = new THREE.Vector3();
    const vertexC = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    const bounds = new THREE.Box3();
    let totalArea = 0;
    let triangleCount = 0;
    let meshCount = 0;

    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const position = mesh.geometry.getAttribute("position") as GeometryAttribute | undefined;
      if (!position || position.itemSize < 3) return;
      const index = mesh.geometry.getIndex();
      const rawTriangleCount = Math.floor((index?.count ?? position.count) / 3);
      if (rawTriangleCount < 1) return;
      triangleCount += rawTriangleCount;
      if (triangleCount > MATERIALIZATION_MODEL_MAX_TRIANGLES) {
        fail(
          "complexity",
          "This model is too complex to prepare safely in the browser. Export a lighter static GLB and try again.",
        );
      }

      const validTriangles: number[] = [];
      const cumulativeAreas: number[] = [];
      let surfaceArea = 0;
      for (let triangle = 0; triangle < rawTriangleCount; triangle += 1) {
        const a = index ? index.getX(triangle * 3) : triangle * 3;
        const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
        const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
        readVertex(position, a, vertexA);
        readVertex(position, b, vertexB);
        readVertex(position, c, vertexC);
        vertexA.applyMatrix4(mesh.matrixWorld);
        vertexB.applyMatrix4(mesh.matrixWorld);
        vertexC.applyMatrix4(mesh.matrixWorld);
        if (![...vertexA.toArray(), ...vertexB.toArray(), ...vertexC.toArray()].every(Number.isFinite)) {
          fail("geometry", "No usable triangle mesh was found. Choose a GLB containing finite mesh position data.");
        }
        bounds.expandByPoint(vertexA);
        bounds.expandByPoint(vertexB);
        bounds.expandByPoint(vertexC);
        edgeA.subVectors(vertexB, vertexA);
        edgeB.subVectors(vertexC, vertexA);
        const area = edgeA.cross(edgeB).length() * 0.5;
        if (area <= 1e-12) continue;
        surfaceArea += area;
        validTriangles.push(triangle);
        cumulativeAreas.push(surfaceArea);
      }
      if (surfaceArea <= 0) return;
      surfaces.push({
        mesh,
        position,
        color: (mesh.geometry.getAttribute("color") as GeometryAttribute | undefined) ?? null,
        index,
        triangleIndices: new Uint32Array(validTriangles),
        cumulativeAreas: new Float64Array(cumulativeAreas),
        startArea: totalArea,
        area: surfaceArea,
      });
      totalArea += surfaceArea;
      meshCount += 1;
    });

    if (surfaces.length === 0) {
      fail("geometry", "No usable triangle mesh was found. Choose a GLB containing mesh position data.");
    }
    if (!Number.isFinite(totalArea) || totalArea <= 0 || bounds.isEmpty()) {
      fail("degenerate", "The model has no measurable surface area, so it cannot be sampled into particles.");
    }

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const longestDimension = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(longestDimension) || longestDimension <= 1e-9) {
      fail("degenerate", "The model has no measurable surface area, so it cannot be sampled into particles.");
    }
    const scale = TARGET_LONGEST_DIMENSION / longestDimension;
    const positions = new Float32Array(safePointCount * 3);
    const colors = new Float32Array(safePointCount * 3);
    const sections = new Float32Array(safePointCount);
    const random = mulberry32(0xe0c0e5);
    const cyan = new THREE.Color(0x24dcff);
    const violet = new THREE.Color(0x805cff);
    const pearl = new THREE.Color(0xeafaff);
    const palette = new THREE.Color();
    const sampledColor = new THREE.Color();
    const yRange = Math.max(size.y, 1e-9);

    for (let point = 0; point < safePointCount; point += 1) {
      const areaTarget = random() * totalArea;
      let surface = surfaces[surfaces.length - 1];
      for (const candidate of surfaces) {
        if (areaTarget < candidate.startArea + candidate.area) {
          surface = candidate;
          break;
        }
      }
      const localArea = Math.max(0, areaTarget - surface.startArea);
      const triangleOffset = findTriangle(surface.cumulativeAreas, localArea);
      const triangle = surface.triangleIndices[triangleOffset];
      const a = surface.index ? surface.index.getX(triangle * 3) : triangle * 3;
      const b = surface.index ? surface.index.getX(triangle * 3 + 1) : triangle * 3 + 1;
      const c = surface.index ? surface.index.getX(triangle * 3 + 2) : triangle * 3 + 2;
      readVertex(surface.position, a, vertexA);
      readVertex(surface.position, b, vertexB);
      readVertex(surface.position, c, vertexC);
      vertexA.applyMatrix4(surface.mesh.matrixWorld);
      vertexB.applyMatrix4(surface.mesh.matrixWorld);
      vertexC.applyMatrix4(surface.mesh.matrixWorld);
      const squareRoot = Math.sqrt(random());
      const weightA = 1 - squareRoot;
      const weightB = squareRoot * (1 - random());
      const weightC = 1 - weightA - weightB;
      const worldX = vertexA.x * weightA + vertexB.x * weightB + vertexC.x * weightC;
      const worldY = vertexA.y * weightA + vertexB.y * weightB + vertexC.y * weightC;
      const worldZ = vertexA.z * weightA + vertexB.z * weightB + vertexC.z * weightC;
      const offset = point * 3;
      positions[offset] = (worldX - center.x) * scale;
      positions[offset + 1] = (worldY - center.y) * scale;
      positions[offset + 2] = (worldZ - center.z) * scale;
      const yProgress = THREE.MathUtils.clamp((worldY - bounds.min.y) / yRange, 0, 1);
      sections[point] = Math.min(3, Math.floor(yProgress * 4));
      palette.copy(cyan).lerp(violet, yProgress).lerp(pearl, 0.08 + yProgress * 0.08);
      if (surface.color && surface.color.itemSize >= 3) {
        sampledColor.setRGB(
          surface.color.getX(a) * weightA + surface.color.getX(b) * weightB + surface.color.getX(c) * weightC,
          surface.color.getY(a) * weightA + surface.color.getY(b) * weightB + surface.color.getY(c) * weightC,
          surface.color.getZ(a) * weightA + surface.color.getZ(b) * weightB + surface.color.getZ(c) * weightC,
        ).lerp(palette, 0.22);
      } else {
        sampledColor.copy(palette);
      }
      colors[offset] = sampledColor.r;
      colors[offset + 1] = sampledColor.g;
      colors[offset + 2] = sampledColor.b;
    }

    return {
      positions,
      colors,
      sections,
      count: safePointCount,
      meshCount,
      triangleCount,
    };
  } catch (error) {
    if (error instanceof MaterializationModelError) throw error;
    if (error instanceof RangeError) {
      throw new MaterializationModelError(
        "memory",
        "The browser could not prepare this model. Try a smaller GLB or switch the preview to Low quality.",
      );
    }
    throw new MaterializationModelError(
      "parse",
      "We could not read this GLB. It may be damaged or use an unsupported extension.",
    );
  } finally {
    if (scene) disposeScene(scene);
  }
}

export async function createMaterializationPointCloudFromFile(
  file: File,
): Promise<MaterializationPointCloud> {
  if (!file.name.toLowerCase().endsWith(".glb")) {
    fail("format", "Choose a binary glTF 2.0 file ending in .glb.");
  }
  if (file.size === 0) fail("empty", "This file is empty. Choose another GLB.");
  if (file.size > MATERIALIZATION_MODEL_MAX_BYTES) {
    const megabytes = (file.size / (1024 * 1024)).toFixed(1);
    fail("size", `This file is ${megabytes} MB. Choose a GLB no larger than 20 MB.`);
  }
  try {
    return await createMaterializationPointCloudFromGlb(await file.arrayBuffer());
  } catch (error) {
    if (error instanceof MaterializationModelError) throw error;
    fail("memory", "The browser could not prepare this model. Try a smaller GLB or switch the preview to Low quality.");
  }
}

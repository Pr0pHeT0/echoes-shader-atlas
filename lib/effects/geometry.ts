import * as THREE from "three";

export interface PointCloudData {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
}

export interface ProceduralTerrainData extends PointCloudData {
  normals: Float32Array;
  tangents: Float32Array;
  particleSections: Float32Array;
}

export interface TorusKnotSectionData {
  positions: Float32Array;
  normals: Float32Array;
}

export interface SegmentedTorusKnotData extends PointCloudData {
  normals: Float32Array;
  tangents: Float32Array;
  particleSections: Float32Array;
  sections: readonly TorusKnotSectionData[];
}

/** Stateless deterministic random value used by every generated replacement asset. */
export function seededValue(index: number, seed = 0): number {
  const value = Math.sin((index + 1) * 12.9898 + (seed + 1) * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

/** Deterministic partial Fisher-Yates sample with no repeated indices. */
export function makeRandomIndices(total: number, desired: number, salt = 0): Uint32Array {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const safeDesired = Number.isFinite(desired) ? Math.max(0, Math.floor(desired)) : 0;
  const safeSalt = Number.isFinite(salt) ? salt : 0;
  const count = Math.min(safeTotal, safeDesired);
  const pool = new Uint32Array(safeTotal);
  for (let index = 0; index < safeTotal; index += 1) pool[index] = index;
  for (let index = 0; index < count; index += 1) {
    const pick = index + Math.floor(
      seededValue(index + 1, safeSalt) * (safeTotal - index),
    );
    const current = pool[index];
    pool[index] = pool[pick];
    pool[pick] = current;
  }
  return pool.slice(0, count);
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function terrainNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const hash = (offsetX: number, offsetZ: number) => seededValue(
    (ix + offsetX) * 7_919 + (iz + offsetZ) * 104_729,
    seed,
  );
  const near = THREE.MathUtils.lerp(hash(0, 0), hash(1, 0), fx);
  const far = THREE.MathUtils.lerp(hash(0, 1), hash(1, 1), fx);
  return THREE.MathUtils.lerp(near, far, fz);
}

function terrainRidge(x: number, z: number): number {
  return Math.exp(-Math.abs(x + Math.sin(z * 0.8) * 0.9) * 0.82) * 0.9;
}

function terrainHeight(x: number, z: number, seed: number): number {
  let amplitude = 0.72;
  let frequency = 0.42;
  let height = 0;
  for (let octave = 0; octave < 5; octave += 1) {
    height += (
      terrainNoise((x + 8) * frequency, (z + 8) * frequency, seed + octave * 17) - 0.5
    ) * amplitude;
    amplitude *= 0.52;
    frequency *= 2.03;
  }
  const basin = Math.exp(-(x * x + z * z) * 0.08) * 0.26;
  return height + terrainRidge(x, z) + basin - 0.43;
}

/** Seeded terrain replaces the source PLY while retaining the point-cloud data shape. */
export function createProceduralTerrain(count: number, seed = 47): ProceduralTerrainData {
  const safeCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const side = Math.ceil(Math.sqrt(safeCount));
  const positions = new Float32Array(safeCount * 3);
  const normals = new Float32Array(safeCount * 3);
  const tangents = new Float32Array(safeCount * 3);
  const colors = new Float32Array(safeCount * 3);
  const particleSections = new Float32Array(safeCount);
  const ink = new THREE.Color(0x163346);
  const cyan = new THREE.Color(0x1edbff);
  const violet = new THREE.Color(0x805cff);
  const color = new THREE.Color();
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();

  for (let index = 0; index < safeCount; index += 1) {
    const row = Math.floor(index / side);
    const column = index % side;
    const u = side === 1 ? 0.5 : column / (side - 1);
    const v = side === 1 ? 0.5 : row / (side - 1);
    const x = (u - 0.5) * 7.6;
    const z = (v - 0.5) * 5.2;
    const y = terrainHeight(x, z, seed);
    const offset = index * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    particleSections[index] = Math.min(3, Math.floor(v * 4));

    const ridge = terrainRidge(x, z);
    const elevation = THREE.MathUtils.clamp((y + 0.9) / 2, 0, 1);
    color.copy(ink).lerp(cyan, elevation);
    color.lerp(violet, Math.max(0, ridge - 0.52) * 0.28);
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  for (let index = 0; index < safeCount; index += 1) {
    const row = Math.floor(index / side);
    const column = index % side;
    const rowStart = row * side;
    const rowLength = Math.min(side, safeCount - rowStart);
    const leftIndex = rowStart + Math.max(0, column - 1);
    const rightIndex = rowStart + Math.min(rowLength - 1, column + 1);
    const aboveCandidate = (row - 1) * side + column;
    const belowCandidate = (row + 1) * side + column;
    const aboveIndex = row > 0 && aboveCandidate < safeCount ? aboveCandidate : index;
    const belowIndex = belowCandidate < safeCount ? belowCandidate : index;
    const leftOffset = leftIndex * 3;
    const rightOffset = rightIndex * 3;
    const aboveOffset = aboveIndex * 3;
    const belowOffset = belowIndex * 3;
    const deltaX = positions[rightOffset] - positions[leftOffset];
    const deltaZ = positions[belowOffset + 2] - positions[aboveOffset + 2];
    const slopeX = Math.abs(deltaX) > 1e-8
      ? (positions[rightOffset + 1] - positions[leftOffset + 1]) / deltaX
      : 0;
    const slopeZ = Math.abs(deltaZ) > 1e-8
      ? (positions[belowOffset + 1] - positions[aboveOffset + 1]) / deltaZ
      : 0;
    normal.set(-slopeX, 1, -slopeZ).normalize();
    tangent.set(1, slopeX, 0).normalize();
    bitangent.crossVectors(normal, tangent).normalize();
    const tangentAngle = seededValue(index, 887) * Math.PI;
    tangent.multiplyScalar(Math.cos(tangentAngle)).addScaledVector(
      bitangent,
      Math.sin(tangentAngle),
    ).normalize();
    const offset = index * 3;
    normals[offset] = normal.x;
    normals[offset + 1] = normal.y;
    normals[offset + 2] = normal.z;
    tangents[offset] = tangent.x;
    tangents[offset + 1] = tangent.y;
    tangents[offset + 2] = tangent.z;
  }

  return { positions, normals, tangents, colors, count: safeCount, particleSections };
}

/** A four-section torus-knot replaces the unlicensed GLB materialization input. */
export function createSegmentedTorusKnot(count: number): SegmentedTorusKnotData {
  const safeCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const constrained = safeCount <= 16_384;
  const tubularSegments = constrained ? 160 : 384;
  const radialSegments = constrained ? 20 : 32;
  const indexed = new THREE.TorusKnotGeometry(1.38, 0.42, tubularSegments, radialSegments, 2, 3);
  indexed.computeTangents();
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  const sourcePositions = geometry.getAttribute("position");
  const sourceNormals = geometry.getAttribute("normal");
  const sourceTangents = geometry.getAttribute("tangent");
  const positions = new Float32Array(safeCount * 3);
  const normals = new Float32Array(safeCount * 3);
  const tangents = new Float32Array(safeCount * 3);
  const colors = new Float32Array(safeCount * 3);
  const particleSections = new Float32Array(safeCount);
  const sectionPositions: number[][] = [[], [], [], []];
  const sectionNormals: number[][] = [[], [], [], []];
  const cyan = new THREE.Color(0x24dcff);
  const violet = new THREE.Color(0x805cff);
  const pearl = new THREE.Color(0xeafaff);
  const color = new THREE.Color();
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const fallbackAxis = new THREE.Vector3();
  const verticesPerTubeSegment = radialSegments * 6;

  for (let sourceIndex = 0; sourceIndex < sourcePositions.count; sourceIndex += 1) {
    const tubeProgress = Math.floor(sourceIndex / verticesPerTubeSegment) / tubularSegments;
    const section = Math.min(3, Math.floor(tubeProgress * 4));
    sectionPositions[section].push(
      sourcePositions.getX(sourceIndex),
      sourcePositions.getY(sourceIndex),
      sourcePositions.getZ(sourceIndex),
    );
    sectionNormals[section].push(
      sourceNormals.getX(sourceIndex),
      sourceNormals.getY(sourceIndex),
      sourceNormals.getZ(sourceIndex),
    );
  }

  for (let index = 0; index < safeCount; index += 1) {
    const sourceIndex = Math.min(
      sourcePositions.count - 1,
      Math.floor((index + 0.5) * sourcePositions.count / safeCount),
    );
    const offset = index * 3;
    positions[offset] = sourcePositions.getX(sourceIndex);
    positions[offset + 1] = sourcePositions.getY(sourceIndex);
    positions[offset + 2] = sourcePositions.getZ(sourceIndex);
    normal.set(
      sourceNormals.getX(sourceIndex),
      sourceNormals.getY(sourceIndex),
      sourceNormals.getZ(sourceIndex),
    );
    if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() <= 1e-20) {
      normal.set(0, 1, 0);
    } else {
      normal.normalize();
    }
    tangent.set(
      sourceTangents.getX(sourceIndex),
      sourceTangents.getY(sourceIndex),
      sourceTangents.getZ(sourceIndex),
    );
    tangent.addScaledVector(normal, -tangent.dot(normal));
    if (!Number.isFinite(tangent.lengthSq()) || tangent.lengthSq() <= 1e-20) {
      if (Math.abs(normal.x) <= Math.abs(normal.y) && Math.abs(normal.x) <= Math.abs(normal.z)) {
        fallbackAxis.set(1, 0, 0);
      } else if (Math.abs(normal.y) <= Math.abs(normal.z)) {
        fallbackAxis.set(0, 1, 0);
      } else {
        fallbackAxis.set(0, 0, 1);
      }
      tangent.copy(fallbackAxis).addScaledVector(normal, -fallbackAxis.dot(normal));
    }
    tangent.normalize();
    normals[offset] = normal.x;
    normals[offset + 1] = normal.y;
    normals[offset + 2] = normal.z;
    tangents[offset] = tangent.x;
    tangents[offset + 1] = tangent.y;
    tangents[offset + 2] = tangent.z;
    const tubeProgress = Math.floor(sourceIndex / verticesPerTubeSegment) / tubularSegments;
    const section = Math.min(3, Math.floor(tubeProgress * 4));
    particleSections[index] = section;
    color.copy(cyan).lerp(violet, tubeProgress);
    color.lerp(pearl, 0.12 + Math.max(0, sourceNormals.getY(sourceIndex)) * 0.18);
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  geometry.dispose();
  return {
    positions,
    normals,
    tangents,
    colors,
    count: safeCount,
    particleSections,
    sections: sectionPositions.map((values, section) => ({
      positions: new Float32Array(values),
      normals: new Float32Array(sectionNormals[section]),
    })),
  };
}

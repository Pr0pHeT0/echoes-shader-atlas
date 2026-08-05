import * as THREE from "three";

export interface PointCloudData {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
}

export interface TorusKnotSectionData {
  positions: Float32Array;
  normals: Float32Array;
}

export interface SegmentedTorusKnotData extends PointCloudData {
  particleSections: Float32Array;
  sections: readonly TorusKnotSectionData[];
}

/** Stateless deterministic random value used by every generated replacement asset. */
export function seededValue(index: number, seed = 0): number {
  const value = Math.sin((index + 1) * 12.9898 + (seed + 1) * 78.233) * 43_758.5453;
  return value - Math.floor(value);
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

/** Seeded terrain replaces the source PLY while retaining the point-cloud data shape. */
export function createProceduralTerrain(count: number, seed = 47): PointCloudData {
  const safeCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const side = Math.ceil(Math.sqrt(safeCount));
  const positions = new Float32Array(safeCount * 3);
  const colors = new Float32Array(safeCount * 3);
  const ink = new THREE.Color(0x163346);
  const cyan = new THREE.Color(0x1edbff);
  const violet = new THREE.Color(0x805cff);
  const color = new THREE.Color();

  for (let index = 0; index < safeCount; index += 1) {
    const row = Math.floor(index / side);
    const column = index % side;
    const u = side === 1 ? 0.5 : column / (side - 1);
    const v = side === 1 ? 0.5 : row / (side - 1);
    const x = (u - 0.5) * 7.6;
    const z = (v - 0.5) * 5.2;
    let amplitude = 0.72;
    let frequency = 0.42;
    let height = 0;
    for (let octave = 0; octave < 5; octave += 1) {
      height += (terrainNoise((x + 8) * frequency, (z + 8) * frequency, seed + octave * 17) - 0.5) * amplitude;
      amplitude *= 0.52;
      frequency *= 2.03;
    }
    const ridge = Math.exp(-Math.abs(x + Math.sin(z * 0.8) * 0.9) * 0.82) * 0.9;
    const basin = Math.exp(-(x * x + z * z) * 0.08) * 0.26;
    const y = height + ridge + basin - 0.43;
    const offset = index * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;

    const elevation = THREE.MathUtils.clamp((y + 0.9) / 2, 0, 1);
    color.copy(ink).lerp(cyan, elevation);
    color.lerp(violet, Math.max(0, ridge - 0.52) * 0.28);
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  return { positions, colors, count: safeCount };
}

/** A four-section torus-knot replaces the unlicensed GLB materialization input. */
export function createSegmentedTorusKnot(count: number): SegmentedTorusKnotData {
  const safeCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const constrained = safeCount <= 16_384;
  const tubularSegments = constrained ? 160 : 384;
  const radialSegments = constrained ? 20 : 32;
  const indexed = new THREE.TorusKnotGeometry(1.38, 0.42, tubularSegments, radialSegments, 2, 3);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  const sourcePositions = geometry.getAttribute("position");
  const sourceNormals = geometry.getAttribute("normal");
  const positions = new Float32Array(safeCount * 3);
  const colors = new Float32Array(safeCount * 3);
  const particleSections = new Float32Array(safeCount);
  const sectionPositions: number[][] = [[], [], [], []];
  const sectionNormals: number[][] = [[], [], [], []];
  const cyan = new THREE.Color(0x24dcff);
  const violet = new THREE.Color(0x805cff);
  const pearl = new THREE.Color(0xeafaff);
  const color = new THREE.Color();
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
    colors,
    count: safeCount,
    particleSections,
    sections: sectionPositions.map((values, section) => ({
      positions: new Float32Array(values),
      normals: new Float32Array(sectionNormals[section]),
    })),
  };
}

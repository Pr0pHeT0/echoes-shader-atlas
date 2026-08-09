export const MATERIALIZATION_MOTION_VARIANTS = Object.freeze([
  "gentle-drift",
  "orbital-current",
  "surface-breathe",
  "radial-ripple",
  "helical-twist",
  "tangent-flutter",
] as const);

export type MaterializationMotionVariant =
  (typeof MATERIALIZATION_MOTION_VARIANTS)[number];

export type MaterializationMotionIndex = 0 | 1 | 2 | 3 | 4 | 5;

export const MATERIALIZATION_MOTION_CROSSFADE_SECONDS = 0.4;
export const MATERIALIZATION_MOTION_MAX_OFFSET = 0.16;

export const MATERIALIZATION_DRIFT_AMPLITUDE_MIN = 0.06;
export const MATERIALIZATION_DRIFT_AMPLITUDE_MAX = 0.11;
export const MATERIALIZATION_DRIFT_SECONDARY_RATIO = 0.65;
export const MATERIALIZATION_DRIFT_ANGULAR_SPEED = 0.8;

export const MATERIALIZATION_ORBIT_AMPLITUDE_MIN = 0.08;
export const MATERIALIZATION_ORBIT_AMPLITUDE_MAX = 0.14;
export const MATERIALIZATION_ORBIT_ANGULAR_SPEED = 1.05;

export const MATERIALIZATION_BREATHE_AMPLITUDE = 0.1;
export const MATERIALIZATION_BREATHE_ANGULAR_SPEED = 1.1;

export const MATERIALIZATION_RIPPLE_AMPLITUDE = 0.12;
export const MATERIALIZATION_RIPPLE_RING_COUNT = 2;
export const MATERIALIZATION_RIPPLE_ANGULAR_SPEED = 2.4;

export const MATERIALIZATION_TWIST_AMPLITUDE = 0.12;
export const MATERIALIZATION_TWIST_ANGULAR_SPEED = 1.25;

export const MATERIALIZATION_FLUTTER_TANGENT_AMPLITUDE = 0.05;
export const MATERIALIZATION_FLUTTER_BITANGENT_AMPLITUDE = 0.035;
export const MATERIALIZATION_FLUTTER_TANGENT_SPEED = 2.1;
export const MATERIALIZATION_FLUTTER_BITANGENT_SPEED = 3.2;
export const MATERIALIZATION_FLUTTER_BITANGENT_SEED_SCALE = 1.7;

export type MaterializationMotionVector3 = readonly [number, number, number];

export interface MaterializationMotionInput {
  target: MaterializationMotionVector3;
  normal: MaterializationMotionVector3;
  tangent: MaterializationMotionVector3;
  seed: number;
  heightPhase: number;
  radiusPhase: number;
  phaseSeconds: number;
  surfaceMix: number;
  reducedMotion: boolean;
}

export interface MaterializationMotionCrossfadeWeights {
  from: number;
  to: number;
}

const VECTOR_EPSILON = 1e-8;
const HORIZONTAL_RADIUS_EPSILON = 1e-7;
const TAU = Math.PI * 2;

function clampUnit(value: number, fallback = 0): number {
  const finiteValue = Number.isFinite(value) ? value : fallback;
  return Math.min(1, Math.max(0, finiteValue));
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteVector(
  vector: MaterializationMotionVector3,
): [number, number, number] {
  return vector.map((value) =>
    Number.isFinite(value) ? value : 0
  ) as [number, number, number];
}

function normalizeVector(
  vector: MaterializationMotionVector3,
): [number, number, number] {
  const finite = finiteVector(vector);
  const magnitude = Math.hypot(...finite);
  return magnitude > VECTOR_EPSILON
    ? finite.map((value) => value / magnitude) as [number, number, number]
    : [0, 0, 0];
}

function crossVector(
  left: MaterializationMotionVector3,
  right: MaterializationMotionVector3,
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function addScaledVectors(
  first: MaterializationMotionVector3,
  firstScale: number,
  second: MaterializationMotionVector3 = [0, 0, 0],
  secondScale = 0,
): [number, number, number] {
  return first.map(
    (value, index) => value * firstScale + second[index] * secondScale,
  ) as [number, number, number];
}

function clampOffset(
  vector: MaterializationMotionVector3,
): [number, number, number] {
  const finite = finiteVector(vector);
  const magnitude = Math.hypot(...finite);
  if (magnitude <= MATERIALIZATION_MOTION_MAX_OFFSET) return finite;
  if (magnitude <= VECTOR_EPSILON) return [0, 0, 0];

  const scale = MATERIALIZATION_MOTION_MAX_OFFSET / magnitude;
  return finite.map((value) => value * scale) as [number, number, number];
}

export function isMaterializationMotionVariant(
  value: unknown,
): value is MaterializationMotionVariant {
  return (
    typeof value === "string" &&
    (MATERIALIZATION_MOTION_VARIANTS as readonly string[]).includes(value)
  );
}

/** Returns the shader-uniform index, defaulting unknown input to Drift. */
export function materializationMotionIndex(
  value: unknown,
): MaterializationMotionIndex {
  switch (value) {
    case "orbital-current":
      return 1;
    case "surface-breathe":
      return 2;
    case "radial-ripple":
      return 3;
    case "helical-twist":
      return 4;
    case "tangent-flutter":
      return 5;
    case "gentle-drift":
    default:
      return 0;
  }
}

/** Advances a looping motion clock by active time. A zero delta freezes it. */
export function advanceMaterializationMotionPhase(
  phaseSeconds: number,
  activeDeltaSeconds: number,
): number {
  const phase = finiteNonNegative(phaseSeconds);
  return phase + finiteNonNegative(activeDeltaSeconds);
}

/** Advances a linear crossfade from zero to one in exactly 400ms active time. */
export function advanceMaterializationMotionCrossfade(
  progress: number,
  activeDeltaSeconds: number,
): number {
  const current = clampUnit(progress);
  const delta = finiteNonNegative(activeDeltaSeconds);
  return Math.min(
    1,
    current + delta / MATERIALIZATION_MOTION_CROSSFADE_SECONDS,
  );
}

/** Smooth interpolation amount used by the render graph during a crossfade. */
export function materializationMotionCrossfadeMix(progress: number): number {
  const linear = clampUnit(progress);
  return linear * linear * (3 - 2 * linear);
}

export function materializationMotionCrossfadeWeights(
  progress: number,
): MaterializationMotionCrossfadeWeights {
  const to = materializationMotionCrossfadeMix(progress);
  return { from: 1 - to, to };
}

/**
 * CPU reference for the continuous render-time motion graph. Every path uses
 * target-space frames already present in the particle data, remains within the
 * shared displacement cap, and fades to exactly zero with the settled surface.
 */
export function materializationMotionOffset(
  variant: MaterializationMotionVariant,
  input: MaterializationMotionInput,
): [number, number, number] {
  if (input.reducedMotion) return [0, 0, 0];

  const surfaceVisibility = 1 - clampUnit(input.surfaceMix);
  if (surfaceVisibility === 0) return [0, 0, 0];

  const target = finiteVector(input.target);
  const normal = normalizeVector(input.normal);
  const tangent = normalizeVector(input.tangent);
  const bitangent = normalizeVector(crossVector(normal, tangent));
  const horizontalRadius: MaterializationMotionVector3 = [target[0], 0, target[2]];
  const horizontalRadiusLength = Math.hypot(...horizontalRadius);
  const radial = normalizeVector(horizontalRadius);
  const orbitTangent = normalizeVector([-radial[2], 0, radial[0]]);
  const fallbackOrbitTangent = normalizeVector([tangent[0], 0, tangent[2]]);
  const safeOrbitTangent = horizontalRadiusLength > HORIZONTAL_RADIUS_EPSILON
    ? orbitTangent
    : fallbackOrbitTangent;
  const seed = clampUnit(input.seed);
  const seedAngle = seed * TAU;
  const phaseSeconds = finiteNonNegative(input.phaseSeconds);
  const heightPhase = clampUnit(input.heightPhase);
  const radiusPhase = clampUnit(input.radiusPhase);
  let offset: [number, number, number];

  if (variant === "gentle-drift") {
    const amplitude = MATERIALIZATION_DRIFT_AMPLITUDE_MIN +
      (MATERIALIZATION_DRIFT_AMPLITUDE_MAX -
        MATERIALIZATION_DRIFT_AMPLITUDE_MIN) * seed;
    const angle = phaseSeconds * MATERIALIZATION_DRIFT_ANGULAR_SPEED +
      seedAngle;
    offset = addScaledVectors(
      tangent,
      Math.cos(angle) * amplitude,
      bitangent,
      Math.sin(angle) * amplitude * MATERIALIZATION_DRIFT_SECONDARY_RATIO,
    );
  } else if (variant === "orbital-current") {
    const amplitude = MATERIALIZATION_ORBIT_AMPLITUDE_MIN +
      (MATERIALIZATION_ORBIT_AMPLITUDE_MAX -
        MATERIALIZATION_ORBIT_AMPLITUDE_MIN) * seed;
    const angle = phaseSeconds * MATERIALIZATION_ORBIT_ANGULAR_SPEED +
      seedAngle;
    offset = addScaledVectors(
      radial,
      Math.sin(angle) * amplitude,
      safeOrbitTangent,
      Math.cos(angle) * amplitude,
    );
  } else if (variant === "surface-breathe") {
    const angle = phaseSeconds * MATERIALIZATION_BREATHE_ANGULAR_SPEED +
      seedAngle;
    offset = addScaledVectors(
      normal,
      Math.sin(angle) * MATERIALIZATION_BREATHE_AMPLITUDE,
    );
  } else if (variant === "radial-ripple") {
    const angle = radiusPhase * TAU * MATERIALIZATION_RIPPLE_RING_COUNT -
      phaseSeconds * MATERIALIZATION_RIPPLE_ANGULAR_SPEED;
    offset = addScaledVectors(
      normal,
      Math.sin(angle) * MATERIALIZATION_RIPPLE_AMPLITUDE,
    );
  } else if (variant === "helical-twist") {
    const angle = phaseSeconds * MATERIALIZATION_TWIST_ANGULAR_SPEED +
      heightPhase * TAU;
    offset = addScaledVectors(
      safeOrbitTangent,
      Math.sin(angle) * MATERIALIZATION_TWIST_AMPLITUDE,
    );
  } else {
    offset = addScaledVectors(
      tangent,
      Math.sin(
        phaseSeconds * MATERIALIZATION_FLUTTER_TANGENT_SPEED + seedAngle,
      ) * MATERIALIZATION_FLUTTER_TANGENT_AMPLITUDE,
      bitangent,
      Math.sin(
        phaseSeconds * MATERIALIZATION_FLUTTER_BITANGENT_SPEED +
          seedAngle * MATERIALIZATION_FLUTTER_BITANGENT_SEED_SCALE,
      ) * MATERIALIZATION_FLUTTER_BITANGENT_AMPLITUDE,
    );
  }

  return clampOffset(offset).map(
    (value) => value * surfaceVisibility,
  ) as [number, number, number];
}

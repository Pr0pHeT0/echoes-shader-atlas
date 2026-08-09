export const MATERIALIZATION_TRANSITION_VARIANTS = Object.freeze([
  "organic-arc",
  "spiral-vortex",
  "radial-bloom",
  "traveling-wave",
] as const);

export type MaterializationTransitionVariant =
  (typeof MATERIALIZATION_TRANSITION_VARIANTS)[number];

export type MaterializationTransitionIndex = 0 | 1 | 2 | 3;

export const MATERIALIZATION_ARRIVAL_STAGGER = 0.12;
export const MATERIALIZATION_ARRIVAL_WINDOW =
  1 - MATERIALIZATION_ARRIVAL_STAGGER;
export const MATERIALIZATION_MAX_POINT_FLARE = 1.5;
export const MATERIALIZATION_ARRIVAL_ARC_MIN = 0.08;
export const MATERIALIZATION_ARRIVAL_ARC_MAX = 0.22;
export const MATERIALIZATION_VORTEX_TURNS_MIN = 1.25;
export const MATERIALIZATION_VORTEX_TURNS_MAX = 1.75;
export const MATERIALIZATION_BLOOM_NORMAL_LIFT_MIN = 0.16;
export const MATERIALIZATION_BLOOM_NORMAL_LIFT_MAX = 0.3;
export const MATERIALIZATION_WAVE_NORMAL_LIFT = 0.16;

export type MaterializationVector3 = readonly [number, number, number];

export interface MaterializationTrajectoryInput {
  source: MaterializationVector3;
  target: MaterializationVector3;
  normal: MaterializationVector3;
  tangent: MaterializationVector3;
  seed: number;
  arrival: number;
  heightPhase: number;
}

export interface MaterializationTransitionReplay {
  transitionVariant: MaterializationTransitionVariant;
  preset: "materialize";
  paused: false;
  replayTokenIncrement: 1;
}

const SPATIAL_RANGE_EPSILON = 1e-6;

function clampUnit(value: number, fallback = 0): number {
  const finiteValue = Number.isFinite(value) ? value : fallback;
  return Math.min(1, Math.max(0, finiteValue));
}

function finiteVector(vector: MaterializationVector3): [number, number, number] {
  return vector.map((value) =>
    Number.isFinite(value) ? value : 0
  ) as [number, number, number];
}

function normalizeVector(vector: MaterializationVector3): [number, number, number] {
  const finite = finiteVector(vector);
  const magnitude = Math.hypot(...finite);
  return magnitude > 1e-8
    ? finite.map((value) => value / magnitude) as [number, number, number]
    : [0, 0, 0];
}

function mixVector(
  source: MaterializationVector3,
  target: MaterializationVector3,
  amount: number,
): [number, number, number] {
  return source.map(
    (value, index) => value + (target[index] - value) * amount,
  ) as [number, number, number];
}

export function isMaterializationTransitionVariant(
  value: unknown,
): value is MaterializationTransitionVariant {
  return (
    typeof value === "string" &&
    (MATERIALIZATION_TRANSITION_VARIANTS as readonly string[]).includes(value)
  );
}

/** Returns the shader-uniform index, defaulting unknown input to Organic. */
export function materializationTransitionIndex(
  value: unknown,
): MaterializationTransitionIndex {
  switch (value) {
    case "spiral-vortex":
      return 1;
    case "radial-bloom":
      return 2;
    case "traveling-wave":
      return 3;
    case "organic-arc":
    default:
      return 0;
  }
}

/** UI command shared by first-time and already-active Transition selections. */
export function materializationTransitionReplay(
  transitionVariant: MaterializationTransitionVariant,
): MaterializationTransitionReplay {
  return {
    transitionVariant,
    preset: "materialize",
    paused: false,
    replayTokenIncrement: 1,
  };
}

/**
 * Normalizes a model-space coordinate for spatial arrival ordering. An absent
 * result tells callers to retain deterministic seed ordering for a degenerate
 * or otherwise unusable range.
 */
export function materializationSpatialPhase(
  value: number,
  rangeMinimum: number,
  rangeMaximum: number,
): number | undefined {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(rangeMinimum) ||
    !Number.isFinite(rangeMaximum)
  ) {
    return undefined;
  }

  const range = rangeMaximum - rangeMinimum;
  if (range <= SPATIAL_RANGE_EPSILON) return undefined;

  return clampUnit((value - rangeMinimum) / range);
}

/**
 * Resolves an arrival offset within the shared 12% spread. Spatial variants
 * may blend toward a normalized model-space phase; missing spatial data falls
 * back to the deterministic seed.
 */
export function materializationArrivalStart(
  seed: number,
  spatialPhase?: number,
  spatialMix = 1,
): number {
  const seedPhase = clampUnit(seed);
  if (spatialPhase === undefined || !Number.isFinite(spatialPhase)) {
    return seedPhase * MATERIALIZATION_ARRIVAL_STAGGER;
  }

  const mixAmount = Number.isFinite(spatialMix) ? clampUnit(spatialMix) : 0;
  const phase = seedPhase + (clampUnit(spatialPhase) - seedPhase) * mixAmount;
  return phase * MATERIALIZATION_ARRIVAL_STAGGER;
}

/** Scalar equivalent of the TSL smoothstep used to verify arrival endpoints. */
export function materializationArrivalProgress(
  progress: number,
  arrivalStart: number,
): number {
  const safeProgress = clampUnit(progress);
  const safeStart = Math.min(
    MATERIALIZATION_ARRIVAL_STAGGER,
    Math.max(0, Number.isFinite(arrivalStart) ? arrivalStart : 0),
  );
  const arrivalEnd = safeStart + MATERIALIZATION_ARRIVAL_WINDOW;

  if (safeProgress <= safeStart) return 0;
  if (safeProgress >= arrivalEnd) return 1;

  const linearProgress = (safeProgress - safeStart) /
    MATERIALIZATION_ARRIVAL_WINDOW;
  return linearProgress * linearProgress * (3 - 2 * linearProgress);
}

/** Endpoint-zero transient envelope shared by all transition paths. */
export function materializationArrivalEnvelope(arrival: number): number {
  const safeArrival = clampUnit(arrival);
  if (safeArrival === 0 || safeArrival === 1) return 0;
  return Math.sin(safeArrival * Math.PI);
}

/** Point-size accent capped at the current 1.5x animation maximum. */
export function materializationPointFlare(envelope: number): number {
  return 1 +
    clampUnit(envelope) * (MATERIALIZATION_MAX_POINT_FLARE - 1);
}

/**
 * CPU reference for the uniform-selected TSL transition graph. It keeps the
 * authored paths testable without adding another render or compute pass.
 */
export function materializationTrajectoryPosition(
  variant: MaterializationTransitionVariant,
  input: MaterializationTrajectoryInput,
): [number, number, number] {
  const source = finiteVector(input.source);
  const target = finiteVector(input.target);
  const arrival = clampUnit(input.arrival);
  if (arrival === 0) return source;
  if (arrival === 1) return target;

  const seed = clampUnit(input.seed);
  const normal = normalizeVector(input.normal);
  const tangent = normalizeVector(input.tangent);
  const envelope = materializationArrivalEnvelope(arrival);
  const linear = mixVector(source, target, arrival);

  if (variant === "organic-arc") {
    const bitangent = normalizeVector([
      normal[1] * tangent[2] - normal[2] * tangent[1],
      normal[2] * tangent[0] - normal[0] * tangent[2],
      normal[0] * tangent[1] - normal[1] * tangent[0],
    ]);
    const angle = seed * Math.PI * 2;
    const strength = (
      MATERIALIZATION_ARRIVAL_ARC_MIN +
      (MATERIALIZATION_ARRIVAL_ARC_MAX - MATERIALIZATION_ARRIVAL_ARC_MIN) * seed
    ) * envelope;
    return linear.map(
      (value, index) => value + (
        tangent[index] * Math.cos(angle) +
        bitangent[index] * Math.sin(angle)
      ) * strength,
    ) as [number, number, number];
  }

  if (variant === "spiral-vortex") {
    const turns = MATERIALIZATION_VORTEX_TURNS_MIN +
      (MATERIALIZATION_VORTEX_TURNS_MAX - MATERIALIZATION_VORTEX_TURNS_MIN) *
        seed;
    const angle = arrival * turns * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rotatedSource: MaterializationVector3 = [
      source[0] * cosine - source[2] * sine,
      source[1],
      source[0] * sine + source[2] * cosine,
    ];
    return mixVector(rotatedSource, target, arrival);
  }

  if (variant === "radial-bloom") {
    const lift = (
      MATERIALIZATION_BLOOM_NORMAL_LIFT_MIN +
      (MATERIALIZATION_BLOOM_NORMAL_LIFT_MAX -
        MATERIALIZATION_BLOOM_NORMAL_LIFT_MIN) * seed
    ) * envelope;
    return linear.map(
      (value, index) => value + normal[index] * lift,
    ) as [number, number, number];
  }

  const heightPhase = clampUnit(input.heightPhase);
  const oscillation = Math.sin(
    heightPhase * Math.PI * 2 - arrival * Math.PI * 2,
  );
  return linear.map(
    (value, index) => value + normal[index] * oscillation * envelope *
      MATERIALIZATION_WAVE_NORMAL_LIFT,
  ) as [number, number, number];
}

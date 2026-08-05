import type {
  EffectFamily,
  EffectFilters,
  EffectId,
  EffectStatus,
  ShaderEffectMeta,
  ShaderSourceUnit,
} from "./types";

export const effectFamilies = [
  "Procedural Backdrop",
  "Audio Visualization",
  "Particle Typography",
  "Point-cloud Transition",
  "GPGPU Materialization",
] as const satisfies readonly EffectFamily[];

export const effectStatuses = ["active", "archived"] as const satisfies readonly EffectStatus[];

const source = (
  unit: ShaderSourceUnit,
): ShaderSourceUnit => unit;

export const shaderSourceUnits = [
  source({
    id: "aurora-fullscreen-vertex",
    label: "Fullscreen vertex",
    stage: "vertex",
    stageLabel: "Vertex",
    sourceKind: "inline",
    sourcePath: "src/game/LandingAuroraBackground.js",
    sourceSymbol: "vertexShader",
    extractedPath: "lib/shaders/shared/fullscreen.vert.glsl",
    shared: true,
  }),
  source({
    id: "aurora-field-fragment",
    label: "Aurora field",
    stage: "fragment",
    stageLabel: "Fragment",
    sourceKind: "inline",
    sourcePath: "src/game/LandingAuroraBackground.js",
    sourceSymbol: "fragmentShader",
    extractedPath: "lib/shaders/aurora/aurora-field.frag.glsl",
    shared: false,
  }),
  source({
    id: "voice-fullscreen-vertex",
    label: "Fullscreen vertex",
    stage: "vertex",
    stageLabel: "Vertex",
    sourceKind: "inline",
    sourcePath: "src/game/BottomVoiceEffect.js",
    sourceSymbol: "vertexShader",
    extractedPath: "lib/shaders/shared/fullscreen.vert.glsl",
    shared: true,
  }),
  source({
    id: "voice-wave-fragment",
    label: "Voice wave field",
    stage: "fragment",
    stageLabel: "Fragment",
    sourceKind: "inline",
    sourcePath: "src/game/BottomVoiceEffect.js",
    sourceSymbol: "fragmentShader",
    extractedPath: "lib/shaders/voice/voice-wave.frag.glsl",
    shared: false,
  }),
  source({
    id: "title-particles-vertex",
    label: "Title particles",
    stage: "vertex",
    stageLabel: "Vertex",
    sourceKind: "file",
    sourcePath: "src/shaders/landingTitle.vert",
    sourceSymbol: null,
    extractedPath: "lib/shaders/title/title-particles.vert.glsl",
    shared: false,
  }),
  source({
    id: "title-particles-fragment",
    label: "Title point sprite",
    stage: "fragment",
    stageLabel: "Fragment",
    sourceKind: "file",
    sourcePath: "src/shaders/landingTitle.frag",
    sourceSymbol: null,
    extractedPath: "lib/shaders/title/title-particles.frag.glsl",
    shared: false,
  }),
  source({
    id: "orb-to-scene-compute",
    label: "Orb flow simulation",
    stage: "compute",
    stageLabel: "GPGPU compute",
    sourceKind: "file",
    sourcePath: "src/shaders/gpgpu/gameplayPly.glsl",
    sourceSymbol: null,
    extractedPath: "lib/shaders/orb/orb-to-scene.compute.glsl",
    shared: false,
  }),
  source({
    id: "orb-to-scene-vertex",
    label: "Orb-to-scene points",
    stage: "vertex",
    stageLabel: "Vertex",
    sourceKind: "file",
    sourcePath: "src/shaders/gameplayPly.vert",
    sourceSymbol: null,
    extractedPath: "lib/shaders/orb/orb-to-scene.vert.glsl",
    shared: false,
  }),
  source({
    id: "orb-to-scene-fragment",
    label: "Lit point sprite",
    stage: "fragment",
    stageLabel: "Fragment",
    sourceKind: "file",
    sourcePath: "src/shaders/gameplayPly.frag",
    sourceSymbol: null,
    extractedPath: "lib/shaders/orb/orb-to-scene.frag.glsl",
    shared: false,
  }),
  source({
    id: "materialization-compute",
    label: "Audio flow simulation",
    stage: "compute",
    stageLabel: "GPGPU compute",
    sourceKind: "file",
    sourcePath: "src/shaders/gpgpu/particles.glsl",
    sourceSymbol: null,
    extractedPath: "lib/shaders/materialization/materialization.compute.glsl",
    shared: false,
  }),
  source({
    id: "materialization-vertex",
    label: "Section materialization",
    stage: "vertex",
    stageLabel: "Vertex",
    sourceKind: "file",
    sourcePath: "src/shaders/particles.vert",
    sourceSymbol: null,
    extractedPath: "lib/shaders/materialization/materialization.vert.glsl",
    shared: false,
  }),
  source({
    id: "materialization-fragment",
    label: "Material point sprite",
    stage: "fragment",
    stageLabel: "Fragment",
    sourceKind: "file",
    sourcePath: "src/shaders/particles.frag",
    sourceSymbol: null,
    extractedPath: "lib/shaders/materialization/materialization.frag.glsl",
    shared: false,
  }),
  source({
    id: "simplex-noise-4d",
    label: "Ashima 4D simplex noise",
    stage: "include",
    stageLabel: "Shared include",
    sourceKind: "file",
    sourcePath: "src/shaders/includes/simplexNoise4d.glsl",
    sourceSymbol: null,
    extractedPath: "lib/shaders/shared/simplex-noise-4d.glsl",
    shared: true,
  }),
] as const satisfies readonly ShaderSourceUnit[];

const bySourceId = new Map(shaderSourceUnits.map((unit) => [unit.id, unit]));

function sources(...ids: string[]): readonly ShaderSourceUnit[] {
  return ids.map((id) => {
    const unit = bySourceId.get(id);
    if (!unit) throw new Error(`Unknown shader source unit: ${id}`);
    return unit;
  });
}

export const shaderEffects: readonly ShaderEffectMeta[] = [
  {
    id: "aurora-field",
    slug: "aurora-field",
    index: 1,
    name: "Aurora Field",
    shortName: "Aurora",
    family: "Procedural Backdrop",
    status: "active",
    statusLabel: "Active",
    eyebrow: "01 / Procedural backdrop",
    summary: "Layered cyan and violet light shaped by time, noise, and a quiet synthetic pulse.",
    description:
      "Five octaves of value noise bend three exponential light bands across an aspect-correct fullscreen plane. The original timing, color mix, vignette, and optional audio gain remain intact.",
    drivers: ["Time", "Synthetic audio (optional)"],
    techniques: [
      "Five-octave FBM",
      "Layered exponential bands",
      "Aspect-correct fullscreen pass",
      "Audio-reactive gain",
    ],
    primitives: ["Fullscreen plane"],
    runtime: "aurora-field",
    sourceUnits: sources("aurora-fullscreen-vertex", "aurora-field-fragment"),
    presets: [
      { id: "quiet-drift", label: "Quiet drift", description: "Original low-energy movement and color balance." },
      { id: "voice-lit", label: "Voice lit", description: "Raises the synthetic voice envelope through the aurora bands." },
      { id: "midnight", label: "Midnight", description: "A restrained, dim field for close inspection of the noise structure." },
    ],
    accent: { primary: "#67e8f9", secondary: "#6d4aff", wash: "rgba(103, 232, 249, 0.16)" },
    stats: [
      { label: "Source units", value: "2" },
      { label: "Render path", value: "Fullscreen" },
      { label: "Noise octaves", value: "5" },
    ],
  },
  {
    id: "voice-wave-particles",
    slug: "voice-wave-particles",
    index: 2,
    name: "Voice Wave Particles",
    shortName: "Voice Wave",
    family: "Audio Visualization",
    status: "active",
    statusLabel: "Active",
    eyebrow: "02 / Audio visualization",
    summary: "A luminous additive waveform assembled from hundreds of procedural point-like sparks.",
    description:
      "Three seeded wave layers translate synthetic level, bass, mid, and treble values into motion, density, tint, and alpha. It is an audio study without microphone access or recorded media.",
    drivers: ["Time", "Synthetic level", "Synthetic bass", "Synthetic mid", "Synthetic treble"],
    techniques: [
      "Procedural dot field",
      "Seeded wave layers",
      "Additive blending",
      "Frequency-band mapping",
    ],
    primitives: ["Segmented fullscreen plane"],
    runtime: "voice-wave-particles",
    sourceUnits: sources("voice-fullscreen-vertex", "voice-wave-fragment"),
    presets: [
      { id: "balanced", label: "Balanced", description: "An even synthetic voice spectrum using the original controls." },
      { id: "bass-current", label: "Bass current", description: "Weights the lower waves and broad amber movement." },
      { id: "treble-sparks", label: "Treble sparks", description: "Emphasizes fine pearl particles and quick upper-band motion." },
    ],
    accent: { primary: "#22d3ee", secondary: "#ff9d3d", wash: "rgba(34, 211, 238, 0.15)" },
    stats: [
      { label: "Source units", value: "2" },
      { label: "Wave layers", value: "3" },
      { label: "Audio source", value: "Synthetic" },
    ],
  },
  {
    id: "morphing-echoes-title",
    slug: "morphing-echoes-title",
    index: 3,
    name: "Morphing Echoes Title",
    shortName: "Echoes Title",
    family: "Particle Typography",
    status: "active",
    statusLabel: "Active",
    eyebrow: "03 / Particle typography",
    summary: "The word ECHOES drifts between five typefaces, an orb, and an icosahedral constellation.",
    description:
      "Canvas-sampled glyph points move through font targets and alternate geometric forms. Pointer repulsion, seeded depth, 4D simplex flow, additive point sprites, and an explosion state preserve the original title system while using neutral ECHOES copy.",
    drivers: ["Time", "Pointer", "Font phase", "Preset state"],
    techniques: [
      "Canvas glyph sampling",
      "Point-sprite typography",
      "4D simplex flow",
      "Multi-target morphing",
      "Pointer repulsion",
    ],
    primitives: ["Point cloud", "Glyph masks", "Orb target", "Icosahedron target"],
    runtime: "morphing-echoes-title",
    sourceUnits: sources("title-particles-vertex", "title-particles-fragment", "simplex-noise-4d"),
    presets: [
      { id: "wordmark", label: "Wordmark", description: "Holds the ECHOES glyph field near its typographic target." },
      { id: "orb", label: "Orb", description: "Moves the title particles into the flowing spherical target." },
      { id: "icosahedron", label: "Icosahedron", description: "Reframes the points as a faceted constellation." },
      { id: "burst", label: "Burst", description: "Triggers the original seeded explosion envelope." },
    ],
    accent: { primary: "#d8fbff", secondary: "#8b5cf6", wash: "rgba(139, 92, 246, 0.17)" },
    stats: [
      { label: "Original units", value: "2 + shared noise" },
      { label: "Font targets", value: "5" },
      { label: "Input", value: "Pointer + time" },
    ],
  },
  {
    id: "orb-to-scene-reveal",
    slug: "orb-to-scene-reveal",
    index: 4,
    name: "Orb-to-Scene Reveal",
    shortName: "Orb Reveal",
    family: "Point-cloud Transition",
    status: "active",
    statusLabel: "Active",
    eyebrow: "04 / Point-cloud transition",
    summary: "A silver orb opens into a terrain-like point cloud carried by a looping flow simulation.",
    description:
      "A GPGPU position texture resets each particle by lifetime, pushes it through a 4D simplex field, and blends the rendered point from an orb target into seeded procedural terrain. Lit sprites and depth fog complete the scene reveal.",
    drivers: ["Time", "Reveal progress", "Particle lifetime"],
    techniques: [
      "GPGPU position feedback",
      "Lifetime reset",
      "4D simplex flow field",
      "Vertex target morph",
      "Lit point sprites and fog",
    ],
    primitives: ["Point cloud", "Data textures", "Procedural terrain target", "Orb target"],
    runtime: "orb-to-scene-reveal",
    sourceUnits: sources(
      "orb-to-scene-compute",
      "orb-to-scene-vertex",
      "orb-to-scene-fragment",
      "simplex-noise-4d",
    ),
    presets: [
      { id: "orbit", label: "Orb", description: "Holds the compact silver particle state." },
      { id: "reveal", label: "Reveal", description: "Plays the full orb-to-terrain transition." },
      { id: "flow", label: "Flow field", description: "Keeps the procedural scene visible while emphasizing particle drift." },
    ],
    accent: { primary: "#baf6ff", secondary: "#7157ff", wash: "rgba(186, 246, 255, 0.14)" },
    stats: [
      { label: "Original units", value: "3 + shared noise" },
      { label: "Particle budget", value: "16K / 64K" },
      { label: "Geometry", value: "Seeded terrain" },
    ],
  },
  {
    id: "audio-reactive-materialization",
    slug: "audio-reactive-materialization",
    index: 5,
    name: "Audio-Reactive Materialization",
    shortName: "Materialization",
    family: "GPGPU Materialization",
    status: "archived",
    statusLabel: "Archived · fully demonstrated",
    eyebrow: "05 / GPGPU materialization",
    summary: "Four sections of a torus-knot form resolve from an audio-reactive simulated point field.",
    description:
      "This archived system maps synthetic level, bass, mid, and treble into flow time, influence, frequency, radial distortion, and point size. A section threshold turns the simulated cloud into a deterministic segmented torus knot without redistributing the original GLB.",
    drivers: ["Time", "Synthetic level", "Synthetic bass", "Synthetic mid", "Synthetic treble", "Section count"],
    techniques: [
      "GPGPU flow field",
      "Audio-gated simulation",
      "Four-section reveal",
      "Bass radial deformation",
      "Treble point sizing",
    ],
    primitives: ["Point cloud", "Data textures", "Segmented torus-knot target"],
    runtime: "audio-reactive-materialization",
    sourceUnits: sources(
      "materialization-compute",
      "materialization-vertex",
      "materialization-fragment",
      "simplex-noise-4d",
    ),
    presets: [
      { id: "dormant", label: "Dormant", description: "Shows the unresolved simulated point field." },
      { id: "materialize", label: "Materialize", description: "Reveals the torus-knot form section by section." },
      { id: "pulse", label: "Pulse", description: "Raises synthetic bass and treble modulation." },
      { id: "dissolve", label: "Dissolve", description: "Returns materialized sections to the moving field." },
    ],
    accent: { primary: "#8be9f2", secondary: "#b27aff", wash: "rgba(178, 122, 255, 0.16)" },
    stats: [
      { label: "Original units", value: "3 + shared noise" },
      { label: "Reveal sections", value: "4" },
      { label: "Status", value: "Archived study" },
    ],
  },
];

export function getEffectBySlug(slug: string): ShaderEffectMeta | undefined {
  return shaderEffects.find((effect) => effect.slug === slug);
}

export function filterShaderEffects(filters: EffectFilters = {}): readonly ShaderEffectMeta[] {
  const { family = "all", status = "all", driver = "all" } = filters;
  const normalizedDriver = driver.toLowerCase();

  return shaderEffects.filter((effect) => {
    if (family !== "all" && effect.family !== family) return false;
    if (status !== "all" && effect.status !== status) return false;
    if (
      normalizedDriver !== "all"
      && !effect.drivers.some((candidate) => candidate.toLowerCase() === normalizedDriver)
    ) return false;
    return true;
  });
}

export function isEffectId(value: string): value is EffectId {
  return shaderEffects.some((effect) => effect.id === value);
}

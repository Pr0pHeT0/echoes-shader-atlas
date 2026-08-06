import auroraFragment from "../shaders/aurora/aurora-field.frag.glsl?raw";
import materializationCompute from "../shaders/materialization/materialization.compute.glsl?raw";
import materializationFragment from "../shaders/materialization/materialization.frag.glsl?raw";
import materializationVertex from "../shaders/materialization/materialization.vert.glsl?raw";
import orbCompute from "../shaders/orb/orb-to-scene.compute.glsl?raw";
import orbFragment from "../shaders/orb/orb-to-scene.frag.glsl?raw";
import orbVertex from "../shaders/orb/orb-to-scene.vert.glsl?raw";
import fullscreenVertex from "../shaders/shared/fullscreen.vert.glsl?raw";
import simplexNoise4d from "../shaders/shared/simplex-noise-4d.glsl?raw";
import titleFragment from "../shaders/title/title-particles.frag.glsl?raw";
import titleVertex from "../shaders/title/title-particles.vert.glsl?raw";
import voiceFragment from "../shaders/voice/voice-wave.frag.glsl?raw";

import type { EffectId, EffectShaderSource } from "./types";

const source = (
  label: string,
  stage: EffectShaderSource["stage"],
  path: string,
  shaderSource: string,
): EffectShaderSource => ({ label, stage, path, source: shaderSource });

const sharedFullscreen = source(
  "Fullscreen vertex",
  "vertex",
  "lib/shaders/shared/fullscreen.vert.glsl",
  fullscreenVertex,
);
const sharedSimplex = source(
  "Ashima 4D simplex noise",
  "include",
  "lib/shaders/shared/simplex-noise-4d.glsl",
  simplexNoise4d,
);

export const effectShaderSources: Record<EffectId, EffectShaderSource[]> = {
  "aurora-field": [
    sharedFullscreen,
    source("Aurora field", "fragment", "lib/shaders/aurora/aurora-field.frag.glsl", auroraFragment),
  ],
  "voice-wave-particles": [
    sharedFullscreen,
    source("Voice wave particles", "fragment", "lib/shaders/voice/voice-wave.frag.glsl", voiceFragment),
  ],
  "morphing-echoes-title": [
    source("Particle title", "vertex", "lib/shaders/title/title-particles.vert.glsl", titleVertex),
    source("Particle title", "fragment", "lib/shaders/title/title-particles.frag.glsl", titleFragment),
    sharedSimplex,
  ],
  "orb-to-scene-reveal": [
    source("Orb flow", "compute", "lib/shaders/orb/orb-to-scene.compute.glsl", orbCompute),
    source("Orb-to-scene", "vertex", "lib/shaders/orb/orb-to-scene.vert.glsl", orbVertex),
    source("Orb-to-scene", "fragment", "lib/shaders/orb/orb-to-scene.frag.glsl", orbFragment),
    sharedSimplex,
  ],
  "audio-reactive-materialization": [
    source("GPGPU flow", "compute", "lib/shaders/materialization/materialization.compute.glsl", materializationCompute),
    source("Materialization", "vertex", "lib/shaders/materialization/materialization.vert.glsl", materializationVertex),
    source("Materialization", "fragment", "lib/shaders/materialization/materialization.frag.glsl", materializationFragment),
    sharedSimplex,
  ],
};

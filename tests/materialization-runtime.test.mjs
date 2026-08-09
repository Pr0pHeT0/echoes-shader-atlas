import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeUrl = new URL(
  "../lib/effects/runtimes/audio-reactive-materialization.ts",
  import.meta.url,
);

async function loadRuntimeSource() {
  return readFile(runtimeUrl, "utf8");
}

test("live materialization selects four global trajectories instead of section masking", async () => {
  const runtime = await loadRuntimeSource();

  assert.doesNotMatch(runtime, /materializedSectionCount|particleSection|targetSections/);
  assert.doesNotMatch(runtime, /uploaded\.sections/);
  assert.match(runtime, /MATERIALIZATION_ARRIVAL_STAGGER/);
  assert.match(runtime, /MATERIALIZATION_ARRIVAL_WINDOW/);
  assert.match(runtime, /const SURFACE_FADE_START = 0\.62/);
  assert.match(runtime, /const SURFACE_FADE_END = 0\.94/);
  assert.match(runtime, /mix\(particle\.xyz, targetPosition, arrival\)/);
  assert.match(runtime, /cross\(targetNormal, targetTangent\)/);
  assert.match(runtime, /sin\(arrival\.mul\(Math\.PI\)\)/);
  assert.match(runtime, /MATERIALIZATION_VORTEX_TURNS_MIN/);
  assert.match(runtime, /MATERIALIZATION_VORTEX_TURNS_MAX/);
  assert.match(runtime, /const vortexSource = vec3\(/);
  assert.match(runtime, /const vortexPosition = mix\(vortexSource, targetPosition, arrival\)/);
  assert.match(runtime, /const bloomArrivalOrder = mix\(radialPhase, arrivalSeed, SPATIAL_SEED_MIX\)/);
  assert.match(runtime, /targetNormal\.mul\(bloomNormalLift\)/);
  assert.match(runtime, /const waveArrivalOrder = mix\(heightPhase, arrivalSeed, SPATIAL_SEED_MIX\)/);
  assert.match(runtime, /targetNormal\s*\.mul\(waveOscillation\)\s*\.mul\(arrivalEnvelope\)/);
  assert.match(runtime, /new THREE\.InstancedBufferAttribute\(particleTraits, 4\)/);
  assert.doesNotMatch(runtime, /new THREE\.InstancedBufferAttribute\(spatialPhases\.(?:height|radius), 1\)/);
  assert.match(runtime, /this\.transitionVariantIndex\.lessThan\(0\.5\)\.select/);
  assert.equal([...runtime.matchAll(/simplexNoise4d\(/g)].length, 4);
});

test("continuous motion is a bounded render-time graph independent from transitions", async () => {
  const runtime = await loadRuntimeSource();
  const motionGraph = runtime.slice(
    runtime.indexOf("const continuousMotionOffset"),
    runtime.indexOf("const liftedPosition"),
  );

  assert.match(motionGraph, /MATERIALIZATION_DRIFT_AMPLITUDE_MIN/);
  assert.match(motionGraph, /MATERIALIZATION_ORBIT_AMPLITUDE_MAX/);
  assert.match(motionGraph, /MATERIALIZATION_BREATHE_ANGULAR_SPEED/);
  assert.match(motionGraph, /MATERIALIZATION_RIPPLE_RING_COUNT/);
  assert.match(motionGraph, /MATERIALIZATION_TWIST_ANGULAR_SPEED/);
  assert.match(motionGraph, /MATERIALIZATION_FLUTTER_BITANGENT_SPEED/);
  assert.match(motionGraph, /variantIndex\.lessThan\(4\.5\)\.select\(twistOffset, flutterOffset\)/);
  assert.match(motionGraph, /previousMotionOffset/);
  assert.match(motionGraph, /currentMotionOffset/);
  assert.match(motionGraph, /smoothstep\(0, 1, this\.motionCrossfadeProgress\)/);
  assert.match(motionGraph, /MATERIALIZATION_MOTION_MAX_OFFSET/);
  assert.match(motionGraph, /\.mul\(surfaceMix\.oneMinus\(\)\)/);
  assert.match(motionGraph, /\.mul\(this\.reducedMotion \? 0 : 1\)/);
  assert.doesNotMatch(motionGraph, /shaderEnabled|simplexNoise4d|\.compute\(/);
  assert.equal([...runtime.matchAll(/\}\)\(\)\.compute\(/g)].length, 2);
});

test("built-in and uploaded settled layers share global surface progress", async () => {
  const runtime = await loadRuntimeSource();

  assert.match(runtime, /material\.opacityNode = surfaceMix/);
  assert.match(runtime, /material\.alphaHash = true/);
  assert.match(runtime, /const LIVE_POINT_SCALE = 1\.4/);
  assert.match(runtime, /const SETTLED_SHELL_SCALE = 0\.45/);
  assert.match(runtime, /MATERIALIZATION_MAX_POINT_FLARE - 1/);
  assert.match(runtime, /\.mul\(LIVE_POINT_SCALE\)/);
  assert.match(runtime, /material\.sizeNode = uniform\(pointSize \* SETTLED_SHELL_SCALE\)/);
  assert.match(runtime, /surfaceMix\.mul\(0\.96\)/);
  assert.match(runtime, /transparent: true,\s*depthWrite: false,\s*depthTest: true/);
  assert.match(runtime, /targetNormal\.mul\(surfaceMix\)\.mul\(SETTLED_SPARK_LIFT\)/);
  assert.match(runtime, /new THREE\.PointsNodeMaterial/);
  assert.match(runtime, /new THREE\.MeshStandardNodeMaterial/);
});

test("transition replay resets scatter while continuous motion preserves lifecycle state", async () => {
  const runtime = await loadRuntimeSource();
  const transitionSetter = runtime.slice(
    runtime.indexOf("setTransitionVariant("),
    runtime.indexOf("setMotionVariant("),
  );
  const motionSetter = runtime.slice(
    runtime.indexOf("setMotionVariant("),
    runtime.indexOf("\n  setPreset(", runtime.indexOf("setMotionVariant(")),
  );
  const beginMotionCrossfade = runtime.slice(
    runtime.indexOf("private beginMotionCrossfade("),
    runtime.indexOf("private advanceContinuousMotion("),
  );

  assert.match(runtime, /MaterializationInitialParticles/);
  assert.match(runtime, /Materialization deterministic scatter reset/);
  assert.match(runtime, /if \(this\.resetPending\) \{\s*this\.renderer\.compute\(this\.resetComputeNode\)/);
  assert.match(transitionSetter, /this\.transitionProgress = this\.reducedMotion \? 1 : 0/);
  assert.match(transitionSetter, /this\.resetPending = !this\.reducedMotion/);
  assert.match(motionSetter, /crossfade = true/);
  assert.match(beginMotionCrossfade, /this\.previousMotionPhaseSeconds = this\.motionPhaseSeconds/);
  assert.match(motionSetter, /this\.motionPhaseSeconds = 0/);
  assert.match(beginMotionCrossfade, /this\.motionCrossfadeProgressValue = 0/);
  assert.doesNotMatch(
    motionSetter,
    /transitionProgress|transitionTarget|currentPreset|resetPending|renderer\.compute/,
  );
});

test("re-entrant motion changes retain the visible fade and queue only the latest target", async () => {
  const runtime = await loadRuntimeSource();
  const advanceMotion = runtime.slice(
    runtime.indexOf("private advanceContinuousMotion("),
    runtime.indexOf("\n  update(", runtime.indexOf("private advanceContinuousMotion(")),
  );
  const motionSetter = runtime.slice(
    runtime.indexOf("setMotionVariant("),
    runtime.indexOf("\n  setPreset(", runtime.indexOf("setMotionVariant(")),
  );

  assert.match(runtime, /private pendingMotionVariant: MaterializationMotionVariant \| null = null/);
  assert.match(
    motionSetter,
    /this\.motionCrossfadeProgressValue < 1[\s\S]+this\.pendingMotionVariant = motionVariant;\s*return;/,
  );
  assert.match(
    motionSetter,
    /this\.motionCrossfadeProgressValue <= 0[\s\S]+this\.motionVariantIndex\.value = motionVariantIndex/,
  );
  assert.match(
    advanceMotion,
    /secondsToCompletion[\s\S]+MATERIALIZATION_MOTION_CROSSFADE_SECONDS/,
  );
  assert.match(advanceMotion, /const step = Math\.min\(remainingDelta, secondsToCompletion\)/);
  assert.match(advanceMotion, /remainingDelta -= step/);
  assert.match(
    advanceMotion,
    /this\.pendingMotionVariant = null;\s*this\.beginMotionCrossfade\(pendingMotionVariant\)/,
  );
  assert.equal([...runtime.matchAll(/\}\)\(\)\.compute\(/g)].length, 2);
  assert.doesNotMatch(runtime, /PendingMotionBuffer|MotionBlendBuffer/);
});

test("motion timing freezes on static frames and Cloud keeps render motion without flow compute", async () => {
  const runtime = await loadRuntimeSource();

  assert.match(runtime, /const activeMotionDelta = this\.reducedMotion \|\| frame\.static\s*\? 0/);
  assert.match(runtime, /advanceMaterializationMotionPhase\(/);
  assert.match(runtime, /advanceMaterializationMotionCrossfade\(/);
  assert.match(runtime, /const fullySettled = this\.transitionProgress >= 1/);
  assert.match(runtime, /this\.shaderEnabled\.value > 0 && !fullySettled/);
  assert.match(runtime, /const enabled = preset === "dormant" \? 0 : 1/);
  assert.match(runtime, /this\.flowEnabled\.value = enabled/);
  assert.match(
    runtime,
    /const shouldResetScatter = preset === "dormant"\s*&& previousPreset !== "dormant"\s*&& this\.transitionProgress > 0/,
  );
  assert.match(runtime, /if \(shouldResetScatter\) this\.resetPending = true/);
});

test("materialization cleanup retains every owned GPU resource", async () => {
  const runtime = await loadRuntimeSource();

  assert.match(runtime, /const fullySettled = this\.transitionProgress >= 1/);
  assert.match(runtime, /this\.setPreset\("dormant"\)/);
  assert.match(runtime, /this\.resetComputeNode\.dispose\(\)/);
  assert.match(runtime, /this\.computeNode\.dispose\(\)/);
  assert.match(runtime, /disposeComputeOnlyStorage\(this\.renderer, this\.initialParticles\)/);
  assert.match(runtime, /disposeComputeOnlyStorage\(this\.renderer, this\.base\)/);
  assert.match(runtime, /this\.points\.geometry\.dispose\(\)/);
  assert.match(runtime, /this\.sectionGeometries\.forEach\(\(geometry\) => geometry\.dispose\(\)\)/);
  assert.match(runtime, /this\.sectionMaterials\.forEach\(\(material\) => material\.dispose\(\)\)/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { shaderEffects } from "../lib/catalog/effects.ts";
import {
  EFFECT_PRESETS,
  STYLIZED_MATERIALIZATION_DEFAULTS,
} from "../lib/effects/runtime-config.ts";
import { lazyEffectFactories } from "../lib/effects/runtime-registry.ts";

const runtimeUrl = new URL(
  "../lib/effects/runtimes/stylized-materialization.ts",
  import.meta.url,
);

async function loadRuntimeSource() {
  return readFile(runtimeUrl, "utf8");
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function parseNumericLiteral(value) {
  return Number(value.replaceAll("_", ""));
}

function readStyleBudget(source, style) {
  const match = source.match(new RegExp(
    `const ${style}Indices = make(?:Random|Style)Indices\\(\\s*count,\\s*this\\.constrained \\? ([\\d_]+) : ([\\d_]+),`,
  ));
  assert.ok(match, `${style} should use a compact constrained/high index budget`);
  return {
    low: parseNumericLiteral(match[1]),
    high: parseNumericLiteral(match[2]),
  };
}

test("Stylized Point Field keeps compact, style-specific instance budgets", async () => {
  const runtime = await loadRuntimeSource();

  assert.deepEqual(readStyleBudget(runtime, "cyber"), { low: 4_000, high: 8_000 });
  assert.deepEqual(readStyleBudget(runtime, "matrix"), { low: 2_500, high: 5_000 });
  assert.deepEqual(readStyleBudget(runtime, "ink"), { low: 6_000, high: 12_000 });

  assert.match(
    runtime,
    /cyberCoreSprite = this\.addMainSprite\(cyberCoreMaterial, cyberIndices\.length,/,
  );
  assert.match(
    runtime,
    /cyberHaloSprite = this\.addMainSprite\(cyberHaloMaterial, cyberIndices\.length,/,
  );
  assert.match(
    runtime,
    /matrixCoreSprite = this\.addMainSprite\(matrixCoreMaterial, matrixIndices\.length,/,
  );
  assert.match(
    runtime,
    /matrixHaloSprite = this\.addMainSprite\(matrixHaloMaterial, matrixIndices\.length,/,
  );
  assert.match(runtime, /makeInstancedSprite\(inkDepositMaterial, inkIndices\.length\)/);
  assert.match(
    runtime,
    /matrixDepthSprite = this\.addMainSprite\(matrixDepthMaterial, count, 0\)/,
    "only the Matrix occlusion shell intentionally retains the dense point count",
  );
  assert.match(runtime, /applyStyleVisibility\(\): void/);
  assert.match(runtime, /cyberCoreSprite\.visible = cyberVisible/);
  assert.match(runtime, /matrixDepthSprite\.visible = matrixOcclusionVisible/);
});

test("Cyberpunk randomizes surface samples and biases stable ribbons toward model contours", async () => {
  const runtime = await loadRuntimeSource();
  const setup = sourceBetween(runtime, "const cyberIndices", "const matrixDepthMaterial");
  const fragment = sourceBetween(runtime, "function cyberStrokeFragment", "function matrixGlyphFragment");
  const distribution = sourceBetween(setup, "const cyberViewNormal", "const cyberAngle");

  assert.match(setup, /const cyberIndices = makeRandomIndices\(/);
  assert.match(setup, /cyberNormalDistributionData\[output\] = targetNormals\[sourceOffset\]/);
  assert.match(setup, /cyberNormalDistributionData\[output \+ 3\] = seededValue\(sourceIndex, 449\)/);
  assert.match(setup, /normalize\(highpModelNormalViewMatrix\.mul\(cyberNormal\)\)/);
  assert.match(setup, /const cyberViewDirection = normalize\(cyberViewPosition\.negate\(\)\)/);
  assert.match(setup, /abs\(dot\(cyberViewNormal, cyberViewDirection\)\)\.oneMinus\(\)/);
  assert.match(setup, /const cyberRandomPresence = smoothstep\(0\.16, 0\.86, cyberDistributionSeed\)/);
  assert.match(setup, /mix\(0\.5, 0\.8, cyberRandomPresence\)\.add\(cyberContour\.mul\(0\.3\)\)/);
  assert.match(fragment, /\.mul\(distribution\)/);
  assert.doesNotMatch(distribution, /this\.time/);
});

test("Matrix density, glyph, lane, cadence, size, and flicker streams stay independent", async () => {
  const runtime = await loadRuntimeSource();
  const setup = sourceBetween(runtime, "const matrixIndices", "const matrixTarget =");
  const fragment = sourceBetween(runtime, "function matrixGlyphFragment", "function depthDiscFragment");

  assert.match(setup, /this\.constrained \? 2_500 : 5_000,\s*36_667,\s*7_919,/);

  const semanticSalts = {
    lane: /matrixParametersA\[offsetA\] = seededValue\(sourceIndex, ([\d_]+)\)/,
    change: /matrixParametersA\[offsetA \+ 1\] = seededValue\(sourceIndex, ([\d_]+)\)/,
    cadence: /matrixParametersA\[offsetA \+ 2\] = seededValue\(sourceIndex, ([\d_]+)\)/,
    glyphFamily: /const language = seededValue\(sourceIndex, ([\d_]+)\)/,
    binaryGlyph: /seededValue\(sourceIndex, ([\d_]+)\) < 0\.5 \? 0 : 1/,
    operatorGlyph: /seededValue\(sourceIndex, ([\d_]+)\) \* \(MATRIX_SDF_GLYPHS\.length - 2\)/,
    size: /matrixParametersB\[offsetA \+ 1\] = seededValue\(sourceIndex, ([\d_]+)\)/,
    flicker: /matrixParametersB\[offsetA \+ 2\] = seededValue\(sourceIndex, ([\d_]+)\)/,
  };
  const salts = Object.fromEntries(Object.entries(semanticSalts).map(([name, pattern]) => {
    const match = setup.match(pattern);
    assert.ok(match, `missing independent Matrix ${name} stream`);
    return [name, parseNumericLiteral(match[1])];
  }));
  assert.equal(new Set(Object.values(salts)).size, Object.keys(salts).length);

  assert.match(setup, /const language = seededValue\(sourceIndex, [\d_]+\);\s*matrixParametersB\[offsetA\] = language < 0\.85/);
  assert.match(fragment, /const laneHead = time[\s\S]*?cadenceSeed[\s\S]*?laneSeed/);
  assert.match(fragment, /const bucket = floor\([\s\S]*?cadenceSeed[\s\S]*?changeSeed/);
  assert.match(fragment, /const stablePulse = sin\([\s\S]*?cadenceSeed[\s\S]*?flickerSeed/);
  assert.match(
    runtime,
    /const matrixClipPosition = cameraProjectionMatrix[\s\S]*?const matrixVerticalNode = matrixClipPosition\.y/,
    "Matrix lane heads should travel in projected screen space",
  );
  assert.doesNotMatch(
    sourceBetween(fragment, "const stablePulse", "const phosphor"),
    /laneSeed|changeSeed/,
    "flicker must not reuse lane or sparse-glyph hashes",
  );
});

test("preset changes crossfade for 500 ms from the live blend without moving the target", async () => {
  const runtime = await loadRuntimeSource();
  const update = sourceBetween(runtime, "update(frame: EffectFrame)", "prepareRender(): void");
  const setPreset = sourceBetween(runtime, "setPreset(preset: string)", "dispose(): void");

  assert.match(runtime, /const PRESET_TRANSITION_SECONDS = 0\.5;/);
  assert.match(
    update,
    /\(frame\.elapsed - this\.transitionStartedAt\) \/ PRESET_TRANSITION_SECONDS/,
  );
  assert.match(update, /const progress = smoothMix\(/);
  assert.match(update, /THREE\.MathUtils\.lerp\(this\.transitionFrom\[0\], this\.transitionTo\[0\], progress\)/);
  assert.match(update, /if \(this\.reducedMotion \|\| frame\.static === true\) \{\s*this\.setMix\(this\.transitionTo\);/);

  const fromIndex = setPreset.indexOf("this.transitionFrom = this.currentMix();");
  const targetIndex = setPreset.indexOf("this.transitionTo = nextMix;", fromIndex);
  const startIndex = setPreset.indexOf("this.transitionStartedAt = this.lastElapsed;");
  assert.ok(fromIndex >= 0 && fromIndex < targetIndex && targetIndex < startIndex);
  assert.match(setPreset, /if \(this\.reducedMotion\) \{\s*this\.setMix\(nextMix\);/);
  assert.match(
    setPreset,
    /if \(!this\.presetInitialized\) \{[\s\S]*?this\.setMix\(nextMix\);[\s\S]*?return;/,
    "a rebuilt geometry target should initialize in the already-selected style without flashing Cyberpunk",
  );
  assert.doesNotMatch(setPreset, /positionNode|groupRotationY/);
});

test("all styles stay directly anchored to the selected static target without GPGPU or reveal state", async () => {
  const runtime = await loadRuntimeSource();
  const update = sourceBetween(runtime, "update(frame: EffectFrame)", "prepareRender(): void");
  const resize = sourceBetween(runtime, "resize(width: number", "setPreset(preset: string)");

  for (const removed of [
    "simplexNoise4d",
    "computeNode",
    "renderer.compute",
    "revealProgress",
    "particleData",
    "targetSections",
    "particleSections",
    "StorageBufferNode",
    "instancedArray",
  ]) {
    assert.doesNotMatch(runtime, new RegExp(removed.replace(".", "\\.")), `${removed} must stay removed`);
  }
  assert.deepEqual(STYLIZED_MATERIALIZATION_DEFAULTS, { size: 0.058 });
  assert.match(runtime, /const requestedTarget = context\.pointTarget \?\? "base";/);
  assert.match(runtime, /const uploaded = requestedTarget === "uploaded"/);
  assert.match(runtime, /const terrain = requestedTarget === "terrain"\s*\? createProceduralTerrain\(count\)/);
  assert.match(runtime, /const knot = uploaded \|\| terrain \? null : createSegmentedTorusKnot\(count\);/);
  assert.match(runtime, /cyberCoreMaterial\.positionNode = cyberTarget;/);
  assert.match(runtime, /cyberHaloMaterial\.positionNode = cyberTarget;/);
  assert.match(runtime, /matrixCoreMaterial\.positionNode = matrixTarget;/);
  assert.match(runtime, /matrixHaloMaterial\.positionNode = matrixTarget;/);
  assert.match(runtime, /inkDepositMaterial\.positionNode = inkTarget;/);
  assert.match(runtime, /matrixDepthMaterial\.positionNode = fullTargetPosition\.add\(/);
  assert.match(update, /this\.groupRotationY \+= delta \* rotationSpeed \* targetMotionScale/);
  assert.match(update, /this\.group\.rotation\.x = Math\.sin\(shaderTime \* 0\.13\)/);
  assert.match(runtime, /this\.terrainTarget \? TERRAIN_CAMERA_DIRECTION : BASE_CAMERA_DIRECTION/);
  assert.match(runtime, /targetPositions\[offset\] -= targetCenter\.x/);
  assert.match(resize, /const horizontalFov = 2 \* Math\.atan\(Math\.tan\(verticalFov \* 0\.5\) \* aspect\);/);
  assert.match(resize, /const fitFov = Math\.min\(verticalFov, horizontalFov\);/);
  assert.match(resize, /const cameraDistance = this\.targetRadius/);
  assert.match(resize, /this\.camera\.position\.copy\(this\.cameraDirection\)\.multiplyScalar\(cameraDistance\);/);
});

test("Ink pre-render warms once, stays depth-stable, and disposes every offscreen resource", async () => {
  const runtime = await loadRuntimeSource();
  const prepare = sourceBetween(runtime, "prepareRender(): void", "resize(width: number");
  const resize = sourceBetween(runtime, "resize(width: number", "setPreset(preset: string)");
  const dispose = sourceBetween(runtime, "dispose(): void", "async function loadGlyphAtlas");

  assert.match(
    prepare,
    /if \(this\.inkPrepared && Number\(this\.inkMix\.value\) <= 0\.001\) return;/,
  );
  assert.match(prepare, /this\.inkPrepared = true;/);
  const targetSequence = [
    "this.inkDepositTarget",
    "this.inkBlurHorizontalTarget",
    "this.inkBlurVerticalTarget",
    "previousTarget",
  ];
  let cursor = 0;
  for (const target of targetSequence) {
    const index = prepare.indexOf(`this.renderer.setRenderTarget(${target});`, cursor);
    assert.notEqual(index, -1, `missing ordered render target stage: ${target}`);
    cursor = index + 1;
  }
  assert.equal((prepare.match(/this\.renderer\.clear\(\);/g) ?? []).length, 3);
  assert.match(prepare, /try \{/);
  assert.match(prepare, /\} finally \{/);
  const finallyBlock = prepare.slice(prepare.indexOf("} finally {"));
  assert.match(finallyBlock, /this\.renderer\.setRenderTarget\(previousTarget\)/);
  assert.match(prepare, /this\.renderer\.setClearColor\(previousClear, previousAlpha\)/);
  assert.match(prepare, /this\.renderer\.autoClear = previousAutoClear/);

  for (const resource of [
    "inkBlurHorizontalMaterial",
    "inkBlurVerticalMaterial",
    "inkDepositTarget",
    "inkBlurHorizontalTarget",
    "inkBlurVerticalTarget",
    "glyphAtlas",
    "paperTexture",
  ]) {
    assert.match(dispose, new RegExp(`this\\.${resource}\\.dispose\\(\\)`), `${resource} must be disposed`);
  }
  assert.match(dispose, /mainSprites\.forEach\(\(sprite\) => sprite\.geometry\.dispose\(\)\)/);
  assert.match(dispose, /inkSprites\.forEach\(\(sprite\) => sprite\.geometry\.dispose\(\)\)/);
  assert.match(dispose, /mainMaterials\.forEach\(\(material\) => material\.dispose\(\)\)/);
  assert.match(dispose, /inkMaterials\.forEach\(\(material\) => material\.dispose\(\)\)/);
  assert.match(runtime, /const coordinate = viewportUV;/);
  assert.match(
    runtime,
    /const direction = horizontal\s*\? vec2\(texelSize\.x, 0\)\s*: vec2\(0, texelSize\.y\);/,
  );
  assert.doesNotMatch(runtime, /texelSize\.[xy]\.mul\(3\.15\)/);
  assert.match(runtime, /mix\(0\.68, 0\.32, washKind\)/);
  assert.match(runtime, /const sumi = new THREE\.Color\(0x07100e\)/);
  assert.match(runtime, /const blueGray = new THREE\.Color\(0x3c5358\)/);
  assert.match(runtime, /const celadon = new THREE\.Color\(0x526b60\)/);
  assert.match(runtime, /\? \(0\.07 \+ seededValue\(sourceIndex, 619\) \* 0\.11\) \* clusterStrength/);
  assert.match(runtime, /: \(0\.45 \+ seededValue\(sourceIndex, 631\) \* 0\.43\) \* clusterStrength/);
  assert.match(
    runtime,
    /blurred\.a\.mul\(mix\(0\.84, 1\.08, fiber\)\)\.add\(pooledEdge\.mul\(0\.22\)\)/,
  );
  assert.match(runtime, /\n\s*0\.9,\n\s*\);/);
  const inkSetup = sourceBetween(runtime, "const inkDepositMaterial", "const backgroundNode");
  assert.match(inkSetup, /depthWrite: false/);
  assert.match(inkSetup, /depthTest: false/);
  assert.match(inkSetup, /this\.inkDepositTarget = new THREE\.RenderTarget\(1, 1, \{\s*depthBuffer: false/);
  assert.doesNotMatch(inkSetup, /depthWrite: true|depthBuffer: true/);
  assert.match(runtime, /const pooledPigment = mix\(/);
  assert.match(runtime, /\.sub\(washAlpha\.mul\(0\.955\)\)/);
  assert.match(runtime, /\.add\(pooledPigment\.mul\(0\.86\)\)/);
  assert.match(runtime, /paper\.mul\(clamp\(absorption, 0\.04, 1\)\)/);
  assert.doesNotMatch(runtime, /blurred\.rgb\.div|sharp\.rgb\.div/);
  assert.match(resize, /const resolutionScale = this\.constrained \? 0\.25 : 0\.5;/);
  assert.match(resize, /if \(longEdge > INK_TARGET_LONG_EDGE\)/);
  for (const target of [
    "inkDepositTarget",
    "inkBlurHorizontalTarget",
    "inkBlurVerticalTarget",
  ]) {
    assert.match(resize, new RegExp(`this\\.${target}\\.setSize\\(targetWidth, targetHeight\\)`));
  }
});

test("catalog, runtime, and preset IDs retain the archived original and approved remix contract", async () => {
  const runtime = await loadRuntimeSource();
  const original = shaderEffects.find(({ id }) => id === "audio-reactive-materialization");
  const remix = shaderEffects.find(({ id }) => id === "stylized-materialization");

  assert.ok(original);
  assert.ok(remix);
  assert.equal(original.status, "archived");
  assert.equal(original.slug, "audio-reactive-materialization");
  assert.equal(original.runtime, "audio-reactive-materialization");
  assert.deepEqual(original.presets.map(({ id }) => id), [
    "dormant",
    "materialize",
    "pulse",
    "dissolve",
  ]);
  assert.equal(remix.slug, "stylized-materialization");
  assert.equal(remix.runtime, "stylized-materialization");
  assert.deepEqual(remix.presets.map(({ id }) => id), [
    "cyberpunk-lines",
    "matrix-ascii",
    "ink-wash",
  ]);
  assert.deepEqual(EFFECT_PRESETS["audio-reactive-materialization"], [
    "dormant",
    "materialize",
    "pulse",
    "dissolve",
  ]);
  assert.deepEqual(EFFECT_PRESETS["stylized-materialization"], [
    "cyberpunk-lines",
    "matrix-ascii",
    "ink-wash",
  ]);
  assert.deepEqual(Object.keys(lazyEffectFactories), shaderEffects.map(({ id }) => id));
  assert.match(runtime, /readonly id = "stylized-materialization" as const/);
  assert.match(runtime, /const PRESETS = EFFECT_PRESETS\["stylized-materialization"\]/);
});

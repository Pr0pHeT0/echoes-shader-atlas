#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_COMMIT = "d018f6d057c8f30144979bbcc95436cfb405d7c5";

export const EFFECT_IDS = [
  "aurora-field",
  "voice-wave-particles",
  "morphing-echoes-title",
  "orb-to-scene-reveal",
  "audio-reactive-materialization",
];

export const EXTRACTED_SHADER_PATHS = [
  "lib/shaders/shared/fullscreen.vert.glsl",
  "lib/shaders/shared/simplex-noise-4d.glsl",
  "lib/shaders/aurora/aurora-field.frag.glsl",
  "lib/shaders/voice/voice-wave.frag.glsl",
  "lib/shaders/title/title-particles.vert.glsl",
  "lib/shaders/title/title-particles.frag.glsl",
  "lib/shaders/orb/orb-to-scene.compute.glsl",
  "lib/shaders/orb/orb-to-scene.vert.glsl",
  "lib/shaders/orb/orb-to-scene.frag.glsl",
  "lib/shaders/materialization/materialization.compute.glsl",
  "lib/shaders/materialization/materialization.vert.glsl",
  "lib/shaders/materialization/materialization.frag.glsl",
];

const EXPECTED_SOURCE_PATH_COUNTS = new Map([
  ["src/game/LandingAuroraBackground.js", 2],
  ["src/game/BottomVoiceEffect.js", 2],
  ["src/shaders/includes/simplexNoise4d.glsl", 1],
  ["src/shaders/landingTitle.vert", 1],
  ["src/shaders/landingTitle.frag", 1],
  ["src/shaders/gpgpu/particles.glsl", 1],
  ["src/shaders/particles.vert", 1],
  ["src/shaders/particles.frag", 1],
  ["src/shaders/gpgpu/gameplayPly.glsl", 1],
  ["src/shaders/gameplayPly.vert", 1],
  ["src/shaders/gameplayPly.frag", 1],
]);

const EXPECTED_EFFECTS_BY_SOURCE_PATH = new Map([
  ["src/game/LandingAuroraBackground.js", ["aurora-field"]],
  ["src/game/BottomVoiceEffect.js", ["voice-wave-particles"]],
  ["src/shaders/landingTitle.vert", ["morphing-echoes-title"]],
  ["src/shaders/landingTitle.frag", ["morphing-echoes-title"]],
  ["src/shaders/gpgpu/gameplayPly.glsl", ["orb-to-scene-reveal"]],
  ["src/shaders/gameplayPly.vert", ["orb-to-scene-reveal"]],
  ["src/shaders/gameplayPly.frag", ["orb-to-scene-reveal"]],
  ["src/shaders/gpgpu/particles.glsl", ["audio-reactive-materialization"]],
  ["src/shaders/particles.vert", ["audio-reactive-materialization"]],
  ["src/shaders/particles.frag", ["audio-reactive-materialization"]],
  [
    "src/shaders/includes/simplexNoise4d.glsl",
    [
      "morphing-echoes-title",
      "orb-to-scene-reveal",
      "audio-reactive-materialization",
    ],
  ],
]);

const EXPECTED_INLINE_SOURCES = new Set([
  "src/game/LandingAuroraBackground.js#vertexShader",
  "src/game/LandingAuroraBackground.js#fragmentShader",
  "src/game/BottomVoiceEffect.js#vertexShader",
  "src/game/BottomVoiceEffect.js#fragmentShader",
]);

const FONT_ASSETS = [
  {
    name: "Oxanium",
    font: "public/fonts/oxanium/Oxanium-Variable.ttf",
    license: "public/fonts/oxanium/OFL.txt",
  },
  {
    name: "Tektur",
    font: "public/fonts/tektur/Tektur-Variable.ttf",
    license: "public/fonts/tektur/OFL.txt",
  },
  {
    name: "Bruno Ace SC",
    font: "public/fonts/bruno-ace-sc/BrunoAceSC-Regular.ttf",
    license: "public/fonts/bruno-ace-sc/OFL.txt",
  },
  {
    name: "Chakra Petch",
    font: "public/fonts/chakra-petch/ChakraPetch-Bold.ttf",
    license: "public/fonts/chakra-petch/OFL.txt",
  },
  {
    name: "Orbitron",
    font: "public/fonts/orbitron/Orbitron-Variable.ttf",
    license: "public/fonts/orbitron/OFL.txt",
  },
];

const VALID_STAGES = new Set(["vertex", "fragment", "compute", "include"]);
const VALID_SOURCE_KINDS = new Set(["file", "inline"]);
const VALID_STATUSES = new Set(["active", "archived"]);

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function resolveInside(projectRoot, relativePath, fieldName) {
  assert.equal(typeof relativePath, "string", `${fieldName} must be a string`);
  assert.ok(relativePath.length > 0, `${fieldName} must not be empty`);
  assert.ok(!isAbsolute(relativePath), `${fieldName} must be relative`);
  assert.ok(!relativePath.includes("\\"), `${fieldName} must use POSIX separators`);

  const absolutePath = resolve(projectRoot, relativePath);
  assert.ok(
    absolutePath.startsWith(`${resolve(projectRoot)}${sep}`),
    `${fieldName} must stay inside the project root`,
  );
  return absolutePath;
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function assertRegularFile(projectRoot, relativePath, fieldName) {
  const absolutePath = resolveInside(projectRoot, relativePath, fieldName);
  const details = await stat(absolutePath);
  assert.ok(details.isFile(), `${relativePath} must be a regular file`);
  assert.ok(details.size > 0, `${relativePath} must not be empty`);
  return absolutePath;
}

function assertString(value, fieldName) {
  assert.equal(typeof value, "string", `${fieldName} must be a string`);
  assert.ok(value.trim().length > 0, `${fieldName} must not be empty`);
}

/**
 * Validate the extraction inventory and the bytes it references.
 *
 * The manifest intentionally has a small, serializable contract so it can be
 * consumed by the site, CI, and downstream archivists without TypeScript.
 */
export async function auditExtraction({
  projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  manifestPath = "data/extraction-manifest.json",
} = {}) {
  const absoluteManifestPath = await assertRegularFile(
    projectRoot,
    manifestPath,
    "manifestPath",
  );
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));

  assert.equal(
    manifest.sourceCommit,
    SOURCE_COMMIT,
    "manifest sourceCommit must pin the audited artifact revision",
  );
  assert.ok(Array.isArray(manifest.effects), "manifest.effects must be an array");
  assert.ok(Array.isArray(manifest.units), "manifest.units must be an array");
  assert.equal(manifest.effects.length, 5, "manifest must classify exactly five effects");
  assert.equal(manifest.units.length, 13, "manifest must inventory exactly 13 original shader units");

  const effectIds = new Set();
  const effectStatus = new Map();
  for (const [index, effect] of manifest.effects.entries()) {
    assert.ok(effect && typeof effect === "object", `effects[${index}] must be an object`);
    assertString(effect.id, `effects[${index}].id`);
    assert.ok(!effectIds.has(effect.id), `duplicate effect id: ${effect.id}`);
    assert.ok(
      VALID_STATUSES.has(effect.status),
      `effects[${index}].status must be active or archived`,
    );
    effectIds.add(effect.id);
    effectStatus.set(effect.id, effect.status);
  }

  assert.deepEqual(sorted(effectIds), sorted(EFFECT_IDS), "manifest effect ids changed");
  assert.equal(
    effectStatus.get("audio-reactive-materialization"),
    "archived",
    "materialization must retain its archived classification",
  );
  for (const effectId of EFFECT_IDS.filter((id) => id !== "audio-reactive-materialization")) {
    assert.equal(effectStatus.get(effectId), "active", `${effectId} must be active`);
  }

  const unitIds = new Set();
  const mappedEffects = new Set();
  const extractedPaths = new Set();
  const extractedPathCounts = new Map();
  const sourcePathCounts = new Map();
  const inlineSources = new Set();

  for (const [index, unit] of manifest.units.entries()) {
    const prefix = `units[${index}]`;
    assert.ok(unit && typeof unit === "object", `${prefix} must be an object`);
    assertString(unit.id, `${prefix}.id`);
    assert.ok(!unitIds.has(unit.id), `duplicate shader unit id: ${unit.id}`);
    unitIds.add(unit.id);

    assertString(unit.sourcePath, `${prefix}.sourcePath`);
    assert.ok(
      EXPECTED_SOURCE_PATH_COUNTS.has(unit.sourcePath),
      `${prefix}.sourcePath is not part of the pinned extraction inventory`,
    );
    sourcePathCounts.set(unit.sourcePath, (sourcePathCounts.get(unit.sourcePath) ?? 0) + 1);

    assert.ok(
      VALID_SOURCE_KINDS.has(unit.sourceKind),
      `${prefix}.sourceKind must be file or inline`,
    );
    if (unit.sourceKind === "inline") {
      assertString(unit.sourceSymbol, `${prefix}.sourceSymbol`);
      inlineSources.add(`${unit.sourcePath}#${unit.sourceSymbol}`);
    } else {
      assert.ok(
        unit.sourceSymbol == null,
        `${prefix}.sourceSymbol must be omitted or null for file sources`,
      );
    }

    assert.ok(VALID_STAGES.has(unit.stage), `${prefix}.stage is invalid`);
    assert.ok(Array.isArray(unit.effectIds), `${prefix}.effectIds must be an array`);
    assert.ok(unit.effectIds.length > 0, `${prefix}.effectIds must not be empty`);
    assert.equal(
      new Set(unit.effectIds).size,
      unit.effectIds.length,
      `${prefix}.effectIds must not contain duplicates`,
    );
    for (const effectId of unit.effectIds) {
      assert.ok(effectIds.has(effectId), `${prefix} references unknown effect id: ${effectId}`);
      mappedEffects.add(effectId);
    }
    assert.deepEqual(
      sorted(unit.effectIds),
      sorted(EXPECTED_EFFECTS_BY_SOURCE_PATH.get(unit.sourcePath)),
      `${prefix}.effectIds does not match its original consumer`,
    );

    assertString(unit.extractedPath, `${prefix}.extractedPath`);
    assert.match(unit.sha256, /^[a-f0-9]{64}$/, `${prefix}.sha256 must be lowercase SHA-256`);
    const extractedFile = await assertRegularFile(
      projectRoot,
      unit.extractedPath,
      `${prefix}.extractedPath`,
    );
    assert.equal(
      await sha256(extractedFile),
      unit.sha256,
      `${prefix}.sha256 does not match ${unit.extractedPath}`,
    );
    extractedPaths.add(unit.extractedPath);
    extractedPathCounts.set(
      unit.extractedPath,
      (extractedPathCounts.get(unit.extractedPath) ?? 0) + 1,
    );
  }

  assert.deepEqual(
    [...sourcePathCounts.entries()].sort(),
    [...EXPECTED_SOURCE_PATH_COUNTS.entries()].sort(),
    "original source paths or source-unit counts changed",
  );
  assert.deepEqual(sorted(inlineSources), sorted(EXPECTED_INLINE_SOURCES), "inline provenance changed");
  assert.deepEqual(sorted(mappedEffects), sorted(EFFECT_IDS), "every effect must own at least one shader unit");
  assert.deepEqual(
    sorted(extractedPaths),
    sorted(EXTRACTED_SHADER_PATHS),
    "extracted shader file inventory changed",
  );
  assert.equal(
    extractedPathCounts.get("lib/shaders/shared/fullscreen.vert.glsl"),
    2,
    "the identical inline fullscreen vertex shader must be deduplicated",
  );
  for (const shaderPath of EXTRACTED_SHADER_PATHS.slice(1)) {
    assert.equal(extractedPathCounts.get(shaderPath), 1, `${shaderPath} must represent one source unit`);
  }

  return {
    manifest,
    effectCount: effectIds.size,
    unitCount: unitIds.size,
    extractedFileCount: extractedPaths.size,
  };
}

export async function auditThirdPartyAssets({
  projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
} = {}) {
  for (const asset of FONT_ASSETS) {
    await assertRegularFile(projectRoot, asset.font, `${asset.name} font`);
    const licensePath = await assertRegularFile(
      projectRoot,
      asset.license,
      `${asset.name} license`,
    );
    const license = await readFile(licensePath, "utf8");
    assert.match(license, /SIL OPEN FONT LICENSE/i, `${asset.license} must contain the OFL`);
    assert.match(license, /Version 1\.1/i, `${asset.license} must contain OFL version 1.1`);
  }

  const noticePath = await assertRegularFile(
    projectRoot,
    "THIRD_PARTY_NOTICES.md",
    "third-party notice",
  );
  const notice = await readFile(noticePath, "utf8");
  for (const asset of FONT_ASSETS) {
    assert.ok(
      notice.toLocaleLowerCase("en").includes(asset.name.toLocaleLowerCase("en")),
      `THIRD_PARTY_NOTICES.md must credit ${asset.name}`,
    );
  }
  assert.match(notice, /Ashima/i, "THIRD_PARTY_NOTICES.md must credit Ashima Arts");
  assert.match(notice, /MIT License/i, "THIRD_PARTY_NOTICES.md must identify the MIT license");

  const simplexPath = await assertRegularFile(
    projectRoot,
    "lib/shaders/shared/simplex-noise-4d.glsl",
    "Ashima simplex source",
  );
  const ashimaLicensePath = await assertRegularFile(
    projectRoot,
    "lib/shaders/shared/ASHIMA-LICENSE.txt",
    "Ashima MIT license",
  );
  const simplexAndNotice = [
    await readFile(simplexPath, "utf8"),
    await readFile(ashimaLicensePath, "utf8"),
    notice,
  ].join("\n");
  for (const phrase of [
    /Permission is hereby granted, free of charge/i,
    /THE SOFTWARE IS PROVIDED [“"]AS IS[”"]/i,
    /copyright/i,
  ]) {
    assert.match(simplexAndNotice, phrase, "the complete Ashima MIT notice must be retained");
  }

  return { fontCount: FONT_ASSETS.length, noticePath: "THIRD_PARTY_NOTICES.md" };
}

async function main() {
  const extraction = await auditExtraction();
  const thirdParty = await auditThirdPartyAssets();
  process.stdout.write(
    `Extraction audit passed: ${extraction.unitCount} shader units, `
      + `${extraction.effectCount} effects, ${extraction.extractedFileCount} extracted files, `
      + `${thirdParty.fontCount} licensed fonts.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

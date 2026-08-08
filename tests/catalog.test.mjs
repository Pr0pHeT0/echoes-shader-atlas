import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const catalogUrl = new URL("../lib/catalog/effects.ts", import.meta.url);

async function loadCatalog() {
  const source = await readFile(catalogUrl, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "effects.ts",
    reportDiagnostics: true,
  });

  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(errors, []);

  const encoded = Buffer.from(result.outputText).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

test("catalog classifies the five recovered systems and authored point-field study", async () => {
  const { effectFamilies, effectStatuses, shaderEffects } = await loadCatalog();

  assert.deepEqual(
    shaderEffects.map(({ id, family, status }) => ({ id, family, status })),
    [
      { id: "aurora-field", family: "Procedural Backdrop", status: "active" },
      { id: "voice-wave-particles", family: "Audio Visualization", status: "active" },
      { id: "morphing-echoes-title", family: "Particle Typography", status: "active" },
      { id: "orb-to-scene-reveal", family: "Point-cloud Transition", status: "active" },
      { id: "audio-reactive-materialization", family: "GPGPU Materialization", status: "archived" },
      { id: "stylized-materialization", family: "Point-Cloud Styling", status: "active" },
    ],
  );
  assert.deepEqual(effectFamilies, [...new Set(shaderEffects.map((effect) => effect.family))]);
  assert.deepEqual(effectStatuses, ["active", "archived"]);

  for (const effect of shaderEffects) {
    assert.equal(effect.slug, effect.id);
    assert.equal(effect.runtime, effect.id);
    assert.ok(effect.drivers.length > 0);
    assert.ok(effect.techniques.length > 0);
    assert.ok(effect.primitives.length > 0);
    assert.ok(effect.presets.length > 0);
    assert.equal(new Set(effect.presets.map((preset) => preset.id)).size, effect.presets.length);
  }
});

test("source index retains 13 original units while deduplicating fullscreen GLSL", async () => {
  const { shaderSourceUnits } = await loadCatalog();

  assert.equal(shaderSourceUnits.length, 13);
  assert.equal(new Set(shaderSourceUnits.map((unit) => unit.id)).size, 13);
  assert.equal(shaderSourceUnits.filter((unit) => unit.sourceKind === "inline").length, 4);

  const extractedPaths = shaderSourceUnits.map((unit) => unit.extractedPath);
  assert.equal(new Set(extractedPaths).size, 12);
  assert.equal(
    extractedPaths.filter((path) => path === "lib/shaders/shared/fullscreen.vert.glsl").length,
    2,
  );
  assert.ok(
    shaderSourceUnits.some(
      (unit) => unit.id === "simplex-noise-4d"
        && unit.stage === "include"
        && unit.extractedPath === "lib/shaders/shared/simplex-noise-4d.glsl",
    ),
  );

  await Promise.all(
    [...new Set(extractedPaths)].map((path) => access(new URL(`../${path}`, import.meta.url))),
  );
});

test("catalog lookup, filters, and JSON serialization are deterministic", async () => {
  const { filterShaderEffects, getEffectBySlug, shaderEffects } = await loadCatalog();

  assert.equal(getEffectBySlug("orb-to-scene-reveal")?.name, "Orb-to-Scene Reveal");
  assert.equal(getEffectBySlug("not-a-real-effect"), undefined);
  assert.deepEqual(
    filterShaderEffects({ status: "archived" }).map((effect) => effect.id),
    ["audio-reactive-materialization"],
  );
  assert.deepEqual(
    filterShaderEffects({ family: "Particle Typography" }).map((effect) => effect.id),
    ["morphing-echoes-title"],
  );
  assert.deepEqual(
    filterShaderEffects({ driver: "pointer" }).map((effect) => effect.id),
    ["morphing-echoes-title"],
  );
  assert.deepEqual(
    filterShaderEffects({ driver: "local geometry" }).map((effect) => effect.id),
    ["audio-reactive-materialization", "stylized-materialization"],
  );
  assert.equal(
    getEffectBySlug("audio-reactive-materialization")?.drivers.some((driver) => driver.startsWith("Synthetic")),
    false,
  );

  const serialized = JSON.stringify(shaderEffects);
  assert.deepEqual(JSON.parse(serialized), shaderEffects);
  assert.equal(serialized.includes("function"), false);
});

test("Stylized Point Field documents three styles and three static target sources", async () => {
  const { getEffectBySlug } = await loadCatalog();
  const remix = getEffectBySlug("stylized-materialization");
  assert.ok(remix);

  const copy = JSON.stringify(remix);
  assert.match(copy, /target-tangent|tangent neon ribbons/i);
  assert.match(copy, /single-channel binary SDF|binary-led SDF/i);
  assert.match(copy, /shared blurred (?:pigment|splat) mask/i);
  assert.match(copy, /4 × 4 SDF/i);
  assert.match(copy, /base torus/i);
  assert.match(copy, /seeded terrain/i);
  assert.match(copy, /local GLB|browser-local GLB/i);
  assert.doesNotMatch(copy, /shared GPGPU flow|four-section reveal|section progress/i);
  assert.doesNotMatch(copy, /immutable 64-glyph ASCII atlas/i);
});

test("catalog SEO copy is unique, bounded, connected, and serializable", async () => {
  const { shaderEffects } = await loadCatalog();
  const effectIds = new Set(shaderEffects.map((effect) => effect.id));
  const titles = new Set();
  const descriptions = new Set();
  const keywords = new Set();

  for (const effect of shaderEffects) {
    const renderedTitle = `${effect.seo.title} | Echoes Shaders`;
    assert.ok(renderedTitle.length >= 45 && renderedTitle.length <= 60, renderedTitle);
    assert.ok(
      effect.seo.description.length >= 145 && effect.seo.description.length <= 160,
      `${effect.id} description is ${effect.seo.description.length} characters`,
    );
    assert.ok(effect.seo.primaryKeyword.toLowerCase().includes("three.js"));
    assert.ok(effect.seo.workflow.length >= 3);
    assert.equal(effect.seo.relatedEffectIds.length, 2);
    assert.equal(new Set(effect.seo.relatedEffectIds).size, 2);
    assert.equal(effect.seo.relatedEffectIds.includes(effect.id), false);
    for (const relatedId of effect.seo.relatedEffectIds) assert.ok(effectIds.has(relatedId));

    titles.add(effect.seo.title);
    descriptions.add(effect.seo.description);
    keywords.add(effect.seo.primaryKeyword);
  }

  assert.equal(titles.size, shaderEffects.length);
  assert.equal(descriptions.size, shaderEffects.length);
  assert.equal(keywords.size, shaderEffects.length);
});

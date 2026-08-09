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

test("Point-Cloud Materialization catalogs independent transitions and looping point motions", async () => {
  const { getEffectBySlug, shaderEffects } = await loadCatalog();
  const materialization = getEffectBySlug("audio-reactive-materialization");
  assert.ok(materialization);

  assert.equal(materialization.status, "archived");
  assert.deepEqual(
    materialization.presets.map(({ id }) => id),
    ["dormant", "materialize", "pulse", "dissolve"],
  );
  assert.deepEqual(
    materialization.presets.map(({ label }) => label),
    ["Cloud", "Materialize", "Flow Surge", "Dissolve"],
  );
  assert.deepEqual(materialization.transitionVariants, [
    {
      id: "organic-arc",
      label: "Organic",
      description: "Follows the current seeded tangent-space arc into the target.",
    },
    {
      id: "spiral-vortex",
      label: "Vortex",
      description: "Orbits the model-space vertical axis in a shrinking seeded spiral.",
    },
    {
      id: "radial-bloom",
      label: "Bloom",
      description: "Arrives center-out with a bounded surface-normal overshoot.",
    },
    {
      id: "traveling-wave",
      label: "Wave",
      description: "Builds bottom-to-top behind a traveling surface ripple.",
    },
  ]);
  assert.deepEqual(materialization.motionVariants, [
    {
      id: "gentle-drift",
      label: "Drift",
      description: "Loops each point through a small seeded tangent-space ellipse.",
    },
    {
      id: "orbital-current",
      label: "Orbit",
      description: "Carries points around the vertical axis in a gentle horizontal current.",
    },
    {
      id: "surface-breathe",
      label: "Breathe",
      description: "Pulses points along their surface normals with a slow shared breath.",
    },
    {
      id: "radial-ripple",
      label: "Ripple",
      description: "Sends repeating normal-offset rings across target radius.",
    },
    {
      id: "helical-twist",
      label: "Twist",
      description: "Turns height-phased points around the model-space vertical axis.",
    },
    {
      id: "tangent-flutter",
      label: "Flutter",
      description: "Traces a fine tangent-space Lissajous flutter around each point.",
    },
  ]);
  assert.deepEqual(
    shaderEffects.filter((effect) => effect.transitionVariants).map(({ id }) => id),
    ["audio-reactive-materialization"],
  );
  assert.deepEqual(
    shaderEffects.filter((effect) => effect.motionVariants).map(({ id }) => id),
    ["audio-reactive-materialization"],
  );

  const copy = JSON.stringify(materialization);
  assert.match(copy, /four reversible 3\.5-second transitions/i);
  assert.match(copy, /six independent looping motions|six continuous point motions/i);
  assert.match(copy, /organic arcs.+spiral vortex.+radial bloom.+traveling wave/is);
  assert.match(copy, /drift.+orbit.+breathe.+ripple.+twist.+flutter/is);
  assert.match(copy, /shared built-in and uploaded endpoints|same (?:built-in and uploaded )?endpoints/i);
  assert.match(copy, /polished alpha-hashed surface/i);
  assert.match(copy, /normal-offset sparks/i);
  assert.match(copy, /uploaded GLB.+dense anchored point surface/i);
  assert.match(copy, /extracted archival GLSL remains unchanged.+live TSL presentation intentionally departs/is);
  assert.doesNotMatch(
    copy,
    /four-stage|four[- ]section|section by section|section threshold|particle lifetime|lifetime reset|reveal sections|section count/i,
  );
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

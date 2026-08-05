import assert from "node:assert/strict";
import test from "node:test";

import { EFFECT_IDS, SOURCE_COMMIT } from "../scripts/audit-extraction.mjs";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;
const effectNames = new Map([
  ["aurora-field", "Aurora Field"],
  ["voice-wave-particles", "Voice Wave Particles"],
  ["morphing-echoes-title", "Morphing Echoes Title"],
  ["orb-to-scene-reveal", "Orb-to-Scene Reveal"],
  ["audio-reactive-materialization", "Audio-Reactive Materialization"],
]);

let workerPromise;

async function worker() {
  if (!workerPromise) {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    workerPromise = import(workerUrl.href).then(({ default: builtWorker }) => builtWorker);
  }
  return workerPromise;
}

async function render(pathname) {
  const builtWorker = await worker();
  return builtWorker.fetch(
    new Request(new URL(pathname, "http://atlas.local"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function renderedHtml(pathname, expectedStatus = 200) {
  const response = await render(pathname);
  assert.equal(response.status, expectedStatus, `${pathname} returned an unexpected status`);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  return response.text();
}

test("server-renders the complete classified atlas landing route", async () => {
  const html = await renderedHtml("/");

  assert.match(html, /<title>Echoes Shader Atlas<\/title>/i);
  assert.match(html, /Echoes Shader Atlas/i);
  assert.match(html, /<main\b/i);
  for (const effectId of EFFECT_IDS) {
    assert.match(html, new RegExp(effectNames.get(effectId), "i"));
    assert.match(html, new RegExp(`href=["']/effects/${effectId}["']`, "i"));
  }
  assert.match(html, /Procedural Backdrop/i);
  assert.match(html, /Audio Visualization/i);
  assert.match(html, /Particle Typography/i);
  assert.match(html, /Point-cloud Transition/i);
  assert.match(html, /GPGPU Materialization/i);
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|react-loading-skeleton/i);
});

test("server-renders every effect permalink with its own classified content", async (t) => {
  for (const effectId of EFFECT_IDS) {
    await t.test(effectId, async () => {
      const html = await renderedHtml(`/effects/${effectId}`);
      assert.match(html, new RegExp(effectNames.get(effectId), "i"));
      assert.match(html, /Source|GLSL/i);
      assert.match(html, /Preset/i);
      assert.match(html, /WebGL2/i);
      assert.match(html, /Echoes Shader Atlas/i);
      assert.match(html, /<meta[^>]+property=["']og:image["'][^>]+og\.png/i);
      assert.match(html, /<meta[^>]+name=["']twitter:image["'][^>]+og\.png/i);
    });
  }
});

test("server-renders extraction provenance and licensing on the about route", async () => {
  const html = await renderedHtml("/about");

  assert.match(html, /About|Extraction/i);
  assert.match(html, new RegExp(SOURCE_COMMIT));
  assert.match(html, /Thirteen source units|13\s+original units/i);
  assert.match(html, /MIT License|MIT-licensed/i);
  assert.match(html, /Ashima/i);
  assert.match(html, /SIL Open Font License|OFL/i);
});

test("unknown effect slugs return the not-found route", async () => {
  const html = await renderedHtml("/effects/not-a-real-shader", 404);
  assert.match(html, /not found|404/i);
});

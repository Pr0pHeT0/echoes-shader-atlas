import assert from "node:assert/strict";
import test from "node:test";

import { EFFECT_IDS } from "../lib/effects/types.ts";
import { SOURCE_COMMIT } from "../scripts/audit-extraction.mjs";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;
const effectNames = new Map([
  ["aurora-field", "Aurora Field"],
  ["voice-wave-particles", "Voice Wave Particles"],
  ["morphing-echoes-title", "Morphing Echoes Title"],
  ["orb-to-scene-reveal", "Orb-to-Scene Reveal"],
  ["audio-reactive-materialization", "Point-Cloud Materialization"],
  ["stylized-materialization", "Stylized Point Field"],
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

  assert.match(html, /<title>Open-Source GLSL Shader Examples \| Echoes Shaders<\/title>/i);
  assert.match(html, /<h1[^>]*>\s*Open-source[\s\S]*GLSL shaders\./i);
  assert.match(html, /Echoes Shaders/i);
  assert.match(html, /Open source shaders\./i);
  assert.doesNotMatch(html, /Pause motion/i);
  assert.match(html, /<main\b/i);
  for (const effectId of EFFECT_IDS) {
    assert.match(html, new RegExp(effectNames.get(effectId), "i"));
    assert.match(html, new RegExp(`href=["']/effects/${effectId}["']`, "i"));
    assert.match(html, new RegExp(`/effect-previews/${effectId}\\.png`, "i"));
  }
  assert.match(html, /Procedural Backdrop/i);
  assert.match(html, /Audio Visualization/i);
  assert.match(html, /Particle Typography/i);
  assert.match(html, /Point-cloud Transition/i);
  assert.match(html, /GPGPU Materialization/i);
  assert.match(html, /Point-Cloud Styling/i);
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|react-loading-skeleton/i);
});

test("server-renders every effect permalink with its own classified content", async (t) => {
  for (const effectId of EFFECT_IDS) {
    await t.test(effectId, async () => {
      const html = await renderedHtml(`/effects/${effectId}`);
      assert.match(html, new RegExp(effectNames.get(effectId), "i"));
      assert.match(html, /Source|GLSL/i);
      assert.match(html, effectId === "audio-reactive-materialization" ? /State/i : /Preset/i);
      assert.match(html, /aria-label=["']Renderer["']/i);
      assert.match(html, /WebGPU/i);
      assert.match(html, /WebGL2/i);
      assert.match(html, /Echoes Shaders/i);
      const socialImage =
        effectId === "stylized-materialization"
          ? /og-stylized-point-field\.png/i
          : /\/og\.png/i;
      assert.match(html.match(/<meta[^>]+property=["']og:image["'][^>]+/i)?.[0] ?? "", socialImage);
      assert.match(html.match(/<meta[^>]+name=["']twitter:image["'][^>]+/i)?.[0] ?? "", socialImage);
      if (effectId === "stylized-materialization") {
        assert.match(html, /tangent neon ribbons/i);
        assert.match(html, /binary SDF glyphs/i);
        assert.match(html, /shared blurred pigment mask/i);
        assert.match(html, /aria-label=["']Target["']/i);
        assert.match(html, />\s*Base\s*</i);
        assert.match(html, />\s*Terrain\s*</i);
        assert.match(html, /Upload…|Uploaded/i);
      }
      if (effectId === "audio-reactive-materialization") {
        assert.doesNotMatch(html, /aria-label=["']Preset["']/i);
        assert.match(html, /four reversible 3\.5-second transitions/i);
        assert.match(html, /six independent looping motions|six continuous point motions/i);
        assert.match(html, /organic arcs.+spiral vortex.+radial bloom.+traveling wave/is);
        assert.match(html, /drift.+orbit.+breathe.+ripple.+twist.+flutter/is);
        assert.match(html, /shared built-in and uploaded endpoints|same (?:built-in and uploaded )?endpoints/i);
        assert.match(html, /polished alpha-hashed surface/i);
        assert.match(html, /normal-offset sparks/i);
        assert.match(html, /uploaded GLB.+dense anchored point surface/is);
        assert.match(html, /extracted archival GLSL remains unchanged.+live TSL presentation intentionally departs/is);
        assert.match(
          html,
          /aria-label=["']Renderer["'][\s\S]+aria-label=["']State["'][\s\S]+aria-label=["']Transition["'][\s\S]+aria-label=["']Motion["'][\s\S]+aria-label=["']Playback["'][\s\S]+aria-label=["']Quality["']/i,
        );
        assert.match(html, />\s*Cloud\s*</i);
        assert.match(html, /<button[^>]*aria-pressed=["']true["'][^>]*>\s*Cloud\s*<\/button>/i);
        assert.match(html, />\s*Organic\s*</i);
        assert.match(html, />\s*Vortex\s*</i);
        assert.match(html, />\s*Bloom\s*</i);
        assert.match(html, />\s*Wave\s*</i);
        assert.match(html, />\s*Drift\s*</i);
        assert.match(html, /<button[^>]*aria-pressed=["']true["'][^>]*>\s*Organic\s*<\/button>/i);
        assert.match(html, /<button[^>]*aria-pressed=["']true["'][^>]*>\s*Drift\s*<\/button>/i);
        assert.match(html, />\s*Orbit\s*</i);
        assert.match(html, />\s*Breathe\s*</i);
        assert.match(html, />\s*Ripple\s*</i);
        assert.match(html, />\s*Twist\s*</i);
        assert.match(html, />\s*Flutter\s*</i);
        assert.doesNotMatch(
          html,
          /four-stage|four[- ]section|section by section|section threshold|particle lifetime|lifetime reset|reveal sections|section count/i,
        );
      } else {
        assert.doesNotMatch(html, /aria-label=["']Transition["']/i);
        assert.doesNotMatch(html, /aria-label=["']Motion["']/i);
      }
      if (["audio-reactive-materialization", "stylized-materialization"].includes(effectId)) {
        assert.match(
          html,
          effectId === "stylized-materialization"
            ? /Use your own model/i
            : /Materialize your own model/i,
        );
        assert.match(html, /type=["']file["'][^>]+accept=["']\.glb,model\/gltf-binary["']/i);
        assert.match(html, /never uploaded, stored/i);
        assert.match(html, /vertex colors/i);
        assert.match(
          html,
          effectId === "stylized-materialization"
            ? /deterministic surface frames/i
            : /adaptive point sizing/i,
        );
        assert.doesNotMatch(html, /Audio response, without a microphone/i);
      } else {
        assert.doesNotMatch(html, /type=["']file["']/i);
        assert.doesNotMatch(html, /Choose local GLB/i);
      }
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

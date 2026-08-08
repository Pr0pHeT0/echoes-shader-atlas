import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimePaths = [
  "aurora-field.ts",
  "voice-wave-particles.ts",
  "morphing-echoes-title.ts",
  "orb-to-scene-reveal.ts",
  "audio-reactive-materialization.ts",
];

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("all live effects use portable TSL node materials rather than WebGL-only shader materials", async () => {
  for (const filename of runtimePaths) {
    const runtime = await source(`lib/effects/runtimes/${filename}`);
    assert.match(runtime, /from ["']three\/webgpu["']/, `${filename} should use the WebGPU entrypoint`);
    assert.match(runtime, /from ["']three\/tsl["']/, `${filename} should define its shader with TSL`);
    assert.doesNotMatch(runtime, /\bShaderMaterial\b/, `${filename} must not depend on WebGL-only ShaderMaterial`);
    assert.doesNotMatch(runtime, /GPUComputationRenderer/, `${filename} must not use the WebGL GPGPU helper`);
    assert.doesNotMatch(runtime, /\.glsl\?raw/, `${filename} should leave extracted GLSL as archive source only`);
  }
});

test("the shared stage prefers WebGPU, retains WebGL2 fallback testing, and initializes asynchronously", async () => {
  const stage = await source("app/components/ShaderStage.tsx");
  const detail = await source("app/components/EffectDetail.tsx");
  const controller = await source("lib/effects/stage-controller.ts");
  const types = await source("lib/effects/types.ts");

  assert.match(stage, /import\(["']three\/webgpu["']\)/);
  assert.match(stage, /new THREE\.WebGPURenderer/);
  assert.match(stage, /forceWebGL/);
  assert.match(stage, /rendererMode === ["']webgl2["']/);
  assert.match(detail, /key=\{`\$\{effect\.id\}-\$\{rendererMode\}-\$\{quality\}-\$\{restartKey\}`\}/);
  assert.match(detail, /rendererMode=\{rendererMode\}/);
  assert.match(detail, /aria-label=["']Renderer["']/);
  assert.match(detail, /aria-pressed=\{rendererMode === value\}/);
  assert.match(detail, /url\.searchParams\.set\(["']renderer["'], ["']webgl2["']\)/);
  assert.match(detail, /url\.searchParams\.delete\(["']renderer["']\)/);
  assert.match(detail, /renderer_change/);
  assert.match(controller, /await (?:candidateRenderer|renderer)\.init\(\)/);
  assert.match(controller, /info\.api === ["']WebGPU["']/);
  assert.match(types, /renderer: WebGPURenderer/);
});

# Contributing to Echoes Shaders

Thanks for helping make realtime graphics easier to study. Contributions should improve the archive
without obscuring where the work came from or making the demo unsafe to open.

## Set up the project

Use Node.js `22.13` or newer.

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## Preserve the catalog contract

Effect metadata lives in `lib/catalog`. It must remain serializable: use strings, numbers, booleans,
arrays, plain objects, and `null`; do not put components, import callbacks, Three.js instances, or other
runtime objects in catalog entries.

Every effect needs:

- a stable ID and slug;
- one primary family and an active or archived status;
- driver, technique, and primitive classifications;
- concise public-facing context;
- at least one preset supported by its runtime; and
- source-unit records that point to the extracted GLSL paths.

Do not silently rename IDs or presets. They connect route generation, filters, runtime loading, tests,
and provenance records.

## Work on shader source

Treat `data/extraction-manifest.json` as the chain of custody for extracted GLSL. A shader change that is
intended to remain faithful to the source should preserve its equation, uniform defaults, timing,
colors, blending, and render-state behavior.

When adding an independently sourced effect:

1. Confirm that its license permits redistribution and modification.
2. Preserve the complete copyright and license notice.
3. Record the immutable source revision, original path, shader stage, consumer, extracted path, and
   SHA-256 digest.
4. Keep shared source as an explicit dependency rather than copying it into several files.
5. Add or update the catalog and extraction-audit tests.

Do not add a PLY, GLB, texture, font, recording, screenshot, or other asset without documented reuse
terms. Prefer small deterministic procedural geometry when the object itself is not essential to the
effect.

## Runtime expectations

Each runtime follows the shared lifecycle: create, set a preset, update, resize, and dispose. A runtime
must remove listeners, cancel its work, and dispose geometries, materials, textures, and render targets
when it is replaced.

Keep these project guarantees intact:

- no microphone permission, server-side uploads, persistence, accounts, arbitrary shader execution,
  or external API dependency; the bounded GLB importer processes model geometry and RGB color only in
  browser memory;
- capped device pixel ratio and bounded particle counts;
- pause work while the document is hidden;
- reduced-motion and WebGL-unavailable fallbacks; and
- keyboard-accessible controls with visible focus states.

## Pull requests

Keep changes focused and explain the visual or archival reason for them. Include the tests you ran and
call out intentional departures from the source behavior. Screenshots are useful for UI changes, but do
not commit third-party reference imagery unless it is licensed for redistribution.

By contributing, you agree that your contribution is licensed under this project's MIT License. This
does not replace or weaken the licenses of third-party fonts, shader utilities, or other attributed work.

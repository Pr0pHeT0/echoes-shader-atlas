# Echoes Shaders

An open-source field guide to five production WebGL shader systems, preserved as readable GLSL and
rebuilt in Three.js TSL for WebGPU with automatic WebGL2 fallback, plus one authored point-field
study. The project pairs live, interactive demonstrations with classification, presets, source
tabs, provenance, and practical implementation notes.

The site is built with React, TypeScript, vinext, and Three.js `0.185.0`. It is static by design:
there are no accounts, server uploads, microphone permissions, or persistence. The model-driven
studies can process a self-contained GLB locally in the browser; its bytes and derived point cloud never
leave the tab. Optional Google Analytics 4 measurement is consent-gated and the Google tag is not
loaded unless a visitor explicitly accepts.

## Catalog

| Effect | Family | Drivers | Status |
| --- | --- | --- | --- |
| Aurora Field | Procedural Backdrop | Time, optional synthetic audio | Active |
| Voice Wave Particles | Audio Visualization | Synthetic level, bass, mid, treble | Active |
| Morphing Echoes Title | Particle Typography | Time, pointer, font phase, preset state | Active |
| Orb-to-Scene Reveal | Point-cloud Transition | Time, reveal progress, particle lifetime | Active |
| Point-Cloud Materialization | GPGPU Materialization | Time, local geometry, vertex color, model complexity | Archived, fully demonstrated |
| Stylized Point Field | Point-Cloud Styling | Time, style preset, base/terrain/local geometry | Active authored study |

## Quick start

Requirements: Node.js `22.13` or newer and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server.

Useful checks:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## Deployment targets

The default `npm run build` keeps the project compatible with its Cloudflare Sites deployment.
Vercel uses a separate Nitro-backed vinext build so both hosting targets can coexist:

```bash
vercel link --yes --project echoes-shader-atlas --scope echoes
npm run build:vercel
vercel deploy --prebuilt --prod --scope echoes
```

Vercel project settings are committed in `vercel.json`; Nitro's generated Build Output API files and
the local project link both live under the intentionally ignored `.vercel` directory.

To enable optional analytics, set the public GA4 web-stream ID at build time. Omitting it disables
the analytics interface and all event collection:

```bash
vercel env add NEXT_PUBLIC_GA_MEASUREMENT_ID production --scope echoes
```

Production canonicals, Open Graph metadata, JSON-LD, `robots.txt`, `sitemap.xml`, and the web app
manifest all use `https://shader.echoes.art`. Search Console ownership is verified through a DNS TXT
record; retain that record to keep verification active.

## Routes

- `/` — immersive reel, classification filters, and the complete effect catalog.
- `/effects/[slug]` — one live study with presets, playback and quality controls, synthetic-audio
  controls where relevant, an optional browser-local GLB target for both model-driven point studies,
  source tabs, and implementation notes.
- `/about` — extraction method, taxonomy, provenance, asset policy, licenses, and contribution guide.
- `/privacy` — optional analytics disclosure and persistent consent controls.

## Project map

```text
app/                       Routes and shared interface components
lib/catalog/               Serializable effect taxonomy and source-unit index
lib/effects/               Runtime contract, stage controller, and effect implementations
lib/shaders/               Extracted GLSL organized by effect
data/extraction-manifest.json
                           Commit, original paths, stages, consumers, and SHA-256 digests
public/fonts/              Five OFL-licensed title font families and their license files
tests/                     Catalog, extraction, runtime, and rendered-route checks
```

`ShaderEffectMeta` is deliberately JSON-safe. Runtime implementations are addressed by an effect ID
and loaded separately, so catalog data can cross the server/client boundary without functions or
Three.js objects.

## Provenance and extraction

The source inventory was extracted from artifact commit
`d018f6d057c8f30144979bbcc95436cfb405d7c5`. It contains exactly 13 original shader units:

- four inline shader strings;
- eight standalone vertex, fragment, and GPGPU shader files; and
- the shared Ashima 4D simplex-noise include.

The two inline fullscreen vertex shaders are byte-identical and resolve to one shared extracted file,
but remain distinct records in the extraction manifest. Shader equations, uniforms, timing, defaults,
colors, blending, and fog behavior are preserved. The title copy is changed from the original product
wordmark to `ECHOES`.

To verify extraction integrity, run the repository test suite. The audit checks the fixed source commit,
effect and unit counts, source-to-output mapping, and digests.

## Procedural asset policy

The original PLY and GLB files are not redistributed because their reuse terms were not documented.
Their role is replaced, not imitated:

- Orb-to-Scene Reveal targets deterministic seeded terrain.
- Point-Cloud Materialization targets a segmented torus knot.

Visitors may temporarily replace that torus knot with their own self-contained GLB. The importer reads
only bounded triangle geometry, samples it into the existing particle budget, multiplies interpolated RGB
vertex colors by each mesh's base-material color, and adapts point size to valid triangle and mesh counts.
It does not transmit or store the file and restores the procedural target on refresh or navigation.

Audio-specific effects use generated control signals; Point-Cloud Materialization is model-driven and has
no audio control path. The site never requests microphone access and does not include the source project's
recordings, screenshots, models, or product branding.

## Rendering and accessibility

The shared stage prefers WebGPU and automatically falls back to WebGL2. It caps device pixel ratio at
`1.5`, uses a 16K constrained-device particle budget and a 64K standard budget, pauses when the document
is hidden, and releases GPU resources when effects change. Reduced-motion preferences disable continuous
movement, lost devices are rebuilt when possible, and unavailable GPU backends receive an accessible
static fallback. Effect pages expose a visible WebGPU/WebGL2 renderer selector; the WebGL2 choice is
mirrored to `?renderer=webgl2` so the forced fallback can also be linked and tested directly.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a shader or runtime change. Project code and
first-party extracted shaders are available under the [MIT License](LICENSE). Font licenses, the Ashima
notice, and runtime-library attributions are collected in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

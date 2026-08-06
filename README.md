# Echoes Shader Atlas

An open-source field guide to five production WebGL shader systems. The atlas pairs live,
interactive demonstrations with classification, presets, source tabs, provenance, and practical
implementation notes.

The site is built with React, TypeScript, vinext, and Three.js `0.185.0`. It is static by design:
there are no accounts, uploads, microphone permissions, or persistence. Optional Google Analytics 4
measurement is consent-gated and the Google tag is not loaded unless a visitor explicitly accepts.

## Catalog

| Effect | Family | Drivers | Status |
| --- | --- | --- | --- |
| Aurora Field | Procedural Backdrop | Time, optional synthetic audio | Active |
| Voice Wave Particles | Audio Visualization | Synthetic level, bass, mid, treble | Active |
| Morphing Echoes Title | Particle Typography | Time, pointer, font phase, preset state | Active |
| Orb-to-Scene Reveal | Point-cloud Transition | Time, reveal progress, particle lifetime | Active |
| Audio-Reactive Materialization | GPGPU Materialization | Time, synthetic audio, section count | Archived, fully demonstrated |

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
  controls where relevant, source tabs, and implementation notes.
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
- Audio-Reactive Materialization targets a segmented torus knot.

All audio-reactive effects use generated control signals. The site never requests microphone access and
does not include the source project's recordings, screenshots, models, or product branding.

## Rendering and accessibility

The shared WebGL stage caps device pixel ratio at `1.5`, uses a 16K constrained-device particle budget
and a 64K standard budget, pauses when the document is hidden, and releases GPU resources when effects
change. Reduced-motion preferences disable continuous movement, and unsupported or lost WebGL contexts
receive an accessible static fallback.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a shader or runtime change. Project code and
first-party extracted shaders are available under the [MIT License](LICENSE). Font licenses, the Ashima
notice, and runtime-library attributions are collected in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

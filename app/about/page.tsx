import type { Metadata } from "next";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { JsonLd } from "../components/JsonLd";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { shaderEffects, shaderSourceUnits } from "@/lib/catalog/effects";
import {
  createPageMetadata,
  SITE_CONTRIBUTING_URL,
  SITE_GITHUB_URL,
  SITE_MAINTAINER_NAME,
  SITE_MAINTAINER_URL,
  SITE_MANIFEST_URL,
  SITE_SOURCE_COMMIT,
  SITE_THREE_VERSION,
  SITE_UPDATED_DATE,
  SITE_URL,
} from "@/lib/site";

const description =
  "Read how five production GLSL shader systems were extracted, classified, licensed under MIT, tested, and rebuilt as reproducible Three.js studies.";

export const metadata: Metadata = createPageMetadata({
  title: "Open-Source GLSL Shader Archive",
  description,
  path: "/about",
  keywords: ["shader provenance", "shader extraction", "MIT License", "GLSL archive"],
});

const aboutStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "AboutPage",
      "@id": `${SITE_URL}/about#page`,
      url: `${SITE_URL}/about`,
      name: "Method & Provenance — Echoes Shader Atlas",
      description,
      inLanguage: "en",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      mainEntity: { "@id": `${SITE_URL}/#organization` },
      breadcrumb: { "@id": `${SITE_URL}/about#breadcrumb` },
      about: [
        { "@type": "Thing", name: "GLSL shader extraction" },
        { "@type": "Thing", name: "Open-source software provenance" },
      ],
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${SITE_URL}/about#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Shader Atlas", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Method & Provenance", item: `${SITE_URL}/about` },
      ],
    },
  ],
};

export default function AboutPage() {
  const activeCount = shaderEffects.filter((effect) => effect.status === "active").length;
  const archivedCount = shaderEffects.length - activeCount;

  return (
    <div className="site-shell" id="top">
      <JsonLd id="about-structured-data" data={aboutStructuredData} />
      <SiteHeader />

      <main className="page-main">
        <Breadcrumbs current="Method & Provenance" />
        <section className="about-hero" aria-labelledby="about-title">
          <div>
            <span className="eyebrow">Method / provenance / license</span>
            <h1 className="display-title" id="about-title">
              Production GLSL shaders, made legible.
            </h1>
          </div>
          <div>
            <p className="lead">
              Echoes Shader Atlas separates five visual systems from their original product context,
              preserves their shader logic, and presents each one as a documented, inspectable study.
            </p>
            <a className="text-link" href="/#catalog">
              Browse the five systems <span aria-hidden="true">↘</span>
            </a>
          </div>
        </section>

        <div className="section-grid">
          <section className="info-panel" aria-labelledby="inventory-heading">
            <span className="section-label">01 / Inventory</span>
            <h2 id="inventory-heading">Five systems. Thirteen source units.</h2>
            <p>
              The inventory covers every original shader unit in the selected source revision: four
              inline shader strings, eight standalone shader files, and one shared 4D simplex include.
            </p>
            <ul className="metadata-list">
              <li><strong>Effects</strong><span>{shaderEffects.length} classified systems</span></li>
              <li><strong>Source units</strong><span>{shaderSourceUnits.length} original units</span></li>
              <li><strong>Status</strong><span>{activeCount} active · {archivedCount} archived</span></li>
              <li><strong>Languages</strong><span>TypeScript · GLSL</span></li>
              <li><strong>Runtime</strong><span>Three.js {SITE_THREE_VERSION} · WebGL2</span></li>
              <li>
                <strong>Maintainer</strong>
                <span>
                  <a className="inline-link" href={SITE_MAINTAINER_URL} target="_blank" rel="noreferrer">
                    {SITE_MAINTAINER_NAME}
                  </a>
                </span>
              </li>
              <li>
                <strong>Verified</strong>
                <span><time dateTime={SITE_UPDATED_DATE}>August 6, 2026</time></span>
              </li>
            </ul>
          </section>

          <section className="info-panel" aria-labelledby="taxonomy-heading">
            <span className="section-label">02 / Taxonomy</span>
            <h2 id="taxonomy-heading">One primary family per system.</h2>
            <p>
              Families describe the dominant visual behavior. Drivers and techniques remain separate,
              so an audio-reactive flow field is searchable by what moves it and how it is built.
            </p>
            <ul className="metadata-list">
              {shaderEffects.map((effect) => (
                <li key={effect.id}>
                  <strong>{String(effect.index).padStart(2, "0")} · {effect.status}</strong>
                  <span>
                    <a className="inline-link" href={`/effects/${effect.slug}`}>
                      {effect.name} / {effect.family}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="info-panel" aria-labelledby="provenance-heading">
            <span className="section-label">03 / Provenance</span>
            <h2 id="provenance-heading">A reproducible extraction.</h2>
            <p>
              All source was read from artifact commit <code>{SITE_SOURCE_COMMIT}</code>. The manifest records
              each original path, inline symbol where applicable, shader stage, consuming effect,
              extracted path, and SHA-256 digest. The{" "}
              <a className="inline-link" href={SITE_MANIFEST_URL} target="_blank" rel="noreferrer">
                machine-readable extraction manifest
              </a>{" "}
              makes the inventory independently reviewable.
            </p>
            <p>
              Shader equations, uniforms, default timing, colors, blending, and fog behavior are kept.
              The two identical inline fullscreen vertex strings resolve to one shared extracted file,
              while remaining two distinct provenance records.
            </p>
          </section>

          <section className="info-panel" aria-labelledby="assets-heading">
            <span className="section-label">04 / Procedural asset policy</span>
            <h2 id="assets-heading">The effect, not the borrowed object.</h2>
            <p>
              The source PLY terrain and GLB pendant are intentionally not redistributed because their
              reuse terms were not documented. Orb-to-Scene Reveal uses deterministic seeded terrain;
              Materialization uses a segmented torus knot.
            </p>
            <p>
              Synthetic audio drives all reactive demonstrations, so the atlas never asks for microphone
              access or ships recordings. The particle title changes only its copy, from the original
              product wordmark to the neutral word ECHOES.
            </p>
          </section>

          <section className="info-panel" aria-labelledby="license-heading">
            <span className="section-label">05 / Licensing</span>
            <h2 id="license-heading">Open, with attribution intact.</h2>
            <p>
              Atlas code and first-party extracted shaders are released under the MIT License. The 4D
              simplex implementation by Ian McEwan and Ashima Arts retains its MIT notice.
            </p>
            <p>
              Oxanium, Tektur, Bruno Ace SC, Chakra Petch, and Orbitron remain under the SIL Open Font
              License 1.1. Their original license files ship beside the font files; the root third-party
              notices file collects attribution and paths in one place.
            </p>
            <a className="text-link" href="https://opensource.org/license/mit" target="_blank" rel="noreferrer">
              Read the MIT License <span aria-hidden="true">↗</span>
            </a>
          </section>

          <section className="info-panel" aria-labelledby="contributing-heading">
            <span className="section-label">06 / Contributing</span>
            <h2 id="contributing-heading">Keep the archive precise.</h2>
            <p>
              Contributions should preserve provenance, deterministic fallbacks, accessibility, and the
              serializable catalog contract. New effects need a documented source license, a bounded
              runtime lifecycle, and a useful non-WebGL fallback.
            </p>
            <p>
              Start with the{" "}
              <a className="inline-link" href={SITE_CONTRIBUTING_URL} target="_blank" rel="noreferrer">
                contribution guide
              </a>{" "}
              for local commands, shader extraction rules, testing, and pull-request expectations.
              Shader editing and arbitrary uploaded code are deliberately outside the v1 project.
            </p>
            <a className="text-link" href={SITE_GITHUB_URL} target="_blank" rel="noreferrer">
              Inspect the GitHub source <span aria-hidden="true">↗</span>
            </a>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EffectDetail } from "@/app/components/EffectDetail";
import { JsonLd } from "@/app/components/JsonLd";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { getEffectBySlug, shaderEffects } from "@/lib/catalog/effects";
import {
  createPageMetadata,
  SITE_GITHUB_URL,
  SITE_LICENSE_URL,
  SITE_MAINTAINER_NAME,
  SITE_MAINTAINER_URL,
  SITE_PUBLISHED_DATE,
  SITE_SOURCE_COMMIT,
  SITE_THREE_VERSION,
  SITE_UPDATED_DATE,
  SITE_URL,
} from "@/lib/site";

type EffectPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return shaderEffects.map((effect) => ({ slug: effect.slug }));
}

export async function generateMetadata({ params }: EffectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const effect = getEffectBySlug(slug);
  if (!effect) return {};

  return createPageMetadata({
    title: effect.seo.title,
    description: effect.seo.description,
    path: `/effects/${effect.slug}`,
    keywords: [effect.seo.primaryKeyword, effect.family, ...effect.drivers, ...effect.techniques],
  });
}

export default async function EffectPage({ params }: EffectPageProps) {
  const { slug } = await params;
  const effect = getEffectBySlug(slug);
  if (!effect) notFound();

  const effectUrl = `${SITE_URL}/effects/${effect.slug}`;
  const relatedEffects = effect.seo.relatedEffectIds
    .map((effectId) => shaderEffects.find((candidate) => candidate.id === effectId))
    .filter((candidate): candidate is (typeof shaderEffects)[number] => Boolean(candidate));
  const effectStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareSourceCode",
        "@id": `${effectUrl}#source-code`,
        url: effectUrl,
        name: effect.name,
        headline: effect.seo.title,
        description: effect.seo.description,
        abstract: effect.summary,
        inLanguage: "en",
        codeRepository: SITE_GITHUB_URL,
        license: SITE_LICENSE_URL,
        version: "1.0.0",
        identifier: {
          "@type": "PropertyValue",
          name: "Original artifact source commit",
          value: SITE_SOURCE_COMMIT,
        },
        author: {
          "@type": "Person",
          name: SITE_MAINTAINER_NAME,
          url: SITE_MAINTAINER_URL,
        },
        datePublished: SITE_PUBLISHED_DATE,
        dateModified: SITE_UPDATED_DATE,
        isAccessibleForFree: true,
        programmingLanguage: ["GLSL", "TypeScript", "TSL"],
        runtimePlatform: `WebGPU with automatic WebGL2 fallback in Three.js ${SITE_THREE_VERSION}`,
        codeSampleType: "full",
        creativeWorkStatus: effect.statusLabel,
        keywords: [effect.seo.primaryKeyword, effect.family, ...effect.drivers, ...effect.techniques],
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntityOfPage: { "@id": `${effectUrl}#page` },
        hasPart: effect.sourceUnits.map((unit) => ({
          "@type": "SoftwareSourceCode",
          name: unit.label,
          identifier: unit.id,
          url: `${SITE_GITHUB_URL}/blob/main/${unit.extractedPath}`,
          programmingLanguage: "GLSL",
          codeSampleType: unit.stageLabel,
        })),
      },
      {
        "@type": "WebPage",
        "@id": `${effectUrl}#page`,
        url: effectUrl,
        name: `${effect.name} — Echoes Shaders`,
        description: effect.summary,
        datePublished: SITE_PUBLISHED_DATE,
        dateModified: SITE_UPDATED_DATE,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: { "@id": `${effectUrl}#source-code` },
        breadcrumb: { "@id": `${effectUrl}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${effectUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Echoes Shaders", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: effect.name, item: effectUrl },
        ],
      },
    ],
  };

  return (
    <div className="site-shell" id="top">
      <JsonLd id="effect-structured-data" data={effectStructuredData} />
      <SiteHeader floating />
      <main>
        <EffectDetail key={effect.id} effect={effect} />
        <section className="related-studies" aria-labelledby="related-studies-title">
          <div className="related-studies__heading">
            <div>
              <span className="section-kicker">Related shader studies</span>
              <h2 id="related-studies-title">Continue through the shaders.</h2>
            </div>
            <p>
              Compare another Three.js shader example by its input signal, point pipeline, and
              extracted GLSL source.
            </p>
          </div>
          <div className="related-studies__grid">
            {relatedEffects.map((related) => (
              <a
                className="related-study"
                href={`/effects/${related.slug}`}
                key={related.id}
                style={{ "--related-accent": related.accent.primary } as React.CSSProperties}
              >
                <span>{related.seo.primaryKeyword}</span>
                <strong>{related.name}</strong>
                <p>{related.summary}</p>
                <span>Explore {related.shortName} shader study →</span>
              </a>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

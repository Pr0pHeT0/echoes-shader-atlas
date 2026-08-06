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
  SITE_SOURCE_COMMIT,
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
    title: effect.name,
    description: effect.summary,
    path: `/effects/${effect.slug}`,
    keywords: [effect.family, ...effect.drivers, ...effect.techniques],
  });
}

export default async function EffectPage({ params }: EffectPageProps) {
  const { slug } = await params;
  const effect = getEffectBySlug(slug);
  if (!effect) notFound();

  const effectUrl = `${SITE_URL}/effects/${effect.slug}`;
  const effectStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareSourceCode",
        "@id": `${effectUrl}#source-code`,
        url: effectUrl,
        name: effect.name,
        headline: effect.name,
        description: effect.description,
        abstract: effect.summary,
        inLanguage: "en",
        codeRepository: SITE_GITHUB_URL,
        license: SITE_LICENSE_URL,
        version: SITE_SOURCE_COMMIT,
        programmingLanguage: ["GLSL", "TypeScript"],
        runtimePlatform: "WebGL2 with Three.js 0.185.0",
        codeSampleType: "full",
        creativeWorkStatus: effect.statusLabel,
        keywords: [effect.family, ...effect.drivers, ...effect.techniques],
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
        name: `${effect.name} — Echoes Shader Atlas`,
        description: effect.summary,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: { "@id": `${effectUrl}#source-code` },
        breadcrumb: { "@id": `${effectUrl}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${effectUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Shader Atlas", item: `${SITE_URL}/` },
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
      </main>
      <SiteFooter />
    </div>
  );
}

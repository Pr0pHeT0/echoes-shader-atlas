import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EffectDetail } from "@/app/components/EffectDetail";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { getEffectBySlug, shaderEffects } from "@/lib/catalog/effects";

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

  return {
    title: effect.name,
    description: effect.summary,
    openGraph: {
      title: `${effect.name} — Echoes Shader Atlas`,
      description: effect.summary,
      images: [{
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Echoes Shader Atlas particle orb and terrain",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${effect.name} — Echoes Shader Atlas`,
      description: effect.summary,
      images: ["/og.png"],
    },
  };
}

export default async function EffectPage({ params }: EffectPageProps) {
  const { slug } = await params;
  const effect = getEffectBySlug(slug);
  if (!effect) notFound();

  return (
    <div className="site-shell" id="top">
      <SiteHeader floating />
      <main>
        <EffectDetail key={effect.id} effect={effect} />
      </main>
      <SiteFooter />
    </div>
  );
}

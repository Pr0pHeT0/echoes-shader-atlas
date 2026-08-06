import type { Metadata } from "next";
import { JsonLd } from "./components/JsonLd";
import { HomeGallery } from "./components/HomeGallery";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { shaderEffects } from "@/lib/catalog/effects";
import { createPageMetadata, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = createPageMetadata({
  title: "Open-Source GLSL Shader Examples",
  path: "/",
  description: SITE_DESCRIPTION,
  keywords: ["GLSL shader gallery", "Three.js examples", "WebGL demos"],
});

const collectionStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${SITE_URL}/#collection`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      headline: "Open-source GLSL shaders, made legible.",
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      mainEntity: { "@id": `${SITE_URL}/#effect-list` },
      about: ["GLSL", "Three.js", "WebGL2", "GPGPU", "particle systems"],
    },
    {
      "@type": "ItemList",
      "@id": `${SITE_URL}/#effect-list`,
      name: "Five classified shader systems",
      numberOfItems: shaderEffects.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: shaderEffects.map((effect) => ({
        "@type": "ListItem",
        position: effect.index,
        url: `${SITE_URL}/effects/${effect.slug}`,
        name: effect.name,
        description: effect.seo.description,
      })),
    },
  ],
};

export default function Home() {
  return (
    <div className="site-shell" id="top">
      <JsonLd id="collection-structured-data" data={collectionStructuredData} />
      <SiteHeader floating />
      <main>
        <HomeGallery />
      </main>
      <SiteFooter />
    </div>
  );
}

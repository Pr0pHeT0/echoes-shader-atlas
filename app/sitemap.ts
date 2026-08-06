import type { MetadataRoute } from "next";
import { shaderEffects } from "@/lib/catalog/effects";
import { absoluteUrl, SITE_UPDATED_DATE } from "@/lib/site";

const lastModified = new Date(`${SITE_UPDATED_DATE}T00:00:00.000Z`);

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...shaderEffects.map((effect) => ({
      url: absoluteUrl(`/effects/${effect.slug}`),
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    {
      url: absoluteUrl("/about"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/privacy"),
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

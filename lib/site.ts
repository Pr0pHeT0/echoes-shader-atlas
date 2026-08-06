import type { Metadata } from "next";

export const SITE_NAME = "Echoes Shader Atlas";
export const SITE_URL = "https://shader.echoes.art";
export const SITE_DESCRIPTION =
  "Five production GLSL shader systems, extracted, classified, and rebuilt as open-source Three.js studies.";
export const SITE_SOCIAL_DESCRIPTION =
  "A living visual index of production GLSL, particle systems, and GPGPU transitions.";
export const SITE_GITHUB_URL = "https://github.com/Pr0pHeT0/echoes-shader-atlas";
export const SITE_LICENSE_URL = `${SITE_GITHUB_URL}/blob/main/LICENSE`;
export const SITE_SOURCE_COMMIT = "d018f6d057c8f30144979bbcc95436cfb405d7c5";
export const SITE_SOCIAL_IMAGE = `${SITE_URL}/og.png`;

export const SITE_KEYWORDS = [
  "GLSL",
  "Three.js",
  "WebGL2",
  "shaders",
  "GPGPU",
  "particle systems",
  "creative coding",
  "open source",
] as const;

export function absoluteUrl(path = "/"): string {
  return new URL(path, `${SITE_URL}/`).toString();
}

type PageMetadataOptions = {
  title?: string;
  description?: string;
  path: string;
  keywords?: readonly string[];
};

/** Build consistent, production-canonical metadata for a public Atlas route. */
export function createPageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path,
  keywords = [],
}: PageMetadataOptions): Metadata {
  const canonical = absoluteUrl(path);
  const socialTitle = title ? `${title} — ${SITE_NAME}` : SITE_NAME;

  return {
    title: title ?? { absolute: SITE_NAME },
    description,
    keywords: [...SITE_KEYWORDS, ...keywords],
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: canonical,
      siteName: SITE_NAME,
      title: socialTitle,
      description,
      images: [
        {
          url: SITE_SOCIAL_IMAGE,
          width: 1200,
          height: 630,
          alt: "Echoes Shader Atlas particle orb opening into a procedural terrain",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [SITE_SOCIAL_IMAGE],
    },
  };
}

import type { Metadata } from "next";

export const SITE_NAME = "Echoes Shaders";
export const SITE_URL = "https://shader.echoes.art";
export const SITE_DESCRIPTION =
  "Explore five open-source GLSL shader examples built with Three.js: live WebGL2 aurora, audio particles, type morphs, and GPGPU reveals with readable source.";
export const SITE_SOCIAL_DESCRIPTION =
  "Live GLSL and WebGL2 shader studies with readable source, interactive controls, and open Three.js implementations.";
export const SITE_GITHUB_URL = "https://github.com/Pr0pHeT0/echoes-shader-atlas";
export const SITE_MAINTAINER_NAME = "Pr0pHeT0";
export const SITE_MAINTAINER_URL = "https://github.com/Pr0pHeT0";
export const SITE_LICENSE_URL = `${SITE_GITHUB_URL}/blob/main/LICENSE`;
export const SITE_MANIFEST_URL = `${SITE_GITHUB_URL}/blob/main/data/extraction-manifest.json`;
export const SITE_NOTICES_URL = `${SITE_GITHUB_URL}/blob/main/THIRD_PARTY_NOTICES.md`;
export const SITE_CONTRIBUTING_URL = `${SITE_GITHUB_URL}/blob/main/CONTRIBUTING.md`;
export const SITE_SOURCE_COMMIT = "d018f6d057c8f30144979bbcc95436cfb405d7c5";
export const SITE_THREE_VERSION = "0.185.0";
export const SITE_PUBLISHED_DATE = "2026-08-06";
export const SITE_UPDATED_DATE = "2026-08-06";
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

/** Build consistent, production-canonical metadata for a public site route. */
export function createPageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path,
  keywords = [],
}: PageMetadataOptions): Metadata {
  const canonical = absoluteUrl(path);
  const socialTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;

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
          alt: "Echoes Shaders particle orb opening into procedural terrain",
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

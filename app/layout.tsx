import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "./components/GoogleAnalytics";
import { JsonLd } from "./components/JsonLd";
import {
  SITE_DESCRIPTION,
  SITE_GITHUB_URL,
  SITE_KEYWORDS,
  SITE_MAINTAINER_NAME,
  SITE_MAINTAINER_URL,
  SITE_NAME,
  SITE_PUBLISHED_DATE,
  SITE_SOCIAL_DESCRIPTION,
  SITE_SOCIAL_IMAGE,
  SITE_UPDATED_DATE,
  SITE_URL,
} from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  keywords: [...SITE_KEYWORDS],
  authors: [
    { name: SITE_MAINTAINER_NAME, url: SITE_MAINTAINER_URL },
    { name: `${SITE_NAME} contributors`, url: SITE_GITHUB_URL },
  ],
  creator: SITE_MAINTAINER_NAME,
  publisher: SITE_NAME,
  category: "Technology",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_SOCIAL_DESCRIPTION,
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
    title: SITE_NAME,
    description: SITE_SOCIAL_DESCRIPTION,
    images: [SITE_SOCIAL_IMAGE],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#050607",
};

const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      datePublished: SITE_PUBLISHED_DATE,
      dateModified: SITE_UPDATED_DATE,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: "An open-source library and visual showcase for GLSL shader systems.",
      sameAs: [SITE_GITHUB_URL],
      founder: {
        "@type": "Person",
        name: SITE_MAINTAINER_NAME,
        url: SITE_MAINTAINER_URL,
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <JsonLd id="site-structured-data" data={siteStructuredData} />
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  );
}

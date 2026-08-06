import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "./components/GoogleAnalytics";
import { JsonLd } from "./components/JsonLd";
import {
  SITE_DESCRIPTION,
  SITE_GITHUB_URL,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_SOCIAL_DESCRIPTION,
  SITE_SOCIAL_IMAGE,
  SITE_URL,
} from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
  keywords: [...SITE_KEYWORDS],
  authors: [{ name: `${SITE_NAME} contributors`, url: SITE_GITHUB_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Technology",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
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
        alt: "Echoes Shader Atlas particle orb opening into a procedural terrain",
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
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: "An open-source archive and visual showcase for production shader systems.",
      sameAs: [SITE_GITHUB_URL],
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

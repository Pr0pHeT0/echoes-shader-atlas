import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const description =
    "Five production shader systems, extracted, classified, and rebuilt as open-source Three.js studies.";
  const socialImage = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title: {
      default: "Echoes Shader Atlas",
      template: "%s — Echoes Shader Atlas",
    },
    description,
    applicationName: "Echoes Shader Atlas",
    keywords: ["GLSL", "Three.js", "WebGL", "shaders", "GPGPU", "creative coding"],
    authors: [{ name: "Echoes Shader Atlas contributors" }],
    creator: "Echoes Shader Atlas",
    openGraph: {
      type: "website",
      siteName: "Echoes Shader Atlas",
      title: "Echoes Shader Atlas",
      description: "A living visual index of production GLSL, particle systems, and GPGPU transitions.",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "Echoes Shader Atlas particle orb and terrain" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Echoes Shader Atlas",
      description: "A living visual index of production GLSL, particle systems, and GPGPU transitions.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

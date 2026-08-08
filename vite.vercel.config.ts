import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import vinext from "vinext";
import { defineConfig } from "vite";

// Nitro's build-time crawler omits a User-Agent. Mark its requests as
// prerenders so vinext resolves generated metadata into <head> instead of
// streaming it after the document body.
process.env.VINEXT_PRERENDER = "1";

const publicRoutes = [
  "/",
  "/about",
  "/privacy",
  "/effects/aurora-field",
  "/effects/voice-wave-particles",
  "/effects/morphing-echoes-title",
  "/effects/orb-to-scene-reveal",
  "/effects/audio-reactive-materialization",
  "/effects/stylized-materialization",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
];

export default defineConfig({
  plugins: [
    tailwindcss(),
    vinext({ prerender: true }),
    nitro({
      prerender: {
        routes: publicRoutes,
        crawlLinks: false,
        failOnError: true,
      },
    }),
  ],
});

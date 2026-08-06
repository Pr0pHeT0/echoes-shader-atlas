import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep canonical, description, and social metadata in <head> for every
  // crawler and browser. The site has only eight static public routes, so
  // streaming metadata adds no useful tradeoff here.
  htmlLimitedBots: /.*/,
};

export default nextConfig;

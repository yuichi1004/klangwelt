import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static output: no serverless functions, no middleware.
  // Keeps the whole site inside Vercel's free tier (bandwidth only).
  output: "export",
  images: {
    // Portraits are self-hosted under /public/portraits, so we skip
    // Vercel's Image Optimization entirely (it is unavailable in `export`).
    unoptimized: true,
  },
};

export default nextConfig;

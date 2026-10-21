import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // An import sends up to 500 posts of up to 3,000 characters to a server action (lib/import/posts.ts).
    serverActions: { bodySizeLimit: "3mb" },
  },
  // Dev only: lets `next dev` serve its dev runtime and hot reload to a tunnel, which is needed to test Bachs
  // payments locally (Bachs won't return to localhost). Without it the page loads but never hydrates there.
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

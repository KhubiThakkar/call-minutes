import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page is auth-gated and shows live, per-request shared-ledger data
  // for exactly 2 users — no prerendering benefit, just Suspense boilerplate.
  // Use the classic (pre-16) caching model instead of Cache Components.
  cacheComponents: false,
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

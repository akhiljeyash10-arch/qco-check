import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components / Partial Prefetching are disabled: this app is
  // predominantly dynamic (DB-backed compliance checks), so the standard
  // per-route `export const dynamic` model is simpler and sufficient for V1.
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

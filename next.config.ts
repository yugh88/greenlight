import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  // PGlite (embedded fallback DB) loads its WASM + data files at runtime; keep it out of the bundle so they're traced.
  serverExternalPackages: ["@electric-sql/pglite"],
  async rewrites() {
    return [{ source: "/guides/:slug.md", destination: "/api/md/:slug" }];
  },
};

export default nextConfig;

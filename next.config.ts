import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  async rewrites() {
    return [{ source: "/guides/:slug.md", destination: "/api/md/:slug" }];
  },
};

export default nextConfig;

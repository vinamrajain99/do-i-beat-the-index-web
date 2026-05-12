import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1 MB; our `csvs` storage bucket allows up to 10 MB.
      // Bump to 12 MB to leave room for FormData overhead.
      // See: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md
      bodySizeLimit: "12mb",
    },
  },
  // In dev, proxy /api/analyze to the standalone Python server started by
  // `scripts/dev_python_server.py` (default port 3001). In prod, Vercel
  // serves api/analyze.py directly, so this rewrite does nothing.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const port = process.env.PY_DEV_PORT ?? "3001";
    return [
      {
        source: "/api/analyze",
        destination: `http://127.0.0.1:${port}/api/analyze`,
      },
    ];
  },
};

export default nextConfig;

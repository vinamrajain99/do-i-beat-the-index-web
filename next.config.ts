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
};

export default nextConfig;

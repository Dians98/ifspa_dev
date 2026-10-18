import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Polices lues sur disque par @react-pdf : à embarquer dans le build standalone.
  outputFileTracingIncludes: {
    "/api/pdf/*": ["src/pdf/polices/**/*", "public/brand/**/*"],
  },
  // Figée au build : chaque déploiement installe un nouveau service worker et remplace son cache.
  env: { NEXT_PUBLIC_VERSION_BUILD: Date.now().toString(36) },
  // Reprise des données : 1 Mo de fichiers, plus l'enveloppe multipart du FormData.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  async headers() {
    return [
      {
        source: "/sw-encaisser.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;

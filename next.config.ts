import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production sur cPanel (Setup Node.js App) : serveur autonome `server.js`, sans node_modules complet à envoyer.
  output: "standalone",
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
        source: "/:path*",
        headers: [
          // Ignoré par les navigateurs en http (localhost) : n'agit qu'une fois le site servi en https.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
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

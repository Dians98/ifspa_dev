import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Polices lues sur disque par @react-pdf : à embarquer dans le build standalone.
  outputFileTracingIncludes: {
    "/api/pdf/*": ["src/pdf/polices/**/*", "public/brand/**/*"],
  },
};

export default nextConfig;

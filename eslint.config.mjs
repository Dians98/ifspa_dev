import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Client Prisma généré
    "src/generated/**",
    // Outils d'agents IA (skills, maquettes)
    ".claude/**",
    ".agents/**",
    ".windsurf/**",
    ".impeccable/**",
    // Maquettes HTML statiques
    "prototype/**",
  ]),
]);

export default eslintConfig;

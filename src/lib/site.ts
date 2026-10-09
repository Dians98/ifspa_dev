// Adresse publique du site, figée au build (voir la phase 8 de docs/PLAN.md : le .env de build porte le vrai domaine).
export const URL_SITE = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100").replace(/\/$/, "");

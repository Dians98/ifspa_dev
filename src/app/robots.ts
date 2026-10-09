import type { MetadataRoute } from "next";
import { URL_SITE } from "@/lib/site";

// /connexion reste explorable pour que les moteurs lisent son « noindex » ; l'espace connecté et l'API ne le sont pas.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app/", "/api/"] },
    sitemap: `${URL_SITE}/sitemap.xml`,
  };
}

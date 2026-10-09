import type { MetadataRoute } from "next";
import { URL_SITE } from "@/lib/site";

// Seule la landing est publique et indexable.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${URL_SITE}/`, changeFrequency: "monthly", priority: 1 }];
}

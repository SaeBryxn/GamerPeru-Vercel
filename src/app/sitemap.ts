import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/seo/sitemap-entries";

export const revalidate = 3600;

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap();
}

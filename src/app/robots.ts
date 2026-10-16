import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seo/sitemap-entries";

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}

import "server-only";
import { and, eq } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/config/app";
import { COOKIE_POLICY } from "@/content/legal/cookies";
import { PRIVACY_POLICY } from "@/content/legal/privacy";
import { TERMS_OF_SERVICE } from "@/content/legal/terms";
import { BUYING_GUIDES } from "@/content/guides";
import { SOFTWARE_KIND_PAGES } from "@/content/software/kinds";
import { db } from "@/db";
import { brands, categories, products } from "@/db/schema";
import { cacheCatalogQuery } from "@/lib/catalog/catalog-cache";
import { resolveCatalogReaderMode } from "@/lib/catalog/resolve-reader-mode";
import { buyingGuidePath } from "@/lib/guides/guide-seo";

const ORIGIN = `https://${APP_CONFIG.canonicalHost}`;

/** Indexable pages that exist regardless of catalog state. */
export function staticSitemapPaths(): string[] {
  return [
    "/",
    "/productos",
    "/buscar",
    "/soporte",
    "/soporte/preguntas-frecuentes",
    "/soporte/contacto",
    "/soporte/distribuidores",
    "/soporte/tienda-oficial",
    "/software",
    ...SOFTWARE_KIND_PAGES.map((page) => `/software/${page.kind}`),
    ...BUYING_GUIDES.map((guide) => buyingGuidePath(guide.slug)),
    ...[PRIVACY_POLICY, TERMS_OF_SERVICE, COOKIE_POLICY].map((doc) => `/legal/${doc.slug}`),
  ];
}

interface CatalogSitemapRows {
  categories: { slug: string; updatedAt: Date | string }[];
  brands: { slug: string; updatedAt: Date | string }[];
  products: { slug: string; updatedAt: Date | string }[];
}

const readCatalogSitemapRows = cacheCatalogQuery(
  "catalog-sitemap-rows",
  async (): Promise<CatalogSitemapRows> => {
    const [categoryRows, brandRows, productRows] = await Promise.all([
      db
        .select({ slug: categories.slug, updatedAt: categories.updatedAt })
        .from(categories)
        .where(eq(categories.status, "PUBLISHED")),
      db
        .select({ slug: brands.slug, updatedAt: brands.updatedAt })
        .from(brands)
        .where(eq(brands.status, "PUBLISHED")),
      db
        .select({ slug: products.slug, updatedAt: products.updatedAt })
        .from(products)
        .innerJoin(brands, eq(brands.id, products.brandId))
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(
          and(
            eq(products.status, "PUBLISHED"),
            eq(brands.status, "PUBLISHED"),
            eq(categories.status, "PUBLISHED")
          )
        ),
    ]);
    return { categories: categoryRows, brands: brandRows, products: productRows };
  }
);

function toEntries(
  prefix: string,
  rows: { slug: string; updatedAt: Date | string }[]
): MetadataRoute.Sitemap {
  // Cached rows come back from JSON, so dates may arrive as strings.
  return rows.map((row) => ({
    url: `${ORIGIN}${prefix}/${row.slug}`,
    lastModified: new Date(row.updatedAt),
  }));
}

/**
 * Static pages plus published categories, brands and products. Fail-soft: a database problem
 * yields the static pages only instead of an error page for crawlers.
 */
export async function buildSitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticSitemapPaths().map((path) => ({
    url: `${ORIGIN}${path}`,
  }));

  if (resolveCatalogReaderMode() === "e2e-fixture") return staticEntries;

  try {
    const rows = await readCatalogSitemapRows();
    return [
      ...staticEntries,
      ...toEntries("/categorias", rows.categories),
      ...toEntries("/marcas", rows.brands),
      ...toEntries("/productos", rows.products),
    ];
  } catch {
    return staticEntries;
  }
}

/** Private, transactional and API paths crawlers should not index. */
export const ROBOTS_DISALLOW = ["/admin", "/api/", "/cuenta", "/checkout", "/carrito", "/auth/"];

export function buildRobots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ROBOTS_DISALLOW }],
    sitemap: `${ORIGIN}/sitemap.xml`,
    host: ORIGIN,
  };
}

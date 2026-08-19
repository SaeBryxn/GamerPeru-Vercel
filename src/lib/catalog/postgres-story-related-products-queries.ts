import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, mediaAssets, products } from "@/db/schema";
import {
  buildEligibleStartingPriceSql,
  buildEligibleVariantExistsClause,
} from "@/lib/discovery-filters/postgres-predicates";

export function buildStoryRelatedProductsBySlugsQuery(
  slugs: readonly string[],
  excludeProductId?: string
) {
  const whereConditions = [
    eq(products.status, "PUBLISHED"),
    eq(brands.status, "PUBLISHED"),
    eq(categories.status, "PUBLISHED"),
    buildEligibleVariantExistsClause(null, null),
    inArray(products.slug, [...slugs]),
  ];

  if (excludeProductId) {
    whereConditions.push(ne(products.id, excludeProductId));
  }

  const startingPriceSql = buildEligibleStartingPriceSql(null, null);

  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      subtitle: products.subtitle,
      brandName: brands.name,
      brandSlug: brands.slug,
      categoryName: categories.name,
      categorySlug: categories.slug,
      primaryMediaKey: mediaAssets.objectKey,
      primaryMediaAlt: mediaAssets.altText,
      primaryMediaWidth: mediaAssets.width,
      primaryMediaHeight: mediaAssets.height,
      startingPriceCents: startingPriceSql.mapWith(Number),
    })
    .from(products)
    .innerJoin(brands, and(eq(products.brandId, brands.id), eq(brands.status, "PUBLISHED")))
    .innerJoin(
      categories,
      and(eq(products.categoryId, categories.id), eq(categories.status, "PUBLISHED"))
    )
    .leftJoin(
      mediaAssets,
      and(
        eq(products.primaryMediaId, mediaAssets.id),
        eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
        eq(mediaAssets.mediaType, "IMAGE")
      )
    )
    .where(and(...whereConditions));
}

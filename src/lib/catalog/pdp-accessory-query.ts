import "server-only";
import { and, asc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, mediaAssets, products, productVariants } from "@/db/schema";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import type { ProductPdpAccessory } from "./product-detail-types";

/** Only public catalog fields cross this boundary; prices always come from the catalog. */
export async function queryPdpAccessories(
  productId: string,
  variantIds: string[],
  search?: string
): Promise<ProductPdpAccessory[]> {
  if (search === undefined && variantIds.length === 0) return [];
  const rows = await db
    .select({
      id: productVariants.id,
      productName: products.name,
      title: productVariants.title,
      priceCents: productVariants.priceCents,
      objectKey: mediaAssets.objectKey,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .innerJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(
      mediaAssets,
      and(
        eq(products.primaryMediaId, mediaAssets.id),
        eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
        ilike(mediaAssets.mimeType, "image/%")
      )
    )
    .where(
      and(
        ne(products.id, productId),
        eq(products.status, "PUBLISHED"),
        eq(productVariants.status, "ACTIVE"),
        eq(brands.status, "PUBLISHED"),
        eq(categories.status, "PUBLISHED"),
        search === undefined
          ? inArray(productVariants.id, variantIds)
          : or(
              ilike(products.name, `%${search}%`),
              ilike(productVariants.sku, `%${search}%`),
              ...(variantIds.length ? [inArray(productVariants.id, variantIds)] : [])
            )
      )
    )
    .orderBy(asc(products.name), asc(productVariants.displayOrder), asc(productVariants.id))
    .limit(60);
  const mapped = rows.map((row) => ({
    id: row.id,
    name: row.title === "Estándar" ? row.productName : `${row.productName} · ${row.title}`,
    priceCents: row.priceCents,
    imageUrl: resolvePublicMediaUrl(row.objectKey),
  }));
  if (search === undefined)
    return variantIds.flatMap((id) => mapped.filter((row) => row.id === id));
  const selected = variantIds.length ? await queryPdpAccessories(productId, variantIds) : [];
  return [...selected, ...mapped.filter((row) => !selected.some((item) => item.id === row.id))];
}

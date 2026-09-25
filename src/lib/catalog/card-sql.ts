import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { products } from "@/db/schema";
import type { ProductCardImage } from "./types";

/** Photos fetched per card; one more than shown, so a primary outside the gallery still leaves three. */
const GALLERY_FETCH_LIMIT = 4;

/**
 * The product's public gallery in display order, product-wide photos before variant-specific ones.
 * jsonb rather than json so queries that select DISTINCT can still compare the column.
 */
export const cardGallerySql = sql<ProductCardImage[] | null>`(
  SELECT jsonb_agg(jsonb_build_object('objectKey', g.object_key, 'altText', g.alt_text) ORDER BY g.rank)
  FROM (
    SELECT a.object_key, a.alt_text,
      row_number() OVER (
        ORDER BY (pm.variant_id IS NULL) DESC, pm.display_order ASC, pm.created_at ASC
      ) AS rank
    FROM product_media pm
    JOIN media_assets a ON a.id = pm.media_asset_id
    WHERE pm.product_id = ${products.id}
      AND a.security_class = 'PUBLIC_MEDIA'
      AND a.media_type = 'IMAGE'
    ORDER BY rank
    LIMIT ${GALLERY_FETCH_LIMIT}
  ) g
)`;

/**
 * Compare-at price of the variant that sets the card's starting price. When several variants share
 * that price, the highest reference wins so a genuine discount is never hidden.
 */
export function cardCompareAtSql(startingPriceSql: SQL<number>): SQL<number | null> {
  return sql<number | null>`(
    SELECT v.compare_at_price_cents
    FROM product_variants v
    WHERE v.product_id = ${products.id}
      AND v.status = 'ACTIVE'
      AND v.price_cents = ${startingPriceSql}
    ORDER BY v.compare_at_price_cents DESC NULLS LAST
    LIMIT 1
  )`;
}

/** The variant id when the product sells exactly one active variant; otherwise null. */
export const cardSingleVariantSql = sql<string | null>`(
  SELECT CASE WHEN COUNT(*) = 1 THEN MIN(v.id::text) END
  FROM product_variants v
  WHERE v.product_id = ${products.id} AND v.status = 'ACTIVE'
)`;

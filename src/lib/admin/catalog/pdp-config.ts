import "server-only";
import { sql, type SQLWrapper } from "drizzle-orm";
import { productPdpConfigSchema, type ProductPdpConfig } from "@/lib/catalog/product-pdp-config";
import { CatalogDomainError } from "./types";

export function validatePdpConfig(input: unknown): ProductPdpConfig {
  const result = productPdpConfigSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new CatalogDomainError(
      `Revisa la ficha de tienda (${issue?.path.join(" · ")}): ${issue?.message}`,
      "INVALID_PDP_CONFIG",
      422
    );
  }
  return result.data;
}

export async function validatePdpReferences(
  config: ProductPdpConfig,
  productId: string,
  executor: { execute: (query: SQLWrapper) => Promise<unknown> }
) {
  const variantIds = Object.keys(config.variants);
  if (variantIds.length > 100)
    throw new CatalogDomainError(
      "Hay demasiadas variantes configuradas.",
      "INVALID_PDP_CONFIG",
      422
    );
  if (variantIds.length) {
    const expected = Object.entries(config.variants).map(([id, presentation]) => ({
      id,
      media_asset_id: presentation.mediaAssetId,
    }));
    const rows = (await executor.execute(sql`
      SELECT pv.id FROM jsonb_to_recordset(${JSON.stringify(expected)}::jsonb) AS expected(id uuid, media_asset_id uuid)
      JOIN product_variants pv ON pv.id = expected.id AND pv.product_id = ${productId}::uuid
      WHERE expected.media_asset_id IS NULL OR EXISTS (
        SELECT 1 FROM product_media pm JOIN media_assets ma ON ma.id = pm.media_asset_id
        WHERE pm.product_id = pv.product_id AND pm.media_asset_id = expected.media_asset_id
          AND pm.placement = 'GALLERY' AND (pm.variant_id IS NULL OR pm.variant_id = pv.id)
          AND ma.security_class = 'PUBLIC_MEDIA' AND ma.mime_type LIKE 'image/%'
      );
    `)) as { id: string }[];
    if (rows.length !== variantIds.length)
      throw new CatalogDomainError(
        "Una miniatura o variante no pertenece a este producto. Revisa la selección.",
        "INVALID_PDP_REFERENCE",
        422
      );
  }
  if (config.accessories.enabled && config.accessories.variantIds.length) {
    const ids = sql.join(
      config.accessories.variantIds.map((id) => sql`${id}::uuid`),
      sql`, `
    );
    const rows = (await executor.execute(sql`
      SELECT pv.id FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      JOIN brands b ON b.id = p.brand_id JOIN categories c ON c.id = p.category_id
      WHERE pv.id IN (${ids}) AND p.id <> ${productId}::uuid AND pv.status = 'ACTIVE'
        AND p.status = 'PUBLISHED' AND b.status = 'PUBLISHED' AND c.status = 'PUBLISHED';
    `)) as { id: string }[];
    if (rows.length !== config.accessories.variantIds.length)
      throw new CatalogDomainError(
        "Elige accesorios publicados con variantes activas y distintos del producto principal.",
        "INVALID_PDP_REFERENCE",
        422
      );
  }
}

/** Keep the cart and order attributes aligned with the selectors shown on the PDP. */
export async function syncPdpVariantAttributes(
  config: ProductPdpConfig,
  productId: string,
  executor: { execute: (query: SQLWrapper) => Promise<unknown> }
): Promise<void> {
  const entries = Object.entries(config.variants).map(([id, variant]) => ({
    id,
    color: variant.color,
    size: variant.size,
  }));
  if (!entries.length) return;
  await executor.execute(sql`
    WITH configured AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS x(id uuid, color text, size text)
    ), next_attributes AS (
      SELECT pv.id,
        (pv.attributes - 'colorway' - 'color' - 'size' - 'talla' - 'tamano') ||
        jsonb_strip_nulls(jsonb_build_object('color', NULLIF(c.color, ''), 'size', NULLIF(c.size, ''))) AS attributes
      FROM product_variants pv JOIN configured c ON c.id = pv.id
      WHERE pv.product_id = ${productId}::uuid
    )
    UPDATE product_variants pv SET attributes = na.attributes, updated_at = NOW()
    FROM next_attributes na WHERE pv.id = na.id AND pv.attributes IS DISTINCT FROM na.attributes;
  `);
}

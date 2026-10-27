import "server-only";

import { sql, type SQL } from "drizzle-orm";

export interface OrderItemPreview {
  productName: string;
  variantTitle: string;
  quantity: number;
  imageObjectKey: string | null;
}

/** Public product image for an order line; private payment media is never eligible. */
export function orderItemImageSql(variantId: SQL): SQL<string | null> {
  return sql<string | null>`(
          SELECT a.object_key
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          JOIN media_assets a ON a.id = COALESCE(
            p.primary_media_id,
            (
              SELECT pm.media_asset_id
              FROM product_media pm
              JOIN media_assets ma ON ma.id = pm.media_asset_id
              WHERE pm.product_id = p.id
                AND pm.placement = 'GALLERY'
                AND ma.security_class = 'PUBLIC_MEDIA'
                AND ma.media_type = 'IMAGE'
              ORDER BY (pm.variant_id IS NULL) DESC, pm.display_order ASC, pm.created_at ASC
              LIMIT 1
            )
          )
          WHERE pv.id = ${variantId}
            AND a.security_class = 'PUBLIC_MEDIA'
            AND a.media_type = 'IMAGE'
          LIMIT 1
        )`;
}

/**
 * The first order lines as JSON, each with the same card image rule as the catalog: the
 * designated primary, else the first public global photo. `orderId` is the SQL expression of
 * the order's id in the surrounding query (a column or an alias).
 */
export function orderItemPreviewsSql(orderId: SQL, limit: number): SQL<OrderItemPreview[] | null> {
  return sql<OrderItemPreview[] | null>`(
    SELECT jsonb_agg(
      jsonb_build_object(
        'productName', x.product_name_snapshot,
        'variantTitle', x.variant_title_snapshot,
        'quantity', x.quantity,
        'imageObjectKey', x.object_key
      ) ORDER BY x.created_at, x.id
    )
    FROM (
      SELECT oi.id, oi.created_at, oi.product_name_snapshot, oi.variant_title_snapshot, oi.quantity,
        ${orderItemImageSql(sql`oi.variant_id`)} AS object_key
      FROM order_items oi
      WHERE oi.order_id = ${orderId}
      ORDER BY oi.created_at, oi.id
      LIMIT ${limit}
    ) x
  )`;
}

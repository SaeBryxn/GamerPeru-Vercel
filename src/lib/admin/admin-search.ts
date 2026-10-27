import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { PermissionName } from "@/lib/auth/rbac";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import type { AdminSearchResults } from "./admin-search-types";

const LIMIT = 5;
export const MIN_SEARCH_LENGTH = 2;

/** `%` and `_` typed by the operator are literal characters, not wildcards. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Global admin search: orders by number (with or without «GP-», «#» or spaces) and products by
 * name or SKU. One query; each half runs only with the permission its screen requires.
 */
export async function searchAdmin(
  raw: string,
  can: (permission: PermissionName) => boolean
): Promise<AdminSearchResults> {
  const term = raw.trim().slice(0, 80);
  const canOrders = can("orders:manage");
  const canProducts = can("catalog:manage");
  if (term.length < MIN_SEARCH_LENGTH || (!canOrders && !canProducts)) {
    return { orders: [], products: [] };
  }

  const orderTerm = escapeLike(term.replace(/^#/, "").replace(/\s+/g, "").toUpperCase());
  const like = `%${escapeLike(term)}%`;
  const none = sql`'[]'::json`;

  const rows = await db.execute<{
    orders: Array<{ number: string; status: string; created_at: string }> | null;
    products: Array<{
      id: string;
      name: string;
      status: string;
      sku: string | null;
      object_key: string | null;
    }> | null;
  }>(sql`
    SELECT
      ${
        canOrders
          ? sql`(SELECT COALESCE(json_agg(o), '[]'::json) FROM (
              SELECT order_number AS number, status, created_at FROM orders
              WHERE order_number ILIKE ${`%${orderTerm}%`}
              ORDER BY created_at DESC LIMIT ${LIMIT}
            ) o)`
          : none
      } AS orders,
      ${
        canProducts
          ? sql`(SELECT COALESCE(json_agg(p), '[]'::json) FROM (
              SELECT pr.id, pr.name, pr.status, ma.object_key,
                CASE WHEN pr.name ILIKE ${like} THEN NULL ELSE (
                  SELECT pv.sku FROM product_variants pv
                  WHERE pv.product_id = pr.id AND pv.sku ILIKE ${like}
                  ORDER BY pv.sku LIMIT 1
                ) END AS sku
              FROM products pr
              LEFT JOIN media_assets ma ON ma.id = pr.primary_media_id
              WHERE pr.status <> 'ARCHIVED' AND (
                pr.name ILIKE ${like}
                OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = pr.id AND pv.sku ILIKE ${like})
              )
              ORDER BY (pr.name ILIKE ${`${escapeLike(term)}%`}) DESC, pr.name
              LIMIT ${LIMIT}
            ) p)`
          : none
      } AS products
  `);

  const row = rows[0];
  return {
    orders: (row?.orders ?? []).map((order) => ({
      orderNumber: order.number,
      status: order.status,
      href: `/admin/orders/${encodeURIComponent(order.number)}`,
    })),
    products: (row?.products ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      status: product.status,
      sku: product.sku,
      imageUrl: resolvePublicMediaUrl(product.object_key),
      href: `/admin/products/${product.id}`,
    })),
  };
}

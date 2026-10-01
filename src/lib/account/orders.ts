import "server-only";
import { cache } from "react";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerProfiles, orders } from "@/db/schema";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import { logger } from "@/lib/logger";
import {
  describeCustomerOrder,
  type CustomerOrderStatusView,
  type CustomerShipmentStatus,
} from "./order-status";

const ORDER_HISTORY_LIMIT = 50;
/** Thumbnails shown per order row; the rest are summarized as "+N". */
const ORDER_THUMBNAIL_LIMIT = 3;

export interface CustomerOrderItemPreview {
  productName: string;
  variantTitle: string;
  quantity: number;
  imageObjectKey: string | null;
}

/** Client-safe order summary: the order number is the public handle, no internal ids. */
export interface CustomerOrderSummaryDTO {
  orderNumber: string;
  createdAt: string;
  totalCents: number;
  itemCount: number;
  status: CustomerOrderStatusView;
  items: CustomerOrderItemPreview[];
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

export type AccountOrdersState =
  | { status: "READY"; orders: CustomerOrderSummaryDTO[] }
  | { status: "UNAUTHENTICATED" }
  | { status: "NEEDS_PROFILE_COMPLETION" }
  | { status: "ERROR"; error: string };

// Same card image rule as the catalog: the designated primary, else the first public global photo.
const itemPreviewsSql = sql<CustomerOrderItemPreview[] | null>`(
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
      (
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
        WHERE pv.id = oi.variant_id
          AND a.security_class = 'PUBLIC_MEDIA'
          AND a.media_type = 'IMAGE'
        LIMIT 1
      ) AS object_key
    FROM order_items oi
    WHERE oi.order_id = ${orders.id}
    ORDER BY oi.created_at, oi.id
    LIMIT ${ORDER_THUMBNAIL_LIMIT}
  ) x
)`;

const itemCountSql = sql<number>`(
  SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = ${orders.id}
)`;

const latestShipmentSql = sql<{
  status: CustomerShipmentStatus;
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
} | null>`(
  SELECT jsonb_build_object(
    'status', s.status,
    'courierName', s.courier_name,
    'trackingNumber', s.tracking_number,
    'trackingUrl', s.tracking_url
  )
  FROM shipments s
  WHERE s.order_id = ${orders.id}
  ORDER BY s.created_at DESC
  LIMIT 1
)`;

/** Staff type the tracking link by hand; only a well-formed https URL is ever rendered. */
function safeTrackingUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Order history of the signed-in customer, newest first.
 *
 * Invariants:
 * 1. Authority: the customer profile is resolved from verified JWT claims, never from input.
 * 2. IDOR prevention: only orders whose customer_id is that profile are read.
 * 3. Privacy: the DTO carries the public order number and purchase snapshots only.
 */
export const getCurrentCustomerOrders = cache(async (): Promise<AccountOrdersState> => {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return { status: "UNAUTHENTICATED" };
  }

  try {
    const [profile] = await db
      .select({ id: customerProfiles.id })
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, verified.identity.authUserId))
      .limit(1);

    if (!profile) {
      return { status: "NEEDS_PROFILE_COMPLETION" };
    }

    const rows = await db
      .select({
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
        itemCount: itemCountSql.mapWith(Number),
        items: itemPreviewsSql,
        shipment: latestShipmentSql,
      })
      .from(orders)
      .where(eq(orders.customerId, profile.id))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(ORDER_HISTORY_LIMIT);

    return {
      status: "READY",
      orders: rows.map((row) => ({
        orderNumber: row.orderNumber,
        createdAt: row.createdAt.toISOString(),
        totalCents: row.totalCents,
        itemCount: row.itemCount,
        status: describeCustomerOrder(row.status, row.shipment?.status ?? null),
        items: row.items ?? [],
        courierName: row.shipment?.courierName ?? null,
        trackingNumber: row.shipment?.trackingNumber ?? null,
        trackingUrl: safeTrackingUrl(row.shipment?.trackingUrl ?? null),
      })),
    };
  } catch {
    logger.error({ event: "account_orders_read_failed" });
    return { status: "ERROR", error: "No se pudieron cargar tus pedidos." };
  }
});

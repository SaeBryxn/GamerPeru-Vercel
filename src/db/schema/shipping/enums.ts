import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Gamer Perú — Canonical Shipment Status Enum
 *
 * Status lifecycle:
 * - UNFULFILLED: Initial state at order placement.
 * - READY_TO_PACK: Stock allocated and order queued for picking/packing.
 * - PACKED: Parcel packed and labeled.
 * - SHIPPED: Dispatched with courier.
 * - DELIVERED: Successfully received by customer.
 * - RETURNED: Parcel returned to warehouse.
 */
export const shipmentStatusEnum = pgEnum("shipment_status", [
  "UNFULFILLED",
  "READY_TO_PACK",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "RETURNED",
]);

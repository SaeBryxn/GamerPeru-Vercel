import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Gamer Perú — Canonical Inventory Movement Type Enum
 *
 * Captures all physical and logical multi-balance stock transitions.
 */
export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
  "RECEIVING",
  "MANUAL_ADJUSTMENT",
  "RESERVATION_CREATED",
  "RESERVATION_EXPIRED",
  "RESERVATION_RELEASED",
  "ALLOCATION_CONFIRMED",
  "ALLOCATION_RELEASED",
  "FULFILLMENT_DISPATCHED",
  "RETURN_RESTOCKED",
]);

/**
 * Gamer Perú — Canonical Inventory Reference Type Enum
 */
export const inventoryReferenceTypeEnum = pgEnum("inventory_reference_type", [
  "ORDER",
  "PURCHASE_ORDER",
  "RMA",
  "MANUAL_AUDIT",
]);

/**
 * Gamer Perú — Canonical Inventory Reservation Status Enum
 *
 * Status lifecycle:
 * - ACTIVE: Created at checkout, holding stock during unpaid window.
 * - VERIFICATION_HOLD: Payment submitted; expiry timer suspended during staff review.
 * - ALLOCATED: Payment verified/confirmed; reserved stock transitioned to confirmed allocation.
 * - CONSUMED: Order parcel dispatched with courier.
 * - RELEASED: Reservation released due to order cancellation, rejection, or timeout.
 */
export const inventoryReservationStatusEnum = pgEnum("inventory_reservation_status", [
  "ACTIVE",
  "VERIFICATION_HOLD",
  "ALLOCATED",
  "CONSUMED",
  "RELEASED",
]);

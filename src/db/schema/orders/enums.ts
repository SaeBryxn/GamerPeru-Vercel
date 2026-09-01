import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Gamer Perú — Canonical Order Status Enum
 *
 * Status lifecycle:
 * - PENDING: Initial state at checkout creation, awaiting payment or payment submission.
 * - CONFIRMED: Payment verified and approved by staff (or automated if gateway in future).
 * - PROCESSING: Order is being prepared in the warehouse.
 * - FULFILLED: Order has been packed, dispatched, and delivered.
 * - CANCELLED: Order cancelled before fulfillment or rejected by staff.
 * - EXPIRED: Unpaid order reservation TTL expired before payment submission.
 * - REFUNDED: Paid order refunded (partially or fully).
 */
export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "FULFILLED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
]);

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

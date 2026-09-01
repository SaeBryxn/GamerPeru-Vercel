import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Gamer Perú — Canonical Payment Method Type Enum
 */
export const paymentMethodTypeEnum = pgEnum("payment_method_type", ["MANUAL", "GATEWAY"]);

export type PaymentMethodType = (typeof paymentMethodTypeEnum.enumValues)[number];

/**
 * Gamer Perú — Canonical Payment Status Enum
 *
 * Status lifecycle:
 * - UNPAID: Initial state created atomically at Order checkout.
 * - SUBMITTED: Customer provided operation code and/or voucher proof (GP-019).
 * - VERIFYING: Staff began reviewing the payment submission (GP-028).
 * - PAID: Staff verified bank funds receipt and approved the payment (GP-028).
 * - REJECTED: Staff rejected the payment submission as invalid/fraudulent (GP-028).
 * - REFUNDED: Staff recorded a partial or full refund against confirmed payment.
 */
export const paymentStatusEnum = pgEnum("payment_status", [
  "UNPAID",
  "SUBMITTED",
  "VERIFYING",
  "PAID",
  "REJECTED",
  "REFUNDED",
]);

export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];

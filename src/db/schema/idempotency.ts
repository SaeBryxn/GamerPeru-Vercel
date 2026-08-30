import { index, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../utils/uuid";

/**
 * Gamer Perú — Canonical Idempotency Operation Type Enum
 */
export const idempotencyOperationTypeEnum = pgEnum("idempotency_operation_type", [
  "ORDER_CREATION",
  "PAYMENT_SUBMISSION",
  "PAYMENT_VERIFICATION_APPROVE",
  "PAYMENT_VERIFICATION_REJECT",
  "ORDER_CANCELLATION",
  "REFUND_RECORDING",
  "INVENTORY_MUTATION",
  "AFFILIATE_CONVERSION_QUALIFY",
  "COMMISSION_PAYOUT_BATCH",
  "OUTBOX_DISPATCH",
]);

/**
 * Idempotency Keys Entity
 *
 * Enforces exactly-once execution and duplicate-safe mutation replays.
 *
 * Canonical Invariants:
 * 1. Key Uniqueness: idempotency_key is UNIQUE NOT NULL.
 * 2. Privacy: Zero raw customer PII or raw anonymous session tokens stored for fingerprinting.
 * 3. Fingerprint: request_fingerprint stores a 64-character SHA-256 hex digest of normalized intent.
 * 4. Expiration: expires_at is NOT NULL and configurable per operation class.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    operationType: idempotencyOperationTypeEnum("operation_type").notNull(),
    targetAggregateId: varchar("target_aggregate_id", { length: 255 }),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }),
    responsePayload: jsonb("response_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idempotency_keys_expires_at_idx").on(table.expiresAt)]
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;

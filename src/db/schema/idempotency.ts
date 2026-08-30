import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../utils/uuid";
import { carts } from "./cart";

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
 * Enforces exactly-once execution, authority verification, and duplicate-safe mutation replays.
 *
 * Canonical Invariants:
 * 1. Key Uniqueness: idempotency_key is UNIQUE NOT NULL.
 * 2. Authority Binding: authority_binding_digest stores a 64-character SHA-256 server-derived digest
 *    of the authoritative caller (CustomerProfile.id for authenticated, or HMAC of session_token for guest).
 *    Never stores raw session tokens or raw contact PII.
 * 3. Authority vs Fingerprint Distinction:
 *    - Same key + same authority + same request => Replay committed result
 *    - Same key + same authority + changed request => 409 IDEMPOTENCY_CONFLICT
 *    - Same key + wrong authority / cross-session => 403 UNAUTHORIZED
 * 4. Source Cart: source_cart_id is NOT NULL with ON DELETE RESTRICT to carts.id.
 * 5. Request Fingerprint: request_fingerprint is NOT NULL, storing a 64-character SHA-256 hex digest
 *    of normalized checkout intent.
 * 6. Expiration: expires_at is NOT NULL and configurable per operation class.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    operationType: idempotencyOperationTypeEnum("operation_type").notNull(),
    authorityBindingDigest: varchar("authority_binding_digest", { length: 64 }).notNull(),
    sourceCartId: uuid("source_cart_id")
      .notNull()
      .references((): AnyPgColumn => carts.id, { onDelete: "restrict" }),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    targetAggregateId: varchar("target_aggregate_id", { length: 255 }),
    responsePayload: jsonb("response_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
    index("idempotency_keys_source_cart_id_idx").on(table.sourceCartId),
  ]
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;

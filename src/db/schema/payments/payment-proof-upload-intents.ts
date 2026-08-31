import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { payments } from "./payments";

/**
 * Payment Proof Upload Intents Entity
 *
 * Transient upload-control entity for private voucher proofs in Cloudflare R2.
 * Tracks upload session ownership, declared metadata, and staging object keys.
 *
 * Canonical Invariants:
 * 1. Payment Restrict: payment_id references payments.id with ON DELETE RESTRICT.
 * 2. Staging Key Uniqueness: UNIQUE(staging_object_key).
 * 3. Bounded Size: declared_size_bytes > 0 AND declared_size_bytes <= 5242880 (5MB).
 * 4. Controlled Status: status IN ('PENDING', 'FINALIZED', 'ABANDONED').
 * 5. Cleanup Indexing: Composite index on (status, expires_at) for transient orphan pruning.
 */
export const paymentProofUploadIntents = pgTable(
  "payment_proof_upload_intents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    paymentId: uuid("payment_id")
      .notNull()
      .references((): AnyPgColumn => payments.id, { onDelete: "restrict" }),
    authorityBindingDigest: varchar("authority_binding_digest", { length: 64 }).notNull(),
    stagingObjectKey: varchar("staging_object_key", { length: 500 }).notNull().unique(),
    declaredMimeType: varchar("declared_mime_type", { length: 100 }).notNull(),
    declaredSizeBytes: integer("declared_size_bytes").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "payment_proof_upload_intents_status_check",
      sql`${table.status} IN ('PENDING', 'FINALIZED', 'ABANDONED')`
    ),
    check(
      "payment_proof_upload_intents_size_check",
      sql`${table.declaredSizeBytes} > 0 AND ${table.declaredSizeBytes} <= 5242880`
    ),
    index("payment_proof_upload_intents_payment_id_idx").on(table.paymentId),
    index("payment_proof_upload_intents_status_expires_at_idx").on(table.status, table.expiresAt),
  ]
);

export type PaymentProofUploadIntent = typeof paymentProofUploadIntents.$inferSelect;
export type NewPaymentProofUploadIntent = typeof paymentProofUploadIntents.$inferInsert;

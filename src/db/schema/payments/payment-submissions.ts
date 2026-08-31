import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { mediaAssets } from "../catalog/media-assets";
import { payments } from "./payments";

/**
 * Payment Submissions Entity
 *
 * Immutable historical record of a customer's payment operation-code and proof submission.
 *
 * Canonical Invariants:
 * 1. Payment Restrict: payment_id references payments.id with ON DELETE RESTRICT.
 * 2. Attempt Uniqueness: UNIQUE(payment_id, attempt_number).
 * 3. Proof Media Uniqueness: UNIQUE(proof_media_id) with ON DELETE RESTRICT (proofs cannot be shared or detached).
 * 4. Immutable Audit: Rows are append-only; historical attempts are preserved upon resubmission.
 * 5. Positive Attempt: attempt_number > 0.
 * 6. Non-Empty Code: length(trim(operation_code)) > 0.
 * 7. Fraud Index: Composite index on (operation_code, submitted_at).
 */
export const paymentSubmissions = pgTable(
  "payment_submissions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    paymentId: uuid("payment_id")
      .notNull()
      .references((): AnyPgColumn => payments.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    operationCode: varchar("operation_code", { length: 50 }).notNull(),
    proofMediaId: uuid("proof_media_id")
      .unique()
      .references((): AnyPgColumn => mediaAssets.id, { onDelete: "restrict" }),
    customerNotes: text("customer_notes"),
    isLate: boolean("is_late").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("payment_submissions_payment_attempt_unique").on(table.paymentId, table.attemptNumber),
    check("payment_submissions_attempt_number_positive", sql`${table.attemptNumber} > 0`),
    check(
      "payment_submissions_operation_code_not_empty",
      sql`length(trim(${table.operationCode})) > 0`
    ),
    index("payment_submissions_operation_code_submitted_idx").on(
      table.operationCode,
      table.submittedAt
    ),
  ]
);

export type PaymentSubmission = typeof paymentSubmissions.$inferSelect;
export type NewPaymentSubmission = typeof paymentSubmissions.$inferInsert;

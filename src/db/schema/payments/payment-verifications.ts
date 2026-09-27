import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { authUsers } from "../identity/auth-users";
import { paymentVerificationDecisionEnum } from "./enums";
import { paymentSubmissions } from "./payment-submissions";
import { payments } from "./payments";

/**
 * Payment Verifications Entity
 *
 * Immutable record of a staff decision on one customer payment submission.
 *
 * Canonical Invariants:
 * 1. One Decision Per Submission: UNIQUE(submission_id) makes a second decision on the same
 *    voucher impossible, independently of application-level locking.
 * 2. Financial Restrict: payment_id and submission_id FKs are ON DELETE RESTRICT.
 * 3. Staff Actor Reference: verifier_auth_user_id FK references auth.users(id) ON DELETE SET NULL;
 *    the AuditEvent log preserves the actor string permanently.
 * 4. Rejections Carry a Reason: any non-APPROVED decision requires a non-empty rejection_reason.
 * 5. Append-Only: rows are never updated or deleted.
 */
export const paymentVerifications = pgTable(
  "payment_verifications",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    paymentId: uuid("payment_id")
      .notNull()
      .references((): AnyPgColumn => payments.id, { onDelete: "restrict" }),
    submissionId: uuid("submission_id")
      .notNull()
      .unique()
      .references((): AnyPgColumn => paymentSubmissions.id, { onDelete: "restrict" }),
    verifierAuthUserId: uuid("verifier_auth_user_id"),
    decision: paymentVerificationDecisionEnum("decision").notNull(),
    rejectionReason: varchar("rejection_reason", { length: 255 }),
    verificationNotes: text("verification_notes"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "payment_verifications_verifier_auth_user_id_fk",
      columns: [table.verifierAuthUserId],
      foreignColumns: [authUsers.id],
    }).onDelete("set null"),
    check(
      "payment_verifications_rejection_reason_required",
      sql`${table.decision} = 'APPROVED' OR length(trim(coalesce(${table.rejectionReason}, ''))) > 0`
    ),
    index("payment_verifications_payment_verified_idx").on(table.paymentId, table.verifiedAt),
  ]
);

export type PaymentVerification = typeof paymentVerifications.$inferSelect;
export type NewPaymentVerification = typeof paymentVerifications.$inferInsert;

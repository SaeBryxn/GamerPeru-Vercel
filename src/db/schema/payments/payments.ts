import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { authUsers } from "../identity/auth-users";
import { orders } from "../orders/orders";
import { paymentStatusEnum } from "./enums";
import { paymentInstructionVersions } from "./payment-instructions";
import { paymentMethodConfigurations } from "./payment-methods";

/**
 * Payments Entity
 *
 * The financial transaction record associated with an Order.
 *
 * Canonical Invariants:
 * 1. Order Uniqueness: UNIQUE(order_id) — exactly one Payment record per Order.
 * 2. Order Restrict: order_id FK has ON DELETE RESTRICT (financial records cannot be cascade-deleted).
 * 3. Method Restrict: payment_method_code FK has ON DELETE RESTRICT.
 * 4. Composite Method/Instruction Consistency: Composite FK on (instruction_version_id, payment_method_code)
 *    referencing payment_instruction_versions(id, payment_method_code) with ON DELETE RESTRICT.
 *    Guarantees a Payment row cannot pair a Yape instruction with a Plin method code.
 * 5. Initial Status: Default 'UNPAID'.
 * 6. Money: Integer minor units in PEN cents, non-negative.
 * 7. Refund Check: refunded_amount_cents <= amount_cents.
 * 8. Verification Claim: a VERIFYING payment is claimed by exactly one reviewer
 *    (verification_claimed_at is set iff status = VERIFYING); the claimant FK is ON DELETE SET NULL.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references((): AnyPgColumn => orders.id, { onDelete: "restrict" }),
    paymentMethodCode: varchar("payment_method_code", { length: 50 })
      .notNull()
      .references((): AnyPgColumn => paymentMethodConfigurations.code, { onDelete: "restrict" }),
    instructionVersionId: uuid("instruction_version_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    refundedAmountCents: integer("refunded_amount_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("PEN"),
    status: paymentStatusEnum("status").notNull().default("UNPAID"),
    resubmissionGraceExpiresAt: timestamp("resubmission_grace_expires_at", { withTimezone: true }),
    verificationClaimedByAuthUserId: uuid("verification_claimed_by_auth_user_id"),
    verificationClaimedAt: timestamp("verification_claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.instructionVersionId, table.paymentMethodCode],
      foreignColumns: [paymentInstructionVersions.id, paymentInstructionVersions.paymentMethodCode],
      name: "payments_instruction_method_fk",
    }).onDelete("restrict"),
    check("payments_amount_cents_non_negative", sql`${table.amountCents} >= 0`),
    check("payments_refunded_amount_non_negative", sql`${table.refundedAmountCents} >= 0`),
    check(
      "payments_refunded_amount_lte_total",
      sql`${table.refundedAmountCents} <= ${table.amountCents}`
    ),
    foreignKey({
      name: "payments_verification_claimed_by_auth_user_id_fk",
      columns: [table.verificationClaimedByAuthUserId],
      foreignColumns: [authUsers.id],
    }).onDelete("set null"),
    // A VERIFYING payment always belongs to exactly one reviewer, and no other state keeps a claim.
    check(
      "payments_verification_claim_consistency",
      sql`(${table.status} = 'VERIFYING') = (${table.verificationClaimedAt} IS NOT NULL)`
    ),
    index("payments_status_created_at_idx").on(table.status, table.createdAt),
    index("payments_verification_queue_idx").on(
      table.status,
      table.resubmissionGraceExpiresAt,
      table.createdAt
    ),
  ]
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

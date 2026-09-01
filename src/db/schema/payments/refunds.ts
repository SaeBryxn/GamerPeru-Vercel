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
import { orders } from "../orders/orders";
import { payments } from "./payments";
import { authUsers } from "../identity/auth-users";

/**
 * Refunds Entity
 *
 * Immutable financial reimbursement records linked to Orders and Payments.
 *
 * Canonical Invariants:
 * 1. Order Restrict: order_id FK has ON DELETE RESTRICT.
 * 2. Payment Restrict: payment_id FK has ON DELETE RESTRICT.
 * 3. Positive Amount: amount_cents > 0 (all money in integer PEN cents).
 * 4. Non-empty Reason: length(trim(reason)) > 0.
 * 5. Staff Actor Reference: actor_auth_user_id FK references auth.users(id) ON DELETE SET NULL.
 * 6. Primary Calculation Index: (payment_id, created_at) for refund history and cumulative calculations.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    orderId: uuid("order_id")
      .notNull()
      .references((): AnyPgColumn => orders.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references((): AnyPgColumn => payments.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    externalReference: varchar("external_reference", { length: 100 }),
    actorAuthUserId: uuid("actor_auth_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "refunds_actor_auth_user_id_fk",
      columns: [table.actorAuthUserId],
      foreignColumns: [authUsers.id],
    }).onDelete("set null"),
    check("refunds_amount_cents_positive", sql`${table.amountCents} > 0`),
    check("refunds_reason_not_empty", sql`length(trim(${table.reason})) > 0`),
    index("refunds_payment_created_idx").on(table.paymentId, table.createdAt),
    index("refunds_order_id_idx").on(table.orderId),
  ]
);

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;

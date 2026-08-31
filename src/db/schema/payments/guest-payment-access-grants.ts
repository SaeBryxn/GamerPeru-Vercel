import { index, pgTable, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { guestPaymentSessions } from "./guest-payment-sessions";
import { payments } from "./payments";

/**
 * Guest Payment Access Grants Entity
 *
 * Maps a guest payment session to an authorized Payment record.
 *
 * Canonical Invariants:
 * 1. Payment Uniqueness: UNIQUE(payment_id) — each guest Payment has exactly one active grant.
 * 2. Session Ownership: session_id references guest_payment_sessions.id with ON DELETE RESTRICT.
 * 3. Payment Restrict: payment_id references payments.id with ON DELETE RESTRICT.
 * 4. Multi-Grant Session: One guest payment session can own multiple guest Payment grants.
 */
export const guestPaymentAccessGrants = pgTable(
  "guest_payment_access_grants",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    paymentId: uuid("payment_id")
      .notNull()
      .unique()
      .references((): AnyPgColumn => payments.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id")
      .notNull()
      .references((): AnyPgColumn => guestPaymentSessions.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("guest_payment_access_grants_session_id_idx").on(table.sessionId)]
);

export type GuestPaymentAccessGrant = typeof guestPaymentAccessGrants.$inferSelect;
export type NewGuestPaymentAccessGrant = typeof guestPaymentAccessGrants.$inferInsert;

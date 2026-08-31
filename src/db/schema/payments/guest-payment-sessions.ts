import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";

/**
 * Guest Payment Sessions Entity
 *
 * Stores server-derived cryptographic session digests for guest payment access.
 * Decoupled from cart session rotation to allow long-term payment access.
 *
 * Canonical Invariants:
 * 1. Opaque Entropy: Raw token is 256-bit entropy, held in HttpOnly cookie gp_payment_session.
 * 2. One-Way Digest: PostgreSQL stores only the 64-char HMAC-SHA256 digest of the token.
 * 3. Session Uniqueness: UNIQUE(token_digest).
 * 4. Technical Expiry: expires_at manages session lifetime (default 30 days).
 */
export const guestPaymentSessions = pgTable("guest_payment_sessions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => generateUuidV7()),
  tokenDigest: varchar("token_digest", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export type GuestPaymentSession = typeof guestPaymentSessions.$inferSelect;
export type NewGuestPaymentSession = typeof guestPaymentSessions.$inferInsert;

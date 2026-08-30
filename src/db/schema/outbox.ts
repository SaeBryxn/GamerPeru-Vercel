import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../utils/uuid";

/**
 * Gamer Perú — Canonical Outbox Event Status Enum
 */
export const outboxEventStatusEnum = pgEnum("outbox_event_status", [
  "PENDING",
  "DELIVERED",
  "FAILED",
]);

/**
 * Outbox Events Entity
 *
 * Transactional outbox table ensuring reliable downstream event dispatch.
 *
 * Canonical Invariants:
 * 1. Transactional Atomicity: Outbox events (e.g. OrderPlaced) are inserted within the same PostgreSQL ACID transaction as the domain mutation.
 * 2. Idempotency Key: OutboxEvent.id acts as the canonical outbound event ID and downstream idempotency key.
 * 3. Status Index: Indexed on (status, next_attempt_at) to support high-performance polling by Inngest workers.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    eventName: varchar("event_name", { length: 100 }).notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 255 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: outboxEventStatusEnum("status").notNull().default("PENDING"),
    retryCount: integer("retry_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [index("outbox_events_status_next_attempt_idx").on(table.status, table.nextAttemptAt)]
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;

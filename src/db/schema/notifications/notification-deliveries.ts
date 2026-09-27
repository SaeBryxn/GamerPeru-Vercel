import {
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { outboxEvents } from "../outbox";

/**
 * Notification Deliveries Entity
 *
 * One row per message the provider accepted for an outbox event.
 *
 * Canonical Invariants:
 * 1. Exactly Once Per Template: UNIQUE(outbox_event_id, template). A retried dispatch finds the row
 *    and skips the send, so an event can never produce the same email twice.
 * 2. Outbox Restrict: outbox_event_id FK is ON DELETE RESTRICT; delivery history outlives cleanup.
 * 3. Append-Only: rows are inserted after the provider accepts the message and never updated.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    outboxEventId: uuid("outbox_event_id")
      .notNull()
      .references((): AnyPgColumn => outboxEvents.id, { onDelete: "restrict" }),
    template: varchar("template", { length: 64 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull().default("EMAIL"),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("notification_deliveries_event_template_unique").on(table.outboxEventId, table.template),
    index("notification_deliveries_sent_at_idx").on(table.sentAt),
  ]
);

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;

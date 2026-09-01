import { index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { auditActorTypeEnum } from "./enums";

/**
 * Audit Events Entity
 *
 * Immutable audit records for privileged and critical commerce lifecycle mutations.
 *
 * Canonical Invariants:
 * 1. Transactional Atomicity: Appended within the same PostgreSQL ACID transaction as the business mutation.
 * 2. Actor Classification: actor_type is strictly CUSTOMER, ADMIN, or SYSTEM.
 * 3. Sanitized Payloads: metadata JSONB strictly excludes customer passwords, private session tokens,
 *    payment proofs/operation codes, and internal secrets.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),
    targetId: varchar("target_id", { length: 255 }).notNull(),
    metadata: jsonb("metadata"),
    ipAddress: varchar("ip_address", { length: 45 }),
    requestId: varchar("request_id", { length: 255 }),
  },
  (table) => [
    index("audit_events_target_idx").on(table.targetType, table.targetId, table.timestamp),
    index("audit_events_action_timestamp_idx").on(table.action, table.timestamp),
  ]
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;

import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { aiProviders } from "./providers";

/**
 * AI Provider Credentials Entity
 *
 * AES-256-GCM encrypted provider API credentials with dynamic AAD binding.
 * Exactly one ACTIVE credential per provider enforced via partial unique index.
 */
export const aiProviderCredentials = pgTable(
  "ai_provider_credentials",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "restrict" }),
    keyVersion: integer("key_version").notNull().default(1),
    ciphertext: text("ciphertext").notNull(),
    iv: varchar("iv", { length: 64 }).notNull(),
    authTag: varchar("auth_tag", { length: 64 }).notNull(),
    maskedKey: varchar("masked_key", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    lastHealthStatus: varchar("last_health_status", { length: 30 }),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    check("ai_provider_credentials_key_version_positive", sql`${table.keyVersion} > 0`),
    check(
      "ai_provider_credentials_ciphertext_format",
      sql`${table.ciphertext} ~ '^[0-9a-f]+$' AND length(${table.ciphertext}) % 2 = 0 AND length(${table.ciphertext}) > 0`
    ),
    check("ai_provider_credentials_iv_format", sql`${table.iv} ~ '^[0-9a-f]{24}$'`),
    check("ai_provider_credentials_auth_tag_format", sql`${table.authTag} ~ '^[0-9a-f]{32}$'`),
    check("ai_provider_credentials_status_check", sql`${table.status} IN ('ACTIVE', 'REVOKED')`),
    check(
      "ai_provider_credentials_health_status_check",
      sql`${table.lastHealthStatus} IS NULL OR ${table.lastHealthStatus} IN ('HEALTHY', 'UNHEALTHY', 'UNTESTED')`
    ),
    uniqueIndex("ai_provider_credentials_active_idx")
      .on(table.providerId)
      .where(sql`${table.status} = 'ACTIVE'`),
  ]
);

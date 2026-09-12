import { boolean, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";

/**
 * AI Providers Entity
 *
 * Configured AI model providers (e.g. 'google', 'openai', 'anthropic', 'mock').
 * Strictly stores non-secret provider configuration.
 */
export const aiProviders = pgTable("ai_providers", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => generateUuidV7()),
  providerKey: varchar("provider_key", { length: 50 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

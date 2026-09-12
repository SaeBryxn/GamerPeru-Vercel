import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { aiProviders } from "./providers";

/**
 * AI Profiles Entity
 *
 * Execution profiles decoupling operational tasks (fast research, deep research,
 * SEO copy, batch import) from physical AI providers and models.
 */
export const aiProfiles = pgTable(
  "ai_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    profileKey: varchar("profile_key", { length: 50 }).notNull().unique(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "restrict" }),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    temperature: numeric("temperature", { precision: 3, scale: 2 }).notNull().default("0.20"),
    maxTokens: integer("max_tokens").notNull().default(4096),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    check(
      "ai_profiles_temperature_range",
      sql`${table.temperature} >= 0.00 AND ${table.temperature} <= 2.00`
    ),
    check("ai_profiles_max_tokens_positive", sql`${table.maxTokens} > 0`),
  ]
);

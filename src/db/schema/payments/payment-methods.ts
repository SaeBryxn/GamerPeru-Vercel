import {
  boolean,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { paymentMethodTypeEnum } from "./enums";
import { paymentInstructionVersions } from "./payment-instructions";

/**
 * Payment Method Configurations Entity
 *
 * Supported payment methods (e.g. YAPE_MANUAL, PLIN_MANUAL).
 *
 * Canonical Invariants:
 * 1. Code Uniqueness: code is UNIQUE NOT NULL.
 * 2. Current Instruction Version: References payment_instruction_versions.id with ON DELETE SET NULL.
 * 3. Structure Only: Zero invented production methods seeded by migration.
 */
export const paymentMethodConfigurations = pgTable("payment_method_configurations", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => generateUuidV7()),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  methodType: paymentMethodTypeEnum("method_type").notNull().default("MANUAL"),
  currentInstructionVersionId: uuid("current_instruction_version_id").references(
    (): AnyPgColumn => paymentInstructionVersions.id,
    { onDelete: "set null" }
  ),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export type PaymentMethodConfiguration = typeof paymentMethodConfigurations.$inferSelect;
export type NewPaymentMethodConfiguration = typeof paymentMethodConfigurations.$inferInsert;

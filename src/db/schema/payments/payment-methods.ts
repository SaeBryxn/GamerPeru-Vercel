import {
  boolean,
  foreignKey,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
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
 * 2. Parent Consistency Constraint: Composite FK on (current_instruction_version_id, code)
 *    referencing payment_instruction_versions(id, payment_method_code).
 *    - If current_instruction_version_id IS NULL: allowed (unconfigured method).
 *    - If current_instruction_version_id IS NOT NULL: method code MUST match the instruction version's method code.
 * 3. Deletion Policy: ON DELETE RESTRICT (an active instruction version cannot be deleted while referenced).
 */
export const paymentMethodConfigurations = pgTable(
  "payment_method_configurations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    code: varchar("code", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    methodType: paymentMethodTypeEnum("method_type").notNull().default("MANUAL"),
    currentInstructionVersionId: uuid("current_instruction_version_id"),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.currentInstructionVersionId, table.code],
      foreignColumns: [paymentInstructionVersions.id, paymentInstructionVersions.paymentMethodCode],
      name: "payment_method_configurations_current_instruction_fk",
    }).onDelete("restrict"),
  ]
);

export type PaymentMethodConfiguration = typeof paymentMethodConfigurations.$inferSelect;
export type NewPaymentMethodConfiguration = typeof paymentMethodConfigurations.$inferInsert;

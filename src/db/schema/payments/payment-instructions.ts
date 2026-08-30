import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { mediaAssets } from "../catalog/media-assets";
import { paymentMethodConfigurations } from "./payment-methods";

/**
 * Payment Instruction Versions Entity
 *
 * Versioned store bank/wallet details for manual payment methods.
 *
 * Canonical Invariants:
 * 1. Method Code FK: References payment_method_configurations.code with ON DELETE RESTRICT.
 * 2. Version Uniqueness: UNIQUE(payment_method_code, version_number).
 * 3. Composite Identity Uniqueness: UNIQUE(id, payment_method_code) to support relational
 *    composite foreign keys ensuring method consistency across configuration and payments.
 * 4. Media FK: qr_media_id references media_assets.id with ON DELETE SET NULL.
 * 5. Historical Preservation: Referenced instruction versions cannot be deleted (ON DELETE RESTRICT).
 */
export const paymentInstructionVersions = pgTable(
  "payment_instruction_versions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    paymentMethodCode: varchar("payment_method_code", { length: 50 })
      .notNull()
      .references((): AnyPgColumn => paymentMethodConfigurations.code, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    recipientName: varchar("recipient_name", { length: 150 }).notNull(),
    accountIdentifier: varchar("account_identifier", { length: 50 }).notNull(),
    qrMediaId: uuid("qr_media_id").references((): AnyPgColumn => mediaAssets.id, {
      onDelete: "set null",
    }),
    instructionText: text("instruction_text").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("payment_instruction_versions_method_version_unique").on(
      table.paymentMethodCode,
      table.versionNumber
    ),
    unique("payment_instruction_versions_id_method_code_unique").on(
      table.id,
      table.paymentMethodCode
    ),
    index("payment_instruction_versions_method_code_idx").on(table.paymentMethodCode),
  ]
);

export type PaymentInstructionVersion = typeof paymentInstructionVersions.$inferSelect;
export type NewPaymentInstructionVersion = typeof paymentInstructionVersions.$inferInsert;

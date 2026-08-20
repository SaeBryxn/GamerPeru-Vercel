import { foreignKey, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { authUsers } from "./auth-users";
import { documentTypeEnum } from "./enums";

/**
 * Customer Profiles Entity
 *
 * Stores customer-facing commerce profile data linked 1-to-1 with Supabase Auth's auth.users.
 * Invariant: auth_user_id is nullable upon account detachment/deletion to preserve historical
 * orders and commerce records, while active accounts have a unique non-null auth_user_id.
 */
export const customerProfiles = pgTable(
  "customer_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    authUserId: uuid("auth_user_id"),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    documentType: documentTypeEnum("document_type"),
    documentNumber: varchar("document_number", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "customer_profiles_auth_user_fk",
      columns: [table.authUserId],
      foreignColumns: [authUsers.id],
    }).onDelete("set null"),
    unique("customer_profiles_auth_user_id_unique").on(table.authUserId),
  ]
);

export type CustomerProfile = typeof customerProfiles.$inferSelect;
export type NewCustomerProfile = typeof customerProfiles.$inferInsert;

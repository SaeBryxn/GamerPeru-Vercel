import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { authUsers } from "./auth-users";
import { documentTypeEnum } from "./enums";

/**
 * Customer Addresses Entity
 *
 * Stores customer delivery address book entries. Subordinate to customer_profiles.
 * Invariant: customer_id is a foreign key to customer_profiles.id with ON DELETE CASCADE.
 * Unique constraint on (customer_id, id) enables composite foreign key from customer_profiles
 * for same-owner default shipping address invariant.
 */
export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    customerId: uuid("customer_id")
      .notNull()
      .references((): AnyPgColumn => customerProfiles.id, { onDelete: "cascade" }),
    recipientName: varchar("recipient_name", { length: 150 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    streetAddress: varchar("street_address", { length: 255 }).notNull(),
    apartmentSuite: varchar("apartment_suite", { length: 100 }),
    department: varchar("department", { length: 100 }).notNull(),
    province: varchar("province", { length: 100 }).notNull(),
    district: varchar("district", { length: 100 }).notNull(),
    postalCode: varchar("postal_code", { length: 20 }),
    referenceNotes: text("reference_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [unique("customer_addresses_customer_id_id_unique").on(table.customerId, table.id)]
);

export type CustomerAddress = typeof customerAddresses.$inferSelect;
export type NewCustomerAddress = typeof customerAddresses.$inferInsert;

/**
 * Customer Profiles Entity
 *
 * Stores customer-facing commerce profile data linked 1-to-1 with Supabase Auth's auth.users.
 * Invariant: auth_user_id is nullable upon account detachment/deletion to preserve historical
 * orders and commerce records, while active accounts have a unique non-null auth_user_id.
 * default_shipping_address_id is a composite foreign key referencing (customer_addresses.customer_id, customer_addresses.id)
 * to enforce that a customer profile can only designate an address owned by itself as default.
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
    defaultShippingAddressId: uuid("default_shipping_address_id"),
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
    foreignKey({
      name: "customer_profiles_default_shipping_address_fk",
      columns: [table.id, table.defaultShippingAddressId],
      foreignColumns: [customerAddresses.customerId, customerAddresses.id],
    })
      .onDelete("no action")
      .onUpdate("no action"),
    unique("customer_profiles_auth_user_id_unique").on(table.authUserId),
  ]
);

export type CustomerProfile = typeof customerProfiles.$inferSelect;
export type NewCustomerProfile = typeof customerProfiles.$inferInsert;

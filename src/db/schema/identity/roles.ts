import { pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";

/**
 * Roles Entity
 *
 * Authoritative RBAC role definitions (e.g. SUPER_ADMIN, ADMIN_CATALOG, ADMIN_ORDERS, ADMIN_SUPPORT, CUSTOMER).
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    name: varchar("name", { length: 50 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [unique("roles_name_unique").on(table.name)]
);

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

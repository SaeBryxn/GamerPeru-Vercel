import { pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";

/**
 * Permissions Entity
 *
 * Authoritative RBAC granular permission strings (e.g. catalog:publish, orders:verify).
 */
export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [unique("permissions_name_unique").on(table.name)]
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;

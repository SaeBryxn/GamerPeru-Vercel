import { foreignKey, index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { roles } from "./roles";

/**
 * User Roles Join Entity
 *
 * Maps staff auth users to their assigned roles with cascade delete semantics on user or role deletion.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    authUserId: uuid("auth_user_id").notNull(),
    roleId: uuid("role_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.authUserId, table.roleId],
      name: "user_roles_pkey",
    }),
    foreignKey({
      name: "user_roles_auth_user_fk",
      columns: [table.authUserId],
      foreignColumns: [authUsers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "user_roles_role_fk",
      columns: [table.roleId],
      foreignColumns: [roles.id],
    }).onDelete("cascade"),
    index("user_roles_role_id_idx").on(table.roleId),
  ]
);

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;

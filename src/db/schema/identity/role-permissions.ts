import { foreignKey, index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { permissions } from "./permissions";
import { roles } from "./roles";

/**
 * Role Permissions Join Entity
 *
 * Maps roles to their granted permissions with cascade delete semantics.
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull(),
    permissionId: uuid("permission_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.roleId, table.permissionId],
      name: "role_permissions_pkey",
    }),
    foreignKey({
      name: "role_permissions_role_fk",
      columns: [table.roleId],
      foreignColumns: [roles.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "role_permissions_permission_fk",
      columns: [table.permissionId],
      foreignColumns: [permissions.id],
    }).onDelete("cascade"),
    index("role_permissions_permission_id_idx").on(table.permissionId),
  ]
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;

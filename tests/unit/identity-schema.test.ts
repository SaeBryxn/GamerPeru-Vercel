import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getTableColumns } from "drizzle-orm";

describe("Identity & RBAC Schema — Physical Bootstrap Integrity (GP-015)", () => {
  it("exports exactly the 5 approved canonical identity & RBAC tables", () => {
    expect(schema.customerProfiles).toBeDefined();
    expect(schema.roles).toBeDefined();
    expect(schema.permissions).toBeDefined();
    expect(schema.rolePermissions).toBeDefined();
    expect(schema.userRoles).toBeDefined();

    // Verify deferred tables are NOT present in this gate
    expect((schema as Record<string, unknown>).customerAddresses).toBeUndefined();
    expect((schema as Record<string, unknown>).wishlistItems).toBeUndefined();
    expect((schema as Record<string, unknown>).reviews).toBeUndefined();
    expect((schema as Record<string, unknown>).orders).toBeUndefined();
    expect((schema as Record<string, unknown>).payments).toBeUndefined();
  });

  it("exports the canonical document_type PostgreSQL enum", () => {
    expect(schema.documentTypeEnum).toBeDefined();
    expect(schema.documentTypeEnum.enumValues).toEqual(["DNI", "CE", "RUC", "PASSPORT"]);
  });

  describe("customer_profiles table", () => {
    it("has canonical column definitions and types", () => {
      const cols = getTableColumns(schema.customerProfiles);
      expect(cols.id).toBeDefined();
      expect(cols.authUserId).toBeDefined();
      expect(cols.firstName).toBeDefined();
      expect(cols.lastName).toBeDefined();
      expect(cols.phone).toBeDefined();
      expect(cols.documentType).toBeDefined();
      expect(cols.documentNumber).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();

      // Ensure default_shipping_address_id is NOT in customer_profiles during GP-015
      expect((cols as Record<string, unknown>).defaultShippingAddressId).toBeUndefined();
    });
  });

  describe("roles table", () => {
    it("has canonical column definitions", () => {
      const cols = getTableColumns(schema.roles);
      expect(cols.id).toBeDefined();
      expect(cols.name).toBeDefined();
      expect(cols.description).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });
  });

  describe("permissions table", () => {
    it("has canonical column definitions", () => {
      const cols = getTableColumns(schema.permissions);
      expect(cols.id).toBeDefined();
      expect(cols.name).toBeDefined();
      expect(cols.description).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });
  });

  describe("role_permissions table", () => {
    it("has canonical composite key column definitions", () => {
      const cols = getTableColumns(schema.rolePermissions);
      expect(cols.roleId).toBeDefined();
      expect(cols.permissionId).toBeDefined();
      expect(cols.createdAt).toBeDefined();

      // Verify no surrogate ID
      expect((cols as Record<string, unknown>).id).toBeUndefined();
    });
  });

  describe("user_roles table", () => {
    it("has canonical composite key column definitions", () => {
      const cols = getTableColumns(schema.userRoles);
      expect(cols.authUserId).toBeDefined();
      expect(cols.roleId).toBeDefined();
      expect(cols.createdAt).toBeDefined();

      // Verify no surrogate ID
      expect((cols as Record<string, unknown>).id).toBeUndefined();
    });
  });
});

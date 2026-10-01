import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getTableColumns } from "drizzle-orm";

describe("Identity & RBAC Schema — Physical Bootstrap Integrity", () => {
  it("exports canonical identity & RBAC tables", () => {
    expect(schema.customerProfiles).toBeDefined();
    expect(schema.customerAddresses).toBeDefined();
    expect(schema.roles).toBeDefined();
    expect(schema.permissions).toBeDefined();
    expect(schema.rolePermissions).toBeDefined();
    expect(schema.userRoles).toBeDefined();

    // Verify deferred tables are NOT present in this gate
    expect((schema as Record<string, unknown>).reviews).toBeUndefined();
    expect((schema as Record<string, unknown>).promotions).toBeUndefined();
    expect((schema as Record<string, unknown>).coupons).toBeUndefined();
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
      expect(cols.defaultShippingAddressId).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });
  });

  describe("roles table", () => {
    it("has canonical column definitions and excludes unauthorized timestamps", () => {
      const cols = getTableColumns(schema.roles);
      expect(cols.id).toBeDefined();
      expect(cols.name).toBeDefined();
      expect(cols.description).toBeDefined();

      // Ensure unauthorized columns are NOT present
      expect((cols as Record<string, unknown>).createdAt).toBeUndefined();
      expect((cols as Record<string, unknown>).updatedAt).toBeUndefined();
    });
  });

  describe("permissions table", () => {
    it("has canonical column definitions and excludes unauthorized description and timestamps", () => {
      const cols = getTableColumns(schema.permissions);
      expect(cols.id).toBeDefined();
      expect(cols.name).toBeDefined();

      // Ensure unauthorized columns are NOT present
      expect((cols as Record<string, unknown>).description).toBeUndefined();
      expect((cols as Record<string, unknown>).createdAt).toBeUndefined();
      expect((cols as Record<string, unknown>).updatedAt).toBeUndefined();
    });
  });

  describe("role_permissions table", () => {
    it("has canonical composite key column definitions and excludes unauthorized timestamps", () => {
      const cols = getTableColumns(schema.rolePermissions);
      expect(cols.roleId).toBeDefined();
      expect(cols.permissionId).toBeDefined();

      // Verify no surrogate ID or timestamps
      expect((cols as Record<string, unknown>).id).toBeUndefined();
      expect((cols as Record<string, unknown>).createdAt).toBeUndefined();
      expect((cols as Record<string, unknown>).updatedAt).toBeUndefined();
    });
  });

  describe("user_roles table", () => {
    it("has canonical composite key column definitions and excludes unauthorized timestamps", () => {
      const cols = getTableColumns(schema.userRoles);
      expect(cols.authUserId).toBeDefined();
      expect(cols.roleId).toBeDefined();

      // Verify no surrogate ID or timestamps
      expect((cols as Record<string, unknown>).id).toBeUndefined();
      expect((cols as Record<string, unknown>).createdAt).toBeUndefined();
      expect((cols as Record<string, unknown>).updatedAt).toBeUndefined();
    });
  });
});

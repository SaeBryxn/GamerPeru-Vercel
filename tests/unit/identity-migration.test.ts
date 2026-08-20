import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

describe("GP-015 — Identity & RBAC Schema and Migration Candidate Integrity", () => {
  it("defines canonical unique constraints, foreign keys, and defaults on customer_profiles", () => {
    const tableConfig = getTableConfig(schema.customerProfiles);

    // Unique constraints
    const uniqueNames = tableConfig.uniqueConstraints.map((uc) => uc.name);
    expect(uniqueNames).toContain("customer_profiles_auth_user_id_unique");

    // Foreign keys
    const fks = tableConfig.foreignKeys;
    const authFk = fks.find((fk) => fk.getName() === "customer_profiles_auth_user_fk");
    expect(authFk, "Missing binding constraint customer_profiles_auth_user_fk").toBeDefined();
    expect(authFk?.onDelete).toBe("set null");
  });

  it("defines canonical unique constraints on roles and permissions", () => {
    const rolesConfig = getTableConfig(schema.roles);
    expect(rolesConfig.uniqueConstraints.map((uc) => uc.name)).toContain("roles_name_unique");

    const permissionsConfig = getTableConfig(schema.permissions);
    expect(permissionsConfig.uniqueConstraints.map((uc) => uc.name)).toContain(
      "permissions_name_unique"
    );
  });

  it("defines canonical composite primary keys, reverse indexes, and foreign keys on role_permissions", () => {
    const tableConfig = getTableConfig(schema.rolePermissions);

    // Primary key
    expect(tableConfig.primaryKeys[0]?.getName()).toBe("role_permissions_pkey");

    // Reverse lookup index on permission_id
    const indexNames = tableConfig.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("role_permissions_permission_id_idx");

    // Foreign keys
    const fks = tableConfig.foreignKeys;
    const roleFk = fks.find((fk) => fk.getName() === "role_permissions_role_fk");
    const permFk = fks.find((fk) => fk.getName() === "role_permissions_permission_fk");

    expect(roleFk, "Missing binding constraint role_permissions_role_fk").toBeDefined();
    expect(roleFk?.reference().foreignTable).toBe(schema.roles);
    expect(roleFk?.onDelete).toBe("cascade");

    expect(permFk, "Missing binding constraint role_permissions_permission_fk").toBeDefined();
    expect(permFk?.reference().foreignTable).toBe(schema.permissions);
    expect(permFk?.onDelete).toBe("cascade");
  });

  it("defines canonical composite primary keys, reverse indexes, and foreign keys on user_roles", () => {
    const tableConfig = getTableConfig(schema.userRoles);

    // Primary key
    expect(tableConfig.primaryKeys[0]?.getName()).toBe("user_roles_pkey");

    // Reverse lookup index on role_id
    const indexNames = tableConfig.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("user_roles_role_id_idx");

    // Foreign keys
    const fks = tableConfig.foreignKeys;
    const authFk = fks.find((fk) => fk.getName() === "user_roles_auth_user_fk");
    const roleFk = fks.find((fk) => fk.getName() === "user_roles_role_fk");

    expect(authFk, "Missing binding constraint user_roles_auth_user_fk").toBeDefined();
    expect(authFk?.onDelete).toBe("cascade");

    expect(roleFk, "Missing binding constraint user_roles_role_fk").toBeDefined();
    expect(roleFk?.reference().foreignTable).toBe(schema.roles);
    expect(roleFk?.onDelete).toBe("cascade");
  });

  it("verifies generated 0004 migration file exists, is pure DDL, and contains exact binding constraints", () => {
    const migrationsDir = resolve(process.cwd(), "src/db/migrations");
    const migrationFiles = readdirSync(migrationsDir).filter(
      (f) => f.startsWith("0004_") && f.endsWith(".sql")
    );
    expect(migrationFiles).toHaveLength(1);
    const migrationFileName = migrationFiles[0];
    expect(migrationFileName).toBeDefined();

    const migrationPath = resolve(migrationsDir, migrationFileName!);
    expect(existsSync(migrationPath)).toBe(true);

    const content = readFileSync(migrationPath, "utf8");

    // Enum created
    expect(content).toContain(
      "CREATE TYPE \"public\".\"document_type\" AS ENUM('DNI', 'CE', 'RUC', 'PASSPORT');"
    );

    // Tables created
    expect(content).toContain('CREATE TABLE "customer_profiles"');
    expect(content).toContain('CREATE TABLE "roles"');
    expect(content).toContain('CREATE TABLE "permissions"');
    expect(content).toContain('CREATE TABLE "role_permissions"');
    expect(content).toContain('CREATE TABLE "user_roles"');

    // Unique constraints
    expect(content).toContain(
      'CONSTRAINT "customer_profiles_auth_user_id_unique" UNIQUE("auth_user_id")'
    );
    expect(content).toContain('CONSTRAINT "roles_name_unique" UNIQUE("name")');
    expect(content).toContain('CONSTRAINT "permissions_name_unique" UNIQUE("name")');

    // Primary keys
    expect(content).toContain(
      'CONSTRAINT "role_permissions_pkey" PRIMARY KEY("role_id","permission_id")'
    );
    expect(content).toContain('CONSTRAINT "user_roles_pkey" PRIMARY KEY("auth_user_id","role_id")');

    // Foreign key constraints
    expect(content).toContain(
      'ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_auth_user_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null'
    );
    expect(content).toContain(
      'ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade'
    );
    expect(content).toContain(
      'ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade'
    );
    expect(content).toContain(
      'ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_auth_user_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade'
    );
    expect(content).toContain(
      'ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade'
    );

    // Indexes
    expect(content).toContain(
      'CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions" USING btree ("permission_id");'
    );
    expect(content).toContain(
      'CREATE INDEX "user_roles_role_id_idx" ON "user_roles" USING btree ("role_id");'
    );

    // Assert absence of unauthorized columns in RBAC tables
    expect(content).not.toMatch(/"roles"[^;]*"created_at"/s);
    expect(content).not.toMatch(/"roles"[^;]*"updated_at"/s);
    expect(content).not.toMatch(/"permissions"[^;]*"description"/s);
    expect(content).not.toMatch(/"permissions"[^;]*"created_at"/s);
    expect(content).not.toMatch(/"permissions"[^;]*"updated_at"/s);
    expect(content).not.toMatch(/"role_permissions"[^;]*"created_at"/s);
    expect(content).not.toMatch(/"user_roles"[^;]*"created_at"/s);

    // Purity: No DROP or DML
    expect(content).not.toMatch(/^\s*DROP\s+/im);
    expect(content).not.toMatch(/INSERT\s+INTO/i);
    expect(content).not.toMatch(/\bUPDATE\s+["a-z_]+\s+SET\b/i);
    expect(content).not.toMatch(/DELETE\s+FROM/i);
  });

  it("verifies Drizzle snapshot metadata records the exact tables and foreign keys", () => {
    const snapshotPath = resolve(process.cwd(), "src/db/migrations/meta/0004_snapshot.json");
    expect(existsSync(snapshotPath)).toBe(true);

    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    expect(snapshot.tables).toHaveProperty("public.customer_profiles");
    expect(snapshot.tables).toHaveProperty("public.roles");
    expect(snapshot.tables).toHaveProperty("public.permissions");
    expect(snapshot.tables).toHaveProperty("public.role_permissions");
    expect(snapshot.tables).toHaveProperty("public.user_roles");

    // Check column counts
    expect(Object.keys(snapshot.tables["public.roles"].columns)).toEqual([
      "id",
      "name",
      "description",
    ]);
    expect(Object.keys(snapshot.tables["public.permissions"].columns)).toEqual(["id", "name"]);
    expect(Object.keys(snapshot.tables["public.role_permissions"].columns)).toEqual([
      "role_id",
      "permission_id",
    ]);
    expect(Object.keys(snapshot.tables["public.user_roles"].columns)).toEqual([
      "auth_user_id",
      "role_id",
    ]);

    const custFks = snapshot.tables["public.customer_profiles"].foreignKeys;
    expect(custFks).toHaveProperty("customer_profiles_auth_user_fk");
    expect(custFks.customer_profiles_auth_user_fk.onDelete).toBe("set null");

    const rolePermFks = snapshot.tables["public.role_permissions"].foreignKeys;
    expect(rolePermFks).toHaveProperty("role_permissions_role_fk");
    expect(rolePermFks.role_permissions_role_fk.onDelete).toBe("cascade");
    expect(rolePermFks).toHaveProperty("role_permissions_permission_fk");
    expect(rolePermFks.role_permissions_permission_fk.onDelete).toBe("cascade");

    const userRoleFks = snapshot.tables["public.user_roles"].foreignKeys;
    expect(userRoleFks).toHaveProperty("user_roles_auth_user_fk");
    expect(userRoleFks.user_roles_auth_user_fk.onDelete).toBe("cascade");
    expect(userRoleFks).toHaveProperty("user_roles_role_fk");
    expect(userRoleFks.user_roles_role_fk.onDelete).toBe("cascade");
  });

  it("verifies Drizzle journal records exactly 5 migrations in sequence", () => {
    const journalPath = resolve(process.cwd(), "src/db/migrations/meta/_journal.json");
    expect(existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    expect(journal.entries).toHaveLength(5);
    expect(journal.entries[0].tag).toBe("0000_superb_ink");
    expect(journal.entries[1].tag).toBe("0001_search_pg_trgm");
    expect(journal.entries[2].tag).toBe("0002_silky_dazzler");
    expect(journal.entries[3].tag).toBe("0003_small_slyde");
    expect(journal.entries[4].tag).toMatch(/^0004_/);
  });
});

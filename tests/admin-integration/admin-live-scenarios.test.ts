import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";

describe("GP-022 / BR1 — Admin & RBAC Real PostgreSQL Physical Verification", () => {
  const rawDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";

  let sql: postgres.Sql;

  const testAuthUserIds = {
    superAdmin: "018f0000-0000-7000-8000-00000000ad01",
    adminCatalog: "018f0000-0000-7000-8000-00000000ad02",
    adminOrders: "018f0000-0000-7000-8000-00000000ad03",
    adminSupport: "018f0000-0000-7000-8000-00000000ad04",
    customer: "018f0000-0000-7000-8000-00000000ad05",
    noRole: "018f0000-0000-7000-8000-00000000ad06",
  };

  beforeAll(async () => {
    // Fail-closed validation: refuse to interact with non-local database target
    const databaseUrl = assertLocalDatabaseTarget(rawDatabaseUrl);
    sql = postgres(databaseUrl, { max: 1 });

    // Seed test auth users for live RBAC resolution verification
    await sql.begin(async (tx) => {
      for (const [key, id] of Object.entries(testAuthUserIds)) {
        await tx`
          INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
          VALUES (${id}, ${`${key}.admintest@gamerperu.pe`}, '{"provider":"email","providers":["email"]}', '{}', false, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
        `;
      }

      // Assign user_roles
      await tx`
        INSERT INTO user_roles (auth_user_id, role_id)
        VALUES
          (${testAuthUserIds.superAdmin}, (SELECT id FROM roles WHERE name = 'SUPER_ADMIN')),
          (${testAuthUserIds.adminCatalog}, (SELECT id FROM roles WHERE name = 'ADMIN_CATALOG')),
          (${testAuthUserIds.adminOrders}, (SELECT id FROM roles WHERE name = 'ADMIN_ORDERS')),
          (${testAuthUserIds.adminSupport}, (SELECT id FROM roles WHERE name = 'ADMIN_SUPPORT')),
          (${testAuthUserIds.customer}, (SELECT id FROM roles WHERE name = 'CUSTOMER'))
        ON CONFLICT DO NOTHING;
      `;
    });
  });

  afterAll(async () => {
    if (sql) {
      await sql.begin(async (tx) => {
        const ids = Object.values(testAuthUserIds);
        await tx`DELETE FROM user_roles WHERE auth_user_id IN ${tx(ids)}`;
        await tx`DELETE FROM auth.users WHERE id IN ${tx(ids)}`;
      });
      await sql.end();
    }
  });

  it("M1: physical database contains the canonical inventory:manage permission with deterministic UUID", async () => {
    const rows = await sql`
      SELECT id, name FROM permissions WHERE name = 'inventory:manage';
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("018f0000-0000-7000-8000-00000000002b");
    expect(rows[0]?.name).toBe("inventory:manage");
  });

  it("M2: physical database maps inventory:manage exclusively to SUPER_ADMIN", async () => {
    const rows = await sql`
      SELECT r.name as role_name, p.name as permission_name
      FROM role_permissions rp
      JOIN roles r ON rp.role_id = r.id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE p.name = 'inventory:manage';
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.role_name).toBe("SUPER_ADMIN");
    expect(rows[0]?.permission_name).toBe("inventory:manage");
  });

  it("M3: physical database proves ADMIN_CATALOG, ADMIN_ORDERS, ADMIN_SUPPORT, CUSTOMER do not have inventory:manage", async () => {
    const rows = await sql`
      SELECT r.name as role_name
      FROM role_permissions rp
      JOIN roles r ON rp.role_id = r.id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE p.name = 'inventory:manage' AND r.name != 'SUPER_ADMIN';
    `;

    expect(rows).toHaveLength(0);
  });

  it("M4: physical database contains all 18 canonical role_permissions mappings (11 SUPER_ADMIN, 3 ADMIN_CATALOG, 2 ADMIN_ORDERS, 2 ADMIN_SUPPORT, 0 CUSTOMER)", async () => {
    const rows = await sql`
      SELECT r.name as role_name, COUNT(p.id)::int as perm_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      GROUP BY r.name
      ORDER BY r.name;
    `;

    const counts = Object.fromEntries(rows.map((r) => [r.role_name, r.perm_count]));

    expect(counts["SUPER_ADMIN"]).toBe(11);
    expect(counts["ADMIN_CATALOG"]).toBe(3);
    expect(counts["ADMIN_ORDERS"]).toBe(2);
    expect(counts["ADMIN_SUPPORT"]).toBe(2);
    expect(counts["CUSTOMER"]).toBe(0);

    const totalRows = await sql`SELECT COUNT(*)::int as total FROM role_permissions;`;
    expect(totalRows[0]?.total).toBe(18);
  });

  it("M5: physical resolution for real SUPER_ADMIN test user yields all 11 permissions", async () => {
    const rows = await sql`
      SELECT p.name as permission_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      JOIN role_permissions rp ON r.id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.auth_user_id = ${testAuthUserIds.superAdmin};
    `;

    const perms = rows.map((r) => r.permission_name);
    expect(perms).toHaveLength(11);
    expect(perms).toContain("inventory:manage");
    expect(perms).toContain("catalog:manage");
    expect(perms).toContain("orders:manage");
    expect(perms).toContain("support:manage");
    expect(perms).toContain("staff:manage");
  });

  it("M6: physical resolution for real ADMIN_CATALOG test user yields 3 catalog permissions and lacks inventory:manage", async () => {
    const rows = await sql`
      SELECT p.name as permission_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      JOIN role_permissions rp ON r.id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.auth_user_id = ${testAuthUserIds.adminCatalog};
    `;

    const perms = rows.map((r) => r.permission_name);
    expect(perms).toHaveLength(3);
    expect(perms).toEqual(
      expect.arrayContaining(["catalog:manage", "catalog:publish", "catalog:ai_research"])
    );
    expect(perms).not.toContain("inventory:manage");
  });

  it("M7: physical resolution for real CUSTOMER test user yields 0 permissions", async () => {
    const rows = await sql`
      SELECT p.name as permission_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      JOIN role_permissions rp ON r.id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.auth_user_id = ${testAuthUserIds.customer};
    `;

    expect(rows).toHaveLength(0);
  });

  it("M8: physical resolution for user with no roles yields 0 permissions", async () => {
    const rows = await sql`
      SELECT p.name as permission_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      JOIN role_permissions rp ON r.id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.auth_user_id = ${testAuthUserIds.noRole};
    `;

    expect(rows).toHaveLength(0);
  });
});

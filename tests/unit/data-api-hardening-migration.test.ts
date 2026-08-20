import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GP-015 — Data API Hardening Migration Candidate Integrity", () => {
  const CANONICAL_TABLES = [
    "brands",
    "categories",
    "category_specification_schemas",
    "customer_profiles",
    "media_assets",
    "permissions",
    "product_media",
    "product_specifications",
    "product_stories",
    "product_story_revisions",
    "product_variants",
    "products",
    "role_permissions",
    "roles",
    "user_roles",
  ] as const;

  it("verifies 0005 migration file exists and is named 0005_data_api_hardening.sql", () => {
    const migrationsDir = resolve(process.cwd(), "src/db/migrations");
    const migrationFiles = readdirSync(migrationsDir).filter(
      (f) => f.startsWith("0005_") && f.endsWith(".sql")
    );
    expect(migrationFiles).toHaveLength(1);
    expect(migrationFiles[0]).toBe("0005_data_api_hardening.sql");
  });

  it("verifies 0005 migration revokes all privileges on all 15 canonical tables from client roles", () => {
    const migrationPath = resolve(process.cwd(), "src/db/migrations/0005_data_api_hardening.sql");
    expect(existsSync(migrationPath)).toBe(true);

    const content = readFileSync(migrationPath, "utf8");

    // All 15 canonical table names must be present in the REVOKE statement
    for (const table of CANONICAL_TABLES) {
      expect(content, `Missing revocation for table: ${table}`).toContain(`"public"."${table}"`);
    }

    // Must revoke from anon, authenticated, and service_role
    expect(content).toContain('"anon"');
    expect(content).toContain('"authenticated"');
    expect(content).toContain('"service_role"');
    expect(content).toMatch(/REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLE/i);
  });

  it("verifies 0005 migration alters default privileges for tables, sequences, and functions", () => {
    const migrationPath = resolve(process.cwd(), "src/db/migrations/0005_data_api_hardening.sql");
    const content = readFileSync(migrationPath, "utf8");

    // Table default privileges revoked
    expect(content).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+"postgres"\s+IN\s+SCHEMA\s+"public"\s+REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLES\s+FROM\s+"anon",\s*"authenticated",\s*"service_role";/i
    );

    // Sequence default privileges revoked
    expect(content).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+"postgres"\s+IN\s+SCHEMA\s+"public"\s+REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+SEQUENCES\s+FROM\s+"anon",\s*"authenticated",\s*"service_role";/i
    );

    // Function default privileges revoked from client roles
    expect(content).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+"postgres"\s+IN\s+SCHEMA\s+"public"\s+REVOKE\s+EXECUTE\s+ON\s+FUNCTIONS\s+FROM\s+"anon",\s*"authenticated",\s*"service_role";/i
    );

    // Function default privileges revoked from PUBLIC
    expect(content).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+"postgres"\s+IN\s+SCHEMA\s+"public"\s+REVOKE\s+EXECUTE\s+ON\s+FUNCTIONS\s+FROM\s+"PUBLIC";/i
    );
  });

  it("verifies 0005 migration contains zero GRANT, RLS, policy, structural DDL, or DML statements", () => {
    const migrationPath = resolve(process.cwd(), "src/db/migrations/0005_data_api_hardening.sql");
    const content = readFileSync(migrationPath, "utf8");

    // Zero GRANT statements
    expect(content).not.toMatch(/\bGRANT\b/i);

    // Zero RLS statements
    expect(content).not.toMatch(/ROW\s+LEVEL\s+SECURITY/i);
    expect(content).not.toMatch(/POLICY/i);

    // Zero structural DDL
    expect(content).not.toMatch(/CREATE\s+TABLE/i);
    expect(content).not.toMatch(/DROP\s+TABLE/i);
    expect(content).not.toMatch(/ALTER\s+TABLE/i);
    expect(content).not.toMatch(/CREATE\s+INDEX/i);
    expect(content).not.toMatch(/DROP\s+INDEX/i);
    expect(content).not.toMatch(/CREATE\s+TYPE/i);
    expect(content).not.toMatch(/DROP\s+TYPE/i);

    // Zero DML
    expect(content).not.toMatch(/INSERT\s+INTO/i);
    expect(content).not.toMatch(/\bUPDATE\s+["a-z_]+\s+SET\b/i);
    expect(content).not.toMatch(/DELETE\s+FROM/i);
    expect(content).not.toMatch(/TRUNCATE/i);
  });

  it("verifies Drizzle journal records exactly 6 migrations in sequence ending with 0005", () => {
    const journalPath = resolve(process.cwd(), "src/db/migrations/meta/_journal.json");
    expect(existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    expect(journal.entries).toHaveLength(6);
    expect(journal.entries[0].tag).toBe("0000_superb_ink");
    expect(journal.entries[1].tag).toBe("0001_search_pg_trgm");
    expect(journal.entries[2].tag).toBe("0002_silky_dazzler");
    expect(journal.entries[3].tag).toBe("0003_small_slyde");
    expect(journal.entries[4].tag).toBe("0004_famous_doomsday");
    expect(journal.entries[5].tag).toBe("0005_data_api_hardening");
  });
});

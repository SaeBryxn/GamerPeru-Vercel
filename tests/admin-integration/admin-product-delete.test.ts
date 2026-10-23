import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import { deleteProduct, duplicateProduct } from "@/lib/admin/catalog/service";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

/**
 * Permanent product delete against the local database: a product with order history is refused,
 * and a never-ordered copy goes with its variants and stock while the audit keeps a snapshot.
 */
describe("Admin product delete (live)", () => {
  const databaseUrl = assertLocalDatabaseTarget(
    process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres"
  );
  let sql: postgres.Sql;
  const auth: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: "018f0000-0000-7000-8000-00000000de01",
    email: "delete.test@gamerperu.pe",
    roles: ["SUPER_ADMIN"],
    permissions: new Set(["catalog:manage", "catalog:publish"]),
  };

  beforeAll(() => {
    sql = postgres(databaseUrl, { max: 1 });
  });
  afterAll(async () => {
    await sql`DELETE FROM audit_events WHERE actor_id = ${auth.authUserId}`;
    await sql.end();
  });

  it("refuses a product that already has orders and leaves it untouched", async () => {
    const [ordered] = await sql<{ id: string; updated_at: Date }[]>`
      SELECT p.id, p.updated_at FROM products p
      WHERE EXISTS (SELECT 1 FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id
                    WHERE v.product_id = p.id)
      LIMIT 1`;
    if (!ordered) return; // No order history in this database to refuse.

    const attempt = deleteProduct(
      { productId: ordered.id, expectedUpdatedAt: ordered.updated_at },
      { authContext: auth }
    );
    await expect(attempt).rejects.toBeInstanceOf(CatalogDomainError);
    await expect(attempt).rejects.toMatchObject({ code: "PRODUCT_HAS_ORDERS" });
    const [still] = await sql`SELECT 1 AS ok FROM products WHERE id = ${ordered.id}`;
    expect(still).toBeTruthy();
  });

  it("deletes a never-ordered product with its variants and records what was removed", async () => {
    const [source] = await sql<{ id: string }[]>`
      SELECT p.id FROM products p
      WHERE EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id
                        WHERE v.product_id = p.id)
      LIMIT 1`;
    expect(source).toBeTruthy();
    const copy = await duplicateProduct(
      {
        sourceProductId: source!.id,
        options: { customName: "Copia para borrar", customSlug: `copia-borrar-${Date.now()}` },
      },
      { authContext: auth }
    );

    const result = await deleteProduct(
      { productId: copy.id, expectedUpdatedAt: copy.updatedAt },
      { authContext: auth }
    );
    expect(result).toEqual({ productId: copy.id, name: "Copia para borrar" });

    const [gone] = await sql`SELECT 1 FROM products WHERE id = ${copy.id}`;
    const variants = await sql`SELECT 1 FROM product_variants WHERE product_id = ${copy.id}`;
    expect(gone).toBeUndefined();
    expect(variants).toHaveLength(0);
    const [audit] = await sql<{ metadata: { name: string; skus: string[] } }[]>`
      SELECT metadata FROM audit_events
      WHERE action = 'catalog:product:delete' AND target_id = ${copy.id}`;
    expect(audit?.metadata.name).toBe("Copia para borrar");
    expect(Array.isArray(audit?.metadata.skus)).toBe(true);
  });

  it("asks for a fresh copy when the product changed since it was opened", async () => {
    const [source] = await sql<{ id: string }[]>`
      SELECT p.id FROM products p
      WHERE NOT EXISTS (SELECT 1 FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id
                        WHERE v.product_id = p.id)
      LIMIT 1`;
    const copy = await duplicateProduct(
      { sourceProductId: source!.id, options: { customSlug: `copia-stale-${Date.now()}` } },
      { authContext: auth }
    );
    try {
      await expect(
        deleteProduct(
          { productId: copy.id, expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
          { authContext: auth }
        )
      ).rejects.toMatchObject({ code: "STALE_WRITE_CONFLICT" });
    } finally {
      await deleteProduct(
        { productId: copy.id, expectedUpdatedAt: copy.updatedAt },
        { authContext: auth }
      );
    }
  });
});

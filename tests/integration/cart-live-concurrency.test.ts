import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import {
  atomicAddCartLine,
  atomicRemoveCartLine,
  atomicUpdateCartLine,
  getOrCreateActiveCart,
  mergeGuestCartIntoAuthenticated,
  queryCartHydrationLines,
  retireCartById,
} from "@/lib/cart/persistence";

/**
 * Strict database URL validator for real local PostgreSQL testing.
 * Hard-fails before any query if hostname !== 127.0.0.1, port !== 54322, or db !== /postgres.
 */
export function assertAuthorizedLocalPostgresTarget(rawUrl: string | undefined): string {
  const urlString = rawUrl ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`[SAFETY_ERROR] Malformed DATABASE_URL: ${urlString}`);
  }

  const hostname = parsed.hostname;
  const port = parsed.port;
  const pathname = parsed.pathname;

  if (hostname !== "127.0.0.1" || port !== "54322" || pathname !== "/postgres") {
    throw new Error(
      `[SAFETY_ERROR] Unauthorized PostgreSQL target for live integration tests. Target must be exactly 127.0.0.1:54322/postgres. Received hostname=${hostname}, port=${port}, pathname=${pathname}.`
    );
  }

  // Explicit rejection of forbidden remote/proxy targets
  if (
    urlString.includes("supabase.co") ||
    urlString.includes("jpjffalmvlxpufvtvskx") ||
    urlString.includes("6543")
  ) {
    throw new Error("[SAFETY_ERROR] Rejected forbidden remote or proxy target.");
  }

  return urlString;
}

describe("GP-017 CART4-R1 — Real Local PostgreSQL Concurrency & Persistence Suite", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);

  let sqlClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  // Synthetic fixture IDs
  const fixturePrefix = "0191c400-0000-7000-8000-";
  const brandId = `${fixturePrefix}000000000001`;
  const categoryId = `${fixturePrefix}000000000002`;
  const productId = `${fixturePrefix}000000000003`;
  const variantId1 = `${fixturePrefix}000000000004`;
  const variantId2 = `${fixturePrefix}000000000005`;
  const authUserId = `${fixturePrefix}000000000006`;
  const customerProfileId = `${fixturePrefix}000000000007`;

  beforeAll(async () => {
    // Fail-closed initialization: connection, schema, and seed MUST succeed or test run terminates with failure
    sqlClient = postgres(connectionString, {
      prepare: false,
      max: 10,
      connect_timeout: 5,
    });

    // Probe connection: throws on connection failure
    await sqlClient`SELECT 1`;
    testDb = drizzle(sqlClient, { schema });

    // Clean prior fixtures and seed fresh synthetic records
    await cleanupSyntheticFixtures();
    await seedSyntheticFixtures();
  });

  afterAll(async () => {
    if (sqlClient) {
      try {
        await cleanupSyntheticFixtures();
      } finally {
        await sqlClient.end();
      }
    }
  });

  async function cleanupSyntheticFixtures() {
    await sqlClient`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerProfileId} OR session_token LIKE 'synth_token_%')`;
    await sqlClient`DELETE FROM carts WHERE customer_id = ${customerProfileId} OR session_token LIKE 'synth_token_%'`;
    await sqlClient`DELETE FROM product_variants WHERE id IN (${variantId1}, ${variantId2})`;
    await sqlClient`DELETE FROM products WHERE id = ${productId}`;
    await sqlClient`DELETE FROM categories WHERE id = ${categoryId}`;
    await sqlClient`DELETE FROM brands WHERE id = ${brandId}`;
    await sqlClient`DELETE FROM customer_profiles WHERE id = ${customerProfileId}`;
    await sqlClient`DELETE FROM auth.users WHERE id = ${authUserId}`.catch(() => {});
  }

  async function seedSyntheticFixtures() {
    // 1. Brand
    await sqlClient`
      INSERT INTO brands (id, name, slug, status, created_at, updated_at)
      VALUES (${brandId}, 'Synthetic Brand', 'synth-brand', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    // 2. Category
    await sqlClient`
      INSERT INTO categories (id, name, slug, status, created_at, updated_at)
      VALUES (${categoryId}, 'Synthetic Category', 'synth-cat', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    // 3. Product
    await sqlClient`
      INSERT INTO products (id, brand_id, category_id, name, slug, status, created_at, updated_at)
      VALUES (${productId}, ${brandId}, ${categoryId}, 'Synthetic Mouse', 'synth-mouse', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    // 4. Product Variants
    await sqlClient`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, created_at, updated_at)
      VALUES 
        (${variantId1}, ${productId}, 'SYNTH-SKU-1', 'Synthetic Variant 1', 19900, 'ACTIVE', NOW(), NOW()),
        (${variantId2}, ${productId}, 'SYNTH-SKU-2', 'Synthetic Variant 2', 24900, 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    // 5. Customer Profile
    await sqlClient`
      INSERT INTO customer_profiles (id, first_name, last_name, created_at, updated_at)
      VALUES (${customerProfileId}, 'Test', 'Customer', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
  }

  describe("Safety Assertions", () => {
    it("strictly asserts local PostgreSQL target 127.0.0.1:54322/postgres and rejects remote/proxy targets", () => {
      expect(() =>
        assertAuthorizedLocalPostgresTarget("postgres://postgres:postgres@127.0.0.1:54322/postgres")
      ).not.toThrow();

      expect(() =>
        assertAuthorizedLocalPostgresTarget("postgres://postgres:secret@127.0.0.1:5432/postgres")
      ).toThrowError(/Unauthorized PostgreSQL target/);

      expect(() =>
        assertAuthorizedLocalPostgresTarget(
          "postgres://user:pass@db.jpjffalmvlxpufvtvskx.supabase.co:5432/postgres"
        )
      ).toThrowError(/Unauthorized PostgreSQL target/);

      expect(() =>
        assertAuthorizedLocalPostgresTarget("postgres://user:pass@127.0.0.1:6543/postgres")
      ).toThrowError(/Unauthorized PostgreSQL target/);
    });
  });

  describe("Canonical Concurrency & Persistence Tests Using Production Primitives", () => {
    it("A. Concurrent anonymous canonical Cart creation yields exactly one ACTIVE Cart", async () => {
      const sessionToken = `synth_token_anon_create_${Date.now()}_${"A".repeat(15)}`;
      const concurrency = 5;

      const creationFn = async () => {
        return testDb.transaction(async (tx) => {
          const cart = await getOrCreateActiveCart({ type: "ANONYMOUS", sessionToken }, tx);
          return cart.id;
        });
      };

      const results = await Promise.all(Array.from({ length: concurrency }, () => creationFn()));
      const uniqueIds = new Set(results);

      expect(uniqueIds.size).toBe(1);

      const activeRows =
        await sqlClient`SELECT * FROM carts WHERE session_token = ${sessionToken} AND status = 'ACTIVE'`;
      expect(activeRows).toHaveLength(1);
    });

    it("B. Concurrent authenticated canonical Cart creation yields exactly one ACTIVE Cart", async () => {
      const concurrency = 5;

      const creationFn = async () => {
        return testDb.transaction(async (tx) => {
          const cart = await getOrCreateActiveCart(
            { type: "AUTHENTICATED", customerProfileId, authUserId: "" },
            tx
          );
          return cart.id;
        });
      };

      const results = await Promise.all(Array.from({ length: concurrency }, () => creationFn()));
      const uniqueIds = new Set(results);

      expect(uniqueIds.size).toBe(1);

      const activeRows =
        await sqlClient`SELECT * FROM carts WHERE customer_id = ${customerProfileId} AND status = 'ACTIVE'`;
      expect(activeRows).toHaveLength(1);
    });

    it("C. Concurrent production line increment results in exactly 3 without lost updates", async () => {
      const sessionToken = `synth_token_inc_${Date.now()}_${"B".repeat(15)}`;

      // Setup: Create cart and add initial quantity 1 using production primitives
      const cart = await testDb.transaction(async (tx) => {
        const c = await getOrCreateActiveCart({ type: "ANONYMOUS", sessionToken }, tx);
        await atomicAddCartLine(c.id, variantId1, 1, tx);
        return c;
      });

      // Concurrent execution of two +1 additions using atomicAddCartLine
      const incrementFn = async () => {
        return testDb.transaction(async (tx) => {
          await atomicAddCartLine(cart.id, variantId1, 1, tx);
        });
      };

      await Promise.all([incrementFn(), incrementFn()]);

      const [itemRow] =
        await sqlClient`SELECT quantity FROM cart_items WHERE cart_id = ${cart.id} AND variant_id = ${variantId1}`;
      expect(itemRow).toBeDefined();
      expect(itemRow!.quantity).toBe(3);
    });

    it("D. Concurrent production cap crossing (initial 8, +3 and +4) caps cleanly at 10 without errors", async () => {
      const sessionToken = `synth_token_cap_${Date.now()}_${"C".repeat(15)}`;

      const cart = await testDb.transaction(async (tx) => {
        const c = await getOrCreateActiveCart({ type: "ANONYMOUS", sessionToken }, tx);
        await atomicAddCartLine(c.id, variantId1, 8, tx);
        return c;
      });

      const addFn = async (qty: number) => {
        return testDb.transaction(async (tx) => {
          await atomicAddCartLine(cart.id, variantId1, qty, tx);
        });
      };

      await expect(Promise.all([addFn(3), addFn(4)])).resolves.toBeDefined();

      const [itemRow] =
        await sqlClient`SELECT quantity FROM cart_items WHERE cart_id = ${cart.id} AND variant_id = ${variantId1}`;
      expect(itemRow).toBeDefined();
      expect(itemRow!.quantity).toBe(10);
    });

    it("E. Concurrent production guest merge incorporates items exactly once and final guest is ABANDONED", async () => {
      const guestToken = `synth_token_merge_${Date.now()}_${"D".repeat(15)}`;

      // Setup: guest cart with 2 of variant1 and 3 of variant2
      const guestCart = await testDb.transaction(async (tx) => {
        const gc = await getOrCreateActiveCart({ type: "ANONYMOUS", sessionToken: guestToken }, tx);
        await atomicAddCartLine(gc.id, variantId1, 2, tx);
        await atomicAddCartLine(gc.id, variantId2, 3, tx);
        return gc;
      });

      // Clear any prior auth cart
      await sqlClient`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerProfileId})`;
      await sqlClient`DELETE FROM carts WHERE customer_id = ${customerProfileId}`;

      // Concurrent merge calls
      const mergeFn = async () => {
        return testDb.transaction(async (tx) => {
          return mergeGuestCartIntoAuthenticated(customerProfileId, guestToken, tx);
        });
      };

      const [resA, resB] = await Promise.all([mergeFn(), mergeFn()]);

      // Exactly one transaction performs the merge
      expect([resA.merged, resB.merged].filter(Boolean)).toHaveLength(1);

      // Verify guest cart final state is ABANDONED (never CONVERTED)
      const [finalGuest] = await sqlClient`SELECT status FROM carts WHERE id = ${guestCart.id}`;
      expect(finalGuest).toBeDefined();
      expect(finalGuest!.status).toBe("ABANDONED");
      expect(finalGuest!.status).not.toBe("CONVERTED");

      // Verify auth cart line quantities
      const authLines = await sqlClient`
        SELECT variant_id, quantity FROM cart_items 
        WHERE cart_id = (SELECT id FROM carts WHERE customer_id = ${customerProfileId} AND status = 'ACTIVE')
      `;
      expect(authLines).toHaveLength(2);
      const v1 = authLines.find((l) => l.variant_id === variantId1);
      const v2 = authLines.find((l) => l.variant_id === variantId2);
      expect(v1).toBeDefined();
      expect(v2).toBeDefined();
      expect(v1!.quantity).toBe(2);
      expect(v2!.quantity).toBe(3);
    });

    it("F. Concurrent production expired ACTIVE replacement transitions old to ABANDONED and creates exactly one new ACTIVE cart", async () => {
      const sessionToken = `synth_token_expired_race_${Date.now()}_${"E".repeat(15)}`;

      // Setup: Insert expired active cart
      const [oldCart] = await sqlClient`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${sessionToken}, 'ACTIVE', 'PEN', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 days', NOW())
        RETURNING id;
      `;
      expect(oldCart).toBeDefined();

      const resolveActiveCartFn = async () => {
        return testDb.transaction(async (tx) => {
          const cart = await getOrCreateActiveCart({ type: "ANONYMOUS", sessionToken }, tx);
          return cart.id;
        });
      };

      const results = await Promise.all([resolveActiveCartFn(), resolveActiveCartFn()]);
      const uniqueIds = new Set(results);

      expect(uniqueIds.size).toBe(1);

      // Old cart is ABANDONED
      const [oldCartCheck] = await sqlClient`SELECT status FROM carts WHERE id = ${oldCart!.id}`;
      expect(oldCartCheck).toBeDefined();
      expect(oldCartCheck!.status).toBe("ABANDONED");

      // Exactly 1 new ACTIVE cart exists
      const activeRows =
        await sqlClient`SELECT id FROM carts WHERE session_token = ${sessionToken} AND status = 'ACTIVE'`;
      expect(activeRows).toHaveLength(1);
      expect(activeRows[0]!.id).not.toBe(oldCart!.id);
    });

    it("G. Production retireCartById transitions cart to ABANDONED without leaving stale ACTIVE rows", async () => {
      const sessionToken = `synth_token_retire_${Date.now()}_${"F".repeat(15)}`;

      const cart = await testDb.transaction(async (tx) => {
        return getOrCreateActiveCart({ type: "ANONYMOUS", sessionToken }, tx);
      });

      await testDb.transaction(async (tx) => {
        await retireCartById(cart.id, tx);
      });

      const [checked] = await sqlClient`SELECT status FROM carts WHERE id = ${cart.id}`;
      expect(checked).toBeDefined();
      expect(checked!.status).toBe("ABANDONED");
    });

    it("H. Production atomicUpdateCartLine returns false when updating nonexistent line item", async () => {
      const sessionToken = `synth_token_upd_missing_${Date.now()}_${"G".repeat(15)}`;

      const cart = await testDb.transaction(async (tx) => {
        return getOrCreateActiveCart({ type: "ANONYMOUS", sessionToken }, tx);
      });

      const result = await testDb.transaction(async (tx) => {
        return atomicUpdateCartLine(cart.id, variantId1, 5, tx);
      });

      expect(result).toBe(false);
    });

    it("I. Production atomicRemoveCartLine returns false and deletes 0 rows when removing nonexistent line item", async () => {
      const sessionToken = `synth_token_rem_missing_${Date.now()}_${"H".repeat(15)}`;

      const cart = await testDb.transaction(async (tx) => {
        return getOrCreateActiveCart({ type: "ANONYMOUS", sessionToken }, tx);
      });

      const result = await testDb.transaction(async (tx) => {
        return atomicRemoveCartLine(cart.id, variantId1, tx);
      });

      expect(result).toBe(false);
    });

    it("J. Production queryCartHydrationLines returns empty array for empty cart", async () => {
      const sessionToken = `synth_token_query_empty_${Date.now()}_${"I".repeat(15)}`;

      const cart = await testDb.transaction(async (tx) => {
        return getOrCreateActiveCart({ type: "ANONYMOUS", sessionToken }, tx);
      });

      const lines = await queryCartHydrationLines(cart.id, testDb);
      expect(lines).toEqual([]);
    });
  });
});

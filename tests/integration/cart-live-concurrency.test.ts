import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import {
  ANONYMOUS_CART_TTL_MS,
  ANONYMOUS_CART_TTL_DAYS,
  ANONYMOUS_TOKEN_REGEX,
} from "@/lib/cart/constants";
import {
  atomicAddCartLine,
  atomicRemoveCartLine,
  getOrCreateActiveCart,
  mergeGuestCartIntoAuthenticated,
  refreshCartTtl,
  resolveAnonymousMutationCart,
  resolveExistingAnonymousMutationCart,
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

describe("GP-017 CART4-R4 — Real Local PostgreSQL Concurrency & Persistence Suite", () => {
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
      VALUES (${brandId}, 'Synthetic Brand', 'synth-brand', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    // 2. Category
    await sqlClient`
      INSERT INTO categories (id, name, slug, status, created_at, updated_at)
      VALUES (${categoryId}, 'Synthetic Category', 'synth-cat', 'PUBLISHED', NOW(), NOW())
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

  describe("Canonical Concurrency & Persistence Tests Using Shared Production Primitives", () => {
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

    it("F. Concurrent production expired anonymous add race retires old cart and converges to exactly one replacement ACTIVE cart with both additions and zero line revival", async () => {
      const sessionToken = `synth_token_expired_race_${Date.now()}_${"E".repeat(15)}`;

      // Setup: Insert expired active cart with variant 1 (quantity 5)
      const [oldCart] = await sqlClient`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${sessionToken}, 'ACTIVE', 'PEN', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 days', NOW())
        RETURNING id;
      `;
      expect(oldCart).toBeDefined();

      await sqlClient`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${oldCart!.id}, ${variantId1}, 5, NOW(), NOW());
      `;

      // Concurrent execution: 8 simultaneous anonymous add mutations with the same known token adding variant 2 (+1 each)
      const addMutationFn = async () => {
        return testDb.transaction(async (tx) => {
          const resolution = await resolveAnonymousMutationCart(sessionToken, false, tx);
          await atomicAddCartLine(resolution.cart.id, variantId2, 1, tx);
          await refreshCartTtl(resolution.cart.id, ANONYMOUS_CART_TTL_MS, tx);
          return { cartId: resolution.cart.id, token: resolution.authoritativeToken };
        });
      };

      const concurrency = 8;
      const promises = Array.from({ length: concurrency }, () => addMutationFn());
      const results = await Promise.all(promises);
      const uniqueIds = new Set(results.map((r) => r.cartId));
      const uniqueTokens = new Set(results.map((r) => r.token));

      // All 8 concurrent resolvers converged to the EXACT SAME replacement cart ID and token
      expect(uniqueIds.size).toBe(1);
      expect(uniqueTokens.size).toBe(1);
      expect(results[0]!.token).toBe(sessionToken);

      // Old cart is ABANDONED
      const [oldCartCheck] = await sqlClient`SELECT status FROM carts WHERE id = ${oldCart!.id}`;
      expect(oldCartCheck).toBeDefined();
      expect(oldCartCheck!.status).toBe("ABANDONED");

      // Exactly 1 new ACTIVE cart exists for the known token
      const activeRows =
        await sqlClient`SELECT id FROM carts WHERE session_token = ${sessionToken} AND status = 'ACTIVE'`;
      expect(activeRows).toHaveLength(1);
      expect(activeRows[0]!.id).not.toBe(oldCart!.id);
      expect(activeRows[0]!.id).toBe(results[0]!.cartId);

      // Verify replacement cart contents: variant 2 has quantity 8
      const replacementLines = await sqlClient`
        SELECT variant_id, quantity FROM cart_items WHERE cart_id = ${results[0]!.cartId}
      `;
      expect(replacementLines).toHaveLength(1);
      expect(replacementLines[0]!.variant_id).toBe(variantId2);
      expect(replacementLines[0]!.quantity).toBe(concurrency);

      // Verify ZERO revival: variant 1 from old expired cart is NOT in replacement cart
      const oldItemInNewCart = replacementLines.find((l) => l.variant_id === variantId1);
      expect(oldItemInNewCart).toBeUndefined();
    });

    it("G. Expired update lifecycle using shared production resolver retires old cart to ABANDONED without modifying line or extending TTL", async () => {
      const sessionToken = `synth_token_upd_exp_${Date.now()}_${"F".repeat(15)}`;

      // Setup: Insert expired active cart with variant 1 (quantity 2)
      const [oldCart] = await sqlClient`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${sessionToken}, 'ACTIVE', 'PEN', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '5 days', NOW())
        RETURNING id;
      `;
      expect(oldCart).toBeDefined();

      await sqlClient`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${oldCart!.id}, ${variantId1}, 2, NOW(), NOW());
      `;

      // Execute expired update resolution using shared production primitive
      const updateResult = await testDb.transaction(async (tx) => {
        return resolveExistingAnonymousMutationCart(sessionToken, false, tx);
      });

      expect(updateResult.success).toBe(false);
      if (!updateResult.success) {
        expect(updateResult.code).toBe("ITEM_NOT_FOUND");
      }

      // Old cart is ABANDONED
      const [oldCartCheck] =
        await sqlClient`SELECT status, expires_at FROM carts WHERE id = ${oldCart!.id}`;
      expect(oldCartCheck!.status).toBe("ABANDONED");
      expect(new Date(oldCartCheck!.expires_at).getTime()).toBeLessThan(Date.now());

      // Line quantity remains unchanged
      const [itemCheck] =
        await sqlClient`SELECT quantity FROM cart_items WHERE cart_id = ${oldCart!.id} AND variant_id = ${variantId1}`;
      expect(itemCheck!.quantity).toBe(2);

      // 0 replacement active carts manufactured for this token
      const activeCarts =
        await sqlClient`SELECT id FROM carts WHERE session_token = ${sessionToken} AND status = 'ACTIVE'`;
      expect(activeCarts).toHaveLength(0);
    });

    it("H. Expired remove lifecycle using shared production resolver retires old cart to ABANDONED without deleting line or extending TTL", async () => {
      const sessionToken = `synth_token_rem_exp_${Date.now()}_${"G".repeat(15)}`;

      // Setup: Insert expired active cart with variant 1 (quantity 2)
      const [oldCart] = await sqlClient`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${sessionToken}, 'ACTIVE', 'PEN', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '3 days', NOW())
        RETURNING id;
      `;
      expect(oldCart).toBeDefined();

      await sqlClient`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${oldCart!.id}, ${variantId1}, 2, NOW(), NOW());
      `;

      // Execute expired remove resolution using shared production primitive
      const removeResult = await testDb.transaction(async (tx) => {
        return resolveExistingAnonymousMutationCart(sessionToken, false, tx);
      });

      expect(removeResult.success).toBe(false);
      if (!removeResult.success) {
        expect(removeResult.code).toBe("ITEM_NOT_FOUND");
      }

      // Old cart is ABANDONED
      const [oldCartCheck] =
        await sqlClient`SELECT status, expires_at FROM carts WHERE id = ${oldCart!.id}`;
      expect(oldCartCheck!.status).toBe("ABANDONED");
      expect(new Date(oldCartCheck!.expires_at).getTime()).toBeLessThan(Date.now());

      // Line was NOT deleted
      const [itemCheck] =
        await sqlClient`SELECT quantity FROM cart_items WHERE cart_id = ${oldCart!.id} AND variant_id = ${variantId1}`;
      expect(itemCheck).toBeDefined();
      expect(itemCheck!.quantity).toBe(2);

      // 0 replacement active carts manufactured for this token
      const activeCarts =
        await sqlClient`SELECT id FROM carts WHERE session_token = ${sessionToken} AND status = 'ACTIVE'`;
      expect(activeCarts).toHaveLength(0);
    });

    it("I. Remove missing line does not refresh Cart TTL", async () => {
      const sessionToken = `synth_token_rem_miss_${Date.now()}_${"H".repeat(15)}`;

      // Setup: Active cart with variant 1
      const [cart] = await sqlClient`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${sessionToken}, 'ACTIVE', 'PEN', NOW() + INTERVAL '10 days', NOW(), NOW())
        RETURNING id, expires_at;
      `;
      expect(cart).toBeDefined();
      const originalExpiresAt = new Date(cart!.expires_at).getTime();

      await sqlClient`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${cart!.id}, ${variantId1}, 1, NOW(), NOW());
      `;

      // Attempt to remove variant 2 (which does not exist in cart)
      const didRemove = await testDb.transaction(async (tx) => {
        return atomicRemoveCartLine(cart!.id, variantId2, tx);
      });
      expect(didRemove).toBe(false);

      // Verify cart expires_at was NOT modified
      const [cartCheck] = await sqlClient`SELECT expires_at FROM carts WHERE id = ${cart!.id}`;
      expect(new Date(cartCheck!.expires_at).getTime()).toBe(originalExpiresAt);
    });

    it("J. Successful anonymous mutation refreshes database sliding TTL to ~30 days", async () => {
      const sessionToken = `synth_token_ttl_slide_${Date.now()}_${"J".repeat(15)}`;

      // Setup: Active cart with short TTL
      const [cart] = await sqlClient`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${sessionToken}, 'ACTIVE', 'PEN', NOW() + INTERVAL '2 days', NOW(), NOW())
        RETURNING id;
      `;
      expect(cart).toBeDefined();

      const nowBefore = Date.now();

      // Mutation: refresh sliding TTL
      await testDb.transaction(async (tx) => {
        await refreshCartTtl(cart!.id, ANONYMOUS_CART_TTL_MS, tx);
      });

      const [cartCheck] = await sqlClient`SELECT expires_at FROM carts WHERE id = ${cart!.id}`;
      const diffMs = new Date(cartCheck!.expires_at).getTime() - nowBefore;
      const diffDays = diffMs / (24 * 60 * 60 * 1000);

      // Refreshed TTL is approximately 30 days
      expect(diffDays).toBeGreaterThan(29.9);
      expect(diffDays).toBeLessThan(30.1);
      expect(ANONYMOUS_CART_TTL_DAYS).toBe(30);
    });

    it("K. ABANDONED token replay rotates strictly to fresh token", async () => {
      const staleToken = `synth_token_abandoned_${Date.now()}_${"K".repeat(15)}`;

      // Setup: historical ABANDONED cart row with variant 1
      const [abandonedCart] = await sqlClient`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${staleToken}, 'ABANDONED', 'PEN', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days', NOW())
        RETURNING id;
      `;
      expect(abandonedCart).toBeDefined();

      await sqlClient`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${abandonedCart!.id}, ${variantId1}, 4, NOW(), NOW());
      `;

      // Call production anonymous mutation resolver with stale abandoned token
      const resolution = await testDb.transaction(async (tx) => {
        return resolveAnonymousMutationCart(staleToken, false, tx);
      });

      // Token MUST rotate to a fresh server token
      expect(resolution.authoritativeToken).not.toBe(staleToken);
      expect(resolution.authoritativeToken).toHaveLength(43);
      expect(ANONYMOUS_TOKEN_REGEX.test(resolution.authoritativeToken)).toBe(true);
      expect(resolution.isNewCart).toBe(true);

      // New ACTIVE cart uses fresh token
      const [activeCart] = await sqlClient`
        SELECT * FROM carts WHERE id = ${resolution.cart.id}
      `;
      expect(activeCart).toBeDefined();
      expect(activeCart!.status).toBe("ACTIVE");
      expect(activeCart!.session_token).toBe(resolution.authoritativeToken);

      // 0 ACTIVE carts for staleToken
      const staleActiveRows = await sqlClient`
        SELECT * FROM carts WHERE session_token = ${staleToken} AND status = 'ACTIVE'
      `;
      expect(staleActiveRows).toHaveLength(0);

      // Historical ABANDONED cart remains unchanged
      const [histCheck] = await sqlClient`
        SELECT status FROM carts WHERE id = ${abandonedCart!.id}
      `;
      expect(histCheck!.status).toBe("ABANDONED");

      // No old lines revived in new cart
      const newLines = await sqlClient`
        SELECT * FROM cart_items WHERE cart_id = ${resolution.cart.id}
      `;
      expect(newLines).toHaveLength(0);
    });

    it("L. CONVERTED token replay rotates strictly to fresh token", async () => {
      const staleToken = `synth_token_converted_${Date.now()}_${"L".repeat(15)}`;

      // Setup: historical CONVERTED cart row with variant 2
      const [convertedCart] = await sqlClient`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${staleToken}, 'CONVERTED', 'PEN', NOW() - INTERVAL '5 days', NOW() - INTERVAL '6 days', NOW())
        RETURNING id;
      `;
      expect(convertedCart).toBeDefined();

      await sqlClient`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${convertedCart!.id}, ${variantId2}, 3, NOW(), NOW());
      `;

      // Call production anonymous mutation resolver with stale converted token
      const resolution = await testDb.transaction(async (tx) => {
        return resolveAnonymousMutationCart(staleToken, false, tx);
      });

      // Token MUST rotate to a fresh server token
      expect(resolution.authoritativeToken).not.toBe(staleToken);
      expect(resolution.authoritativeToken).toHaveLength(43);
      expect(ANONYMOUS_TOKEN_REGEX.test(resolution.authoritativeToken)).toBe(true);
      expect(resolution.isNewCart).toBe(true);

      // New ACTIVE cart uses fresh token
      const [activeCart] = await sqlClient`
        SELECT * FROM carts WHERE id = ${resolution.cart.id}
      `;
      expect(activeCart).toBeDefined();
      expect(activeCart!.status).toBe("ACTIVE");
      expect(activeCart!.session_token).toBe(resolution.authoritativeToken);

      // 0 ACTIVE carts for staleToken
      const staleActiveRows = await sqlClient`
        SELECT * FROM carts WHERE session_token = ${staleToken} AND status = 'ACTIVE'
      `;
      expect(staleActiveRows).toHaveLength(0);

      // Historical CONVERTED cart remains unchanged
      const [histCheck] = await sqlClient`
        SELECT status FROM carts WHERE id = ${convertedCart!.id}
      `;
      expect(histCheck!.status).toBe("CONVERTED");

      // No old lines revived in new cart
      const newLines = await sqlClient`
        SELECT * FROM cart_items WHERE cart_id = ${resolution.cart.id}
      `;
      expect(newLines).toHaveLength(0);
    });

    it("M. repeated/stress expired ACTIVE replacement race across 20 iterations", async () => {
      const iterations = 20;
      const contendersPerIteration = 5;

      for (let i = 0; i < iterations; i++) {
        const stressToken = `synth_token_stress_${Date.now()}_${i}_${"M".repeat(10)}`;

        // Setup expired active cart with variant 1 (qty 3)
        const [oldCart] = await sqlClient`
          INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
          VALUES (${generateUuidV7()}, ${stressToken}, 'ACTIVE', 'PEN', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '1 day', NOW())
          RETURNING id;
        `;

        await sqlClient`
          INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
          VALUES (${generateUuidV7()}, ${oldCart!.id}, ${variantId1}, 3, NOW(), NOW());
        `;

        // Launch 5 concurrent resolvers
        const mutationFn = async () => {
          return testDb.transaction(async (tx) => {
            const resolution = await resolveAnonymousMutationCart(stressToken, false, tx);
            await atomicAddCartLine(resolution.cart.id, variantId2, 1, tx);
            return {
              cartId: resolution.cart.id,
              token: resolution.authoritativeToken,
            };
          });
        };

        const results = await Promise.all(
          Array.from({ length: contendersPerIteration }, () => mutationFn())
        );

        const uniqueCartIds = new Set(results.map((r) => r.cartId));
        const uniqueTokens = new Set(results.map((r) => r.token));

        // Exactly 1 replacement Cart ID and token matches original sessionToken
        expect(uniqueCartIds.size).toBe(1);
        expect(uniqueTokens.size).toBe(1);
        expect(results[0]!.token).toBe(stressToken);

        // Exactly 1 ACTIVE cart in DB for stressToken
        const activeRows = await sqlClient`
          SELECT id FROM carts WHERE session_token = ${stressToken} AND status = 'ACTIVE'
        `;
        expect(activeRows).toHaveLength(1);
        expect(activeRows[0]!.id).toBe(results[0]!.cartId);

        // Old cart is ABANDONED
        const [oldCheck] = await sqlClient`
          SELECT status FROM carts WHERE id = ${oldCart!.id}
        `;
        expect(oldCheck!.status).toBe("ABANDONED");

        // Old lines not revived
        const replacementLines = await sqlClient`
          SELECT variant_id, quantity FROM cart_items WHERE cart_id = ${results[0]!.cartId}
        `;
        const oldLine = replacementLines.find((l) => l.variant_id === variantId1);
        expect(oldLine).toBeUndefined();

        const newLine = replacementLines.find((l) => l.variant_id === variantId2);
        expect(newLine).toBeDefined();
        expect(newLine!.quantity).toBe(contendersPerIteration);
      }
    });
  });
});

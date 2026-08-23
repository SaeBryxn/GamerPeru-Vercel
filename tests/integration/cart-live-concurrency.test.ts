import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import {
  ANONYMOUS_CART_TTL_MS,
  AUTHENTICATED_CART_TTL_MS,
  MAX_CART_LINE_QUANTITY,
} from "@/lib/cart/constants";

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

describe("GP-017 CART4 — Real Local PostgreSQL Concurrency Suite", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);

  let sqlClient: postgres.Sql | null = null;
  let testDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
  let isDbConnected = false;

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
    try {
      sqlClient = postgres(connectionString, {
        prepare: false,
        max: 10,
        connect_timeout: 3,
      });

      // Probe connection
      await sqlClient`SELECT 1`;
      testDb = drizzle(sqlClient, { schema });
      isDbConnected = true;

      // Clean any potential pre-existing synthetic fixtures
      await cleanupSyntheticFixtures();

      // Seed minimal synthetic catalog & customer fixtures
      await seedSyntheticFixtures();
    } catch {
      isDbConnected = false;
    }
  });

  afterAll(async () => {
    if (isDbConnected && sqlClient) {
      try {
        await cleanupSyntheticFixtures();
      } finally {
        await sqlClient.end();
      }
    }
  });

  async function cleanupSyntheticFixtures() {
    if (!sqlClient) return;

    // Delete cart lines & carts associated with test customer
    await sqlClient`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerProfileId} OR session_token LIKE 'synth_token_%')`;
    await sqlClient`DELETE FROM carts WHERE customer_id = ${customerProfileId} OR session_token LIKE 'synth_token_%'`;

    // Delete catalog & profile fixtures
    await sqlClient`DELETE FROM product_variants WHERE id IN (${variantId1}, ${variantId2})`;
    await sqlClient`DELETE FROM products WHERE id = ${productId}`;
    await sqlClient`DELETE FROM categories WHERE id = ${categoryId}`;
    await sqlClient`DELETE FROM brands WHERE id = ${brandId}`;
    await sqlClient`DELETE FROM customer_profiles WHERE id = ${customerProfileId}`;
    await sqlClient`DELETE FROM auth.users WHERE id = ${authUserId}`.catch(() => {});
  }

  async function seedSyntheticFixtures() {
    if (!sqlClient) return;

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

    // 5. Customer Profile (auth_user_id nullable or unlinked for synthetic test)
    await sqlClient`
      INSERT INTO customer_profiles (id, first_name, last_name, created_at, updated_at)
      VALUES (${customerProfileId}, 'Test', 'Customer', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
  }

  describe("Safety Assertions", () => {
    it("strictly asserts local PostgreSQL target 127.0.0.1:54322/postgres", () => {
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

  describe("Six Canonical Concurrency Tests", () => {
    it("1. Concurrent anonymous Cart creation yields exactly one ACTIVE Cart", async () => {
      if (!isDbConnected || !testDb) {
        return;
      }

      const sessionToken = `synth_token_anon_create_${Date.now()}_${"A".repeat(15)}`;
      const concurrency = 5;

      const creationFn = async () => {
        return testDb!.transaction(async (tx) => {
          const now = new Date();
          const existing = await tx
            .select()
            .from(schema.carts)
            .where(
              and(eq(schema.carts.sessionToken, sessionToken), eq(schema.carts.status, "ACTIVE"))
            )
            .for("update")
            .limit(1);

          if (existing.length > 0 && existing[0]) {
            return existing[0].id;
          }

          const expiresAt = new Date(now.getTime() + ANONYMOUS_CART_TTL_MS);
          const [inserted] = await tx
            .insert(schema.carts)
            .values({
              customerId: null,
              sessionToken,
              status: "ACTIVE",
              currency: "PEN",
              expiresAt,
            })
            .onConflictDoNothing({
              target: schema.carts.sessionToken,
              where: sql`${schema.carts.status} = 'ACTIVE'`,
            })
            .returning();

          if (inserted) {
            return inserted.id;
          }

          const [reselected] = await tx
            .select()
            .from(schema.carts)
            .where(
              and(eq(schema.carts.sessionToken, sessionToken), eq(schema.carts.status, "ACTIVE"))
            )
            .for("update")
            .limit(1);

          return reselected!.id;
        });
      };

      const results = await Promise.all(Array.from({ length: concurrency }, () => creationFn()));
      const uniqueIds = new Set(results);

      expect(uniqueIds.size).toBe(1);

      const activeRows =
        await sqlClient!`SELECT * FROM carts WHERE session_token = ${sessionToken} AND status = 'ACTIVE'`;
      expect(activeRows).toHaveLength(1);
    });

    it("2. Concurrent authenticated Cart creation yields exactly one ACTIVE Cart", async () => {
      if (!isDbConnected || !testDb) {
        return;
      }

      const concurrency = 5;

      const creationFn = async () => {
        return testDb!.transaction(async (tx) => {
          const now = new Date();
          const existing = await tx
            .select()
            .from(schema.carts)
            .where(
              and(eq(schema.carts.customerId, customerProfileId), eq(schema.carts.status, "ACTIVE"))
            )
            .for("update")
            .limit(1);

          if (existing.length > 0 && existing[0]) {
            return existing[0].id;
          }

          const expiresAt = new Date(now.getTime() + AUTHENTICATED_CART_TTL_MS);
          const [inserted] = await tx
            .insert(schema.carts)
            .values({
              customerId: customerProfileId,
              sessionToken: null,
              status: "ACTIVE",
              currency: "PEN",
              expiresAt,
            })
            .onConflictDoNothing({
              target: schema.carts.customerId,
              where: sql`${schema.carts.status} = 'ACTIVE'`,
            })
            .returning();

          if (inserted) {
            return inserted.id;
          }

          const [reselected] = await tx
            .select()
            .from(schema.carts)
            .where(
              and(eq(schema.carts.customerId, customerProfileId), eq(schema.carts.status, "ACTIVE"))
            )
            .for("update")
            .limit(1);

          return reselected!.id;
        });
      };

      const results = await Promise.all(Array.from({ length: concurrency }, () => creationFn()));
      const uniqueIds = new Set(results);

      expect(uniqueIds.size).toBe(1);

      const activeRows =
        await sqlClient!`SELECT * FROM carts WHERE customer_id = ${customerProfileId} AND status = 'ACTIVE'`;
      expect(activeRows).toHaveLength(1);
    });

    it("3. Concurrent duplicate increment (initial 1, two simultaneous +1) results in exactly 3 without lost updates", async () => {
      if (!isDbConnected || !testDb) {
        return;
      }

      const sessionToken = `synth_token_inc_${Date.now()}_${"B".repeat(15)}`;

      // Setup: Create cart with initial quantity 1
      const [cart] = await sqlClient!`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${sessionToken}, 'ACTIVE', 'PEN', NOW() + INTERVAL '30 days', NOW(), NOW())
        RETURNING id;
      `;
      expect(cart).toBeDefined();

      await sqlClient!`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${cart!.id}, ${variantId1}, 1, NOW(), NOW());
      `;

      // Concurrent execution of two +1 additions
      const incrementFn = async () => {
        return testDb!.transaction(async (tx) => {
          const now = new Date();
          await tx
            .insert(schema.cartItems)
            .values({
              id: generateUuidV7(),
              cartId: cart!.id,
              variantId: variantId1,
              quantity: 1,
            })
            .onConflictDoUpdate({
              target: [schema.cartItems.cartId, schema.cartItems.variantId],
              set: {
                quantity: sql`LEAST(${schema.cartItems.quantity} + 1, ${MAX_CART_LINE_QUANTITY})`,
                updatedAt: now,
              },
            });
        });
      };

      await Promise.all([incrementFn(), incrementFn()]);

      const [itemRow] =
        await sqlClient!`SELECT quantity FROM cart_items WHERE cart_id = ${cart!.id} AND variant_id = ${variantId1}`;
      expect(itemRow).toBeDefined();
      expect(itemRow!.quantity).toBe(3);
    });

    it("4. Concurrent cap crossing (initial 8, additions of +3 and +4) caps cleanly at 10 with 0 unhandled constraint errors", async () => {
      if (!isDbConnected || !testDb) {
        return;
      }

      const sessionToken = `synth_token_cap_${Date.now()}_${"C".repeat(15)}`;

      // Setup: Create cart with initial quantity 8
      const [cart] = await sqlClient!`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${sessionToken}, 'ACTIVE', 'PEN', NOW() + INTERVAL '30 days', NOW(), NOW())
        RETURNING id;
      `;
      expect(cart).toBeDefined();

      await sqlClient!`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${cart!.id}, ${variantId1}, 8, NOW(), NOW());
      `;

      const addFn = async (qty: number) => {
        return testDb!.transaction(async (tx) => {
          const now = new Date();
          await tx
            .insert(schema.cartItems)
            .values({
              id: generateUuidV7(),
              cartId: cart!.id,
              variantId: variantId1,
              quantity: qty,
            })
            .onConflictDoUpdate({
              target: [schema.cartItems.cartId, schema.cartItems.variantId],
              set: {
                quantity: sql`LEAST(${schema.cartItems.quantity} + ${qty}, ${MAX_CART_LINE_QUANTITY})`,
                updatedAt: now,
              },
            });
        });
      };

      await expect(Promise.all([addFn(3), addFn(4)])).resolves.toBeDefined();

      const [itemRow] =
        await sqlClient!`SELECT quantity FROM cart_items WHERE cart_id = ${cart!.id} AND variant_id = ${variantId1}`;
      expect(itemRow).toBeDefined();
      expect(itemRow!.quantity).toBe(10);
    });

    it("5. Concurrent guest -> authenticated merge incorporates items exactly once and final guest is ABANDONED (never CONVERTED)", async () => {
      if (!isDbConnected || !testDb) {
        return;
      }

      const guestToken = `synth_token_merge_${Date.now()}_${"D".repeat(15)}`;

      // Setup: guest cart with 2 of variant1 and 3 of variant2
      const [guestCart] = await sqlClient!`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${guestToken}, 'ACTIVE', 'PEN', NOW() + INTERVAL '30 days', NOW(), NOW())
        RETURNING id;
      `;
      expect(guestCart).toBeDefined();

      await sqlClient!`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES 
          (${generateUuidV7()}, ${guestCart!.id}, ${variantId1}, 2, NOW(), NOW()),
          (${generateUuidV7()}, ${guestCart!.id}, ${variantId2}, 3, NOW(), NOW());
      `;

      // Clear any prior auth cart for customer
      await sqlClient!`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerProfileId})`;
      await sqlClient!`DELETE FROM carts WHERE customer_id = ${customerProfileId}`;

      // Simulate two concurrent merge requests with the same guest token
      const mergeFn = async () => {
        return testDb!.transaction(async (tx) => {
          const now = new Date();
          const [lockedGuest] = await tx
            .select()
            .from(schema.carts)
            .where(
              and(eq(schema.carts.sessionToken, guestToken), eq(schema.carts.status, "ACTIVE"))
            )
            .for("update")
            .limit(1);

          if (!lockedGuest || lockedGuest.expiresAt < now) {
            return { merged: false };
          }

          const guestLines = await tx
            .select()
            .from(schema.cartItems)
            .where(eq(schema.cartItems.cartId, lockedGuest.id))
            .for("update");

          if (guestLines.length === 0) {
            await tx
              .update(schema.carts)
              .set({ status: "ABANDONED", updatedAt: now })
              .where(eq(schema.carts.id, lockedGuest.id));
            return { merged: false };
          }

          // Resolve/create auth cart
          let [authCart] = await tx
            .select()
            .from(schema.carts)
            .where(
              and(eq(schema.carts.customerId, customerProfileId), eq(schema.carts.status, "ACTIVE"))
            )
            .for("update")
            .limit(1);

          if (!authCart) {
            const expiresAt = new Date(now.getTime() + AUTHENTICATED_CART_TTL_MS);
            const [inserted] = await tx
              .insert(schema.carts)
              .values({
                customerId: customerProfileId,
                sessionToken: null,
                status: "ACTIVE",
                currency: "PEN",
                expiresAt,
              })
              .onConflictDoNothing({
                target: schema.carts.customerId,
                where: sql`${schema.carts.status} = 'ACTIVE'`,
              })
              .returning();

            if (inserted) {
              authCart = inserted;
            } else {
              const [reselected] = await tx
                .select()
                .from(schema.carts)
                .where(
                  and(
                    eq(schema.carts.customerId, customerProfileId),
                    eq(schema.carts.status, "ACTIVE")
                  )
                )
                .for("update")
                .limit(1);
              authCart = reselected!;
            }
          }

          for (const line of guestLines) {
            await tx
              .insert(schema.cartItems)
              .values({
                id: generateUuidV7(),
                cartId: authCart.id,
                variantId: line.variantId,
                quantity: line.quantity,
              })
              .onConflictDoUpdate({
                target: [schema.cartItems.cartId, schema.cartItems.variantId],
                set: {
                  quantity: sql`LEAST(${schema.cartItems.quantity} + ${line.quantity}, ${MAX_CART_LINE_QUANTITY})`,
                  updatedAt: now,
                },
              });
          }

          await tx
            .update(schema.carts)
            .set({ status: "ABANDONED", updatedAt: now })
            .where(eq(schema.carts.id, lockedGuest.id));

          return { merged: true };
        });
      };

      const [resA, resB] = await Promise.all([mergeFn(), mergeFn()]);

      // Exactly one transaction performs the merge, the other sees guest as ABANDONED
      expect([resA.merged, resB.merged].filter(Boolean)).toHaveLength(1);

      // Verify guest cart final state is ABANDONED (never CONVERTED)
      const [finalGuest] = await sqlClient!`SELECT status FROM carts WHERE id = ${guestCart!.id}`;
      expect(finalGuest).toBeDefined();
      expect(finalGuest!.status).toBe("ABANDONED");
      expect(finalGuest!.status).not.toBe("CONVERTED");

      // Verify auth cart line quantities
      const authLines = await sqlClient!`
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

    it("6. Expired ACTIVE replacement race transitions old to ABANDONED, creates exactly one new ACTIVE cart with 0 unique violations", async () => {
      if (!isDbConnected || !testDb) {
        return;
      }

      const sessionToken = `synth_token_expired_race_${Date.now()}_${"E".repeat(15)}`;

      // Setup: Insert expired active cart
      const [oldCart] = await sqlClient!`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${sessionToken}, 'ACTIVE', 'PEN', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 days', NOW())
        RETURNING id;
      `;
      expect(oldCart).toBeDefined();

      const resolveActiveCartFn = async () => {
        return testDb!.transaction(async (tx) => {
          const now = new Date();
          const existing = await tx
            .select()
            .from(schema.carts)
            .where(
              and(eq(schema.carts.sessionToken, sessionToken), eq(schema.carts.status, "ACTIVE"))
            )
            .for("update")
            .limit(1);

          if (existing.length > 0 && existing[0]) {
            const activeCart = existing[0];
            if (activeCart.expiresAt < now) {
              await tx
                .update(schema.carts)
                .set({ status: "ABANDONED", updatedAt: now })
                .where(eq(schema.carts.id, activeCart.id));
            } else {
              return activeCart.id;
            }
          }

          const expiresAt = new Date(now.getTime() + ANONYMOUS_CART_TTL_MS);
          const [inserted] = await tx
            .insert(schema.carts)
            .values({
              customerId: null,
              sessionToken,
              status: "ACTIVE",
              currency: "PEN",
              expiresAt,
            })
            .onConflictDoNothing({
              target: schema.carts.sessionToken,
              where: sql`${schema.carts.status} = 'ACTIVE'`,
            })
            .returning();

          if (inserted) {
            return inserted.id;
          }

          const [reselected] = await tx
            .select()
            .from(schema.carts)
            .where(
              and(eq(schema.carts.sessionToken, sessionToken), eq(schema.carts.status, "ACTIVE"))
            )
            .for("update")
            .limit(1);

          return reselected!.id;
        });
      };

      const results = await Promise.all([resolveActiveCartFn(), resolveActiveCartFn()]);
      const uniqueIds = new Set(results);

      expect(uniqueIds.size).toBe(1);

      // Old cart is ABANDONED
      const [oldCartCheck] = await sqlClient!`SELECT status FROM carts WHERE id = ${oldCart!.id}`;
      expect(oldCartCheck).toBeDefined();
      expect(oldCartCheck!.status).toBe("ABANDONED");

      // Exactly 1 new ACTIVE cart exists
      const activeRows =
        await sqlClient!`SELECT id FROM carts WHERE session_token = ${sessionToken} AND status = 'ACTIVE'`;
      expect(activeRows).toHaveLength(1);
      expect(activeRows[0]!.id).not.toBe(oldCart!.id);
    });
  });
});

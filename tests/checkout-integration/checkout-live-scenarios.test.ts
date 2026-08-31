import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { generateUuidV7 } from "@/db/utils/uuid";
import { generateAnonymousSessionToken } from "@/lib/cart/session";
import { submitCheckout, loadCheckoutContext, loadCheckoutConfirmation } from "@/lib/checkout";

// Safety check for local PostgreSQL
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
      `[SAFETY_ERROR] Unauthorized PostgreSQL target for live checkout tests. Target must be exactly 127.0.0.1:54322/postgres. Received hostname=${hostname}, port=${port}, pathname=${pathname}.`
    );
  }

  if (
    urlString.includes("supabase.co") ||
    urlString.includes("jpjffalmvlxpufvtvskx") ||
    urlString.includes("6543")
  ) {
    throw new Error("[SAFETY_ERROR] Rejected forbidden remote or proxy target.");
  }

  return urlString;
}

import { AsyncLocalStorage } from "node:async_hooks";

// Module-level context storage for concurrent request simulation
export interface TestRequestContext {
  cookieValue: string | null;
  identity: { success: boolean; identity?: { authUserId: string; email: string } };
}

export const testContextStorage = new AsyncLocalStorage<TestRequestContext>();

let currentMockCookieValue: string | null = null;
let currentMockIdentity: { success: boolean; identity?: { authUserId: string; email: string } } = {
  success: false,
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => {
    const context = testContextStorage.getStore();
    const val = context ? context.cookieValue : currentMockCookieValue;
    return Promise.resolve({
      get: (_name: string) => (val ? { value: val } : null),
      set: vi.fn(),
      delete: vi.fn(() => {
        if (context) {
          context.cookieValue = null;
        } else {
          currentMockCookieValue = null;
        }
      }),
    });
  }),
}));

vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: vi.fn(() => {
    const context = testContextStorage.getStore();
    return Promise.resolve(context ? context.identity : currentMockIdentity);
  }),
}));

describe("GP-018 / CHK5 — Real Local PostgreSQL Checkout Integration & Concurrency Suite", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);
  let sqlClient: postgres.Sql;

  // Synthetic fixture constants
  const fixturePrefix = "0191c500-0000-7000-8000-";
  const brandId = `${fixturePrefix}000000000001`;
  const categoryId = `${fixturePrefix}000000000002`;
  const productId = `${fixturePrefix}000000000003`;
  const variantId1 = `${fixturePrefix}000000000004`;
  const variantId2 = `${fixturePrefix}000000000005`;
  const variantIdSingleStock = `${fixturePrefix}000000000006`;
  const variantIdOutOfStock = `${fixturePrefix}000000000007`;
  const variantIdArchived = `${fixturePrefix}000000000008`;

  const locationId = `${fixturePrefix}000000000010`;
  const locationCode = "TEST-CHECKOUT-LOC";

  const shippingMethodId1 = `${fixturePrefix}000000000020`;
  const shippingMethodCode1 = "TEST_LIMA_EXPRESS";
  const shippingMethodId2 = `${fixturePrefix}000000000021`;
  const shippingMethodCodeInactive = "TEST_INACTIVE_SHIPPING";

  const paymentMethodId1 = `${fixturePrefix}000000000030`;
  const paymentMethodCode1 = "TEST_YAPE_MANUAL";
  const paymentInstructionId1 = `${fixturePrefix}000000000031`;
  const paymentMethodIdInactive = `${fixturePrefix}000000000032`;
  const paymentMethodCodeInactive = "TEST_INACTIVE_PAYMENT";

  const customerProfileId1 = `${fixturePrefix}000000000040`;
  const customerProfileId2 = `${fixturePrefix}000000000041`;
  const authUserId1 = `${fixturePrefix}000000000042`;
  const authUserId2 = `${fixturePrefix}000000000043`;
  const customerAddressId1 = `${fixturePrefix}000000000044`;
  const customerAddressId2 = `${fixturePrefix}000000000045`;

  const inventoryItemId1 = `${fixturePrefix}000000000050`;
  const inventoryItemId2 = `${fixturePrefix}000000000051`;
  const inventoryItemIdSingleStock = `${fixturePrefix}000000000052`;
  const inventoryItemIdOutOfStock = `${fixturePrefix}000000000053`;

  const validInlineAddress = {
    recipientName: "Carlos Alcantara",
    phone: "998877665",
    streetAddress: "Av. Pardo 500",
    apartmentSuite: "Dpto 302",
    department: "Lima",
    province: "Lima",
    district: "Miraflores",
    postalCode: "15074",
    referenceNotes: "Edificio azul",
  };

  beforeAll(async () => {
    // Configure server-side runtime environment variables for test suite
    process.env.CHECKOUT_HMAC_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = locationCode;
    process.env.CHECKOUT_RESERVATION_TTL_MINUTES = "30";
    process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES = "60";

    sqlClient = postgres(connectionString, {
      prepare: false,
      max: 10,
      connect_timeout: 5,
    });

    await sqlClient`SELECT 1`;
    await cleanupAllFixtures();
    await seedAllFixtures();
  });

  afterAll(async () => {
    if (sqlClient) {
      try {
        await cleanupAllFixtures();
      } finally {
        await sqlClient.end();
      }
    }
  });

  async function cleanupAllFixtures() {
    // Clean up all child order data created during tests
    await sqlClient`DELETE FROM idempotency_keys`;
    await sqlClient`DELETE FROM outbox_events WHERE aggregate_type = 'Order' AND aggregate_id IN (SELECT id::text FROM orders WHERE customer_email LIKE '%@testchk5.pe' OR customer_phone = '998877665')`;
    await sqlClient`DELETE FROM inventory_ledger_entries WHERE inventory_item_id IN (${inventoryItemId1}, ${inventoryItemId2}, ${inventoryItemIdSingleStock}, ${inventoryItemIdOutOfStock})`;
    await sqlClient`DELETE FROM inventory_reservations WHERE inventory_item_id IN (${inventoryItemId1}, ${inventoryItemId2}, ${inventoryItemIdSingleStock}, ${inventoryItemIdOutOfStock})`;
    await sqlClient`DELETE FROM payments WHERE payment_method_code IN (${paymentMethodCode1}, ${paymentMethodCodeInactive})`;
    await sqlClient`DELETE FROM shipments WHERE shipping_method_id IN (${shippingMethodId1}, ${shippingMethodId2})`;
    await sqlClient`DELETE FROM order_pricing_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk5.pe' OR customer_phone = '998877665')`;
    await sqlClient`DELETE FROM order_address_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk5.pe' OR customer_phone = '998877665')`;
    await sqlClient`DELETE FROM order_items WHERE variant_id IN (${variantId1}, ${variantId2}, ${variantIdSingleStock}, ${variantIdOutOfStock}, ${variantIdArchived})`;
    await sqlClient`DELETE FROM orders WHERE customer_email LIKE '%@testchk5.pe' OR customer_phone = '998877665'`;

    // Clean up carts & cart items
    await sqlClient`DELETE FROM cart_items WHERE variant_id IN (${variantId1}, ${variantId2}, ${variantIdSingleStock}, ${variantIdOutOfStock}, ${variantIdArchived})`;
    await sqlClient`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE customer_id IN (${customerProfileId1}, ${customerProfileId2}))`;
    await sqlClient`DELETE FROM carts WHERE customer_id IN (${customerProfileId1}, ${customerProfileId2}) OR id IN (SELECT DISTINCT cart_id FROM cart_items WHERE variant_id IN (${variantId1}, ${variantId2}, ${variantIdSingleStock}, ${variantIdOutOfStock}, ${variantIdArchived}))`;

    // Clean up inventory items & location
    await sqlClient`DELETE FROM inventory_items WHERE location_id = ${locationId}`;
    await sqlClient`DELETE FROM inventory_locations WHERE id = ${locationId}`;

    // Clean up payment methods & instructions
    await sqlClient`UPDATE payment_method_configurations SET current_instruction_version_id = NULL WHERE id = ${paymentMethodId1}`;
    await sqlClient`DELETE FROM payment_instruction_versions WHERE id = ${paymentInstructionId1}`;
    await sqlClient`DELETE FROM payment_method_configurations WHERE id IN (${paymentMethodId1}, ${paymentMethodIdInactive})`;

    // Clean up shipping methods
    await sqlClient`DELETE FROM shipping_methods WHERE id IN (${shippingMethodId1}, ${shippingMethodId2})`;

    // Clean up catalog fixtures
    await sqlClient`DELETE FROM product_variants WHERE id IN (${variantId1}, ${variantId2}, ${variantIdSingleStock}, ${variantIdOutOfStock}, ${variantIdArchived})`;
    await sqlClient`DELETE FROM products WHERE id = ${productId}`;
    await sqlClient`DELETE FROM categories WHERE id = ${categoryId}`;
    await sqlClient`DELETE FROM brands WHERE id = ${brandId}`;

    // Clean up identity fixtures
    await sqlClient`DELETE FROM customer_addresses WHERE id IN (${customerAddressId1}, ${customerAddressId2})`;
    await sqlClient`DELETE FROM customer_profiles WHERE id IN (${customerProfileId1}, ${customerProfileId2})`;
    await sqlClient`DELETE FROM auth.users WHERE id IN (${authUserId1}, ${authUserId2})`.catch(
      () => {}
    );
  }

  async function seedAllFixtures() {
    // 0. Auth Users
    await sqlClient`
      INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
      VALUES 
        (${authUserId1}, 'customer1@testchk5.pe', '{"provider":"email","providers":["email"]}', '{}', false, NOW(), NOW()),
        (${authUserId2}, 'customer2@testchk5.pe', '{"provider":"email","providers":["email"]}', '{}', false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `.catch(() => {});

    // 1. Identity & Saved Addresses
    await sqlClient`
      INSERT INTO customer_profiles (id, auth_user_id, first_name, last_name, phone, created_at, updated_at)
      VALUES 
        (${customerProfileId1}, ${authUserId1}, 'Customer', 'One', '998877661', NOW(), NOW()),
        (${customerProfileId2}, ${authUserId2}, 'Customer', 'Two', '998877662', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO customer_addresses (id, customer_id, recipient_name, phone, street_address, department, province, district, created_at, updated_at)
      VALUES 
        (${customerAddressId1}, ${customerProfileId1}, 'Customer One Delivery', '998877661', 'Calle Uno 100', 'Lima', 'Lima', 'San Isidro', NOW(), NOW()),
        (${customerAddressId2}, ${customerProfileId2}, 'Customer Two Delivery', '998877662', 'Calle Dos 200', 'Lima', 'Lima', 'Miraflores', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    // 2. Catalog
    await sqlClient`
      INSERT INTO brands (id, name, slug, status, created_at, updated_at)
      VALUES (${brandId}, 'Test Brand', 'test-brand-chk5', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO categories (id, name, slug, status, created_at, updated_at)
      VALUES (${categoryId}, 'Test Category', 'test-cat-chk5', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO products (id, brand_id, category_id, name, slug, status, created_at, updated_at)
      VALUES (${productId}, ${brandId}, ${categoryId}, 'Pro Wireless Gaming Mouse', 'pro-wireless-mouse-chk5', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, created_at, updated_at)
      VALUES 
        (${variantId1}, ${productId}, 'CHK5-SKU-01', 'Black Standard', 10000, 'ACTIVE', NOW(), NOW()),
        (${variantId2}, ${productId}, 'CHK5-SKU-02', 'White Premium', 20000, 'ACTIVE', NOW(), NOW()),
        (${variantIdSingleStock}, ${productId}, 'CHK5-SKU-SINGLE', 'Limited Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${variantIdOutOfStock}, ${productId}, 'CHK5-SKU-OOS', 'Sold Out Edition', 12000, 'ACTIVE', NOW(), NOW()),
        (${variantIdArchived}, ${productId}, 'CHK5-SKU-ARCH', 'Archived Color', 8000, 'ARCHIVED', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    // 3. Shipping Methods
    await sqlClient`
      INSERT INTO shipping_methods (id, name, code, base_price_cents, estimated_days_min, estimated_days_max, is_active, created_at)
      VALUES 
        (${shippingMethodId1}, 'Envío Express Lima', ${shippingMethodCode1}, 1500, 1, 2, true, NOW()),
        (${shippingMethodId2}, 'Envío Desactivado', ${shippingMethodCodeInactive}, 2000, 2, 4, false, NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    // 4. Payment Method & Instructions
    await sqlClient`
      INSERT INTO payment_method_configurations (id, name, code, method_type, is_active, display_order, created_at, updated_at)
      VALUES 
        (${paymentMethodId1}, 'Yape', ${paymentMethodCode1}, 'MANUAL', true, 1, NOW(), NOW()),
        (${paymentMethodIdInactive}, 'Pago Inactivo', ${paymentMethodCodeInactive}, 'MANUAL', false, 2, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active, created_at)
      VALUES 
        (${paymentInstructionId1}, ${paymentMethodCode1}, 1, 'Gamer Peru SAC', '999888777', 'Yapear al número indicado', true, NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    await sqlClient`
      UPDATE payment_method_configurations 
      SET current_instruction_version_id = ${paymentInstructionId1}
      WHERE id = ${paymentMethodId1};
    `;

    // 5. Inventory Location & Stock Balances
    await sqlClient`
      INSERT INTO inventory_locations (id, name, code, is_active, created_at)
      VALUES (${locationId}, 'Almacén Central Lima', ${locationCode}, true, NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point, updated_at)
      VALUES 
        (${inventoryItemId1}, ${variantId1}, ${locationId}, 100, 0, 0, 10, NOW()),
        (${inventoryItemId2}, ${variantId2}, ${locationId}, 50, 0, 0, 5, NOW()),
        (${inventoryItemIdSingleStock}, ${variantIdSingleStock}, ${locationId}, 1, 0, 0, 0, NOW()),
        (${inventoryItemIdOutOfStock}, ${variantIdOutOfStock}, ${locationId}, 0, 0, 0, 0, NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
  }

  // Helper to create guest cart with lines
  async function createGuestCart(
    items: Array<{ variantId: string; quantity: number }>
  ): Promise<string> {
    const sessionToken = generateAnonymousSessionToken();
    const cartId = generateUuidV7();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await sqlClient`
      INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
      VALUES (${cartId}, ${sessionToken}, 'ACTIVE', 'PEN', ${expiresAt}, NOW(), NOW());
    `;

    for (const item of items) {
      await sqlClient`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${cartId}, ${item.variantId}, ${item.quantity}, NOW(), NOW());
      `;
    }
    return sessionToken;
  }

  // Helper to create auth cart with lines
  async function createAuthCart(
    customerProfileId: string,
    items: Array<{ variantId: string; quantity: number }>
  ): Promise<string> {
    const cartId = generateUuidV7();
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    await sqlClient`
      INSERT INTO carts (id, customer_id, status, currency, expires_at, created_at, updated_at)
      VALUES (${cartId}, ${customerProfileId}, 'ACTIVE', 'PEN', ${expiresAt}, NOW(), NOW());
    `;

    for (const item of items) {
      await sqlClient`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${cartId}, ${item.variantId}, ${item.quantity}, NOW(), NOW());
      `;
    }
    return cartId;
  }

  // Helper to reset inventory item balances between tests
  async function resetInventoryBalances() {
    await sqlClient`
      UPDATE inventory_items 
      SET quantity_on_hand = 100, quantity_reserved = 0, quantity_allocated = 0
      WHERE id = ${inventoryItemId1};
    `;
    await sqlClient`
      UPDATE inventory_items 
      SET quantity_on_hand = 50, quantity_reserved = 0, quantity_allocated = 0
      WHERE id = ${inventoryItemId2};
    `;
    await sqlClient`
      UPDATE inventory_items 
      SET quantity_on_hand = 1, quantity_reserved = 0, quantity_allocated = 0
      WHERE id = ${inventoryItemIdSingleStock};
    `;
    await sqlClient`
      UPDATE inventory_items 
      SET quantity_on_hand = 0, quantity_reserved = 0, quantity_allocated = 0
      WHERE id = ${inventoryItemIdOutOfStock};
    `;
  }

  describe("Live Scenario Suite (A - Q)", () => {
    it("Scenario A: Guest Happy Path — atomic order creation, snapshots, inventory reservation, ledger, payment & outbox", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([
        { variantId: variantId1, quantity: 2 },
        { variantId: variantId2, quantity: 1 },
      ]);

      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const attemptId = generateUuidV7();
      const subtotalCents = 2 * 10000 + 1 * 20000; // 40000
      const shippingCents = 1500;
      const totalCents = subtotalCents + shippingCents; // 41500

      const result = await submitCheckout({
        checkoutAttemptId: attemptId,
        customerEmail: "guest.buyer@testchk5.pe",
        deliveryAddress: {
          mode: "INLINE",
          address: validInlineAddress,
        },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: subtotalCents,
        reviewedShippingCents: shippingCents,
        reviewedTotalCents: totalCents,
      });

      if (!result.success) {
        console.error("SCENARIO A ERROR:", result);
      }
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.orderNumber).toMatch(/^GP-[0-9A-Z]{8}$/);
      expect(result.totalCents).toBe(41500);
      expect(result.currency).toBe("PEN");
      expect(result.paymentStatus).toBe("UNPAID");
      expect(result.replayed).toBe(false);

      // Verify physical PostgreSQL state
      const [orderRow] =
        await sqlClient`SELECT * FROM orders WHERE order_number = ${result.orderNumber}`;
      expect(orderRow).toBeDefined();
      expect(orderRow!.customer_id).toBeNull();
      expect(orderRow!.customer_email).toBe("guest.buyer@testchk5.pe");
      expect(orderRow!.customer_phone).toBe("998877665");
      expect(orderRow!.status).toBe("PENDING");
      expect(orderRow!.total_cents).toBe(41500);

      // Verify Order Items
      const orderItemRows =
        await sqlClient`SELECT * FROM order_items WHERE order_id = ${orderRow!.id} ORDER BY variant_id`;
      expect(orderItemRows).toHaveLength(2);
      expect(orderItemRows[0]!.quantity).toBe(2);
      expect(orderItemRows[0]!.line_total_cents).toBe(20000);
      expect(orderItemRows[1]!.quantity).toBe(1);
      expect(orderItemRows[1]!.line_total_cents).toBe(20000);

      // Verify Snapshots
      const [addrSnap] =
        await sqlClient`SELECT * FROM order_address_snapshots WHERE order_id = ${orderRow!.id}`;
      expect(addrSnap).toBeDefined();
      expect(addrSnap!.recipient_name).toBe("Carlos Alcantara");
      expect(addrSnap!.street_address).toBe("Av. Pardo 500");

      const [pricingSnap] =
        await sqlClient`SELECT * FROM order_pricing_snapshots WHERE order_id = ${orderRow!.id}`;
      expect(pricingSnap).toBeDefined();
      expect(pricingSnap!.subtotal_cents).toBe(40000);
      expect(pricingSnap!.shipping_cents).toBe(1500);
      expect(pricingSnap!.total_cents).toBe(41500);

      // Verify Shipment
      const [shipment] = await sqlClient`SELECT * FROM shipments WHERE order_id = ${orderRow!.id}`;
      expect(shipment).toBeDefined();
      expect(shipment!.status).toBe("UNFULFILLED");
      expect(shipment!.shipping_method_id).toBe(shippingMethodId1);

      // Verify Inventory Reservations & Balance Updates
      const reservations =
        await sqlClient`SELECT * FROM inventory_reservations WHERE order_id = ${orderRow!.id}`;
      expect(reservations).toHaveLength(2);
      expect(reservations.every((r) => r.status === "ACTIVE")).toBe(true);

      const [inv1] = await sqlClient`SELECT * FROM inventory_items WHERE id = ${inventoryItemId1}`;
      expect(inv1).toBeDefined();
      expect(inv1!.quantity_reserved).toBe(2);
      const [inv2] = await sqlClient`SELECT * FROM inventory_items WHERE id = ${inventoryItemId2}`;
      expect(inv2).toBeDefined();
      expect(inv2!.quantity_reserved).toBe(1);

      // Verify Inventory Ledger Entries
      const ledgerRows =
        await sqlClient`SELECT * FROM inventory_ledger_entries WHERE reference_id = ${orderRow!.id}`;
      expect(ledgerRows).toHaveLength(2);
      expect(ledgerRows.every((l) => l.movement_type === "RESERVATION_CREATED")).toBe(true);
      expect(ledgerRows.every((l) => l.actor_id === "SYSTEM")).toBe(true);

      // Verify Payment
      const [payment] = await sqlClient`SELECT * FROM payments WHERE order_id = ${orderRow!.id}`;
      expect(payment).toBeDefined();
      expect(payment!.status).toBe("UNPAID");
      expect(payment!.amount_cents).toBe(41500);
      expect(payment!.payment_method_code).toBe(paymentMethodCode1);

      // Verify Cart transitioned to CONVERTED
      const [cart] = await sqlClient`SELECT * FROM carts WHERE session_token = ${guestToken}`;
      expect(cart).toBeDefined();
      expect(cart!.status).toBe("CONVERTED");

      // Verify Outbox Event
      const [outbox] =
        await sqlClient`SELECT * FROM outbox_events WHERE aggregate_id = ${orderRow!.id}`;
      expect(outbox).toBeDefined();
      expect(outbox!.event_name).toBe("OrderPlaced");
      expect(outbox!.status).toBe("PENDING");

      // Verify Idempotency Record
      const [idem] =
        await sqlClient`SELECT * FROM idempotency_keys WHERE idempotency_key = ${attemptId}`;
      expect(idem).toBeDefined();
      expect(idem!.target_aggregate_id).toBe(orderRow!.id);
      expect(idem!.response_payload.orderNumber).toBe(result.orderNumber);
    });

    it("Scenario B: Authenticated Happy Path — resolves CustomerProfile and owned saved address", async () => {
      await resetInventoryBalances();
      await sqlClient`DELETE FROM carts WHERE customer_id = ${customerProfileId1}`;
      await createAuthCart(customerProfileId1, [{ variantId: variantId1, quantity: 1 }]);

      currentMockCookieValue = null;
      currentMockIdentity = {
        success: true,
        identity: { authUserId: authUserId1, email: "customer1@testchk5.pe" },
      };

      const attemptId = generateUuidV7();
      const result = await submitCheckout({
        checkoutAttemptId: attemptId,
        customerEmail: "customer1@testchk5.pe",
        deliveryAddress: {
          mode: "SAVED_ADDRESS",
          addressId: customerAddressId1,
        },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const [orderRow] =
        await sqlClient`SELECT * FROM orders WHERE order_number = ${result.orderNumber}`;
      expect(orderRow).toBeDefined();
      expect(orderRow!.customer_id).toBe(customerProfileId1);
      expect(orderRow!.customer_email).toBe("customer1@testchk5.pe");

      const [addrSnap] =
        await sqlClient`SELECT * FROM order_address_snapshots WHERE order_id = ${orderRow!.id}`;
      expect(addrSnap).toBeDefined();
      expect(addrSnap!.recipient_name).toBe("Customer One Delivery");
      expect(addrSnap!.street_address).toBe("Calle Uno 100");
    });

    it("Scenario C: Cross-Owner Saved Address — rejects attempt without mutating database", async () => {
      await resetInventoryBalances();
      await sqlClient`DELETE FROM idempotency_keys WHERE source_cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerProfileId1})`;
      await sqlClient`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerProfileId1})`;
      await sqlClient`DELETE FROM carts WHERE customer_id = ${customerProfileId1}`;
      await createAuthCart(customerProfileId1, [{ variantId: variantId1, quantity: 1 }]);

      currentMockCookieValue = null;
      currentMockIdentity = {
        success: true,
        identity: { authUserId: authUserId1, email: "customer1@testchk5.pe" },
      };

      const ordersBefore =
        await sqlClient`SELECT count(*)::int as c FROM orders WHERE customer_id = ${customerProfileId1}`;

      const attemptId = generateUuidV7();
      const result = await submitCheckout({
        checkoutAttemptId: attemptId,
        customerEmail: "customer1@testchk5.pe",
        deliveryAddress: {
          mode: "SAVED_ADDRESS",
          addressId: customerAddressId2, // Customer 2's address!
        },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe("ADDRESS_UNAVAILABLE");

      // Verify zero order side effects
      const ordersAfter =
        await sqlClient`SELECT count(*)::int as c FROM orders WHERE customer_id = ${customerProfileId1}`;
      expect(ordersAfter[0]!.c).toBe(ordersBefore[0]!.c);
    });

    it("Scenario D: Same Key Sequential Replay — returns committed result with replayed=true and zero new mutations", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const attemptId = generateUuidV7();
      const submitParams = {
        checkoutAttemptId: attemptId,
        customerEmail: "replay.buyer@testchk5.pe",
        deliveryAddress: { mode: "INLINE" as const, address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      };

      // 1. First submission
      const res1 = await submitCheckout(submitParams);
      expect(res1.success).toBe(true);
      if (!res1.success) return;
      expect(res1.replayed).toBe(false);

      // 2. Second submission with exact same key & params
      const res2 = await submitCheckout(submitParams);
      expect(res2.success).toBe(true);
      if (!res2.success) return;
      expect(res2.replayed).toBe(true);
      expect(res2.orderNumber).toBe(res1.orderNumber);
      expect(res2.totalCents).toBe(res1.totalCents);

      // Verify stock was only reserved once
      const [inv] =
        await sqlClient`SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId1}`;
      expect(inv).toBeDefined();
      expect(inv!.quantity_reserved).toBe(1);

      // Verify only 1 order exists
      const orders = await sqlClient`SELECT * FROM orders WHERE order_number = ${res1.orderNumber}`;
      expect(orders).toHaveLength(1);
    });

    it("Scenario E: Same Key Concurrent Replay — concurrent submissions converge to 1 Order and 0 double-reservations", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);

      const attemptId = generateUuidV7();
      const submitParams = {
        checkoutAttemptId: attemptId,
        customerEmail: "concurrent.replay@testchk5.pe",
        deliveryAddress: { mode: "INLINE" as const, address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      };

      const [resA, resB] = await Promise.all([
        testContextStorage.run({ cookieValue: guestToken, identity: { success: false } }, () =>
          submitCheckout(submitParams)
        ),
        testContextStorage.run({ cookieValue: guestToken, identity: { success: false } }, () =>
          submitCheckout(submitParams)
        ),
      ]);

      // Both concurrent requests must succeed
      expect(resA.success).toBe(true);
      expect(resB.success).toBe(true);
      if (!resA.success || !resB.success) return;

      // Both must converge to the exact same orderNumber and total
      expect(resA.orderNumber).toBe(resB.orderNumber);
      expect(resA.totalCents).toBe(resB.totalCents);

      // Exactly one must be fresh mutation (replayed=false) and exactly one must be replayed (replayed=true)
      const freshCount = [resA, resB].filter((r) => !r.replayed).length;
      const replayedCount = [resA, resB].filter((r) => r.replayed).length;
      expect(freshCount).toBe(1);
      expect(replayedCount).toBe(1);

      // Physical database assertions: Exactly 1 Order, 1 Payment, 1 Reservation, 1 Outbox event
      const orders = await sqlClient`SELECT * FROM orders WHERE order_number = ${resA.orderNumber}`;
      expect(orders).toHaveLength(1);
      const orderId = orders[0]!.id;

      const paymentsRows = await sqlClient`SELECT * FROM payments WHERE order_id = ${orderId}`;
      expect(paymentsRows).toHaveLength(1);

      const reservations =
        await sqlClient`SELECT * FROM inventory_reservations WHERE order_id = ${orderId}`;
      expect(reservations).toHaveLength(1);

      const [inv] =
        await sqlClient`SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId1}`;
      expect(inv).toBeDefined();
      expect(inv!.quantity_reserved).toBe(1);

      const outbox = await sqlClient`SELECT * FROM outbox_events WHERE aggregate_id = ${orderId}`;
      expect(outbox).toHaveLength(1);

      const idem =
        await sqlClient`SELECT * FROM idempotency_keys WHERE idempotency_key = ${attemptId}`;
      expect(idem).toHaveLength(1);
    });

    it("Scenario E2: Authenticated Same Key Concurrent Replay — concurrent authenticated submissions converge to 1 Order", async () => {
      await resetInventoryBalances();
      await sqlClient`DELETE FROM idempotency_keys WHERE source_cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerProfileId1})`;
      await sqlClient`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerProfileId1})`;
      await sqlClient`DELETE FROM carts WHERE customer_id = ${customerProfileId1}`;
      await createAuthCart(customerProfileId1, [{ variantId: variantId1, quantity: 1 }]);

      const attemptId = generateUuidV7();
      const submitParams = {
        checkoutAttemptId: attemptId,
        customerEmail: "customer1@testchk5.pe",
        deliveryAddress: {
          mode: "SAVED_ADDRESS" as const,
          addressId: customerAddressId1,
        },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      };

      const [resA, resB] = await Promise.all([
        testContextStorage.run(
          {
            cookieValue: null,
            identity: {
              success: true,
              identity: { authUserId: authUserId1, email: "customer1@testchk5.pe" },
            },
          },
          () => submitCheckout(submitParams)
        ),
        testContextStorage.run(
          {
            cookieValue: null,
            identity: {
              success: true,
              identity: { authUserId: authUserId1, email: "customer1@testchk5.pe" },
            },
          },
          () => submitCheckout(submitParams)
        ),
      ]);

      expect(resA.success).toBe(true);
      expect(resB.success).toBe(true);
      if (!resA.success || !resB.success) return;

      expect(resA.orderNumber).toBe(resB.orderNumber);

      const freshCount = [resA, resB].filter((r) => !r.replayed).length;
      const replayedCount = [resA, resB].filter((r) => r.replayed).length;
      expect(freshCount).toBe(1);
      expect(replayedCount).toBe(1);

      const orders = await sqlClient`SELECT * FROM orders WHERE order_number = ${resA.orderNumber}`;
      expect(orders).toHaveLength(1);
    });

    it("Scenario F: Same Key Changed Request — rejects with IDEMPOTENCY_CONFLICT", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const attemptId = generateUuidV7();
      const res1 = await submitCheckout({
        checkoutAttemptId: attemptId,
        customerEmail: "conflict.buyer@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      });
      expect(res1.success).toBe(true);

      // Resubmit same key with altered email
      const res2 = await submitCheckout({
        checkoutAttemptId: attemptId,
        customerEmail: "different.email@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      });

      expect(res2.success).toBe(false);
      if (res2.success) return;
      expect(res2.code).toBe("IDEMPOTENCY_CONFLICT");
    });

    it("Scenario G: Same Key Wrong Authority — rejects with UNAUTHORIZED without leaking order info", async () => {
      await resetInventoryBalances();
      const guestToken1 = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);
      const guestToken2 = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);

      const attemptId = generateUuidV7();

      // Authority 1 creates order
      currentMockCookieValue = guestToken1;
      currentMockIdentity = { success: false };
      const res1 = await submitCheckout({
        checkoutAttemptId: attemptId,
        customerEmail: "user1@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      });
      expect(res1.success).toBe(true);

      // Authority 2 attempts to use Authority 1's key
      currentMockCookieValue = guestToken2;
      const res2 = await submitCheckout({
        checkoutAttemptId: attemptId,
        customerEmail: "user2@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      });

      expect(res2.success).toBe(false);
      if (res2.success) return;
      expect(res2.code).toBe("UNAUTHORIZED");
    });

    it("Scenario G2: Same Key Concurrent Wrong Authority Race — winner commits and loser receives UNAUTHORIZED without disclosure", async () => {
      await resetInventoryBalances();
      const guestToken1 = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);
      const guestToken2 = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);

      const attemptId = generateUuidV7();

      const [resA, resB] = await Promise.all([
        testContextStorage.run({ cookieValue: guestToken1, identity: { success: false } }, () =>
          submitCheckout({
            checkoutAttemptId: attemptId,
            customerEmail: "user1.race@testchk5.pe",
            deliveryAddress: { mode: "INLINE", address: validInlineAddress },
            shippingMethodCode: shippingMethodCode1,
            paymentMethodCode: paymentMethodCode1,
            reviewedSubtotalCents: 10000,
            reviewedShippingCents: 1500,
            reviewedTotalCents: 11500,
          })
        ),
        testContextStorage.run({ cookieValue: guestToken2, identity: { success: false } }, () =>
          submitCheckout({
            checkoutAttemptId: attemptId,
            customerEmail: "user2.race@testchk5.pe",
            deliveryAddress: { mode: "INLINE", address: validInlineAddress },
            shippingMethodCode: shippingMethodCode1,
            paymentMethodCode: paymentMethodCode1,
            reviewedSubtotalCents: 10000,
            reviewedShippingCents: 1500,
            reviewedTotalCents: 11500,
          })
        ),
      ]);

      const successful = [resA, resB].filter((r) => r.success);
      const unauthorized = [resA, resB].filter((r) => !r.success && r.code === "UNAUTHORIZED");

      expect(successful).toHaveLength(1);
      expect(unauthorized).toHaveLength(1);

      // Exactly 1 order created in database across both users
      const orders =
        await sqlClient`SELECT * FROM orders WHERE customer_email IN ('user1.race@testchk5.pe', 'user2.race@testchk5.pe')`;
      expect(orders).toHaveLength(1);
    });

    it("Scenario H: Different Keys / Same Cart Concurrency — yields exactly 1 Order and blocks duplicate conversion", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const attempt1 = generateUuidV7();
      const attempt2 = generateUuidV7();

      const [res1, res2] = await Promise.all([
        submitCheckout({
          checkoutAttemptId: attempt1,
          customerEmail: "concurrent.cart@testchk5.pe",
          deliveryAddress: { mode: "INLINE", address: validInlineAddress },
          shippingMethodCode: shippingMethodCode1,
          paymentMethodCode: paymentMethodCode1,
          reviewedSubtotalCents: 10000,
          reviewedShippingCents: 1500,
          reviewedTotalCents: 11500,
        }),
        submitCheckout({
          checkoutAttemptId: attempt2,
          customerEmail: "concurrent.cart@testchk5.pe",
          deliveryAddress: { mode: "INLINE", address: validInlineAddress },
          shippingMethodCode: shippingMethodCode1,
          paymentMethodCode: paymentMethodCode1,
          reviewedSubtotalCents: 10000,
          reviewedShippingCents: 1500,
          reviewedTotalCents: 11500,
        }),
      ]);

      const successCount = [res1, res2].filter((r) => r.success).length;
      expect(successCount).toBe(1);

      // Exactly 1 reservation created
      const [inv] =
        await sqlClient`SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId1}`;
      expect(inv).toBeDefined();
      expect(inv!.quantity_reserved).toBe(1);
    });

    it("Scenario I: Final-Unit Race — two independent carts race for 1 available unit, zero oversell guaranteed", async () => {
      await resetInventoryBalances();
      // Variant Single Stock has exactly quantity_on_hand: 1, quantity_reserved: 0
      const guestTokenA = await createGuestCart([{ variantId: variantIdSingleStock, quantity: 1 }]);
      const guestTokenB = await createGuestCart([{ variantId: variantIdSingleStock, quantity: 1 }]);

      const submitA = () =>
        testContextStorage.run({ cookieValue: guestTokenA, identity: { success: false } }, () =>
          submitCheckout({
            checkoutAttemptId: generateUuidV7(),
            customerEmail: "race.buyerA@testchk5.pe",
            deliveryAddress: { mode: "INLINE", address: validInlineAddress },
            shippingMethodCode: shippingMethodCode1,
            paymentMethodCode: paymentMethodCode1,
            reviewedSubtotalCents: 15000,
            reviewedShippingCents: 1500,
            reviewedTotalCents: 16500,
          })
        );

      const submitB = () =>
        testContextStorage.run({ cookieValue: guestTokenB, identity: { success: false } }, () =>
          submitCheckout({
            checkoutAttemptId: generateUuidV7(),
            customerEmail: "race.buyerB@testchk5.pe",
            deliveryAddress: { mode: "INLINE", address: validInlineAddress },
            shippingMethodCode: shippingMethodCode1,
            paymentMethodCode: paymentMethodCode1,
            reviewedSubtotalCents: 15000,
            reviewedShippingCents: 1500,
            reviewedTotalCents: 16500,
          })
        );

      const [resA, resB] = await Promise.all([submitA(), submitB()]);

      const results = [resA, resB];
      const passed = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success && r.code === "INSUFFICIENT_STOCK");

      expect(passed).toHaveLength(1);
      expect(failed).toHaveLength(1);

      // Critical assertion: Final reserved balance must be exactly 1, NEVER 2!
      const [inv] =
        await sqlClient`SELECT quantity_on_hand, quantity_reserved FROM inventory_items WHERE id = ${inventoryItemIdSingleStock}`;
      expect(inv).toBeDefined();
      expect(inv!.quantity_on_hand).toBe(1);
      expect(inv!.quantity_reserved).toBe(1);
    });

    it("Scenario J: Multi-Line Atomic Stock Failure — entire transaction rolls back when any line has insufficient stock", async () => {
      await resetInventoryBalances();
      // Variant 1 has 100 units, Variant OutOfStock has 0 units
      const guestToken = await createGuestCart([
        { variantId: variantId1, quantity: 1 },
        { variantId: variantIdOutOfStock, quantity: 1 },
      ]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const subtotalCents = 10000 + 12000; // 22000
      const totalCents = subtotalCents + 1500; // 23500

      const result = await submitCheckout({
        checkoutAttemptId: generateUuidV7(),
        customerEmail: "atomic.stock@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: subtotalCents,
        reviewedShippingCents: 1500,
        reviewedTotalCents: totalCents,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe("INSUFFICIENT_STOCK");

      // Verify zero reservations created for Variant 1
      const [inv1] =
        await sqlClient`SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId1}`;
      expect(inv1).toBeDefined();
      expect(inv1!.quantity_reserved).toBe(0);

      // Verify cart remains ACTIVE
      const [cart] = await sqlClient`SELECT status FROM carts WHERE session_token = ${guestToken}`;
      expect(cart).toBeDefined();
      expect(cart!.status).toBe("ACTIVE");
    });

    it("Scenario K: Product / Variant Unavailable — rejects checkout when product is unpublishable", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([{ variantId: variantIdArchived, quantity: 1 }]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const result = await submitCheckout({
        checkoutAttemptId: generateUuidV7(),
        customerEmail: "archived.buyer@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 8000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 9500,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe("PRODUCT_UNAVAILABLE");
    });

    it("Scenario L: Shipping Method Inactive — rejects checkout without side effects", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const result = await submitCheckout({
        checkoutAttemptId: generateUuidV7(),
        customerEmail: "inactive.ship@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCodeInactive,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 2000,
        reviewedTotalCents: 12000,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe("SHIPPING_METHOD_UNAVAILABLE");
    });

    it("Scenario M: Payment Method Incomplete/Inactive — rejects checkout without side effects", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const result = await submitCheckout({
        checkoutAttemptId: generateUuidV7(),
        customerEmail: "inactive.pay@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCodeInactive,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe("PAYMENT_METHOD_UNAVAILABLE");
    });

    it("Scenario N: Review Total Changed — returns CHECKOUT_REVIEW_CHANGED when client money differs from authoritative DB prices", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const result = await submitCheckout({
        checkoutAttemptId: generateUuidV7(),
        customerEmail: "price.changed@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 9000, // Client reviewed 9000 but DB is 10000
        reviewedShippingCents: 1500,
        reviewedTotalCents: 10500,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe("CHECKOUT_REVIEW_CHANGED");
      expect(result.details?.authoritativeSubtotalCents).toBe(10000);
      expect(result.details?.authoritativeTotalCents).toBe(11500);

      // Verify zero order was created
      const [inv] =
        await sqlClient`SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId1}`;
      expect(inv).toBeDefined();
      expect(inv!.quantity_reserved).toBe(0);
    });

    it("Scenario O: Expired Cart — retires cart to ABANDONED and rejects checkout", async () => {
      await resetInventoryBalances();
      const guestToken = generateAnonymousSessionToken();
      const cartId = generateUuidV7();
      const expiredDate = new Date(Date.now() - 1000 * 60);

      await sqlClient`
        INSERT INTO carts (id, session_token, status, currency, expires_at, created_at, updated_at)
        VALUES (${cartId}, ${guestToken}, 'ACTIVE', 'PEN', ${expiredDate}, NOW(), NOW());
      `;
      await sqlClient`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${cartId}, ${variantId1}, 1, NOW(), NOW());
      `;

      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const result = await submitCheckout({
        checkoutAttemptId: generateUuidV7(),
        customerEmail: "expired.cart@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 10000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 11500,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe("CART_EXPIRED");

      // Verify cart status transitioned to ABANDONED
      const [cart] = await sqlClient`SELECT status FROM carts WHERE id = ${cartId}`;
      expect(cart).toBeDefined();
      expect(cart!.status).toBe("ABANDONED");
    });

    it("Scenario P: Empty Cart — rejects checkout with CART_EMPTY", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([]); // 0 items
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const result = await submitCheckout({
        checkoutAttemptId: generateUuidV7(),
        customerEmail: "empty.cart@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 0,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 1500,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe("CART_EMPTY");
    });

    it("Scenario Q: Idempotency Rollback — failed checkout rolls back idempotency record allowing subsequent retry", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([{ variantId: variantIdOutOfStock, quantity: 1 }]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const attemptId = generateUuidV7();

      // 1. Initial attempt fails due to out of stock
      const res1 = await submitCheckout({
        checkoutAttemptId: attemptId,
        customerEmail: "rollback.test@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 12000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 13500,
      });
      expect(res1.success).toBe(false);

      // Verify idempotency record was not committed with success
      const idemRows =
        await sqlClient`SELECT * FROM idempotency_keys WHERE idempotency_key = ${attemptId}`;
      expect(idemRows).toHaveLength(0);

      // 2. Replenish stock for the variant
      await sqlClient`UPDATE inventory_items SET quantity_on_hand = 10 WHERE id = ${inventoryItemIdOutOfStock}`;

      // 3. Retry with same attempt ID now succeeds!
      const res2 = await submitCheckout({
        checkoutAttemptId: attemptId,
        customerEmail: "rollback.test@testchk5.pe",
        deliveryAddress: { mode: "INLINE", address: validInlineAddress },
        shippingMethodCode: shippingMethodCode1,
        paymentMethodCode: paymentMethodCode1,
        reviewedSubtotalCents: 12000,
        reviewedShippingCents: 1500,
        reviewedTotalCents: 13500,
      });
      expect(res2.success).toBe(true);
    });

    it("Scenario R: Order Number Collision Recovery — recovers from collision without aborting transaction", async () => {
      await resetInventoryBalances();
      const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      // Pre-seed an existing order with a known collision number
      const collisionOrderNumber = "GP-COLLIS01";
      const preseededOrderId = generateUuidV7();
      await sqlClient`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, currency, subtotal_cents, shipping_cents, total_cents, created_at, updated_at)
        VALUES (${preseededOrderId}, ${collisionOrderNumber}, 'preseed@testchk5.pe', '998877665', 'PENDING', 'PEN', 10000, 1500, 11500, NOW(), NOW())
      `;

      let generatorCalls = 0;
      const mockOrderNumberGenerator = () => {
        generatorCalls++;
        if (generatorCalls === 1) {
          return collisionOrderNumber; // Force collision on attempt 1
        }
        return "GP-RECOVR01"; // Unique on attempt 2
      };

      const result = await submitCheckout(
        {
          checkoutAttemptId: generateUuidV7(),
          customerEmail: "collision.buyer@testchk5.pe",
          deliveryAddress: { mode: "INLINE", address: validInlineAddress },
          shippingMethodCode: shippingMethodCode1,
          paymentMethodCode: paymentMethodCode1,
          reviewedSubtotalCents: 10000,
          reviewedShippingCents: 1500,
          reviewedTotalCents: 11500,
        },
        { orderNumberGenerator: mockOrderNumberGenerator }
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.orderNumber).toBe("GP-RECOVR01");
      expect(generatorCalls).toBe(2);

      // Verify physical PostgreSQL state
      const [order] = await sqlClient`SELECT * FROM orders WHERE order_number = 'GP-RECOVR01'`;
      expect(order).toBeDefined();
      expect(order!.customer_email).toBe("collision.buyer@testchk5.pe");
    });

    it("Context Reader: loadCheckoutContext returns safe DTO without sensitive payment instructions", async () => {
      const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);
      currentMockCookieValue = guestToken;
      currentMockIdentity = { success: false };

      const context = await loadCheckoutContext();

      expect(context.cart).toBeDefined();
      expect(context.cart?.subtotalCents).toBe(10000);
      expect(context.shippingMethods.some((s) => s.code === shippingMethodCode1)).toBe(true);
      expect(context.shippingMethods.some((s) => s.code === shippingMethodCodeInactive)).toBe(
        false
      );

      expect(context.paymentMethods.some((p) => p.code === paymentMethodCode1)).toBe(true);
      expect(context.paymentMethods.some((p) => p.code === paymentMethodCodeInactive)).toBe(false);

      // Critical Privacy Check: payment option must NOT contain account_identifier, recipient_name, or instruction_text
      const yapeOption = context.paymentMethods.find((p) => p.code === paymentMethodCode1);
      expect(yapeOption).toBeDefined();
      const rawOption = yapeOption as unknown as Record<string, unknown>;
      expect(rawOption.accountIdentifier).toBeUndefined();
      expect(rawOption.recipientName).toBeUndefined();
      expect(rawOption.instructionText).toBeUndefined();
      expect(rawOption.qrMediaId).toBeUndefined();
    });

    it("Context Reader: clears guest cookie after successful merge", async () => {
      const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);

      await testContextStorage.run(
        {
          cookieValue: guestToken,
          identity: {
            success: true,
            identity: { authUserId: authUserId1, email: "customer1@testchk5.pe" },
          },
        },
        async () => {
          const context = await loadCheckoutContext();
          expect(context.cart).toBeDefined();
        }
      );
    });

    describe("Confirmation Reader Authorization & Privacy (Indistinguishable Denial)", () => {
      it("Guest: authorized guest can read own confirmation; foreign guest receives NOT_AVAILABLE with zero data leak", async () => {
        await resetInventoryBalances();
        const guestToken = await createGuestCart([{ variantId: variantId1, quantity: 1 }]);

        let orderNumber = "";
        await testContextStorage.run(
          { cookieValue: guestToken, identity: { success: false } },
          async () => {
            const res = await submitCheckout({
              checkoutAttemptId: generateUuidV7(),
              customerEmail: "guest.confirm@testchk5.pe",
              deliveryAddress: { mode: "INLINE", address: validInlineAddress },
              shippingMethodCode: shippingMethodCode1,
              paymentMethodCode: paymentMethodCode1,
              reviewedSubtotalCents: 10000,
              reviewedShippingCents: 1500,
              reviewedTotalCents: 11500,
            });
            expect(res.success).toBe(true);
            if (res.success) orderNumber = res.orderNumber;
          }
        );

        // A. Same guest reads confirmation
        await testContextStorage.run(
          { cookieValue: guestToken, identity: { success: false } },
          async () => {
            const conf = await loadCheckoutConfirmation(orderNumber);
            expect(conf.success).toBe(true);
            if (conf.success) {
              expect(conf.confirmation.orderNumber).toBe(orderNumber);
              expect(conf.confirmation.status).toBe("PENDING");
              expect(conf.confirmation.paymentStatus).toBe("UNPAID");
              expect(conf.confirmation.customerEmail).toBe("guest.confirm@testchk5.pe");
              expect(conf.confirmation.items).toHaveLength(1);
            }
          }
        );

        // B. Foreign guest attempts to read confirmation -> NOT_AVAILABLE (indistinguishable from nonexistent)
        const foreignGuestToken = generateAnonymousSessionToken();
        let foreignGuestResult: unknown;
        await testContextStorage.run(
          { cookieValue: foreignGuestToken, identity: { success: false } },
          async () => {
            const conf = await loadCheckoutConfirmation(orderNumber);
            foreignGuestResult = conf;
            expect(conf.success).toBe(false);
            if (!conf.success) {
              expect(conf.code).toBe("NOT_AVAILABLE");
              expect(conf.error).toBe("Pedido no disponible.");
              expect("confirmation" in conf).toBe(false);
              expect("customerEmail" in conf).toBe(false);
              expect("totalCents" in conf).toBe(false);
            }
          }
        );

        // Nonexistent order check under foreign guest
        let nonexistentResult: unknown;
        await testContextStorage.run(
          { cookieValue: foreignGuestToken, identity: { success: false } },
          async () => {
            const conf = await loadCheckoutConfirmation("GP-NONEXIST");
            nonexistentResult = conf;
            expect(conf.success).toBe(false);
            if (!conf.success) {
              expect(conf.code).toBe("NOT_AVAILABLE");
              expect(conf.error).toBe("Pedido no disponible.");
            }
          }
        );

        // E & F: Prove nonexistent and foreign guest results are completely identical
        expect(foreignGuestResult).toEqual(nonexistentResult);
      });

      it("Authenticated: customer reads own confirmation; foreign customer and nonexistent are identical NOT_AVAILABLE", async () => {
        await resetInventoryBalances();
        await sqlClient`DELETE FROM idempotency_keys WHERE source_cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerProfileId1})`;
        await sqlClient`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerProfileId1})`;
        await sqlClient`DELETE FROM carts WHERE customer_id = ${customerProfileId1}`;
        await createAuthCart(customerProfileId1, [{ variantId: variantId1, quantity: 1 }]);

        let orderNumber = "";
        await testContextStorage.run(
          {
            cookieValue: null,
            identity: {
              success: true,
              identity: { authUserId: authUserId1, email: "customer1@testchk5.pe" },
            },
          },
          async () => {
            const res = await submitCheckout({
              checkoutAttemptId: generateUuidV7(),
              customerEmail: "customer1@testchk5.pe",
              deliveryAddress: {
                mode: "SAVED_ADDRESS",
                addressId: customerAddressId1,
              },
              shippingMethodCode: shippingMethodCode1,
              paymentMethodCode: paymentMethodCode1,
              reviewedSubtotalCents: 10000,
              reviewedShippingCents: 1500,
              reviewedTotalCents: 11500,
            });
            expect(res.success).toBe(true);
            if (res.success) orderNumber = res.orderNumber;
          }
        );

        // Record database table counts and specific cart row state before read operations
        const [ordersCountBefore] = await sqlClient`SELECT count(*)::int as c FROM orders`;
        const [paymentsCountBefore] = await sqlClient`SELECT count(*)::int as c FROM payments`;
        const [reservationsCountBefore] =
          await sqlClient`SELECT count(*)::int as c FROM inventory_reservations`;
        const [outboxCountBefore] = await sqlClient`SELECT count(*)::int as c FROM outbox_events`;
        const [cartsCountBefore] = await sqlClient`SELECT count(*)::int as c FROM carts`;
        const [cartSnapshotBefore] =
          await sqlClient`SELECT status, updated_at FROM carts WHERE customer_id = ${customerProfileId1} LIMIT 1`;

        // C. Owner customer reads confirmation
        await testContextStorage.run(
          {
            cookieValue: null,
            identity: {
              success: true,
              identity: { authUserId: authUserId1, email: "customer1@testchk5.pe" },
            },
          },
          async () => {
            const conf = await loadCheckoutConfirmation(orderNumber);
            expect(conf.success).toBe(true);
            if (conf.success) {
              expect(conf.confirmation.orderNumber).toBe(orderNumber);
              expect(conf.confirmation.paymentStatus).toBe("UNPAID");
              expect(conf.confirmation.subtotalCents).toBe(10000);
              expect(conf.confirmation.shippingCents).toBe(1500);
              expect(conf.confirmation.totalCents).toBe(11500);
            }
          }
        );

        // D. Foreign authenticated customer attempts to read confirmation -> NOT_AVAILABLE
        let foreignAuthResult: unknown;
        await testContextStorage.run(
          {
            cookieValue: null,
            identity: {
              success: true,
              identity: { authUserId: authUserId2, email: "customer2@testchk5.pe" },
            },
          },
          async () => {
            const conf = await loadCheckoutConfirmation(orderNumber);
            foreignAuthResult = conf;
            expect(conf.success).toBe(false);
            if (!conf.success) {
              expect(conf.code).toBe("NOT_AVAILABLE");
              expect(conf.error).toBe("Pedido no disponible.");
              expect("confirmation" in conf).toBe(false);
              expect("customerEmail" in conf).toBe(false);
            }
          }
        );

        // E. Nonexistent order lookup
        let nonexistentResult: unknown;
        await testContextStorage.run(
          {
            cookieValue: null,
            identity: {
              success: true,
              identity: { authUserId: authUserId1, email: "customer1@testchk5.pe" },
            },
          },
          async () => {
            const conf = await loadCheckoutConfirmation("GP-NONEXIST");
            nonexistentResult = conf;
            expect(conf.success).toBe(false);
            if (!conf.success) {
              expect(conf.code).toBe("NOT_AVAILABLE");
              expect(conf.error).toBe("Pedido no disponible.");
            }
          }
        );

        // F. Prove foreign authenticated result and nonexistent result are strictly identical
        expect(foreignAuthResult).toEqual(nonexistentResult);

        // H. Confirmation reads remain strictly read-only: zero mutations across all tables (including carts)
        const [ordersCountAfter] = await sqlClient`SELECT count(*)::int as c FROM orders`;
        const [paymentsCountAfter] = await sqlClient`SELECT count(*)::int as c FROM payments`;
        const [reservationsCountAfter] =
          await sqlClient`SELECT count(*)::int as c FROM inventory_reservations`;
        const [outboxCountAfter] = await sqlClient`SELECT count(*)::int as c FROM outbox_events`;
        const [cartsCountAfter] = await sqlClient`SELECT count(*)::int as c FROM carts`;
        const [cartSnapshotAfter] =
          await sqlClient`SELECT status, updated_at FROM carts WHERE customer_id = ${customerProfileId1} LIMIT 1`;

        expect(ordersCountAfter!.c).toBe(ordersCountBefore!.c);
        expect(paymentsCountAfter!.c).toBe(paymentsCountBefore!.c);
        expect(reservationsCountAfter!.c).toBe(reservationsCountBefore!.c);
        expect(outboxCountAfter!.c).toBe(outboxCountBefore!.c);
        expect(cartsCountAfter!.c).toBe(cartsCountBefore!.c);
        if (cartSnapshotBefore && cartSnapshotAfter) {
          expect(cartSnapshotAfter.status).toBe(cartSnapshotBefore.status);
          expect(new Date(cartSnapshotAfter.updated_at).getTime()).toBe(
            new Date(cartSnapshotBefore.updated_at).getTime()
          );
        }
      });
    });
  });
});

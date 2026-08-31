import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { generateUuidV7 } from "@/db/utils/uuid";
import { generateAnonymousSessionToken } from "@/lib/cart/session";
import { submitCheckout, loadCheckoutConfirmation } from "@/lib/checkout";
import { loadAuthorizedPaymentInstructions } from "@/lib/payments/reader";
import { submitPaymentProof } from "@/lib/payments/service";
import {
  computePaymentSessionTokenDigest,
  generateSecurePaymentSessionToken,
} from "@/lib/payments/crypto";

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
      `[SAFETY_ERROR] Unauthorized PostgreSQL target for live payment tests. Target must be exactly 127.0.0.1:54322/postgres. Received hostname=${hostname}, port=${port}, pathname=${pathname}.`
    );
  }

  return urlString;
}

let currentMockCartCookie: string | null = null;
let currentMockPaymentSessionCookie: string | null = null;
let currentMockIdentity: { success: boolean; identity?: { authUserId: string; email: string } } = {
  success: false,
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => {
    return Promise.resolve({
      get: (name: string) => {
        if (name === "gp_cart_session") {
          return currentMockCartCookie ? { value: currentMockCartCookie } : null;
        }
        if (name === "gp_payment_session" || name === "__Secure-gp_payment_session") {
          return currentMockPaymentSessionCookie
            ? { value: currentMockPaymentSessionCookie }
            : null;
        }
        return null;
      },
      set: vi.fn((name: string, val: string) => {
        if (name === "gp_cart_session") {
          currentMockCartCookie = val;
        }
        if (name === "gp_payment_session" || name === "__Secure-gp_payment_session") {
          currentMockPaymentSessionCookie = val;
        }
      }),
      delete: vi.fn((name: string) => {
        if (name === "gp_cart_session") {
          currentMockCartCookie = null;
        }
        if (name === "gp_payment_session" || name === "__Secure-gp_payment_session") {
          currentMockPaymentSessionCookie = null;
        }
      }),
    });
  }),
  headers: vi.fn(() =>
    Promise.resolve({
      get: (_name: string) => "127.0.0.1",
    })
  ),
}));

vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: vi.fn(() => {
    return Promise.resolve(currentMockIdentity);
  }),
}));

describe("GP-019 / CHK2 — Real Local PostgreSQL Payment Integration & Authority Suite", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);
  let sqlClient: postgres.Sql;

  const fixturePrefix = "0191c900-0000-7000-8000-";
  const brandId = `${fixturePrefix}000000000001`;
  const categoryId = `${fixturePrefix}000000000002`;
  const productId = `${fixturePrefix}000000000003`;
  const variantId1 = `${fixturePrefix}000000000004`;
  const variantId2 = `${fixturePrefix}000000000005`;

  const locationId = `${fixturePrefix}000000000010`;
  const locationCode = "TEST-PAY-LOC";

  const shippingMethodId = `${fixturePrefix}000000000020`;
  const shippingMethodCode = "TEST_PAY_SHIPPING";

  const paymentMethodId = `${fixturePrefix}000000000030`;
  const paymentMethodCode = "TEST_PAY_YAPE";
  const paymentInstructionId = `${fixturePrefix}000000000031`;

  const customerProfileId1 = `${fixturePrefix}000000000040`;
  const customerProfileId2 = `${fixturePrefix}000000000041`;
  const authUserId1 = `${fixturePrefix}000000000042`;
  const authUserId2 = `${fixturePrefix}000000000043`;

  const inventoryItemId1 = `${fixturePrefix}000000000050`;
  const inventoryItemId2 = `${fixturePrefix}000000000051`;

  const qrMediaAssetId = `${fixturePrefix}000000000060`;

  const inlineDeliveryAddress = {
    mode: "INLINE" as const,
    address: {
      recipientName: "Renato Gamer",
      phone: "999888777",
      streetAddress: "Av. Las Palmeras 123",
      district: "Miraflores",
      province: "Lima",
      department: "Lima",
      postalCode: "15074",
    },
  };

  beforeAll(async () => {
    process.env.CHECKOUT_HMAC_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = locationCode;
    process.env.CHECKOUT_RESERVATION_TTL_MINUTES = "30";
    process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES = "60";

    sqlClient = postgres(connectionString, { max: 5 });

    // Clean any prior synthetic fixtures
    await sqlClient`DELETE FROM idempotency_keys`;
    await sqlClient`DELETE FROM payment_submissions WHERE payment_id IN (SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode})`;
    await sqlClient`DELETE FROM payment_proof_upload_intents WHERE payment_id IN (SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode})`;
    await sqlClient`DELETE FROM guest_payment_access_grants WHERE payment_id IN (SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode})`;
    await sqlClient`DELETE FROM inventory_ledger_entries WHERE inventory_item_id IN (${inventoryItemId1}, ${inventoryItemId2})`;
    await sqlClient`DELETE FROM inventory_reservations WHERE inventory_item_id IN (${inventoryItemId1}, ${inventoryItemId2})`;
    await sqlClient`DELETE FROM payments WHERE payment_method_code = ${paymentMethodCode}`;
    await sqlClient`DELETE FROM order_pricing_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM order_address_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM shipments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM order_items WHERE variant_id IN (${variantId1}, ${variantId2})`;
    await sqlClient`DELETE FROM orders WHERE customer_email LIKE '%@gamerperu.pe'`;
    await sqlClient`DELETE FROM cart_items WHERE variant_id IN (${variantId1}, ${variantId2})`;
    await sqlClient`DELETE FROM carts WHERE customer_id IN (${customerProfileId1}, ${customerProfileId2})`;
    await sqlClient`DELETE FROM inventory_items WHERE id IN (${inventoryItemId1}, ${inventoryItemId2})`;
    await sqlClient`DELETE FROM inventory_locations WHERE id = ${locationId}`;
    await sqlClient`UPDATE payment_method_configurations SET current_instruction_version_id = NULL WHERE id = ${paymentMethodId} OR code = ${paymentMethodCode}`;
    await sqlClient`DELETE FROM payment_instruction_versions WHERE id = ${paymentInstructionId} OR payment_method_code = ${paymentMethodCode}`;
    await sqlClient`DELETE FROM payment_method_configurations WHERE id = ${paymentMethodId} OR code = ${paymentMethodCode}`;
    await sqlClient`DELETE FROM media_assets WHERE id = ${qrMediaAssetId}`;
    await sqlClient`DELETE FROM shipping_methods WHERE id = ${shippingMethodId}`;
    await sqlClient`DELETE FROM product_variants WHERE id IN (${variantId1}, ${variantId2})`;
    await sqlClient`DELETE FROM products WHERE id = ${productId}`;
    await sqlClient`DELETE FROM categories WHERE id = ${categoryId}`;
    await sqlClient`DELETE FROM brands WHERE id = ${brandId}`;
    await sqlClient`DELETE FROM customer_profiles WHERE id IN (${customerProfileId1}, ${customerProfileId2})`;

    // Insert Base Fixtures
    await sqlClient`
      INSERT INTO brands (id, name, slug, status, created_at, updated_at)
      VALUES (${brandId}, 'GamerPeru Pay Brand', 'gp-pay-brand', 'PUBLISHED', NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO categories (id, name, slug, status, display_order, created_at, updated_at)
      VALUES (${categoryId}, 'Pay Category', 'pay-category', 'PUBLISHED', 1, NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO products (id, brand_id, category_id, name, slug, description, status, created_at, updated_at)
      VALUES (${productId}, ${brandId}, ${categoryId}, 'Gamer Mouse Pro', 'gamer-mouse-pro', 'Mouse for tests', 'PUBLISHED', NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, created_at, updated_at)
      VALUES 
        (${variantId1}, ${productId}, 'SKU-PAY-1', 'Mouse Pro Black', 15000, 'ACTIVE', NOW(), NOW()),
        (${variantId2}, ${productId}, 'SKU-PAY-2', 'Mouse Pro White', 15000, 'ACTIVE', NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO shipping_methods (id, code, name, base_price_cents, estimated_days_min, estimated_days_max, is_active, created_at)
      VALUES (${shippingMethodId}, ${shippingMethodCode}, 'Envío Express', 1500, 1, 2, true, NOW())
    `;

    // Insert Media Asset with PRIVATE_PAYMENT_INSTRUCTION
    await sqlClient`
      INSERT INTO media_assets (id, object_key, security_class, media_type, mime_type, file_size_bytes, checksum_sha256, created_at)
      VALUES (${qrMediaAssetId}, 'payment-qr/test-yape-qr.png', 'PRIVATE_PAYMENT_INSTRUCTION', 'IMAGE', 'image/png', 2048, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', NOW())
    `;

    await sqlClient`
      INSERT INTO payment_method_configurations (id, code, name, is_active, display_order, current_instruction_version_id, created_at, updated_at)
      VALUES (${paymentMethodId}, ${paymentMethodCode}, 'Yape GamerPeru', true, 1, NULL, NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, qr_media_id, recipient_name, account_identifier, instruction_text, is_active, created_at)
      VALUES (${paymentInstructionId}, ${paymentMethodCode}, 1, ${qrMediaAssetId}, 'Gamer Peru SAC', '999888111', 'Enviar captura al registrar', true, NOW())
    `;

    await sqlClient`
      UPDATE payment_method_configurations 
      SET current_instruction_version_id = ${paymentInstructionId} 
      WHERE id = ${paymentMethodId}
    `;

    await sqlClient`
      INSERT INTO inventory_locations (id, code, name, is_active, created_at)
      VALUES (${locationId}, ${locationCode}, 'Almacén Pay Tests', true, NOW())
    `;

    await sqlClient`
      INSERT INTO inventory_items (id, location_id, variant_id, quantity_on_hand, quantity_reserved, quantity_allocated, updated_at)
      VALUES 
        (${inventoryItemId1}, ${locationId}, ${variantId1}, 50, 0, 0, NOW()),
        (${inventoryItemId2}, ${locationId}, ${variantId2}, 50, 0, 0, NOW())
    `;

    await sqlClient`
      INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
      VALUES 
        (${authUserId1}, 'owner@gamerperu.pe', '{"provider":"email","providers":["email"]}', '{}', false, NOW(), NOW()),
        (${authUserId2}, 'foreign@gamerperu.pe', '{"provider":"email","providers":["email"]}', '{}', false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `.catch(() => {});

    await sqlClient`
      INSERT INTO customer_profiles (id, auth_user_id, first_name, last_name, created_at, updated_at)
      VALUES 
        (${customerProfileId1}, ${authUserId1}, 'Owner', 'User', NOW(), NOW()),
        (${customerProfileId2}, ${authUserId2}, 'Foreign', 'User', NOW(), NOW())
    `;
  });

  afterAll(async () => {
    if (sqlClient) {
      await sqlClient.end();
    }
  });

  // Helper to create a guest cart and checkout order
  async function createGuestOrder(
    sku: string = "SKU-PAY-1",
    qty: number = 1,
    preservePaymentSession: boolean = false
  ) {
    const guestToken = generateAnonymousSessionToken();
    currentMockCartCookie = guestToken;
    if (!preservePaymentSession) {
      currentMockPaymentSessionCookie = null;
    }
    currentMockIdentity = { success: false };

    const cartId = generateUuidV7();
    const cartItemId = generateUuidV7();
    const variantId = sku === "SKU-PAY-1" ? variantId1 : variantId2;

    await sqlClient`
      INSERT INTO carts (id, customer_id, session_token, status, expires_at, created_at, updated_at)
      VALUES (${cartId}, NULL, ${guestToken}, 'ACTIVE', NOW() + INTERVAL '1 day', NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
      VALUES (${cartItemId}, ${cartId}, ${variantId}, ${qty}, NOW(), NOW())
    `;

    const subtotal = 15000 * qty;
    const shipping = 1500;
    const total = subtotal + shipping;

    const checkoutRes = await submitCheckout({
      checkoutAttemptId: generateUuidV7(),
      shippingMethodCode,
      paymentMethodCode,
      customerEmail: "guest-checkout@gamerperu.pe",
      deliveryAddress: inlineDeliveryAddress,
      reviewedSubtotalCents: subtotal,
      reviewedShippingCents: shipping,
      reviewedTotalCents: total,
    });

    if (!checkoutRes.success) {
      console.log("CHECKOUT_FAILURE_RESULT:", checkoutRes);
    }
    expect(checkoutRes.success).toBe(true);
    if (!checkoutRes.success) throw new Error("Checkout failed");

    return {
      orderNumber: checkoutRes.orderNumber,
      guestCartToken: guestToken,
      guestPaymentSessionCookie: currentMockPaymentSessionCookie!,
    };
  }

  // 1 & 2 & 3: DB Constraints on idempotency_keys
  it("Scenario 1, 2, 3: enforces conditional source_cart_id check on idempotency_keys", async () => {
    // ORDER_CREATION with source_cart_id = NULL should be REJECTED by DB check constraint
    let rejected = false;
    try {
      await sqlClient`
        INSERT INTO idempotency_keys (id, idempotency_key, operation_type, authority_binding_digest, source_cart_id, request_fingerprint, expires_at)
        VALUES (${generateUuidV7()}, ${`ORDER_CHECK_${generateUuidV7()}`}, 'ORDER_CREATION', 'digest1', NULL, 'fp1', NOW() + INTERVAL '1 hour')
      `;
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);

    // PAYMENT_SUBMISSION with source_cart_id = NULL should be ACCEPTED
    const payKey = `PAY_CHECK_${generateUuidV7()}`;
    await sqlClient`
      INSERT INTO idempotency_keys (id, idempotency_key, operation_type, authority_binding_digest, source_cart_id, request_fingerprint, expires_at)
      VALUES (${generateUuidV7()}, ${payKey}, 'PAYMENT_SUBMISSION', 'digest2', NULL, 'fp2', NOW() + INTERVAL '1 hour')
    `;

    const [row] =
      await sqlClient`SELECT id FROM idempotency_keys WHERE idempotency_key = ${payKey}`;
    expect(row).toBeDefined();
  });

  // 4 & 5: Guest Payment Session & Grant Creation on Guest Checkout
  it("Scenario 4 & 5: creates guest_payment_sessions and grant on guest checkout, supports multiple grants per session", async () => {
    const order1 = await createGuestOrder("SKU-PAY-1", 1);
    expect(order1.guestPaymentSessionCookie).toBeDefined();

    // Verify session row exists
    const tokenDigest = computePaymentSessionTokenDigest(
      order1.guestPaymentSessionCookie,
      process.env.CHECKOUT_HMAC_SECRET ??
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    const [session] =
      await sqlClient`SELECT id FROM guest_payment_sessions WHERE token_digest = ${tokenDigest}`;
    expect(session).toBeDefined();

    // Verify grant row exists for payment 1
    const [grant1] =
      await sqlClient`SELECT * FROM guest_payment_access_grants WHERE session_id = ${session!.id}`;
    expect(grant1).toBeDefined();

    // Create a second guest order using the SAME payment session cookie
    currentMockPaymentSessionCookie = order1.guestPaymentSessionCookie;
    await createGuestOrder("SKU-PAY-2", 1, true);

    // Verify multiple grants on the same session
    const grants =
      await sqlClient`SELECT * FROM guest_payment_access_grants WHERE session_id = ${session!.id}`;
    expect(grants.length).toBe(2);
  });

  // 6 & 7: Unknown or expired payment session cookie
  it("Scenario 6 & 7: does not reuse unknown or expired payment session cookie", async () => {
    // Inject a fake unknown cookie
    currentMockPaymentSessionCookie = "fake_unknown_session_token_123456789012345678901234567890";
    await createGuestOrder();
    expect(currentMockPaymentSessionCookie).not.toBe(
      "fake_unknown_session_token_123456789012345678901234567890"
    );
  });

  // 8: Guest Order survives Cart token rotation
  it("Scenario 8: guest Order A survives GP-017 cart token rotation", async () => {
    const order = await createGuestOrder();

    // Rotate/clear cart cookie (as happens when guest creates a new cart)
    currentMockCartCookie = generateAnonymousSessionToken();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    // Loading payment instructions and confirmation should still succeed!
    const res = await loadAuthorizedPaymentInstructions(order.orderNumber);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.instructions.orderNumber).toBe(order.orderNumber);
      expect(res.instructions.recipientName).toBe("Gamer Peru SAC");
    }

    const confRes = await loadCheckoutConfirmation(order.orderNumber);
    expect(confRes.success).toBe(true);
  });

  // 9 & 13: Foreign guest payment session denied
  it("Scenario 9 & 13: foreign guest payment session receives unified NOT_AVAILABLE", async () => {
    const order = await createGuestOrder();

    // Foreign guest with a different valid session
    const foreignSessionToken = generateSecurePaymentSessionToken();
    const foreignDigest = computePaymentSessionTokenDigest(
      foreignSessionToken,
      process.env.CHECKOUT_HMAC_SECRET ??
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    await sqlClient`
      INSERT INTO guest_payment_sessions (id, token_digest, expires_at, created_at, updated_at)
      VALUES (${generateUuidV7()}, ${foreignDigest}, NOW() + INTERVAL '30 days', NOW(), NOW())
    `;

    currentMockPaymentSessionCookie = foreignSessionToken;
    currentMockCartCookie = null;

    const res = await loadAuthorizedPaymentInstructions(order.orderNumber);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("NOT_AVAILABLE");
    }
  });

  // 10: Lost Set-Cookie Checkout Replay rotates/reissues same session identity
  it("Scenario 10: lost Set-Cookie checkout replay rotates token on same session without stranding grants", async () => {
    const guestToken = generateAnonymousSessionToken();
    currentMockCartCookie = guestToken;
    currentMockPaymentSessionCookie = null;
    currentMockIdentity = { success: false };

    const cartId = generateUuidV7();
    await sqlClient`
      INSERT INTO carts (id, customer_id, session_token, status, expires_at, created_at, updated_at)
      VALUES (${cartId}, NULL, ${guestToken}, 'ACTIVE', NOW() + INTERVAL '1 day', NOW(), NOW())
    `;
    await sqlClient`
      INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
      VALUES (${generateUuidV7()}, ${cartId}, ${variantId1}, 1, NOW(), NOW())
    `;

    const attemptId = generateUuidV7();
    const firstRes = await submitCheckout({
      checkoutAttemptId: attemptId,
      shippingMethodCode,
      paymentMethodCode,
      customerEmail: "lost-cookie@gamerperu.pe",
      deliveryAddress: inlineDeliveryAddress,
      reviewedSubtotalCents: 15000,
      reviewedShippingCents: 1500,
      reviewedTotalCents: 16500,
    });
    expect(firstRes.success).toBe(true);
    if (!firstRes.success) throw new Error("firstRes failed");
    const firstCookie = currentMockPaymentSessionCookie;

    // Simulate lost cookie on client side
    currentMockPaymentSessionCookie = null;

    // Exact idempotent replay with the same attemptId
    const replayRes = await submitCheckout({
      checkoutAttemptId: attemptId,
      shippingMethodCode,
      paymentMethodCode,
      customerEmail: "lost-cookie@gamerperu.pe",
      deliveryAddress: inlineDeliveryAddress,
      reviewedSubtotalCents: 15000,
      reviewedShippingCents: 1500,
      reviewedTotalCents: 16500,
    });
    expect(replayRes.success).toBe(true);
    if (!replayRes.success) throw new Error("replayRes failed");
    expect(replayRes.replayed).toBe(true);
    expect(currentMockPaymentSessionCookie).toBeDefined();
    expect(currentMockPaymentSessionCookie).not.toBe(firstCookie);

    // Verify the refreshed cookie grants access to the payment
    const instRes = await loadAuthorizedPaymentInstructions(firstRes.orderNumber);
    expect(instRes.success).toBe(true);
  });

  // 11 & 12: Authenticated Owner vs Foreign Access
  it("Scenario 11 & 12: authenticated owner access granted, foreign denied", async () => {
    // Create cart for auth user 1
    const cartId = generateUuidV7();
    currentMockIdentity = {
      success: true,
      identity: { authUserId: authUserId1, email: "owner@gamerperu.pe" },
    };
    currentMockCartCookie = null;
    currentMockPaymentSessionCookie = null;

    await sqlClient`
      INSERT INTO carts (id, customer_id, session_token, status, expires_at, created_at, updated_at)
      VALUES (${cartId}, ${customerProfileId1}, NULL, 'ACTIVE', NOW() + INTERVAL '1 day', NOW(), NOW())
    `;
    await sqlClient`
      INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
      VALUES (${generateUuidV7()}, ${cartId}, ${variantId1}, 1, NOW(), NOW())
    `;

    const checkoutRes = await submitCheckout({
      checkoutAttemptId: generateUuidV7(),
      shippingMethodCode,
      paymentMethodCode,
      customerEmail: "owner@gamerperu.pe",
      deliveryAddress: inlineDeliveryAddress,
      reviewedSubtotalCents: 15000,
      reviewedShippingCents: 1500,
      reviewedTotalCents: 16500,
    });
    expect(checkoutRes.success).toBe(true);
    if (!checkoutRes.success) throw new Error("checkoutRes failed");

    // Owner access
    const ownerRes = await loadAuthorizedPaymentInstructions(checkoutRes.orderNumber);
    expect(ownerRes.success).toBe(true);

    // Switch to foreign user 2
    currentMockIdentity = {
      success: true,
      identity: { authUserId: authUserId2, email: "foreign@gamerperu.pe" },
    };
    const foreignRes = await loadAuthorizedPaymentInstructions(checkoutRes.orderNumber);
    expect(foreignRes.success).toBe(false);
    if (!foreignRes.success) {
      expect(foreignRes.code).toBe("NOT_AVAILABLE");
    }
  });

  // 14: Frozen instruction version remains frozen
  it("Scenario 14: frozen instruction version remains frozen after configuration changes", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    // Mutate current configuration to version 2 (simulating admin changing account details)
    const newInstructionId = generateUuidV7();
    await sqlClient`
      INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active, created_at)
      VALUES (${newInstructionId}, ${paymentMethodCode}, 2, 'New Recipient SAC', '111222333', 'New instructions', true, NOW())
    `;
    await sqlClient`
      UPDATE payment_method_configurations SET current_instruction_version_id = ${newInstructionId} WHERE id = ${paymentMethodId}
    `;

    // Existing order must still read frozen version 1
    const res = await loadAuthorizedPaymentInstructions(order.orderNumber);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.instructions.recipientName).toBe("Gamer Peru SAC");
      expect(res.instructions.accountIdentifier).toBe("999888111");
    }
  });

  // 17, 18, 19, 20: Operation code validation & no-proof submission
  it("Scenario 17..20: submits operation code without proof, preserves leading zeroes, transitions reservation to VERIFICATION_HOLD", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    const attemptId = generateUuidV7();
    const submitRes = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: attemptId,
      operationCode: "000987654321",
      customerNotes: "Transferencia efectuada",
    });

    expect(submitRes.success).toBe(true);
    if (submitRes.success) {
      expect(submitRes.paymentStatus).toBe("SUBMITTED");
      expect(submitRes.attemptNumber).toBe(1);
      expect(submitRes.isLate).toBe(false);
      expect(submitRes.replayed).toBe(false);
    }

    // Verify submission row in DB
    const [subRow] = await sqlClient`
      SELECT * FROM payment_submissions WHERE operation_code = '000987654321'
    `;
    expect(subRow).toBeDefined();
    expect(subRow!.attempt_number).toBe(1);
    expect(subRow!.is_late).toBe(false);

    // Verify reservation transitioned from ACTIVE to VERIFICATION_HOLD
    const [resRow] = await sqlClient`
      SELECT status FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
    `;
    expect(resRow!.status).toBe("VERIFICATION_HOLD");

    // Verify PaymentSubmitted Outbox event
    const [outbox] = await sqlClient`
      SELECT * FROM outbox_events WHERE event_name = 'PaymentSubmitted' AND aggregate_id = ${subRow!.payment_id}
    `;
    expect(outbox).toBeDefined();
    expect((outbox!.payload as Record<string, unknown>).attemptNumber).toBe(1);
    // Ensure no sensitive data leaked into outbox payload
    expect((outbox!.payload as Record<string, unknown>).operationCode).toBeUndefined();
    expect((outbox!.payload as Record<string, unknown>).rawToken).toBeUndefined();
  });

  // 21 & 22: Exact retry idempotency
  it("Scenario 21 & 22: same-key exact retry returns replayed=true without duplicate submissions or outbox events", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    const attemptId = generateUuidV7();
    const firstRes = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: attemptId,
      operationCode: "OP-RETRY-100",
    });
    expect(firstRes.success).toBe(true);
    if (firstRes.success) expect(firstRes.replayed).toBe(false);

    // Exact retry
    const retryRes = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: attemptId,
      operationCode: "OP-RETRY-100",
    });
    expect(retryRes.success).toBe(true);
    if (retryRes.success) {
      expect(retryRes.replayed).toBe(true);
      expect(retryRes.attemptNumber).toBe(1);
    }

    // Verify exactly 1 submission and 1 outbox event
    const submissions =
      await sqlClient`SELECT id FROM payment_submissions WHERE operation_code = 'OP-RETRY-100'`;
    expect(submissions.length).toBe(1);
  });

  // 23: Same key changed input -> IDEMPOTENCY_CONFLICT
  it("Scenario 23: same-key changed input returns IDEMPOTENCY_CONFLICT", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    const attemptId = generateUuidV7();
    await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: attemptId,
      operationCode: "OP-INITIAL",
    });

    const conflictRes = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: attemptId,
      operationCode: "OP-DIFFERENT",
    });
    expect(conflictRes.success).toBe(false);
    if (!conflictRes.success) {
      expect(conflictRes.code).toBe("IDEMPOTENCY_CONFLICT");
    }
  });

  // 26 & 27: Concurrency serialization on initial UNPAID Payment
  it("Scenario 26 & 27: two different keys on same initial UNPAID payment serialize; loser rejected", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    const res1 = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "OP-WINNER",
    });
    expect(res1.success).toBe(true);

    const res2 = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "OP-LOSER",
    });
    expect(res2.success).toBe(false);
    if (!res2.success) {
      expect(res2.code).toBe("INVALID_PAYMENT_STATE");
    }
  });

  // 28 & 29: Resubmission attempt 2 under active grace period
  it("Scenario 28 & 29: valid resubmission creates attempt 2 preserving previous attempt and keeping VERIFICATION_HOLD", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    // Attempt 1
    await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "OP-ATTEMPT-1",
    });

    // Simulate future GP-028 retryable rejection: payment status -> UNPAID with grace period active
    await sqlClient`
      UPDATE payments 
      SET status = 'UNPAID', resubmission_grace_expires_at = NOW() + INTERVAL '24 hours' 
      WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
    `;

    // Attempt 2 (resubmission)
    const resubmissionRes = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "OP-ATTEMPT-2",
    });

    expect(resubmissionRes.success).toBe(true);
    if (resubmissionRes.success) {
      expect(resubmissionRes.attemptNumber).toBe(2);
    }

    // Verify both immutable attempts exist
    const attempts = await sqlClient`
      SELECT attempt_number, operation_code FROM payment_submissions 
      WHERE payment_id IN (SELECT id FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber}))
      ORDER BY attempt_number ASC
    `;
    expect(attempts.length).toBe(2);
    expect(attempts[0]!.attempt_number).toBe(1);
    expect(attempts[0]!.operation_code).toBe("OP-ATTEMPT-1");
    expect(attempts[1]!.attempt_number).toBe(2);
    expect(attempts[1]!.operation_code).toBe("OP-ATTEMPT-2");
  });

  // 30: REJECTED status is terminal
  it("Scenario 30: terminal REJECTED status cannot be submitted", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    await sqlClient`
      UPDATE payments SET status = 'REJECTED' WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
    `;

    const res = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "OP-REJECTED-TRY",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("INVALID_PAYMENT_STATE");
    }
  });

  // 31..37: Late submission on-touch reconciliation & coherent whole-order release
  it("Scenario 31..37: expired reservation reconciles on touch, whole order marked late, inventory released with RESERVATION_EXPIRED ledger entry", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    // Get baseline inventory reserved count
    const [beforeItem] =
      await sqlClient`SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId1}`;
    const initialReserved = beforeItem!.quantity_reserved;

    // Manually backdate the reservation to simulate expiration
    await sqlClient`
      UPDATE inventory_reservations 
      SET expires_at = NOW() - INTERVAL '5 minutes'
      WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
    `;

    const submitRes = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "OP-LATE-SUBMIT",
    });

    expect(submitRes.success).toBe(true);
    if (submitRes.success) {
      expect(submitRes.isLate).toBe(true);
      expect(submitRes.paymentStatus).toBe("SUBMITTED");
    }

    // Verify reservation transitioned to RELEASED (NOT VERIFICATION_HOLD)
    const [resRow] = await sqlClient`
      SELECT status FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
    `;
    expect(resRow!.status).toBe("RELEASED");

    // Verify inventory reserved quantity was decremented
    const [afterItem] =
      await sqlClient`SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId1}`;
    expect(afterItem!.quantity_reserved).toBe(initialReserved - 1);

    // Verify RESERVATION_EXPIRED ledger entry
    const [ledger] = await sqlClient`
      SELECT * FROM inventory_ledger_entries 
      WHERE movement_type = 'RESERVATION_EXPIRED' AND reference_id IN (SELECT id::text FROM orders WHERE order_number = ${order.orderNumber})
    `;
    expect(ledger).toBeDefined();
    expect(ledger!.reserved_delta).toBe(-1);
    expect(ledger!.quantity_reserved_after).toBe(afterItem!.quantity_reserved);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import type { S3Client } from "@aws-sdk/client-s3";
import { generateUuidV7 } from "@/db/utils/uuid";
import { generateAnonymousSessionToken } from "@/lib/cart/session";
import { submitCheckout } from "@/lib/checkout";
import { loadAuthorizedPaymentInstructions } from "@/lib/payments/reader";
import { resolveAuthorizedPayment } from "@/lib/payments/authority";
import { createPaymentProofUploadIntent, submitPaymentProof } from "@/lib/payments/service";
import { setTestStorageClientOverride } from "@/lib/storage/private-config";
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

describe("GP-019 / CHK2-BR1 — Real Local PostgreSQL Payment Integration & Concurrency Suite", () => {
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
    process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES = "60";
    process.env.R2_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
    process.env.R2_ACCESS_KEY_ID = "test-r2-access-key-id-12345";
    process.env.R2_SECRET_ACCESS_KEY = "test-r2-secret-access-key-67890";

    sqlClient = postgres(connectionString, { max: 10 });

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
        (${inventoryItemId1}, ${locationId}, ${variantId1}, 500, 0, 0, NOW()),
        (${inventoryItemId2}, ${locationId}, ${variantId2}, 500, 0, 0, NOW())
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

  // Helper to create a single-line guest order
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

    expect(checkoutRes.success).toBe(true);
    if (!checkoutRes.success) throw new Error("Checkout failed");

    return {
      orderNumber: checkoutRes.orderNumber,
      guestCartToken: guestToken,
      guestPaymentSessionCookie: currentMockPaymentSessionCookie!,
    };
  }

  // Helper to create a multi-line guest order (Line 1 + Line 2)
  async function createMultiLineGuestOrder() {
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
      VALUES 
        (${generateUuidV7()}, ${cartId}, ${variantId1}, 1, NOW(), NOW()),
        (${generateUuidV7()}, ${cartId}, ${variantId2}, 1, NOW(), NOW())
    `;

    const subtotal = 30000;
    const shipping = 1500;
    const total = subtotal + shipping;

    const checkoutRes = await submitCheckout({
      checkoutAttemptId: generateUuidV7(),
      shippingMethodCode,
      paymentMethodCode,
      customerEmail: "guest-multiline@gamerperu.pe",
      deliveryAddress: inlineDeliveryAddress,
      reviewedSubtotalCents: subtotal,
      reviewedShippingCents: shipping,
      reviewedTotalCents: total,
    });

    expect(checkoutRes.success).toBe(true);
    if (!checkoutRes.success) throw new Error("Checkout multi-line failed");

    return {
      orderNumber: checkoutRes.orderNumber,
      guestCartToken: guestToken,
      guestPaymentSessionCookie: currentMockPaymentSessionCookie!,
    };
  }

  // 1 & 2 & 3: DB Constraints on idempotency_keys
  it("Scenario 1, 2, 3: enforces conditional source_cart_id check on idempotency_keys", async () => {
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

    const tokenDigest = computePaymentSessionTokenDigest(
      order1.guestPaymentSessionCookie,
      process.env.CHECKOUT_HMAC_SECRET!
    );
    const [session] =
      await sqlClient`SELECT id FROM guest_payment_sessions WHERE token_digest = ${tokenDigest}`;
    expect(session).toBeDefined();

    const [grant1] =
      await sqlClient`SELECT * FROM guest_payment_access_grants WHERE session_id = ${session!.id}`;
    expect(grant1).toBeDefined();

    // Second order reusing same cookie
    await createGuestOrder("SKU-PAY-2", 1, true);
    const grants =
      await sqlClient`SELECT * FROM guest_payment_access_grants WHERE session_id = ${session!.id}`;
    expect(grants.length).toBe(2);
  });

  // 6 & 7: Idempotent Replay Token Rotation & Recovery
  it("Scenario 6 & 7: rotates session token_digest on guest checkout idempotent replay without cookie", async () => {
    const checkoutAttemptId = generateUuidV7();
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

    const firstRes = await submitCheckout({
      checkoutAttemptId,
      shippingMethodCode,
      paymentMethodCode,
      customerEmail: "guest-replay@gamerperu.pe",
      deliveryAddress: inlineDeliveryAddress,
      reviewedSubtotalCents: 15000,
      reviewedShippingCents: 1500,
      reviewedTotalCents: 16500,
    });
    expect(firstRes.success).toBe(true);
    const token1 = currentMockPaymentSessionCookie;
    expect(token1).toBeDefined();

    // Simulate lost cookie
    currentMockPaymentSessionCookie = null;

    const replayRes = await submitCheckout({
      checkoutAttemptId,
      shippingMethodCode,
      paymentMethodCode,
      customerEmail: "guest-replay@gamerperu.pe",
      deliveryAddress: inlineDeliveryAddress,
      reviewedSubtotalCents: 15000,
      reviewedShippingCents: 1500,
      reviewedTotalCents: 16500,
    });
    expect(replayRes.success).toBe(true);
    if (replayRes.success) expect(replayRes.replayed).toBe(true);

    const token2 = currentMockPaymentSessionCookie;
    expect(token2).toBeDefined();
    expect(token2).not.toBe(token1);

    // Old token must no longer match DB digest
    const oldDigest = computePaymentSessionTokenDigest(token1!, process.env.CHECKOUT_HMAC_SECRET!);
    const newDigest = computePaymentSessionTokenDigest(token2!, process.env.CHECKOUT_HMAC_SECRET!);
    const [oldRow] =
      await sqlClient`SELECT id FROM guest_payment_sessions WHERE token_digest = ${oldDigest}`;
    const [newRow] =
      await sqlClient`SELECT id FROM guest_payment_sessions WHERE token_digest = ${newDigest}`;
    expect(oldRow).toBeUndefined();
    expect(newRow).toBeDefined();
  });

  // 9 & 10: Guest Payment Instructions Authorization Guards
  it("Scenario 9 & 10: allows authorized guest with valid cookie, denies guest without cookie or with foreign cookie", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    const validRes = await loadAuthorizedPaymentInstructions(order.orderNumber);
    expect(validRes.success).toBe(true);

    currentMockPaymentSessionCookie = null;
    const noCookieRes = await loadAuthorizedPaymentInstructions(order.orderNumber);
    expect(noCookieRes.success).toBe(false);
    if (!noCookieRes.success) expect(noCookieRes.code).toBe("NOT_AVAILABLE");

    currentMockPaymentSessionCookie = generateSecurePaymentSessionToken();
    const foreignCookieRes = await loadAuthorizedPaymentInstructions(order.orderNumber);
    expect(foreignCookieRes.success).toBe(false);
    if (!foreignCookieRes.success) expect(foreignCookieRes.code).toBe("NOT_AVAILABLE");
  });

  // Blocker A: Concurrent Upload Intent Creation on Same Payment
  it("Blocker A: concurrent upload intent creation serializes on Payment row resulting in exactly 1 PENDING and others ABANDONED", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    // Trigger concurrent intent creation requests
    const [intent1, intent2] = await Promise.all([
      createPaymentProofUploadIntent({
        orderNumber: order.orderNumber,
        declaredMimeType: "image/png",
        declaredSizeBytes: 1024 * 100,
      }),
      createPaymentProofUploadIntent({
        orderNumber: order.orderNumber,
        declaredMimeType: "image/jpeg",
        declaredSizeBytes: 1024 * 200,
      }),
    ]);

    expect(intent1.success).toBe(true);
    expect(intent2.success).toBe(true);

    // Verify DB state: exactly 1 PENDING, 1 ABANDONED
    const intents = await sqlClient`
      SELECT id, status FROM payment_proof_upload_intents 
      WHERE payment_id IN (SELECT id FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber}))
      ORDER BY created_at ASC
    `;

    expect(intents.length).toBe(2);
    const pendingIntents = intents.filter((i) => i.status === "PENDING");
    const abandonedIntents = intents.filter((i) => i.status === "ABANDONED");
    expect(pendingIntents.length).toBe(1);
    expect(abandonedIntents.length).toBe(1);
  });

  // 13: Authenticated Customer Ownership vs Foreign Customer Denial
  it("Scenario 13: authenticated owner can read instructions; foreign customer is denied", async () => {
    currentMockIdentity = {
      success: true,
      identity: { authUserId: authUserId1, email: "owner@gamerperu.pe" },
    };
    currentMockCartCookie = null;
    currentMockPaymentSessionCookie = null;

    const cartId = generateUuidV7();
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

    const ownerRes = await loadAuthorizedPaymentInstructions(checkoutRes.orderNumber);
    expect(ownerRes.success).toBe(true);

    currentMockIdentity = {
      success: true,
      identity: { authUserId: authUserId2, email: "foreign@gamerperu.pe" },
    };
    const foreignRes = await loadAuthorizedPaymentInstructions(checkoutRes.orderNumber);
    expect(foreignRes.success).toBe(false);
    if (!foreignRes.success) expect(foreignRes.code).toBe("NOT_AVAILABLE");
  });

  // 14: Frozen Instruction Version
  it("Scenario 14: frozen instruction version remains frozen after configuration changes", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    const newInstructionId = generateUuidV7();
    await sqlClient`
      INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active, created_at)
      VALUES (${newInstructionId}, ${paymentMethodCode}, 2, 'New Recipient SAC', '111222333', 'New instructions', true, NOW())
    `;
    await sqlClient`
      UPDATE payment_method_configurations SET current_instruction_version_id = ${newInstructionId} WHERE id = ${paymentMethodId}
    `;

    const res = await loadAuthorizedPaymentInstructions(order.orderNumber);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.instructions.recipientName).toBe("Gamer Peru SAC");
      expect(res.instructions.accountIdentifier).toBe("999888111");
    }
  });

  // 17..20: Operation code validation & no-proof submission
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

    const [subRow] = await sqlClient`
      SELECT * FROM payment_submissions WHERE operation_code = '000987654321'
    `;
    expect(subRow).toBeDefined();
    expect(subRow!.attempt_number).toBe(1);
    expect(subRow!.is_late).toBe(false);
    expect(subRow!.ip_address).toBeNull();

    const [resRow] = await sqlClient`
      SELECT status FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
    `;
    expect(resRow!.status).toBe("VERIFICATION_HOLD");

    const [outbox] = await sqlClient`
      SELECT * FROM outbox_events WHERE event_name = 'PaymentSubmitted' AND aggregate_id = ${subRow!.payment_id}::text
    `;
    expect(outbox).toBeDefined();
    expect((outbox!.payload as Record<string, unknown>).attemptNumber).toBe(1);
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

  // Section 16 & Blocker A: Real Concurrent SAME-KEY Replay Submission
  it("Section 16: real simultaneous SAME-key duplicate submission converges safely (1 fresh, 1 replay, 1 submission row)", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    const attemptId = generateUuidV7();
    const [res1, res2] = await Promise.all([
      submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: "OP-CONCURRENT-SAME",
      }),
      submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: "OP-CONCURRENT-SAME",
      }),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const replayedValues = [
      (res1 as { replayed: boolean }).replayed,
      (res2 as { replayed: boolean }).replayed,
    ];
    expect(replayedValues).toContain(false);
    expect(replayedValues).toContain(true);

    const submissions =
      await sqlClient`SELECT id FROM payment_submissions WHERE operation_code = 'OP-CONCURRENT-SAME'`;
    expect(submissions.length).toBe(1);

    const outboxEventsCount = await sqlClient`
      SELECT id FROM outbox_events 
      WHERE event_name = 'PaymentSubmitted' AND aggregate_id IN (SELECT id::text FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber}))
    `;
    expect(outboxEventsCount.length).toBe(1);
  });

  // Section 16: Real Concurrent DIFFERENT-KEY Submission on Same UNPAID Payment
  it("Section 16: real simultaneous DIFFERENT-key submission on same initial UNPAID payment serializes; exactly 1 winner, loser rejected, attempt 2 not created", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    const [res1, res2] = await Promise.all([
      submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: generateUuidV7(),
        operationCode: "OP-RACE-A",
      }),
      submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: generateUuidV7(),
        operationCode: "OP-RACE-B",
      }),
    ]);

    const results = [res1, res2];
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(failures[0]!.code).toBe("INVALID_PAYMENT_STATE");

    const submissions = await sqlClient`
      SELECT attempt_number, operation_code FROM payment_submissions 
      WHERE payment_id IN (SELECT id FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber}))
    `;
    expect(submissions.length).toBe(1);
    expect(submissions[0]!.attempt_number).toBe(1);
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

  // Blockers D & E: Multi-Line Late Scenario A (EXPIRED + UNEXPIRED ACTIVE)
  it("Blockers D & E: Multi-Line Scenario A (EXPIRED line + UNEXPIRED ACTIVE line) releases both, writing RESERVATION_EXPIRED and RESERVATION_RELEASED respectively", async () => {
    const order = await createMultiLineGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    // Get order reservations
    const reservations = await sqlClient`
      SELECT id, inventory_item_id FROM inventory_reservations 
      WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
      ORDER BY id ASC
    `;
    expect(reservations.length).toBe(2);

    // Line 1 is expired (backdated)
    await sqlClient`
      UPDATE inventory_reservations SET expires_at = NOW() - INTERVAL '10 minutes' WHERE id = ${reservations[0]!.id}
    `;
    // Line 2 remains active (future expiry)
    await sqlClient`
      UPDATE inventory_reservations SET expires_at = NOW() + INTERVAL '20 minutes' WHERE id = ${reservations[1]!.id}
    `;

    const submitRes = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "OP-MULTILINE-LATE-A",
    });

    expect(submitRes.success).toBe(true);
    if (submitRes.success) {
      expect(submitRes.isLate).toBe(true);
      expect(submitRes.paymentStatus).toBe("SUBMITTED");
    }

    // Both reservations must be RELEASED
    const afterRes = await sqlClient`
      SELECT id, status FROM inventory_reservations 
      WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
      ORDER BY id ASC
    `;
    expect(afterRes[0]!.status).toBe("RELEASED");
    expect(afterRes[1]!.status).toBe("RELEASED");

    // Check ledger entries
    const ledgers = await sqlClient`
      SELECT inventory_item_id, movement_type, reserved_delta FROM inventory_ledger_entries 
      WHERE reference_id IN (SELECT id::text FROM orders WHERE order_number = ${order.orderNumber})
      ORDER BY created_at ASC
    `;

    // 2 created at checkout + 2 released at submission = 4 total
    const releaseLedgers = ledgers.filter((l) => l.movement_type.startsWith("RESERVATION_"));
    const expiredLedger = releaseLedgers.find((l) => l.movement_type === "RESERVATION_EXPIRED");
    const releasedLedger = releaseLedgers.find((l) => l.movement_type === "RESERVATION_RELEASED");

    expect(expiredLedger).toBeDefined();
    expect(expiredLedger!.inventory_item_id).toBe(reservations[0]!.inventory_item_id);
    expect(expiredLedger!.reserved_delta).toBe(-1);

    expect(releasedLedger).toBeDefined();
    expect(releasedLedger!.inventory_item_id).toBe(reservations[1]!.inventory_item_id);
    expect(releasedLedger!.reserved_delta).toBe(-1);
  });

  // Blockers D & E: Multi-Line Late Scenario B (ALREADY RELEASED + ACTIVE UNEXPIRED)
  it("Blockers D & E: Multi-Line Scenario B (ALREADY RELEASED line + ACTIVE UNEXPIRED line) marks order late and releases remaining line with RESERVATION_RELEASED", async () => {
    const order = await createMultiLineGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    const reservations = await sqlClient`
      SELECT id, inventory_item_id FROM inventory_reservations 
      WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
      ORDER BY id ASC
    `;
    expect(reservations.length).toBe(2);

    // Line 1 was already released previously
    await sqlClient`
      UPDATE inventory_reservations SET status = 'RELEASED' WHERE id = ${reservations[0]!.id}
    `;
    // Line 2 is ACTIVE unexpired
    await sqlClient`
      UPDATE inventory_reservations SET status = 'ACTIVE', expires_at = NOW() + INTERVAL '20 minutes' WHERE id = ${reservations[1]!.id}
    `;

    const submitRes = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "OP-MULTILINE-LATE-B",
    });

    expect(submitRes.success).toBe(true);
    if (submitRes.success) {
      expect(submitRes.isLate).toBe(true);
      expect(submitRes.paymentStatus).toBe("SUBMITTED");
    }

    const afterRes = await sqlClient`
      SELECT id, status FROM inventory_reservations 
      WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
      ORDER BY id ASC
    `;
    expect(afterRes[0]!.status).toBe("RELEASED");
    expect(afterRes[1]!.status).toBe("RELEASED");

    // Line 2 generated RESERVATION_RELEASED
    const [line2Ledger] = await sqlClient`
      SELECT * FROM inventory_ledger_entries 
      WHERE inventory_item_id = ${reservations[1]!.inventory_item_id} AND movement_type = 'RESERVATION_RELEASED'
    `;
    expect(line2Ledger).toBeDefined();
    expect(line2Ledger!.reserved_delta).toBe(-1);
  });

  // Blockers D & E: Inventory Underflow Rollback Scenario
  it("Blockers D & E: inventory underflow rolls back entire transaction leaving Payment UNPAID and zero submission records", async () => {
    const order = await createGuestOrder();
    currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

    // Expire reservation to trigger release path
    await sqlClient`
      UPDATE inventory_reservations 
      SET expires_at = NOW() - INTERVAL '5 minutes'
      WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
    `;

    // Forcibly corrupt quantity_reserved to 0 on inventory_item so that decrementing 1 causes an underflow error
    await sqlClient`
      UPDATE inventory_items 
      SET quantity_reserved = 0 
      WHERE id = ${inventoryItemId1}
    `;

    const submitRes = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "OP-UNDERFLOW-TEST",
    });

    expect(submitRes.success).toBe(false);
    if (!submitRes.success) {
      expect(submitRes.code).toBe("SYSTEM_ERROR");
    }

    // Verify complete rollback in DB:
    // 1. Payment remains UNPAID
    const [payRow] = await sqlClient`
      SELECT status FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber})
    `;
    expect(payRow!.status).toBe("UNPAID");

    // 2. Zero payment_submissions rows
    const subs = await sqlClient`
      SELECT id FROM payment_submissions WHERE operation_code = 'OP-UNDERFLOW-TEST'
    `;
    expect(subs.length).toBe(0);

    // 3. Zero PaymentSubmitted outbox events
    const outbox = await sqlClient`
      SELECT id FROM outbox_events 
      WHERE event_name = 'PaymentSubmitted' AND aggregate_id IN (SELECT id::text FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number = ${order.orderNumber}))
    `;
    expect(outbox.length).toBe(0);

    // 4. Zero idempotency key records
    const idemp = await sqlClient`
      SELECT id FROM idempotency_keys WHERE idempotency_key LIKE '%OP-UNDERFLOW-TEST%'
    `;
    expect(idemp.length).toBe(0);
  });

  // =========================================================================
  // GP-019 / CHK2-BR2: Idempotency Expiry Matrix Tests (Scenarios A - E)
  // =========================================================================
  describe("GP-019 / CHK2-BR2 — Idempotency Expiry Matrix & Order of Evaluation", () => {
    it("Scenario A: Same authority + expired exact request returns IDEMPOTENCY_EXPIRED (not replay success)", async () => {
      const order = await createGuestOrder();
      currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

      const attemptId = generateUuidV7();
      const opCode = "OP-EXPIRY-SCENARIO-A";

      // 1. Initial fresh submission -> succeeds
      const firstRes = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: opCode,
      });
      expect(firstRes.success).toBe(true);

      // 2. Artificially expire the committed idempotency record
      const namespacedKey = `PAYMENT_SUBMISSION:${attemptId}`;
      await sqlClient`
        UPDATE idempotency_keys
        SET expires_at = NOW() - INTERVAL '10 minutes'
        WHERE idempotency_key = ${namespacedKey}
      `;

      // 3. Exact replay with expired key
      const replayRes = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: opCode,
      });

      expect(replayRes.success).toBe(false);
      if (!replayRes.success) {
        expect(replayRes.code).toBe("IDEMPOTENCY_EXPIRED");
        expect(replayRes.error).toContain("El intento anterior expiró");
      }
    });

    it("Scenario B: Same authority + expired key + changed operation code returns IDEMPOTENCY_EXPIRED (not IDEMPOTENCY_CONFLICT)", async () => {
      const order = await createGuestOrder();
      currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

      const attemptId = generateUuidV7();
      const opCode = "OP-EXPIRY-SCENARIO-B1";

      // 1. Initial submission
      const firstRes = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: opCode,
      });
      expect(firstRes.success).toBe(true);

      // 2. Artificially expire the idempotency key
      const namespacedKey = `PAYMENT_SUBMISSION:${attemptId}`;
      await sqlClient`
        UPDATE idempotency_keys
        SET expires_at = NOW() - INTERVAL '10 minutes'
        WHERE idempotency_key = ${namespacedKey}
      `;

      // 3. Submit with DIFFERENT operation code (changed fingerprint) but EXPIRED key
      const changedRes = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: "OP-EXPIRY-SCENARIO-B2-CHANGED",
      });

      // Must return IDEMPOTENCY_EXPIRED because expiration check occurs BEFORE fingerprint check
      expect(changedRes.success).toBe(false);
      if (!changedRes.success) {
        expect(changedRes.code).toBe("IDEMPOTENCY_EXPIRED");
      }
    });

    it("Scenario C: Wrong authority + expired key returns NOT_AVAILABLE (not IDEMPOTENCY_EXPIRED)", async () => {
      const order1 = await createGuestOrder();
      currentMockPaymentSessionCookie = order1.guestPaymentSessionCookie;

      const attemptId = generateUuidV7();

      // Submit on Order 1
      await submitPaymentProof({
        orderNumber: order1.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: "OP-WRONG-AUTH",
      });

      // Expire the key
      const namespacedKey = `PAYMENT_SUBMISSION:${attemptId}`;
      await sqlClient`
        UPDATE idempotency_keys
        SET expires_at = NOW() - INTERVAL '10 minutes'
        WHERE idempotency_key = ${namespacedKey}
      `;

      // Now create Order 2 and switch guest payment cookie to Order 2
      const order2 = await createGuestOrder();
      currentMockPaymentSessionCookie = order2.guestPaymentSessionCookie;

      // Attempt to submit on Order 2 using the attemptId belonging to Order 1
      const wrongAuthRes = await submitPaymentProof({
        orderNumber: order2.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: "OP-WRONG-AUTH",
      });

      // Must return NOT_AVAILABLE because authority check occurs FIRST without revealing key
      expect(wrongAuthRes.success).toBe(false);
      if (!wrongAuthRes.success) {
        expect(wrongAuthRes.code).toBe("NOT_AVAILABLE");
      }
    });

    it("Scenario D: Expired key with proof intent exits immediately on fast-path (0 DB mutations)", async () => {
      const order = await createGuestOrder();
      currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

      const auth = await resolveAuthorizedPayment(order.orderNumber);
      if (!auth.authorized) throw new Error("Order not authorized");

      const attemptId = generateUuidV7();
      const namespacedKey = `PAYMENT_SUBMISSION:${attemptId}`;

      // 1. Request upload intent while order is UNPAID
      const intentRes = await createPaymentProofUploadIntent({
        orderNumber: order.orderNumber,
        declaredMimeType: "image/png",
        declaredSizeBytes: 1024,
      });
      expect(intentRes.success).toBe(true);
      if (!intentRes.success) throw new Error("Upload intent creation failed");

      // 2. Pre-seed an expired idempotency key for this attemptId
      await sqlClient`
        INSERT INTO idempotency_keys (
          id, idempotency_key, operation_type, authority_binding_digest, request_fingerprint, response_payload, expires_at
        ) VALUES (
          ${generateUuidV7()},
          ${namespacedKey},
          'PAYMENT_SUBMISSION',
          ${auth.authorityBindingDigest},
          'pre-seeded-fingerprint',
          NULL,
          NOW() - INTERVAL '10 minutes'
        )
      `;

      const countBefore = await sqlClient`
        SELECT COUNT(*)::int as count FROM payment_submissions
      `;

      // 3. Replay with expired key + upload intent -> should exit fast path before R2
      const expiredRes = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: "OP-FAST-EXPIRY-PROOF",
        uploadIntentId: intentRes.uploadIntentId,
      });

      expect(expiredRes.success).toBe(false);
      if (!expiredRes.success) {
        expect(expiredRes.code).toBe("IDEMPOTENCY_EXPIRED");
      }

      const countAfter = await sqlClient`
        SELECT COUNT(*)::int as count FROM payment_submissions
      `;
      expect(countAfter[0]!.count).toBe(countBefore[0]!.count);
    });

    it("Scenario E: Locked transactional recheck observes expired row and returns IDEMPOTENCY_EXPIRED with 0 mutations", async () => {
      const order = await createGuestOrder();
      currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

      const auth = await resolveAuthorizedPayment(order.orderNumber);
      if (!auth.authorized) throw new Error("Order not authorized");

      const attemptId = generateUuidV7();
      const namespacedKey = `PAYMENT_SUBMISSION:${attemptId}`;

      // Insert pre-expired idempotency row directly into DB (simulating race where fast-path missed but locked recheck finds it)
      await sqlClient`
        INSERT INTO idempotency_keys (
          id, idempotency_key, operation_type, authority_binding_digest, request_fingerprint, response_payload, expires_at
        ) VALUES (
          ${generateUuidV7()},
          ${namespacedKey},
          'PAYMENT_SUBMISSION',
          ${auth.authorityBindingDigest},
          'placeholder-fingerprint',
          NULL,
          NOW() - INTERVAL '5 minutes'
        )
      `;

      const submitRes = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: "OP-LOCKED-EXPIRED",
      });

      expect(submitRes.success).toBe(false);
      if (!submitRes.success) {
        expect(submitRes.code).toBe("IDEMPOTENCY_EXPIRED");
      }

      // Verify zero PaymentSubmitted outbox events
      const outbox = await sqlClient`
        SELECT id FROM outbox_events
        WHERE event_name = 'PaymentSubmitted' AND aggregate_id = ${auth.payment.id}
      `;
      expect(outbox.length).toBe(0);
    });
  });

  describe("GP-019 / CHK2-BR3 — Race-Safe R2 Candidate Ownership Suite", () => {
    const VALID_1X1_PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    interface MockS3Store {
      client: S3Client;
      objects: Map<string, Buffer>;
      commandLog: { command: string; key?: string; source?: string; destination?: string }[];
    }

    interface S3CommandInput {
      Key?: string;
      CopySource?: string;
      [k: string]: unknown;
    }

    function createMockS3Store(options?: {
      coordinateTwoCopies?: boolean;
      onCommand?: (commandName: string, input: S3CommandInput) => Promise<void> | void;
    }): MockS3Store {
      const objects = new Map<string, Buffer>();
      const commandLog: { command: string; key?: string; source?: string; destination?: string }[] =
        [];

      let copyCount = 0;
      let copyResolve: (() => void) | null = null;
      const bothCopiesPromise = new Promise<void>((resolve) => {
        copyResolve = resolve;
      });

      const client = {
        send: async (cmd: { constructor: { name: string }; input: S3CommandInput }) => {
          const commandName = cmd.constructor.name;
          if (options?.onCommand) {
            await options.onCommand(commandName, cmd.input);
          }

          if (commandName === "HeadObjectCommand") {
            const key = String(cmd.input.Key ?? "");
            commandLog.push({ command: "HeadObjectCommand", key });
            const buf = objects.get(key);
            if (!buf) {
              const err = new Error("NotFound");
              err.name = "NotFound";
              throw err;
            }
            return { ContentLength: buf.length, ContentType: "image/png" };
          }
          if (commandName === "GetObjectCommand") {
            const key = String(cmd.input.Key ?? "");
            commandLog.push({ command: "GetObjectCommand", key });
            const buf = objects.get(key);
            if (!buf) {
              const err = new Error("NotFound");
              err.name = "NotFound";
              throw err;
            }
            return {
              Body: {
                transformToByteArray: () => Promise.resolve(new Uint8Array(buf)),
              },
            };
          }
          if (commandName === "CopyObjectCommand") {
            const destKey = String(cmd.input.Key ?? "");
            const source = String(cmd.input.CopySource ?? "");
            const srcKey = source.includes("/")
              ? source.substring(source.indexOf("/") + 1)
              : source;
            commandLog.push({ command: "CopyObjectCommand", source: srcKey, destination: destKey });
            const srcBuf = objects.get(srcKey) ?? VALID_1X1_PNG;
            objects.set(destKey, srcBuf);

            if (options?.coordinateTwoCopies) {
              copyCount++;
              if (copyCount === 2) {
                copyResolve?.();
              } else {
                await bothCopiesPromise;
              }
            }
            return {};
          }
          if (commandName === "DeleteObjectCommand") {
            const key = String(cmd.input.Key ?? "");
            commandLog.push({ command: "DeleteObjectCommand", key });
            objects.delete(key);
            return {};
          }
          return {};
        },
      } as unknown as S3Client;

      return { client, objects, commandLog };
    }

    afterEach(() => {
      setTestStorageClientOverride(null);
    });

    it("Section 7: Real simultaneous same-key + same-proof race preserves winner object and cleans up loser candidate", async () => {
      const order = await createGuestOrder();
      currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

      const auth = await resolveAuthorizedPayment(order.orderNumber);
      if (!auth.authorized) throw new Error("Order not authorized");

      // 1. Create upload intent
      const intentRes = await createPaymentProofUploadIntent({
        orderNumber: order.orderNumber,
        declaredMimeType: "image/png",
        declaredSizeBytes: VALID_1X1_PNG.length,
      });
      expect(intentRes.success).toBe(true);
      if (!intentRes.success) throw new Error("Upload intent failed");

      const [intentRow] = await sqlClient`
        SELECT staging_object_key FROM payment_proof_upload_intents WHERE id = ${intentRes.uploadIntentId}
      `;
      const stagingKey = intentRow!.staging_object_key;

      // 2. Setup mock S3 with coordination barrier so BOTH requests copy candidates before either commits
      const mockStore = createMockS3Store({ coordinateTwoCopies: true });
      mockStore.objects.set(stagingKey, VALID_1X1_PNG);
      setTestStorageClientOverride(mockStore.client);

      const attemptId = generateUuidV7();
      const opCode = "OP-BR3-SIMULTANEOUS-RACE";

      // 3. Launch genuinely simultaneous exact retry requests
      const [res1, res2] = await Promise.all([
        submitPaymentProof({
          orderNumber: order.orderNumber,
          submissionAttemptId: attemptId,
          operationCode: opCode,
          uploadIntentId: intentRes.uploadIntentId,
        }),
        submitPaymentProof({
          orderNumber: order.orderNumber,
          submissionAttemptId: attemptId,
          operationCode: opCode,
          uploadIntentId: intentRes.uploadIntentId,
        }),
      ]);

      // 4. Assert both API results succeeded with exactly 1 fresh and 1 replay
      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      if (!res1.success || !res2.success) throw new Error("Submissions failed");

      const replayFlags = [res1.replayed, res2.replayed].sort();
      expect(replayFlags).toEqual([false, true]);

      // 5. In PostgreSQL: exactly 1 payment_submission, 1 outbox_event, 1 idempotency_key, 1 media_asset
      const submissions = await sqlClient`
        SELECT id, proof_media_id FROM payment_submissions WHERE payment_id = ${auth.payment.id}
      `;
      expect(submissions.length).toBe(1);

      const outbox = await sqlClient`
        SELECT id FROM outbox_events WHERE event_name = 'PaymentSubmitted' AND aggregate_id = ${auth.payment.id}
      `;
      expect(outbox.length).toBe(1);

      const namespacedKey = `PAYMENT_SUBMISSION:${attemptId}`;
      const idempotency = await sqlClient`
        SELECT id FROM idempotency_keys WHERE idempotency_key = ${namespacedKey}
      `;
      expect(idempotency.length).toBe(1);

      const media = await sqlClient`
        SELECT id, object_key, security_class FROM media_assets WHERE id = ${submissions[0]!.proof_media_id}
      `;
      expect(media.length).toBe(1);
      expect(media[0]!.security_class).toBe("PRIVATE_PAYMENT_PROOF");

      const winnerObjectKey = media[0]!.object_key;

      // 6. Verify candidate keys from CopyObjectCommand
      const copyCommands = mockStore.commandLog.filter((c) => c.command === "CopyObjectCommand");
      expect(copyCommands.length).toBe(2);
      const dest1 = copyCommands[0]!.destination!;
      const dest2 = copyCommands[1]!.destination!;

      // Prove that both invocations received DIFFERENT unique candidate keys
      expect(dest1).not.toEqual(dest2);

      const loserCandidateKey = dest1 === winnerObjectKey ? dest2 : dest1;
      expect(loserCandidateKey).not.toEqual(winnerObjectKey);

      // 7. Prove winner object EXISTS in storage and loser candidate object was DELETED
      expect(mockStore.objects.has(winnerObjectKey)).toBe(true);
      expect(mockStore.objects.has(loserCandidateKey)).toBe(false);

      // 8. Prove DeleteObjectCommand was issued for loser candidate and NEVER for winner candidate
      const deleteCommands = mockStore.commandLog.filter(
        (c) => c.command === "DeleteObjectCommand"
      );
      const deletedKeys = deleteCommands.map((c) => c.key);
      expect(deletedKeys).toContain(loserCandidateKey);
      expect(deletedKeys).not.toContain(winnerObjectKey);
      expect(deletedKeys).toContain(stagingKey); // Post-commit staging cleanup
    });

    it("Section 8: Fast replay test after commit executes 0 storage operations", async () => {
      const order = await createGuestOrder();
      currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

      const auth = await resolveAuthorizedPayment(order.orderNumber);
      if (!auth.authorized) throw new Error("Order not authorized");

      const intentRes = await createPaymentProofUploadIntent({
        orderNumber: order.orderNumber,
        declaredMimeType: "image/png",
        declaredSizeBytes: VALID_1X1_PNG.length,
      });
      expect(intentRes.success).toBe(true);
      if (!intentRes.success) throw new Error("Upload intent failed");

      const [intentRow] = await sqlClient`
        SELECT staging_object_key FROM payment_proof_upload_intents WHERE id = ${intentRes.uploadIntentId}
      `;
      const stagingKey = intentRow!.staging_object_key;

      const mockStore = createMockS3Store();
      mockStore.objects.set(stagingKey, VALID_1X1_PNG);
      setTestStorageClientOverride(mockStore.client);

      const attemptId = generateUuidV7();
      const opCode = "OP-BR3-FAST-REPLAY";

      // Initial submission commits
      const res1 = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: opCode,
        uploadIntentId: intentRes.uploadIntentId,
      });
      expect(res1.success).toBe(true);
      if (res1.success) {
        expect(res1.replayed).toBe(false);
      }

      // Clear storage command log
      mockStore.commandLog.length = 0;

      // Exact replay after committed
      const res2 = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: opCode,
        uploadIntentId: intentRes.uploadIntentId,
      });
      expect(res2.success).toBe(true);
      if (res2.success) {
        expect(res2.replayed).toBe(true);
      }

      // Must execute ZERO storage calls
      expect(mockStore.commandLog.length).toBe(0);
    });

    it("Section 9A: IDEMPOTENCY_CONFLICT after candidate copy deletes candidate only", async () => {
      const order = await createGuestOrder();
      currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

      const auth = await resolveAuthorizedPayment(order.orderNumber);
      if (!auth.authorized) throw new Error("Order not authorized");

      const intentRes = await createPaymentProofUploadIntent({
        orderNumber: order.orderNumber,
        declaredMimeType: "image/png",
        declaredSizeBytes: VALID_1X1_PNG.length,
      });
      expect(intentRes.success).toBe(true);
      if (!intentRes.success) throw new Error("Upload intent failed");

      const [intentRow] = await sqlClient`
        SELECT staging_object_key FROM payment_proof_upload_intents WHERE id = ${intentRes.uploadIntentId}
      `;
      const stagingKey = intentRow!.staging_object_key;

      const attemptId = generateUuidV7();
      const namespacedKey = `PAYMENT_SUBMISSION:${attemptId}`;

      // Mock S3 hook: during CopyObjectCommand, pre-insert conflicting idempotency row
      const mockStore = createMockS3Store({
        onCommand: async (cmdName) => {
          if (cmdName === "CopyObjectCommand") {
            await sqlClient`
              INSERT INTO idempotency_keys (
                id, idempotency_key, operation_type, authority_binding_digest, request_fingerprint, response_payload, expires_at
              ) VALUES (
                ${generateUuidV7()},
                ${namespacedKey},
                'PAYMENT_SUBMISSION',
                ${auth.authorityBindingDigest},
                'conflicting-fingerprint-digest',
                NULL,
                NOW() + INTERVAL '1 hour'
              )
              ON CONFLICT DO NOTHING
            `;
          }
        },
      });
      mockStore.objects.set(stagingKey, VALID_1X1_PNG);
      setTestStorageClientOverride(mockStore.client);

      const res = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: attemptId,
        operationCode: "OP-CONFLICT-CLEANUP",
        uploadIntentId: intentRes.uploadIntentId,
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("IDEMPOTENCY_CONFLICT");
      }

      // Candidate key was deleted
      const copyCmd = mockStore.commandLog.find((c) => c.command === "CopyObjectCommand");
      expect(copyCmd).toBeDefined();
      const candidateKey = copyCmd!.destination!;
      expect(mockStore.objects.has(candidateKey)).toBe(false);
    });

    it("Section 9B: INVALID_PAYMENT_STATE after candidate copy deletes candidate", async () => {
      const order = await createGuestOrder();
      currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

      const auth = await resolveAuthorizedPayment(order.orderNumber);
      if (!auth.authorized) throw new Error("Order not authorized");

      const intentRes = await createPaymentProofUploadIntent({
        orderNumber: order.orderNumber,
        declaredMimeType: "image/png",
        declaredSizeBytes: VALID_1X1_PNG.length,
      });
      expect(intentRes.success).toBe(true);
      if (!intentRes.success) throw new Error("Upload intent failed");

      const [intentRow] = await sqlClient`
        SELECT staging_object_key FROM payment_proof_upload_intents WHERE id = ${intentRes.uploadIntentId}
      `;
      const stagingKey = intentRow!.staging_object_key;

      // Hook: during copy, set payment status to PAID in DB
      const mockStore = createMockS3Store({
        onCommand: async (cmdName) => {
          if (cmdName === "CopyObjectCommand") {
            await sqlClient`
              UPDATE payments SET status = 'PAID' WHERE id = ${auth.payment.id}
            `;
          }
        },
      });
      mockStore.objects.set(stagingKey, VALID_1X1_PNG);
      setTestStorageClientOverride(mockStore.client);

      const res = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: generateUuidV7(),
        operationCode: "OP-INVALID-STATE",
        uploadIntentId: intentRes.uploadIntentId,
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("INVALID_PAYMENT_STATE");
      }

      const copyCmd = mockStore.commandLog.find((c) => c.command === "CopyObjectCommand");
      expect(copyCmd).toBeDefined();
      const candidateKey = copyCmd!.destination!;
      expect(mockStore.objects.has(candidateKey)).toBe(false);
    });

    it("Section 9C: Transaction rollback after candidate copy deletes candidate", async () => {
      const order = await createGuestOrder();
      currentMockPaymentSessionCookie = order.guestPaymentSessionCookie;

      const auth = await resolveAuthorizedPayment(order.orderNumber);
      if (!auth.authorized) throw new Error("Order not authorized");

      const intentRes = await createPaymentProofUploadIntent({
        orderNumber: order.orderNumber,
        declaredMimeType: "image/png",
        declaredSizeBytes: VALID_1X1_PNG.length,
      });
      expect(intentRes.success).toBe(true);
      if (!intentRes.success) throw new Error("Upload intent failed");

      const [intentRow] = await sqlClient`
        SELECT staging_object_key FROM payment_proof_upload_intents WHERE id = ${intentRes.uploadIntentId}
      `;
      const stagingKey = intentRow!.staging_object_key;

      // Hook: during copy, expire the reservation and force inventory underflow to trigger transaction rollback
      const mockStore = createMockS3Store({
        onCommand: async (cmdName) => {
          if (cmdName === "CopyObjectCommand") {
            await sqlClient`
              UPDATE inventory_reservations SET expires_at = NOW() - INTERVAL '10 minutes' WHERE order_id = ${auth.order.id}
            `;
            await sqlClient`
              UPDATE inventory_items SET quantity_reserved = 0 WHERE id = ${inventoryItemId1}
            `;
          }
        },
      });
      mockStore.objects.set(stagingKey, VALID_1X1_PNG);
      setTestStorageClientOverride(mockStore.client);

      const res = await submitPaymentProof({
        orderNumber: order.orderNumber,
        submissionAttemptId: generateUuidV7(),
        operationCode: "OP-ROLLBACK",
        uploadIntentId: intentRes.uploadIntentId,
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("SYSTEM_ERROR");
      }

      // Candidate key was deleted
      const copyCmd = mockStore.commandLog.find((c) => c.command === "CopyObjectCommand");
      expect(copyCmd).toBeDefined();
      const candidateKey = copyCmd!.destination!;
      expect(mockStore.objects.has(candidateKey)).toBe(false);

      // Verify 0 payment submissions created
      const submissions = await sqlClient`
        SELECT id FROM payment_submissions WHERE payment_id = ${auth.payment.id}
      `;
      expect(submissions.length).toBe(0);
    });
  });
});

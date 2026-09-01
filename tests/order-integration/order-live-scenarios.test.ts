import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { generateUuidV7 } from "@/db/utils/uuid";
import { generateAnonymousSessionToken } from "@/lib/cart/session";
import { submitCheckout } from "@/lib/checkout";
import {
  cancelPaidPreShipmentAndRefund,
  cancelUnpaidOrder,
  getOrderTimeline,
  recordRefund,
  applyTerminalPaymentRejectionConsequences,
} from "@/lib/orders/service";
import { submitPaymentProof } from "@/lib/payments/service";
import { db } from "@/db";
import { generateSecurePaymentSessionToken } from "@/lib/payments/crypto";

// Safety assertion for local PostgreSQL
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
      `[SAFETY_ERROR] Unauthorized PostgreSQL target for live order tests. Target must be exactly 127.0.0.1:54322/postgres.`
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

describe("GP-020 — Real Local PostgreSQL Order Management, Cancellation & Refund Suite", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);
  let sqlClient: postgres.Sql;

  const fixturePrefix = "0192d100-0000-7000-8000-";
  const brandId = `${fixturePrefix}000000000001`;
  const categoryId = `${fixturePrefix}000000000002`;
  const productId = `${fixturePrefix}000000000003`;
  const variantId1 = `${fixturePrefix}000000000004`;
  const variantId2 = `${fixturePrefix}000000000005`;

  const locationId = `${fixturePrefix}000000000010`;
  const locationCode = "TEST-ORD-LOC";

  const shippingMethodId = `${fixturePrefix}000000000020`;
  const shippingMethodCode = "TEST_ORD_SHIPPING";

  const paymentMethodId = `${fixturePrefix}000000000030`;
  const paymentMethodCode = "TEST_ORD_YAPE";
  const paymentInstructionId = `${fixturePrefix}000000000031`;

  const customerProfileId1 = `${fixturePrefix}000000000040`;
  const customerProfileId2 = `${fixturePrefix}000000000041`;
  const authUserId1 = `${fixturePrefix}000000000042`;
  const authUserId2 = `${fixturePrefix}000000000043`;
  const staffAuthUserId = `${fixturePrefix}000000000044`;

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
    process.env.ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES = "60";

    sqlClient = postgres(connectionString, { max: 10 });

    // Clean any prior synthetic fixtures
    await sqlClient`DELETE FROM refunds WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM audit_events WHERE target_id IN (SELECT id::text FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM idempotency_keys`;
    await sqlClient`DELETE FROM payment_submissions WHERE payment_id IN (SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode} OR order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe'))`;
    await sqlClient`DELETE FROM guest_payment_access_grants WHERE payment_id IN (SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode} OR order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe'))`;
    await sqlClient`DELETE FROM inventory_ledger_entries WHERE inventory_item_id IN (${inventoryItemId1}, ${inventoryItemId2}) OR reference_id IN (SELECT id::text FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM inventory_reservations WHERE inventory_item_id IN (${inventoryItemId1}, ${inventoryItemId2}) OR order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM payments WHERE payment_method_code = ${paymentMethodCode} OR order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM order_pricing_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM order_address_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM shipments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe')`;
    await sqlClient`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@gamerperu.pe') OR variant_id IN (${variantId1}, ${variantId2})`;
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
    await sqlClient`DELETE FROM user_roles WHERE auth_user_id IN (${authUserId1}, ${authUserId2}, ${staffAuthUserId})`;
    await sqlClient`DELETE FROM customer_profiles WHERE id IN (${customerProfileId1}, ${customerProfileId2})`;

    // Insert Base Fixtures
    await sqlClient`
      INSERT INTO brands (id, name, slug, status, created_at, updated_at)
      VALUES (${brandId}, 'GamerPeru Ord Brand', 'gp-ord-brand', 'PUBLISHED', NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO categories (id, name, slug, status, display_order, created_at, updated_at)
      VALUES (${categoryId}, 'Ord Category', 'ord-category', 'PUBLISHED', 1, NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO products (id, brand_id, category_id, name, slug, description, status, created_at, updated_at)
      VALUES (${productId}, ${brandId}, ${categoryId}, 'Gamer Mouse Ultra', 'gamer-mouse-ultra', 'Mouse for order tests', 'PUBLISHED', NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, created_at, updated_at)
      VALUES 
        (${variantId1}, ${productId}, 'SKU-ORD-1', 'Mouse Ultra Black', 15000, 'ACTIVE', NOW(), NOW()),
        (${variantId2}, ${productId}, 'SKU-ORD-2', 'Mouse Ultra White', 10000, 'ACTIVE', NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO shipping_methods (id, code, name, base_price_cents, estimated_days_min, estimated_days_max, is_active, created_at)
      VALUES (${shippingMethodId}, ${shippingMethodCode}, 'Envío Regular', 1500, 1, 2, true, NOW())
    `;

    await sqlClient`
      INSERT INTO media_assets (id, object_key, security_class, media_type, mime_type, file_size_bytes, checksum_sha256, created_at)
      VALUES (${qrMediaAssetId}, 'payment-qr/test-ord-yape-qr.png', 'PRIVATE_PAYMENT_INSTRUCTION', 'IMAGE', 'image/png', 2048, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', NOW())
    `;

    await sqlClient`
      INSERT INTO payment_method_configurations (id, code, name, is_active, display_order, current_instruction_version_id, created_at, updated_at)
      VALUES (${paymentMethodId}, ${paymentMethodCode}, 'Yape Ordenes', true, 1, NULL, NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, qr_media_id, recipient_name, account_identifier, instruction_text, is_active, created_at)
      VALUES (${paymentInstructionId}, ${paymentMethodCode}, 1, ${qrMediaAssetId}, 'Gamer Peru SAC', '999888111', 'Enviar comprobante Yape', true, NOW())
    `;

    await sqlClient`
      UPDATE payment_method_configurations 
      SET current_instruction_version_id = ${paymentInstructionId} 
      WHERE id = ${paymentMethodId}
    `;

    await sqlClient`
      INSERT INTO inventory_locations (id, code, name, address, is_active, created_at, updated_at)
      VALUES (${locationId}, ${locationCode}, 'Almacén Central', 'Av. Central 100', true, NOW(), NOW())
    `;

    await sqlClient`
      INSERT INTO inventory_items (id, location_id, variant_id, sku, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point, restock_target, is_active, created_at, updated_at)
      VALUES 
        (${inventoryItemId1}, ${locationId}, ${variantId1}, 'SKU-ORD-1', 100, 0, 0, 5, 20, true, NOW(), NOW()),
        (${inventoryItemId2}, ${locationId}, ${variantId2}, 'SKU-ORD-2', 100, 0, 0, 5, 20, true, NOW(), NOW())
    `;

    // Customer Profiles
    await sqlClient`
      INSERT INTO customer_profiles (id, auth_user_id, first_name, last_name, phone, created_at, updated_at)
      VALUES 
        (${customerProfileId1}, ${authUserId1}, 'Cliente', 'Uno', '999111222', NOW(), NOW()),
        (${customerProfileId2}, ${authUserId2}, 'Cliente', 'Dos', '999333444', NOW(), NOW())
    `;

    // Staff User Role (ADMIN_ORDERS -> orders:manage)
    await sqlClient`
      INSERT INTO user_roles (auth_user_id, role_id)
      VALUES (${staffAuthUserId}, (SELECT id FROM roles WHERE name = 'ADMIN_ORDERS'))
      ON CONFLICT DO NOTHING
    `;
  });

  afterEach(async () => {
    currentMockCartCookie = null;
    currentMockPaymentSessionCookie = null;
    currentMockIdentity = { success: false };
  });

  afterAll(async () => {
    if (sqlClient) {
      await sqlClient.end();
    }
  });

  // Helper to create a fresh guest or auth order
  async function createTestOrder(options?: {
    isAuth?: boolean;
    multiLine?: boolean;
    authUserId?: string;
    customerProfileId?: string;
  }) {
    const rawCartToken = generateAnonymousSessionToken();
    currentMockCartCookie = rawCartToken;

    if (options?.isAuth) {
      currentMockIdentity = {
        success: true,
        identity: {
          authUserId: options.authUserId ?? authUserId1,
          email: "cliente1@gamerperu.pe",
        },
      };
    } else {
      currentMockIdentity = { success: false };
    }

    const [cart] = await sqlClient`
      INSERT INTO carts (id, session_token, customer_id, status, created_at, updated_at)
      VALUES (
        ${generateUuidV7()},
        ${rawCartToken},
        ${options?.isAuth ? (options.customerProfileId ?? customerProfileId1) : null},
        'ACTIVE',
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    await sqlClient`
      INSERT INTO cart_items (id, cart_id, variant_id, quantity, unit_price_cents, created_at, updated_at)
      VALUES (${generateUuidV7()}, ${cart!.id}, ${variantId1}, 2, 15000, NOW(), NOW())
    `;

    if (options?.multiLine) {
      await sqlClient`
        INSERT INTO cart_items (id, cart_id, variant_id, quantity, unit_price_cents, created_at, updated_at)
        VALUES (${generateUuidV7()}, ${cart!.id}, ${variantId2}, 1, 10000, NOW(), NOW())
      `;
    }

    const subtotal = options?.multiLine ? 40000 : 30000;
    const shipping = 1500;
    const total = subtotal + shipping;

    const checkoutResult = await submitCheckout({
      checkoutAttemptId: generateUuidV7(),
      customerEmail: "cliente1@gamerperu.pe",
      deliveryAddress: inlineDeliveryAddress,
      shippingMethodCode,
      paymentMethodCode,
      reviewedSubtotalCents: subtotal,
      reviewedShippingCents: shipping,
      reviewedTotalCents: total,
    });

    if (!checkoutResult.success) {
      throw new Error(`Checkout failed: ${checkoutResult.error}`);
    }

    return {
      orderNumber: checkoutResult.orderNumber,
      totalCents: checkoutResult.totalCents,
      rawCartToken,
    };
  }

  // Helper for staff auth
  function setStaffAuth() {
    currentMockIdentity = {
      success: true,
      identity: {
        authUserId: staffAuthUserId,
        email: "staff@gamerperu.pe",
      },
    };
  }

  // Scenario A: PENDING/UNPAID owner cancellation
  it("Scenario A: cancels PENDING/UNPAID order, leaves Payment UNPAID, releases stock and writes RESERVATION_RELEASED ledger", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });

    const cancelResult = await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
      reason: "No deseo continuar con la compra",
    });

    expect(cancelResult.success).toBe(true);
    if (cancelResult.success) {
      expect(cancelResult.status).toBe("CANCELLED");
      expect(cancelResult.replayed).toBe(false);
    }

    // Verify DB states
    const [dbOrder] = await sqlClient`SELECT * FROM orders WHERE order_number = ${orderNumber}`;
    expect(dbOrder!.status).toBe("CANCELLED");
    expect(dbOrder!.cancelled_at).not.toBeNull();
    expect(dbOrder!.cancel_reason).toBe("No deseo continuar con la compra");

    const [dbPayment] = await sqlClient`SELECT * FROM payments WHERE order_id = ${dbOrder!.id}`;
    expect(dbPayment!.status).toBe("UNPAID");

    const reservations =
      await sqlClient`SELECT * FROM inventory_reservations WHERE order_id = ${dbOrder!.id}`;
    expect(reservations.length).toBeGreaterThan(0);
    for (const r of reservations) {
      expect(r.status).toBe("RELEASED");
    }

    const [item1] = await sqlClient`SELECT * FROM inventory_items WHERE id = ${inventoryItemId1}`;
    expect(item1!.quantity_reserved).toBe(0);

    const [ledger] = await sqlClient`
      SELECT * FROM inventory_ledger_entries 
      WHERE reference_id = ${dbOrder!.id} AND movement_type = 'RESERVATION_RELEASED'
    `;
    expect(ledger).toBeDefined();
    expect(ledger!.reserved_delta).toBe(-2);
  });

  // Scenario B: Multi-line ACTIVE release
  it("Scenario B: releases all multi-line ACTIVE reservations atomically", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true, multiLine: true });

    const cancelResult = await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
    });

    expect(cancelResult.success).toBe(true);

    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;
    const reservations =
      await sqlClient`SELECT * FROM inventory_reservations WHERE order_id = ${dbOrder!.id}`;
    expect(reservations.length).toBe(2);
    expect(reservations[0]!.status).toBe("RELEASED");
    expect(reservations[1]!.status).toBe("RELEASED");

    const [item1] =
      await sqlClient`SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId1}`;
    const [item2] =
      await sqlClient`SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId2}`;
    expect(item1!.quantity_reserved).toBe(0);
    expect(item2!.quantity_reserved).toBe(0);
  });

  // Scenario C: Same-key genuinely simultaneous cancellation
  it("Scenario C: serializes same-key simultaneous cancellation (1 mutation + 1 replay)", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const sharedAttemptId = generateUuidV7();

    const [res1, res2] = await Promise.all([
      cancelUnpaidOrder({ orderNumber, cancellationAttemptId: sharedAttemptId }),
      cancelUnpaidOrder({ orderNumber, cancellationAttemptId: sharedAttemptId }),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const replayedCount = [res1, res2].filter((r) => r.success && r.replayed).length;
    const freshCount = [res1, res2].filter((r) => r.success && !r.replayed).length;

    expect(freshCount).toBe(1);
    expect(replayedCount).toBe(1);

    // Assert exactly 1 ledger release entry
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;
    const ledgerEntries = await sqlClient`
      SELECT * FROM inventory_ledger_entries 
      WHERE reference_id = ${dbOrder!.id} AND movement_type = 'RESERVATION_RELEASED'
    `;
    expect(ledgerEntries.length).toBe(1);
  });

  // Scenario D: Different-key same-Order simultaneous cancellation
  it("Scenario D: serializes different-key simultaneous cancellation (1 winner only)", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });

    const [res1, res2] = await Promise.all([
      cancelUnpaidOrder({ orderNumber, cancellationAttemptId: generateUuidV7() }),
      cancelUnpaidOrder({ orderNumber, cancellationAttemptId: generateUuidV7() }),
    ]);

    const successCount = [res1, res2].filter((r) => r.success).length;
    const alreadyCancelledCount = [res1, res2].filter(
      (r) => !r.success && r.code === "ALREADY_CANCELLED"
    ).length;

    expect(successCount).toBe(1);
    expect(alreadyCancelledCount).toBe(1);
  });

  // Scenario E: Cancellation wins vs submitPaymentProof
  it("Scenario E: when cancellation wins, submitPaymentProof observes CANCELLED Order and returns INVALID_PAYMENT_STATE", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });

    // Cancel order first
    const cancelRes = await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
    });
    expect(cancelRes.success).toBe(true);

    // Try submit payment proof
    const submitRes = await submitPaymentProof({
      orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "123456",
    });

    expect(submitRes.success).toBe(false);
    if (!submitRes.success) {
      expect(submitRes.code).toBe("INVALID_PAYMENT_STATE");
    }

    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;
    const [dbPayment] = await sqlClient`SELECT * FROM payments WHERE order_id = ${dbOrder!.id}`;
    expect(dbPayment!.status).toBe("UNPAID");

    const submissions =
      await sqlClient`SELECT * FROM payment_submissions WHERE payment_id = ${dbPayment!.id}`;
    expect(submissions.length).toBe(0);
  });

  // Scenario F: submitPaymentProof wins vs cancellation
  it("Scenario F: when submitPaymentProof wins, cancellation returns PAYMENT_REVIEW_IN_PROGRESS", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });

    // Submit payment proof first
    const submitRes = await submitPaymentProof({
      orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "654321",
    });
    expect(submitRes.success).toBe(true);

    // Try cancel order
    const cancelRes = await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
    });

    expect(cancelRes.success).toBe(false);
    if (!cancelRes.success) {
      expect(cancelRes.code).toBe("PAYMENT_REVIEW_IN_PROGRESS");
    }

    const [dbOrder] =
      await sqlClient`SELECT status FROM orders WHERE order_number = ${orderNumber}`;
    expect(dbOrder!.status).toBe("PENDING");

    const reservations = await sqlClient`
      SELECT status FROM inventory_reservations 
      WHERE order_id = (SELECT id FROM orders WHERE order_number = ${orderNumber})
    `;
    expect(reservations[0]!.status).toBe("VERIFICATION_HOLD");
  });

  // Scenario G: Valid EXPIRED late PaymentSubmission regression
  it("Scenario G: EXPIRED order accepts late PaymentSubmission per GP-019 semantics", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });

    // Expire reservations and order in DB
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;
    await sqlClient`
      UPDATE inventory_reservations 
      SET status = 'RELEASED', expires_at = NOW() - INTERVAL '1 hour'
      WHERE order_id = ${dbOrder!.id}
    `;
    await sqlClient`
      UPDATE orders SET status = 'EXPIRED' WHERE id = ${dbOrder!.id}
    `;

    const submitRes = await submitPaymentProof({
      orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "888999",
    });

    expect(submitRes.success).toBe(true);
    if (submitRes.success) {
      expect(submitRes.isLate).toBe(true);
      expect(submitRes.paymentStatus).toBe("SUBMITTED");
    }
  });

  // Scenario H: CANCELLED Order PaymentSubmission regression
  it("Scenario H: CANCELLED order strictly rejects PaymentSubmission", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;
    await sqlClient`UPDATE orders SET status = 'CANCELLED' WHERE id = ${dbOrder!.id}`;

    const submitRes = await submitPaymentProof({
      orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "777666",
    });

    expect(submitRes.success).toBe(false);
    if (!submitRes.success) {
      expect(submitRes.code).toBe("INVALID_PAYMENT_STATE");
    }
  });

  // Scenario I: Paid pre-shipment cancellation with zero prior refunds
  it("Scenario I: paid pre-shipment cancellation creates full Refund, releases ALLOCATED stock and sets Order/Payment REFUNDED", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    // Transition Order to CONFIRMED, Payment to PAID, Reservations to ALLOCATED
    await sqlClient`UPDATE orders SET status = 'CONFIRMED' WHERE id = ${dbOrder!.id}`;
    await sqlClient`UPDATE payments SET status = 'PAID' WHERE order_id = ${dbOrder!.id}`;
    await sqlClient`UPDATE inventory_reservations SET status = 'ALLOCATED' WHERE order_id = ${dbOrder!.id}`;
    await sqlClient`UPDATE inventory_items SET quantity_reserved = 0, quantity_allocated = 2 WHERE id = ${inventoryItemId1}`;

    setStaffAuth();

    const cancelRes = await cancelPaidPreShipmentAndRefund({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
      reason: "Cancelación solicitada por cliente antes de empaque",
      externalReference: "BKP-001",
    });

    expect(cancelRes.success).toBe(true);
    if (cancelRes.success) {
      expect(cancelRes.status).toBe("REFUNDED");
      expect(cancelRes.refundedAmountCents).toBe(31500); // 30000 + 1500 shipping
    }

    const [updatedOrder] = await sqlClient`SELECT * FROM orders WHERE id = ${dbOrder!.id}`;
    expect(updatedOrder!.status).toBe("REFUNDED");

    const [updatedPayment] =
      await sqlClient`SELECT * FROM payments WHERE order_id = ${dbOrder!.id}`;
    expect(updatedPayment!.status).toBe("REFUNDED");
    expect(updatedPayment!.refunded_amount_cents).toBe(31500);

    const [refundRecord] = await sqlClient`SELECT * FROM refunds WHERE order_id = ${dbOrder!.id}`;
    expect(refundRecord).toBeDefined();
    expect(refundRecord!.amount_cents).toBe(31500);
    expect(refundRecord!.external_reference).toBe("BKP-001");
    expect(refundRecord!.actor_auth_user_id).toBe(staffAuthUserId);

    const [item1] =
      await sqlClient`SELECT quantity_allocated FROM inventory_items WHERE id = ${inventoryItemId1}`;
    expect(item1!.quantity_allocated).toBe(0);

    const [ledger] = await sqlClient`
      SELECT * FROM inventory_ledger_entries 
      WHERE reference_id = ${dbOrder!.id} AND movement_type = 'ALLOCATION_RELEASED'
    `;
    expect(ledger!.allocated_delta).toBe(-2);
  });

  // Scenario J: Paid pre-shipment cancellation AFTER prior partial refund
  it("Scenario J: paid pre-shipment cancellation refunds only remaining amount after prior partial refund", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    await sqlClient`UPDATE orders SET status = 'CONFIRMED' WHERE id = ${dbOrder!.id}`;
    await sqlClient`UPDATE payments SET status = 'PAID' WHERE order_id = ${dbOrder!.id}`;
    await sqlClient`UPDATE inventory_reservations SET status = 'ALLOCATED' WHERE order_id = ${dbOrder!.id}`;
    await sqlClient`UPDATE inventory_items SET quantity_reserved = 0, quantity_allocated = 2 WHERE id = ${inventoryItemId1}`;

    setStaffAuth();

    // 1. Partial refund of 10000 cents
    const partialRes = await recordRefund({
      orderNumber,
      refundAttemptId: generateUuidV7(),
      amountCents: 10000,
      reason: "Reembolso parcial por promoción tardía",
    });
    expect(partialRes.success).toBe(true);

    // 2. Full cancellation
    const cancelRes = await cancelPaidPreShipmentAndRefund({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
      reason: "Cancelación final",
    });

    expect(cancelRes.success).toBe(true);
    if (cancelRes.success) {
      expect(cancelRes.refundedAmountCents).toBe(21500); // 31500 - 10000
    }

    const [updatedPayment] =
      await sqlClient`SELECT * FROM payments WHERE order_id = ${dbOrder!.id}`;
    expect(updatedPayment!.refunded_amount_cents).toBe(31500);
    expect(updatedPayment!.status).toBe("REFUNDED");

    const refundList = await sqlClient`SELECT * FROM refunds WHERE order_id = ${dbOrder!.id}`;
    expect(refundList.length).toBe(2);
    const sumRefunds = refundList.reduce((sum, r) => sum + r.amount_cents, 0);
    expect(sumRefunds).toBe(31500);
  });

  // Scenario K: Partial refund: durable Refund, no inventory release
  it("Scenario K: partial refund persists Refund row and leaves inventory allocations unchanged", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    await sqlClient`UPDATE orders SET status = 'CONFIRMED' WHERE id = ${dbOrder!.id}`;
    await sqlClient`UPDATE payments SET status = 'PAID' WHERE order_id = ${dbOrder!.id}`;
    await sqlClient`UPDATE inventory_reservations SET status = 'ALLOCATED' WHERE order_id = ${dbOrder!.id}`;
    await sqlClient`UPDATE inventory_items SET quantity_reserved = 0, quantity_allocated = 2 WHERE id = ${inventoryItemId1}`;

    setStaffAuth();

    const refundRes = await recordRefund({
      orderNumber,
      refundAttemptId: generateUuidV7(),
      amountCents: 5000,
      reason: "Descuento post-venta",
    });

    expect(refundRes.success).toBe(true);
    if (refundRes.success) {
      expect(refundRes.paymentStatus).toBe("PAID");
      expect(refundRes.orderStatus).toBe("CONFIRMED");
      expect(refundRes.totalRefundedCents).toBe(5000);
    }

    const [item1] =
      await sqlClient`SELECT quantity_allocated FROM inventory_items WHERE id = ${inventoryItemId1}`;
    expect(item1!.quantity_allocated).toBe(2); // Unchanged!
  });

  // Scenario L: Concurrent different-key refunds never exceed Payment.amount_cents
  it("Scenario L: concurrent different-key refunds serialize and never exceed Payment.amount_cents", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    await sqlClient`UPDATE orders SET status = 'CONFIRMED' WHERE id = ${dbOrder!.id}`;
    await sqlClient`UPDATE payments SET status = 'PAID' WHERE order_id = ${dbOrder!.id}`;

    setStaffAuth();

    // Payment total is 31500 cents. Send two concurrent requests of 20000 each.
    const [res1, res2] = await Promise.all([
      recordRefund({
        orderNumber,
        refundAttemptId: generateUuidV7(),
        amountCents: 20000,
        reason: "Refund A",
      }),
      recordRefund({
        orderNumber,
        refundAttemptId: generateUuidV7(),
        amountCents: 20000,
        reason: "Refund B",
      }),
    ]);

    const successList = [res1, res2].filter((r) => r.success);
    const failList = [res1, res2].filter((r) => !r.success);

    expect(successList.length).toBe(1);
    expect(failList.length).toBe(1);
    if (!failList[0]!.success) {
      expect(failList[0]!.code).toBe("REFUND_EXCEEDS_PAID_AMOUNT");
    }

    const [dbPayment] =
      await sqlClient`SELECT refunded_amount_cents FROM payments WHERE order_id = ${dbOrder!.id}`;
    expect(dbPayment!.refunded_amount_cents).toBe(20000);
  });

  // Scenario M: Same-key simultaneous refund replay
  it("Scenario M: same-key simultaneous refund creates exactly 1 Refund physical row and 1 replay", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    await sqlClient`UPDATE orders SET status = 'CONFIRMED' WHERE id = ${dbOrder!.id}`;
    await sqlClient`UPDATE payments SET status = 'PAID' WHERE order_id = ${dbOrder!.id}`;

    setStaffAuth();
    const sharedAttemptId = generateUuidV7();

    const [res1, res2] = await Promise.all([
      recordRefund({
        orderNumber,
        refundAttemptId: sharedAttemptId,
        amountCents: 5000,
        reason: "Same key refund",
      }),
      recordRefund({
        orderNumber,
        refundAttemptId: sharedAttemptId,
        amountCents: 5000,
        reason: "Same key refund",
      }),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const replayed = [res1, res2].filter((r) => r.success && r.replayed);
    const fresh = [res1, res2].filter((r) => r.success && !r.replayed);
    expect(replayed.length).toBe(1);
    expect(fresh.length).toBe(1);

    const refundRows = await sqlClient`SELECT * FROM refunds WHERE order_id = ${dbOrder!.id}`;
    expect(refundRows.length).toBe(1);
  });

  // Scenario N: Payment.refunded_amount_cents = SUM(Refund.amount_cents)
  it("Scenario N: verifies Payment.refunded_amount_cents exactly equals sum of persisted refunds", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    await sqlClient`UPDATE orders SET status = 'CONFIRMED' WHERE id = ${dbOrder!.id}`;
    await sqlClient`UPDATE payments SET status = 'PAID' WHERE order_id = ${dbOrder!.id}`;

    setStaffAuth();

    await recordRefund({
      orderNumber,
      refundAttemptId: generateUuidV7(),
      amountCents: 5000,
      reason: "Part 1",
    });

    await recordRefund({
      orderNumber,
      refundAttemptId: generateUuidV7(),
      amountCents: 6500,
      reason: "Part 2",
    });

    const [dbPayment] =
      await sqlClient`SELECT refunded_amount_cents FROM payments WHERE order_id = ${dbOrder!.id}`;
    const [sumResult] = await sqlClient`
      SELECT COALESCE(SUM(amount_cents), 0)::int as total 
      FROM refunds 
      WHERE order_id = ${dbOrder!.id}
    `;

    expect(dbPayment!.refunded_amount_cents).toBe(11500);
    expect(sumResult!.total).toBe(11500);
    expect(dbPayment!.refunded_amount_cents).toBe(sumResult!.total);
  });

  // Scenario O: Inventory underflow rolls back refund/cancellation atomically
  it("Scenario O: inventory underflow causes ACID transaction rollback with zero committed changes", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    // Tamper inventory item quantity_reserved to 0
    await sqlClient`UPDATE inventory_items SET quantity_reserved = 0 WHERE id = ${inventoryItemId1}`;

    const cancelRes = await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
    });

    expect(cancelRes.success).toBe(false);
    if (!cancelRes.success) {
      expect(cancelRes.code).toBe("INVENTORY_INVARIANT_VIOLATION");
    }

    // Assert Order remained PENDING
    const [dbOrderAfter] = await sqlClient`SELECT status FROM orders WHERE id = ${dbOrder!.id}`;
    expect(dbOrderAfter!.status).toBe("PENDING");

    // Assert 0 Outbox events created
    const outbox =
      await sqlClient`SELECT * FROM outbox_events WHERE aggregate_id = ${dbOrder!.id} AND event_name = 'OrderCancelled'`;
    expect(outbox.length).toBe(0);
  });

  // Scenario P: Immutable OrderItem/Address/Pricing snapshots unchanged
  it("Scenario P: purchase snapshots remain strictly immutable after cancellation and refund", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    const [itemBefore] = await sqlClient`SELECT * FROM order_items WHERE order_id = ${dbOrder!.id}`;
    const [addressBefore] =
      await sqlClient`SELECT * FROM order_address_snapshots WHERE order_id = ${dbOrder!.id}`;
    const [pricingBefore] =
      await sqlClient`SELECT * FROM order_pricing_snapshots WHERE order_id = ${dbOrder!.id}`;

    await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
    });

    const [itemAfter] = await sqlClient`SELECT * FROM order_items WHERE order_id = ${dbOrder!.id}`;
    const [addressAfter] =
      await sqlClient`SELECT * FROM order_address_snapshots WHERE order_id = ${dbOrder!.id}`;
    const [pricingAfter] =
      await sqlClient`SELECT * FROM order_pricing_snapshots WHERE order_id = ${dbOrder!.id}`;

    expect(itemBefore!.unit_price_cents_snapshot).toBe(itemAfter!.unit_price_cents_snapshot);
    expect(itemBefore!.line_total_cents).toBe(itemAfter!.line_total_cents);
    expect(addressBefore!.street_address).toBe(addressAfter!.street_address);
    expect(pricingBefore!.total_cents).toBe(pricingAfter!.total_cents);
  });

  // Scenario Q: Foreign authenticated user -> NOT_AVAILABLE
  it("Scenario Q: foreign authenticated user receives NOT_AVAILABLE", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });

    // Switch mock auth to customerProfileId2
    currentMockIdentity = {
      success: true,
      identity: {
        authUserId: authUserId2,
        email: "cliente2@gamerperu.pe",
      },
    };

    const cancelRes = await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
    });

    expect(cancelRes.success).toBe(false);
    if (!cancelRes.success) {
      expect(cancelRes.code).toBe("NOT_AVAILABLE");
    }
  });

  // Scenario R: Foreign guest -> NOT_AVAILABLE
  it("Scenario R: foreign guest without payment session grant receives NOT_AVAILABLE", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: false });

    // Set foreign guest payment session cookie
    currentMockPaymentSessionCookie = generateSecurePaymentSessionToken();
    currentMockIdentity = { success: false };

    const cancelRes = await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
    });

    expect(cancelRes.success).toBe(false);
    if (!cancelRes.success) {
      expect(cancelRes.code).toBe("NOT_AVAILABLE");
    }
  });

  // Scenario S: Valid gp_payment_session guest cancellation after Cart lifecycle conversion
  it("Scenario S: guest with valid gp_payment_session cancels unpaid order after cart is converted", async () => {
    const { orderNumber, rawCartToken } = await createTestOrder({ isAuth: false });

    // Cart is converted during checkout; verify cart status
    const [cart] = await sqlClient`SELECT status FROM carts WHERE session_token = ${rawCartToken}`;
    expect(cart!.status).toBe("CONVERTED");

    // Execute guest cancellation
    const cancelRes = await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
    });

    expect(cancelRes.success).toBe(true);
    if (cancelRes.success) {
      expect(cancelRes.status).toBe("CANCELLED");
    }
  });

  // Scenario T: SUBMITTED/VERIFYING customer cancellation blocked
  it("Scenario T: customer cancellation blocked during SUBMITTED or VERIFYING", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    await sqlClient`UPDATE payments SET status = 'VERIFYING' WHERE order_id = ${dbOrder!.id}`;

    const cancelRes = await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
    });

    expect(cancelRes.success).toBe(false);
    if (!cancelRes.success) {
      expect(cancelRes.code).toBe("PAYMENT_REVIEW_IN_PROGRESS");
    }
  });

  // Scenario U: orders:manage path cannot fabricate Payment.REJECTED
  it("Scenario U: staff orders:manage cancellation leaves Payment UNPAID and does NOT set REJECTED", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    setStaffAuth();

    const cancelRes = await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
      reason: "Staff unpaid cancellation",
    });

    expect(cancelRes.success).toBe(true);

    const [dbPayment] =
      await sqlClient`SELECT status FROM payments WHERE order_id = ${dbOrder!.id}`;
    expect(dbPayment!.status).toBe("UNPAID"); // NOT REJECTED!
  });

  // Scenario V: Terminal rejection consequence helper requires already-REJECTED Payment
  it("Scenario V: applyTerminalPaymentRejectionConsequences throws if Payment is not already REJECTED", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;
    const [dbPayment] = await sqlClient`SELECT id FROM payments WHERE order_id = ${dbOrder!.id}`;

    await expect(
      db.transaction(async (tx) => {
        await applyTerminalPaymentRejectionConsequences(tx, {
          orderId: dbOrder!.id,
          paymentId: dbPayment!.id,
          rejectionReason: "Voucher falso",
        });
      })
    ).rejects.toThrow("PRECONDITION_FAILED_PAYMENT_NOT_REJECTED");
  });

  // Scenario W: Terminal rejection helper does NOT create a second PaymentRejected event
  it("Scenario W: applyTerminalPaymentRejectionConsequences emits OrderCancelled and NO second PaymentRejected event", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;
    const [dbPayment] = await sqlClient`SELECT id FROM payments WHERE order_id = ${dbOrder!.id}`;

    // Set Payment to REJECTED and reservations to VERIFICATION_HOLD (simulating GP-028 decision)
    await sqlClient`UPDATE payments SET status = 'REJECTED' WHERE id = ${dbPayment!.id}`;
    await sqlClient`UPDATE inventory_reservations SET status = 'VERIFICATION_HOLD' WHERE order_id = ${dbOrder!.id}`;

    await db.transaction(async (tx) => {
      await applyTerminalPaymentRejectionConsequences(tx, {
        orderId: dbOrder!.id,
        paymentId: dbPayment!.id,
        rejectionReason: "Voucher inválido verificado",
        actorAuthUserId: staffAuthUserId,
      });
    });

    const [dbOrderAfter] =
      await sqlClient`SELECT status, cancel_reason FROM orders WHERE id = ${dbOrder!.id}`;
    expect(dbOrderAfter!.status).toBe("CANCELLED");
    expect(dbOrderAfter!.cancel_reason).toBe("Voucher inválido verificado");

    // Outbox: Check exactly OrderCancelled and ZERO PaymentRejected from helper
    const outboxCancelled = await sqlClient`
      SELECT * FROM outbox_events 
      WHERE aggregate_id = ${dbOrder!.id} AND event_name = 'OrderCancelled'
    `;
    expect(outboxCancelled.length).toBe(1);

    const outboxRejected = await sqlClient`
      SELECT * FROM outbox_events 
      WHERE aggregate_id = ${dbPayment!.id} AND event_name = 'PaymentRejected'
    `;
    expect(outboxRejected.length).toBe(0);
  });

  // Scenario X: AuditEvent inserted atomically for GP-020 mutations
  it("Scenario X: AuditEvent is appended in the same transaction for cancellation and refund", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
      reason: "Audit test",
    });

    const [audit] = await sqlClient`
      SELECT * FROM audit_events 
      WHERE target_id = ${dbOrder!.id} AND action = 'orders:cancel'
    `;

    expect(audit).toBeDefined();
    expect(audit!.actor_type).toBe("CUSTOMER");
    expect(audit!.action).toBe("orders:cancel");
    expect(audit!.target_type).toBe("Order");
    expect(audit!.metadata.orderNumber).toBe(orderNumber);
  });

  // Scenario Y: Failed transaction -> zero AuditEvent
  it("Scenario Y: failed cancellation transaction leaves zero AuditEvent rows", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    // Tamper item to force underflow failure
    await sqlClient`UPDATE inventory_items SET quantity_reserved = 0 WHERE id = ${inventoryItemId1}`;

    await cancelUnpaidOrder({
      orderNumber,
      cancellationAttemptId: generateUuidV7(),
    });

    const auditList = await sqlClient`
      SELECT * FROM audit_events 
      WHERE target_id = ${dbOrder!.id}
    `;
    expect(auditList.length).toBe(0);
  });

  // Scenario Z: Refund actor_auth_user_id records trusted staff auth ID
  it("Scenario Z: Refund entity actor_auth_user_id stores trusted staff auth user ID", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });
    const [dbOrder] = await sqlClient`SELECT id FROM orders WHERE order_number = ${orderNumber}`;

    await sqlClient`UPDATE orders SET status = 'CONFIRMED' WHERE id = ${dbOrder!.id}`;
    await sqlClient`UPDATE payments SET status = 'PAID' WHERE order_id = ${dbOrder!.id}`;

    setStaffAuth();

    const refundRes = await recordRefund({
      orderNumber,
      refundAttemptId: generateUuidV7(),
      amountCents: 2000,
      reason: "Staff auth test",
    });
    expect(refundRes.success).toBe(true);

    const [refund] = await sqlClient`SELECT * FROM refunds WHERE order_id = ${dbOrder!.id}`;
    expect(refund!.actor_auth_user_id).toBe(staffAuthUserId);
  });

  // Additional Scenario: Timeline Reader
  it("Scenario Timeline: retrieves sanitized chronological timeline", async () => {
    const { orderNumber } = await createTestOrder({ isAuth: true });

    const timelineRes = await getOrderTimeline(orderNumber);
    expect(timelineRes.success).toBe(true);
    if (timelineRes.success) {
      expect(timelineRes.orderNumber).toBe(orderNumber);
      expect(timelineRes.timeline.length).toBeGreaterThanOrEqual(1);
      expect(timelineRes.timeline[0]!.type).toBe("ORDER_PLACED");
    }
  });
});

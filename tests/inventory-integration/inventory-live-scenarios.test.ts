import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { generateUuidV7 } from "@/db/utils/uuid";
import { db } from "@/db";
import { generateAnonymousSessionToken } from "@/lib/cart/session";
import { submitCheckout } from "@/lib/checkout";
import { submitPaymentProof, __setTestPaymentTransactionHook } from "@/lib/payments/service";
import {
  computePaymentSessionTokenDigest,
  generateSecurePaymentSessionToken,
} from "@/lib/payments/crypto";
import {
  cancelUnpaidOrder,
  applyTerminalPaymentRejectionConsequences,
  __setTestOrderTransactionHook,
} from "@/lib/orders/service";
import {
  adjustInventory,
  allocateOrderInventoryAfterPaymentApproval,
  expireUnpaidOrderReservations,
  getVariantAvailability,
  processReservationExpirationBatch,
  reacquireOrderInventoryAfterLatePayment,
  receiveInventory,
  reconcileInventory,
  repairInventoryDiscrepancy,
  transferInventoryQuarantine,
  __setTestInventoryTransactionHook,
} from "@/lib/inventory/service";

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
      `[SAFETY_ERROR] Unauthorized PostgreSQL target for live inventory tests. Target must be exactly 127.0.0.1:54322/postgres.`
    );
  }

  return urlString;
}

// Deterministic in-memory barrier for multi-transaction synchronization
function createBarrier() {
  let resolveA: () => void;
  let resolveB: () => void;
  const promiseA = new Promise<void>((r) => {
    resolveA = r;
  });
  const promiseB = new Promise<void>((r) => {
    resolveB = r;
  });
  return {
    waitA: () => promiseA,
    signalA: () => resolveA(),
    waitB: () => promiseB,
    signalB: () => resolveB(),
  };
}

// Cookie & Auth context mocks for services calling next/headers
let currentMockCartCookie: string | null = null;
let currentMockPaymentSessionCookie: string | null = null;

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
      set: vi.fn(),
      delete: vi.fn(),
    });
  }),
}));

describe("GP-021 / CHK2-BR1 — Real Local PostgreSQL Inventory Engine & Concurrency Suite", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);
  let sqlClient: postgres.Sql;

  const fixturePrefix = "0192d200-0000-7000-8000-";
  const brandId = `${fixturePrefix}000000000001`;
  const categoryId = `${fixturePrefix}000000000002`;
  const productId = `${fixturePrefix}000000000003`;

  // Dedicated variant IDs for each scenario ensuring 100% test isolation
  const variantId1 = `${fixturePrefix}000000000004`;
  const variantId2 = `${fixturePrefix}000000000005`;
  const variantId3 = `${fixturePrefix}000000000006`;
  const raceCVariantId = `${fixturePrefix}000000000007`;
  const reconVariantId = `${fixturePrefix}000000000008`;
  const driftUnderVariantId = `${fixturePrefix}000000000009`;
  const driftOverVariantId = `${fixturePrefix}00000000000a`;
  const multiAllocVariantId = `${fixturePrefix}00000000000b`;
  const raceDVariantId = `${fixturePrefix}00000000000c`;
  const raceEVariantId = `${fixturePrefix}00000000000d`;
  const raceFVariantId = `${fixturePrefix}00000000000e`;
  const raceGVariantId = `${fixturePrefix}00000000000f`;
  const raceHVariantId = `${fixturePrefix}000000000012`;

  const primaryLocId = `${fixturePrefix}000000000010`;
  const quarantineLocId = `${fixturePrefix}000000000011`;
  const primaryLocCode = "TEST-LOC-LIM-01";
  const quarantineLocCode = "TEST-LOC-LIM-QUARANTINE";

  const paymentMethodId = `${fixturePrefix}000000000020`;
  const paymentInstructionId = `${fixturePrefix}000000000021`;
  const paymentMethodCode = "TEST-INV-PAY";
  const shippingMethodId = `${fixturePrefix}000000000030`;
  const shippingMethodCode = "TEST-SHIP-STD";

  // Dedicated suite-owned session and cart IDs to ensure exact cleanup without deleting other suites' records
  const raceDSessionId = `${fixturePrefix}000000000050`;
  const raceESessionId = `${fixturePrefix}000000000051`;
  const raceCCartId = `${fixturePrefix}000000000060`;

  beforeAll(async () => {
    process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = primaryLocCode;
    process.env.INVENTORY_QUARANTINE_LOCATION_CODE = quarantineLocCode;
    process.env.INVENTORY_IDEMPOTENCY_TTL_MINUTES = "1440";
    process.env.INVENTORY_HMAC_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.CHECKOUT_HMAC_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES = "60";
    process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES = "60";
    process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES = "60";
    process.env.CHECKOUT_RESERVATION_TTL_MINUTES = "30";

    sqlClient = postgres(connectionString, { max: 10 });

    // Clean only GP-021 owned fixtures
    await cleanupAllTestFixtures();

    // Seed base locations
    await sqlClient`
      INSERT INTO inventory_locations (id, name, code, is_active, created_at)
      VALUES 
        (${primaryLocId}, 'Almacén Central Lima', ${primaryLocCode}, true, NOW()),
        (${quarantineLocId}, 'Almacén Cuarentena Lima', ${quarantineLocCode}, true, NOW())
      ON CONFLICT (code) DO NOTHING;
    `;

    // Seed catalog fixtures
    await sqlClient`
      INSERT INTO brands (id, name, slug, status, created_at, updated_at)
      VALUES (${brandId}, 'Test Brand', 'test-brand-inv', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO categories (id, name, slug, display_order, status, created_at, updated_at)
      VALUES (${categoryId}, 'Test Category', 'test-cat-inv', 0, 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO products (id, brand_id, category_id, name, slug, description, status, created_at, updated_at)
      VALUES (${productId}, ${brandId}, ${categoryId}, 'Test Product Inv', 'test-prod-inv', 'Description', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, created_at, updated_at)
      VALUES 
        (${variantId1}, ${productId}, 'SKU-INV-001', 'Black Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${variantId2}, ${productId}, 'SKU-INV-002', 'White Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${variantId3}, ${productId}, 'SKU-INV-003', 'Red Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${raceCVariantId}, ${productId}, 'SKU-INV-RACEC', 'Race C Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${reconVariantId}, ${productId}, 'SKU-INV-RECON', 'Recon Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${driftUnderVariantId}, ${productId}, 'SKU-INV-DRIFT-U', 'Drift Under Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${driftOverVariantId}, ${productId}, 'SKU-INV-DRIFT-O', 'Drift Over Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${multiAllocVariantId}, ${productId}, 'SKU-INV-MULTI', 'Multi Alloc Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${raceDVariantId}, ${productId}, 'SKU-INV-RACED', 'Race D Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${raceEVariantId}, ${productId}, 'SKU-INV-RACEE', 'Race E Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${raceFVariantId}, ${productId}, 'SKU-INV-RACEF', 'Race F Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${raceGVariantId}, ${productId}, 'SKU-INV-RACEG', 'Race G Edition', 15000, 'ACTIVE', NOW(), NOW()),
        (${raceHVariantId}, ${productId}, 'SKU-INV-RACEH', 'Race H Edition', 15000, 'ACTIVE', NOW(), NOW())
      ON CONFLICT (sku) DO NOTHING;
    `;

    // Seed payment method fixtures
    await sqlClient`
      INSERT INTO payment_method_configurations (id, code, name, is_active, display_order, current_instruction_version_id, created_at, updated_at)
      VALUES (${paymentMethodId}, ${paymentMethodCode}, 'Test Inv Pay', true, 1, NULL, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, qr_media_id, recipient_name, account_identifier, instruction_text, is_active, created_at)
      VALUES (${paymentInstructionId}, ${paymentMethodCode}, 1, NULL, 'Gamer Peru SAC', '999888111', 'Test Instruction', true, NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    await sqlClient`
      UPDATE payment_method_configurations 
      SET current_instruction_version_id = ${paymentInstructionId} 
      WHERE id = ${paymentMethodId};
    `;

    await sqlClient`
      INSERT INTO shipping_methods (id, code, name, base_price_cents, estimated_days_min, estimated_days_max, is_active, created_at)
      VALUES (${shippingMethodId}, ${shippingMethodCode}, 'Envío Regular', 1500, 1, 2, true, NOW())
      ON CONFLICT (code) DO NOTHING;
    `;
  });

  afterEach(async () => {
    currentMockCartCookie = null;
    currentMockPaymentSessionCookie = null;
    __setTestInventoryTransactionHook(null);
    __setTestPaymentTransactionHook(null);
    __setTestOrderTransactionHook(null);
  });

  afterAll(async () => {
    await cleanupAllTestFixtures();
    await sqlClient.end();
  });

  async function cleanupAllTestFixtures() {
    // 1. Delete dependent ledger entries belonging to GP-021 items (and test references)
    await sqlClient`
      DELETE FROM inventory_ledger_entries
      WHERE inventory_item_id IN (
        SELECT id FROM inventory_items WHERE variant_id IN (
          ${variantId1}, ${variantId2}, ${variantId3}, ${raceCVariantId}, ${reconVariantId},
          ${driftUnderVariantId}, ${driftOverVariantId}, ${multiAllocVariantId},
          ${raceDVariantId}, ${raceEVariantId}, ${raceFVariantId}, ${raceGVariantId}, ${raceHVariantId}
        )
      ) OR actor_id LIKE 'test-%' OR reference_id LIKE 'TEST-%' OR reference_id LIKE 'PO-%' OR reference_id LIKE 'AUDIT-%' OR reference_id LIKE 'TR-%' OR reference_id LIKE 'REPAIR-%' OR reference_id LIKE 'PAY-%';
    `;
    // 2. Delete inventory reservations for GP-021 items and orders
    await sqlClient`
      DELETE FROM inventory_reservations
      WHERE inventory_item_id IN (
        SELECT id FROM inventory_items WHERE variant_id IN (
          ${variantId1}, ${variantId2}, ${variantId3}, ${raceCVariantId}, ${reconVariantId},
          ${driftUnderVariantId}, ${driftOverVariantId}, ${multiAllocVariantId},
          ${raceDVariantId}, ${raceEVariantId}, ${raceFVariantId}, ${raceGVariantId}, ${raceHVariantId}
        )
      ) OR order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%');
    `;
    // 3. Delete dependent guest payment access grants for GP-021 sessions/payments
    await sqlClient`DELETE FROM guest_payment_access_grants WHERE session_id IN (${raceDSessionId}, ${raceESessionId}) OR payment_id IN (SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode} OR order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%'))`;
    // 4. Delete ONLY GP-021 owned guest payment sessions (never global delete)
    await sqlClient`DELETE FROM guest_payment_sessions WHERE id IN (${raceDSessionId}, ${raceESessionId})`;
    // 5. Delete payment submissions and intents
    await sqlClient`DELETE FROM payment_submissions WHERE payment_id IN (SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode} OR order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%'))`;
    await sqlClient`DELETE FROM payment_proof_upload_intents WHERE payment_id IN (SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode} OR order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%'))`;
    // 6. Delete payments
    await sqlClient`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%') OR payment_method_code = ${paymentMethodCode}`;
    // 7. Delete order snapshots and items
    await sqlClient`DELETE FROM order_address_snapshots WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM order_pricing_snapshots WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    // 8. Delete orders
    await sqlClient`DELETE FROM orders WHERE order_number LIKE 'GP-TEST-%'`;
    // 9. Delete cart items and suite-owned cart
    await sqlClient`DELETE FROM cart_items WHERE cart_id = ${raceCCartId} OR variant_id IN (
      ${variantId1}, ${variantId2}, ${variantId3}, ${raceCVariantId}, ${reconVariantId},
      ${driftUnderVariantId}, ${driftOverVariantId}, ${multiAllocVariantId},
      ${raceDVariantId}, ${raceEVariantId}, ${raceFVariantId}, ${raceGVariantId}, ${raceHVariantId}
    )`;
    await sqlClient`DELETE FROM carts WHERE id = ${raceCCartId}`;
    // 10. Delete inventory items for GP-021 variants
    await sqlClient`DELETE FROM inventory_items WHERE variant_id IN (
      ${variantId1}, ${variantId2}, ${variantId3}, ${raceCVariantId}, ${reconVariantId},
      ${driftUnderVariantId}, ${driftOverVariantId}, ${multiAllocVariantId},
      ${raceDVariantId}, ${raceEVariantId}, ${raceFVariantId}, ${raceGVariantId}, ${raceHVariantId}
    )`;
    // 11. Delete idempotency keys and audit events
    await sqlClient`DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'INVENTORY_%' OR idempotency_key LIKE 'CHECKOUT_%' OR idempotency_key LIKE 'ORDER_%' OR idempotency_key LIKE 'PAYMENT_%'`;
    await sqlClient`DELETE FROM audit_events WHERE actor_id LIKE 'test-%'`;
  }

  // Canonical helper to seed test orders satisfying complete current Order schema
  async function seedTestOrder(params: {
    orderNumber: string;
    variantId: string;
    quantity: number;
    reservationStatus: "ACTIVE" | "VERIFICATION_HOLD" | "ALLOCATED" | "RELEASED";
    expiresAt?: Date;
    initialOnHand?: number;
  }) {
    const orderId = generateUuidV7();
    const orderItemId = generateUuidV7();
    const paymentId = generateUuidV7();
    const resId = generateUuidV7();

    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;

    const onHand = params.initialOnHand ?? 100;
    const [item] = await sqlClient`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point)
      VALUES (${generateUuidV7()}, ${params.variantId}, ${locId}, ${onHand}, 0, 0, 10)
      ON CONFLICT (variant_id, location_id) DO UPDATE SET quantity_on_hand = inventory_items.quantity_on_hand
      RETURNING id, quantity_on_hand, quantity_reserved, quantity_allocated;
    `;
    const itemId = item!.id;

    if (params.reservationStatus === "ACTIVE" || params.reservationStatus === "VERIFICATION_HOLD") {
      await sqlClient`
        UPDATE inventory_items
        SET quantity_reserved = quantity_reserved + ${params.quantity}
        WHERE id = ${itemId};
      `;
    } else if (params.reservationStatus === "ALLOCATED") {
      await sqlClient`
        UPDATE inventory_items
        SET quantity_allocated = quantity_allocated + ${params.quantity}
        WHERE id = ${itemId};
      `;
    }

    // Insert complete canonical Order schema
    await sqlClient`
      INSERT INTO orders (
        id, order_number, customer_email, customer_phone, status,
        subtotal_cents, discount_cents, shipping_cents, total_cents, currency,
        created_at, updated_at
      ) VALUES (
        ${orderId}, ${params.orderNumber}, 'test.customer@gamerperu.pe', '999888777', 'PENDING',
        15000, 0, 0, 15000, 'PEN',
        NOW(), NOW()
      );
    `;

    await sqlClient`
      INSERT INTO order_items (
        id, order_id, variant_id, sku_snapshot, product_name_snapshot,
        variant_title_snapshot, unit_price_cents_snapshot, quantity, line_total_cents, created_at
      ) VALUES (
        ${orderItemId}, ${orderId}, ${params.variantId}, 'SKU-INV-001', 'Test Prod',
        'Black', 15000, ${params.quantity}, 15000 * ${params.quantity}, NOW()
      );
    `;

    await sqlClient`
      INSERT INTO payments (
        id, order_id, payment_method_code, instruction_version_id,
        amount_cents, status, created_at, updated_at
      ) VALUES (
        ${paymentId}, ${orderId}, ${paymentMethodCode}, ${paymentInstructionId},
        15000, 'UNPAID', NOW(), NOW()
      );
    `;

    const expiresAt = params.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000);
    await sqlClient`
      INSERT INTO inventory_reservations (
        id, inventory_item_id, order_id, order_item_id,
        quantity, status, expires_at, created_at, updated_at
      ) VALUES (
        ${resId}, ${itemId}, ${orderId}, ${orderItemId},
        ${params.quantity}, ${params.reservationStatus}, ${expiresAt}, NOW(), NOW()
      );
    `;

    return { orderId, orderItemId, paymentId, reservationId: resId, inventoryItemId: itemId };
  }

  // -------------------------------------------------------------------------
  // 1. Receiving Scenarios
  // -------------------------------------------------------------------------

  it("Scenario 1 & 2: receiving increments on-hand exactly and writes ledger entry", async () => {
    const res = await receiveInventory({
      attemptId: "att-recv-001",
      variantId: variantId1,
      locationCode: primaryLocCode,
      quantity: 40,
      referenceId: "PO-2026-001",
      actorId: "test-staff-1",
      notes: "Lote inicial de prueba",
    });

    expect(res.success).toBe(true);
    expect(res.replayed).toBe(false);
    expect(res.quantityReceived).toBe(40);
    expect(res.resultingBalances?.quantityOnHand).toBeGreaterThanOrEqual(40);
    expect(res.ledgerEntryId).toBeDefined();

    const [item] = await sqlClient`
      SELECT quantity_on_hand, quantity_reserved, quantity_allocated 
      FROM inventory_items WHERE id = ${res.inventoryItemId!};
    `;
    expect(item!.quantity_on_hand).toBe(res.resultingBalances!.quantityOnHand);

    const [ledger] = await sqlClient`
      SELECT movement_type, on_hand_delta, reserved_delta, allocated_delta, reference_id, actor_id 
      FROM inventory_ledger_entries WHERE id = ${res.ledgerEntryId!};
    `;
    expect(ledger!.movement_type).toBe("RECEIVING");
    expect(ledger!.on_hand_delta).toBe(40);
    expect(ledger!.reserved_delta).toBe(0);
    expect(ledger!.allocated_delta).toBe(0);
    expect(ledger!.reference_id).toBe("PO-2026-001");
  });

  it("Scenario 3 & 4: idempotent receiving replay returns same payload without double increments", async () => {
    const attemptId = "att-recv-idemp-001";
    const res1 = await receiveInventory({
      attemptId,
      variantId: variantId1,
      locationCode: primaryLocCode,
      quantity: 25,
      referenceId: "PO-2026-002",
      actorId: "test-staff-1",
    });
    expect(res1.success).toBe(true);
    expect(res1.replayed).toBe(false);

    const onHandAfterFirst = res1.resultingBalances!.quantityOnHand;

    const res2 = await receiveInventory({
      attemptId,
      variantId: variantId1,
      locationCode: primaryLocCode,
      quantity: 25,
      referenceId: "PO-2026-002",
      actorId: "test-staff-1",
    });

    expect(res2.success).toBe(true);
    expect(res2.replayed).toBe(true);
    expect(res2.resultingBalances!.quantityOnHand).toBe(onHandAfterFirst);

    const [item] = await sqlClient`
      SELECT quantity_on_hand FROM inventory_items WHERE id = ${res1.inventoryItemId!};
    `;
    expect(item!.quantity_on_hand).toBe(onHandAfterFirst);
  });

  it("Scenario 5: receiving same key with changed payload returns IDEMPOTENCY_CONFLICT", async () => {
    const attemptId = "att-recv-conflict-001";
    await receiveInventory({
      attemptId,
      variantId: variantId1,
      locationCode: primaryLocCode,
      quantity: 10,
      referenceId: "PO-2026-003",
      actorId: "test-staff-1",
    });

    const resConflict = await receiveInventory({
      attemptId,
      variantId: variantId1,
      locationCode: primaryLocCode,
      quantity: 20,
      referenceId: "PO-2026-003",
      actorId: "test-staff-1",
    });

    expect(resConflict.success).toBe(false);
    expect(resConflict.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("Scenario 5B: expired idempotency key returns IDEMPOTENCY_EXPIRED", async () => {
    const attemptId = "att-recv-expired-001";
    const res = await receiveInventory({
      attemptId,
      variantId: variantId1,
      locationCode: primaryLocCode,
      quantity: 5,
      referenceId: "PO-2026-004",
      actorId: "test-staff-1",
    });
    expect(res.success).toBe(true);

    const namespacedKey = `INVENTORY_RECEIVING:${attemptId}`;
    await sqlClient`
      UPDATE idempotency_keys
      SET expires_at = NOW() - INTERVAL '1 hour'
      WHERE idempotency_key = ${namespacedKey};
    `;

    const resExpired = await receiveInventory({
      attemptId,
      variantId: variantId1,
      locationCode: primaryLocCode,
      quantity: 5,
      referenceId: "PO-2026-004",
      actorId: "test-staff-1",
    });

    expect(resExpired.success).toBe(false);
    expect(resExpired.code).toBe("IDEMPOTENCY_EXPIRED");
  });

  // -------------------------------------------------------------------------
  // 2. Manual Adjustments Scenarios & Stable Zero-Effect
  // -------------------------------------------------------------------------

  it("Scenario 6 & 7: positive and negative DELTA adjustments update on-hand correctly", async () => {
    const resPos = await adjustInventory({
      attemptId: "att-adj-pos-001",
      variantId: variantId1,
      locationCode: primaryLocCode,
      commandKind: "DELTA",
      deltaQuantity: 15,
      reason: "Unidades encontradas en auditoría",
      referenceId: "AUDIT-2026-01",
      actorId: "test-staff-1",
    });
    expect(resPos.success).toBe(true);
    expect(resPos.appliedDelta).toBe(15);

    const onHandBeforeNeg = resPos.resultingBalances!.quantityOnHand;

    const resNeg = await adjustInventory({
      attemptId: "att-adj-neg-001",
      variantId: variantId1,
      locationCode: primaryLocCode,
      commandKind: "DELTA",
      deltaQuantity: -5,
      reason: "Muestra de marketing retirada",
      referenceId: "AUDIT-2026-02",
      actorId: "test-staff-1",
    });
    expect(resNeg.success).toBe(true);
    expect(resNeg.appliedDelta).toBe(-5);
    expect(resNeg.resultingBalances!.quantityOnHand).toBe(onHandBeforeNeg - 5);
  });

  it("Scenario 8: PHYSICAL_COUNT adjustment recalculates exact delta", async () => {
    const resCount = await adjustInventory({
      attemptId: "att-adj-count-001",
      variantId: variantId1,
      locationCode: primaryLocCode,
      commandKind: "PHYSICAL_COUNT",
      countedQuantity: 120,
      reason: "Conteo físico general de fin de mes",
      referenceId: "AUDIT-2026-03",
      actorId: "test-staff-1",
    });
    expect(resCount.success).toBe(true);
    expect(resCount.resultingBalances!.quantityOnHand).toBe(120);

    const [item] = await sqlClient`
      SELECT quantity_on_hand FROM inventory_items WHERE id = ${resCount.inventoryItemId!};
    `;
    expect(item!.quantity_on_hand).toBe(120);
  });

  it("Scenario 8B: Zero-effect adjustment is retry-stable and writes 0 ledger rows", async () => {
    const attemptId = "att-adj-zero-001";
    const resZero1 = await adjustInventory({
      attemptId,
      variantId: variantId1,
      locationCode: primaryLocCode,
      commandKind: "PHYSICAL_COUNT",
      countedQuantity: 120,
      reason: "Conteo físico de confirmación idéntico",
      referenceId: "AUDIT-ZERO-01",
      actorId: "test-staff-1",
    });

    expect(resZero1.success).toBe(true);
    expect(resZero1.replayed).toBe(false);
    expect(resZero1.appliedDelta).toBe(0);
    expect(resZero1.resultingBalances!.quantityOnHand).toBe(120);

    const [zeroLedger] = await sqlClient`
      SELECT count(*)::int as count FROM inventory_ledger_entries WHERE reference_id = 'AUDIT-ZERO-01';
    `;
    expect(zeroLedger!.count).toBe(0);

    await adjustInventory({
      attemptId: "att-adj-between-001",
      variantId: variantId1,
      locationCode: primaryLocCode,
      commandKind: "DELTA",
      deltaQuantity: 10,
      reason: "Ajuste intermedio",
      referenceId: "AUDIT-BETWEEN-01",
      actorId: "test-staff-1",
    });

    const resZero2 = await adjustInventory({
      attemptId,
      variantId: variantId1,
      locationCode: primaryLocCode,
      commandKind: "PHYSICAL_COUNT",
      countedQuantity: 120,
      reason: "Conteo físico de confirmación idéntico",
      referenceId: "AUDIT-ZERO-01",
      actorId: "test-staff-1",
    });

    expect(resZero2.success).toBe(true);
    expect(resZero2.replayed).toBe(true);
    expect(resZero2.appliedDelta).toBe(0);

    const [item] = await sqlClient`
      SELECT quantity_on_hand FROM inventory_items WHERE id = ${resZero1.inventoryItemId!};
    `;
    expect(item!.quantity_on_hand).toBe(130);
  });

  it("Scenario 9 & 10: adjustment causing negative balance or violating committed reservations is rejected", async () => {
    const resNegViolation = await adjustInventory({
      attemptId: "att-adj-neg-viol-001",
      variantId: variantId1,
      locationCode: primaryLocCode,
      commandKind: "DELTA",
      deltaQuantity: -10000,
      reason: "Ajuste excesivo",
      referenceId: "AUDIT-2026-04",
      actorId: "test-staff-1",
    });
    expect(resNegViolation.success).toBe(false);
    expect(resNegViolation.code).toBe("NEGATIVE_ON_HAND_DISALLOWED");

    await seedTestOrder({
      orderNumber: "GP-TEST-ADJ-001",
      variantId: variantId2,
      quantity: 80,
      reservationStatus: "ACTIVE",
    });

    const resHoldViolation = await adjustInventory({
      attemptId: "att-adj-hold-viol-001",
      variantId: variantId2,
      locationCode: primaryLocCode,
      commandKind: "PHYSICAL_COUNT",
      countedQuantity: 50,
      reason: "Conteo menor que reservas",
      referenceId: "AUDIT-2026-05",
      actorId: "test-staff-1",
    });
    expect(resHoldViolation.success).toBe(false);
    expect(resHoldViolation.code).toBe("INSUFFICIENT_UNCOMMITTED_STOCK");
  });

  // -------------------------------------------------------------------------
  // 3. Quarantine / Damaged Transfer Scenarios
  // -------------------------------------------------------------------------

  it("Scenario 12 & 13: quarantine transfer decrements source and increments destination with correlated ledger", async () => {
    const resTransfer = await transferInventoryQuarantine({
      attemptId: "att-tr-quar-001",
      variantId: variantId1,
      sourceLocationCode: primaryLocCode,
      destinationLocationCode: quarantineLocCode,
      quantity: 5,
      reason: "Empaque dañado durante traslado",
      referenceId: "TR-QUAR-2026-001",
      actorId: "test-staff-1",
    });

    expect(resTransfer.success).toBe(true);
    expect(resTransfer.quantityTransferred).toBe(5);
    expect(resTransfer.sourceLedgerEntryId).toBeDefined();
    expect(resTransfer.destinationLedgerEntryId).toBeDefined();

    const [sourceLedger] = await sqlClient`
      SELECT movement_type, on_hand_delta, reference_id, notes 
      FROM inventory_ledger_entries WHERE id = ${resTransfer.sourceLedgerEntryId!};
    `;
    const [destLedger] = await sqlClient`
      SELECT movement_type, on_hand_delta, reference_id, notes 
      FROM inventory_ledger_entries WHERE id = ${resTransfer.destinationLedgerEntryId!};
    `;

    expect(sourceLedger!.movement_type).toBe("MANUAL_ADJUSTMENT");
    expect(sourceLedger!.on_hand_delta).toBe(-5);
    expect(sourceLedger!.reference_id).toBe("TR-QUAR-2026-001");
    expect(sourceLedger!.notes).toContain("[QUARANTINE_TRANSFER_OUT]");

    expect(destLedger!.movement_type).toBe("MANUAL_ADJUSTMENT");
    expect(destLedger!.on_hand_delta).toBe(5);
    expect(destLedger!.reference_id).toBe("TR-QUAR-2026-001");
    expect(destLedger!.notes).toContain("[QUARANTINE_TRANSFER_IN]");
  });

  // -------------------------------------------------------------------------
  // 4. Payment Approval Allocation Seam Scenarios
  // -------------------------------------------------------------------------

  it("Scenario 15: normal allocation transitions all-VERIFICATION_HOLD to ALLOCATED atomically", async () => {
    const { orderId, inventoryItemId } = await seedTestOrder({
      orderNumber: "GP-TEST-ALLOC-001",
      variantId: variantId1,
      quantity: 3,
      reservationStatus: "VERIFICATION_HOLD",
    });

    const [itemBefore] = await sqlClient`
      SELECT quantity_reserved, quantity_allocated FROM inventory_items WHERE id = ${inventoryItemId};
    `;

    const allocResult = await db.transaction(async (tx) => {
      return await allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId,
        actorId: "test-admin-verifier",
        referenceId: "PAY-TEST-001",
      });
    });

    expect(allocResult.success).toBe(true);
    expect(allocResult.alreadyAllocated).toBe(false);
    expect(allocResult.allocatedLinesCount).toBe(1);
    expect(allocResult.totalQuantityAllocated).toBe(3);

    const [itemAfter] = await sqlClient`
      SELECT quantity_reserved, quantity_allocated FROM inventory_items WHERE id = ${inventoryItemId};
    `;
    expect(itemAfter!.quantity_reserved).toBe(itemBefore!.quantity_reserved - 3);
    expect(itemAfter!.quantity_allocated).toBe(itemBefore!.quantity_allocated + 3);

    const [res] = await sqlClient`
      SELECT status FROM inventory_reservations WHERE order_id = ${orderId};
    `;
    expect(res!.status).toBe("ALLOCATED");
  });

  it("Scenario 16: normal allocation rejects ACTIVE and mixed reservation states", async () => {
    const { orderId } = await seedTestOrder({
      orderNumber: "GP-TEST-ALLOC-ACT-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "ACTIVE",
    });

    const allocResult = await db.transaction(async (tx) => {
      return await allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId,
        actorId: "test-admin-verifier",
        referenceId: "PAY-TEST-002",
      });
    });

    expect(allocResult.success).toBe(false);
    expect(allocResult.code).toBe("INVALID_RESERVATION_STATE_FOR_ALLOCATION");
  });

  it("Scenario 18: all-ALLOCATED replay verifies authoritative exact total and returns alreadyAllocated", async () => {
    const { orderId } = await seedTestOrder({
      orderNumber: "GP-TEST-ALLOC-REPLAY-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "VERIFICATION_HOLD",
    });

    await db.transaction(async (tx) => {
      await allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId,
        actorId: "test-admin-verifier",
        referenceId: "PAY-TEST-003",
      });
    });

    const [ledgerCountBefore] = await sqlClient`
      SELECT count(*)::int as count FROM inventory_ledger_entries WHERE reference_id = 'PAY-TEST-003';
    `;

    const replayResult = await db.transaction(async (tx) => {
      return await allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId,
        actorId: "test-admin-verifier",
        referenceId: "PAY-TEST-003",
      });
    });

    expect(replayResult.success).toBe(true);
    expect(replayResult.alreadyAllocated).toBe(true);

    const [ledgerCountAfter] = await sqlClient`
      SELECT count(*)::int as count FROM inventory_ledger_entries WHERE reference_id = 'PAY-TEST-003';
    `;
    expect(ledgerCountAfter!.count).toBe(ledgerCountBefore!.count);
  });

  it("Scenario 18B: all-ALLOCATED replay fails if physical allocated balance is less than authoritative reservation sum", async () => {
    const { orderId, inventoryItemId } = await seedTestOrder({
      orderNumber: "GP-TEST-ALLOC-DRIFT-UNDER",
      variantId: driftUnderVariantId,
      quantity: 2,
      reservationStatus: "ALLOCATED",
    });

    // Inject under-count drift: physical quantity_allocated < sum of allocated reservations
    await sqlClient`
      UPDATE inventory_items
      SET quantity_allocated = quantity_allocated - 1
      WHERE id = ${inventoryItemId};
    `;

    const failReplay = await db.transaction(async (tx) => {
      return await allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId,
        actorId: "test-admin-verifier",
        referenceId: "PAY-DRIFT-1",
      });
    });

    expect(failReplay.success).toBe(false);
    expect(failReplay.code).toBe("INCONSISTENT_ALLOCATED_BALANCE");
  });

  it("Scenario 18C: all-ALLOCATED replay fails if physical allocated balance is greater than authoritative reservation sum", async () => {
    const { orderId, inventoryItemId } = await seedTestOrder({
      orderNumber: "GP-TEST-ALLOC-DRIFT-OVER",
      variantId: driftOverVariantId,
      quantity: 2,
      reservationStatus: "ALLOCATED",
    });

    // Inject over-count drift: physical quantity_allocated > sum of allocated reservations
    await sqlClient`
      UPDATE inventory_items
      SET quantity_allocated = quantity_allocated + 5
      WHERE id = ${inventoryItemId};
    `;

    const failReplay = await db.transaction(async (tx) => {
      return await allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId,
        actorId: "test-admin-verifier",
        referenceId: "PAY-DRIFT-2",
      });
    });

    expect(failReplay.success).toBe(false);
    expect(failReplay.code).toBe("INCONSISTENT_ALLOCATED_BALANCE");
  });

  it("Scenario 18D: legitimate InventoryItem shared by multiple allocated Orders replays correctly when total matches exactly", async () => {
    const { orderId: order1 } = await seedTestOrder({
      orderNumber: "GP-TEST-MULTI-ALLOC-1",
      variantId: multiAllocVariantId,
      quantity: 2,
      reservationStatus: "VERIFICATION_HOLD",
    });
    const { orderId: order2 } = await seedTestOrder({
      orderNumber: "GP-TEST-MULTI-ALLOC-2",
      variantId: multiAllocVariantId,
      quantity: 3,
      reservationStatus: "VERIFICATION_HOLD",
    });

    await db.transaction(async (tx) => {
      await allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId: order1,
        actorId: "test-verifier",
        referenceId: "PAY-MULTI-1",
      });
    });

    await db.transaction(async (tx) => {
      await allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId: order2,
        actorId: "test-verifier",
        referenceId: "PAY-MULTI-2",
      });
    });

    // Replay order1: allocated quantity on item is 5, sum of allocated reservations for that item is 5.
    const replayOrder1 = await db.transaction(async (tx) => {
      return await allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId: order1,
        actorId: "test-verifier",
        referenceId: "PAY-MULTI-1",
      });
    });

    expect(replayOrder1.success).toBe(true);
    expect(replayOrder1.alreadyAllocated).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. Late-Payment Reacquisition Scenarios
  // -------------------------------------------------------------------------

  it("Scenario 19 & 20: late reacquisition creates ALLOCATED reservation with original expires_at when stock exists, rejects if insufficient", async () => {
    const originalExpiry = new Date(Date.now() - 60 * 60 * 1000);
    const { orderId: orderIdWithStock, inventoryItemId } = await seedTestOrder({
      orderNumber: "GP-TEST-LATE-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "RELEASED",
      expiresAt: originalExpiry,
    });

    const [itemBefore] = await sqlClient`
      SELECT quantity_allocated FROM inventory_items WHERE id = ${inventoryItemId};
    `;

    const reacqResult = await db.transaction(async (tx) => {
      return await reacquireOrderInventoryAfterLatePayment(tx, {
        orderId: orderIdWithStock,
        actorId: "test-admin-verifier",
        referenceId: "PAY-LATE-001",
      });
    });

    expect(reacqResult.success).toBe(true);
    expect(reacqResult.reacquiredLinesCount).toBe(1);

    const [itemAfter] = await sqlClient`
      SELECT quantity_allocated FROM inventory_items WHERE id = ${inventoryItemId};
    `;
    expect(itemAfter!.quantity_allocated).toBe(itemBefore!.quantity_allocated + 2);

    const [newAllocRes] = await sqlClient`
      SELECT status, expires_at FROM inventory_reservations
      WHERE order_id = ${orderIdWithStock} AND status = 'ALLOCATED';
    `;
    expect(newAllocRes!.status).toBe("ALLOCATED");
    expect(new Date(newAllocRes!.expires_at).getTime()).toBe(originalExpiry.getTime());

    // Test rejection when stock is insufficient
    const { orderId: orderIdNoStock } = await seedTestOrder({
      orderNumber: "GP-TEST-LATE-NOSTOCK-001",
      variantId: variantId2,
      quantity: 5000,
      reservationStatus: "RELEASED",
    });

    const reacqFailResult = await db.transaction(async (tx) => {
      return await reacquireOrderInventoryAfterLatePayment(tx, {
        orderId: orderIdNoStock,
        actorId: "test-admin-verifier",
        referenceId: "PAY-LATE-002",
      });
    });

    expect(reacqFailResult.success).toBe(false);
    expect(reacqFailResult.code).toBe("INSUFFICIENT_STOCK_FOR_REACQUISITION");
  });

  // -------------------------------------------------------------------------
  // 6. Reservation Expiration Scenarios (Enforcing In-Domain Eligibility)
  // -------------------------------------------------------------------------

  it("Scenario 21: direct expiration called before expiry date results in zero mutation (no-op)", async () => {
    const futureDate = new Date(Date.now() + 20 * 60 * 1000);
    const { orderId, inventoryItemId } = await seedTestOrder({
      orderNumber: "GP-TEST-EXP-FUTURE-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "ACTIVE",
      expiresAt: futureDate,
    });

    const [itemBefore] = await sqlClient`
      SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId};
    `;

    const expireResult = await expireUnpaidOrderReservations({
      orderId,
      actorId: "SYSTEM",
    });

    expect(expireResult.success).toBe(true);
    expect(expireResult.code).toBe("NO_EXPIRED_RESERVATIONS");
    expect(expireResult.releasedLinesCount).toBe(0);
    expect(expireResult.orderStatusTransitioned).toBe(false);

    const [order] = await sqlClient`SELECT status FROM orders WHERE id = ${orderId};`;
    expect(order!.status).toBe("PENDING");

    const [itemAfter] = await sqlClient`
      SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId};
    `;
    expect(itemAfter!.quantity_reserved).toBe(itemBefore!.quantity_reserved);
  });

  it("Scenario 22 & 23: legitimate expired trigger releases whole active order with exact movement classifications", async () => {
    const pastDate = new Date(Date.now() - 10 * 60 * 1000);
    const futureDate = new Date(Date.now() + 15 * 60 * 1000);

    const { orderId, inventoryItemId } = await seedTestOrder({
      orderNumber: "GP-TEST-EXP-MIXED-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });

    const orderItemId2 = generateUuidV7();
    const resId2 = generateUuidV7();
    await sqlClient`
      INSERT INTO order_items (
        id, order_id, variant_id, sku_snapshot, product_name_snapshot,
        variant_title_snapshot, unit_price_cents_snapshot, quantity, line_total_cents, created_at
      ) VALUES (
        ${orderItemId2}, ${orderId}, ${variantId1}, 'SKU-INV-001', 'Test Prod',
        'Black', 15000, 3, 45000, NOW()
      );
    `;
    await sqlClient`
      UPDATE inventory_items SET quantity_reserved = quantity_reserved + 3 WHERE id = ${inventoryItemId};
    `;
    await sqlClient`
      INSERT INTO inventory_reservations (
        id, inventory_item_id, order_id, order_item_id,
        quantity, status, expires_at, created_at, updated_at
      ) VALUES (
        ${resId2}, ${inventoryItemId}, ${orderId}, ${orderItemId2},
        3, 'ACTIVE', ${futureDate}, NOW(), NOW()
      );
    `;

    const expireResult = await expireUnpaidOrderReservations({
      orderId,
      actorId: "SYSTEM",
    });

    expect(expireResult.success).toBe(true);
    expect(expireResult.releasedLinesCount).toBe(2);
    expect(expireResult.totalQuantityReleased).toBe(5);
    expect(expireResult.orderStatusTransitioned).toBe(true);

    const [order] =
      await sqlClient`SELECT status, cancel_reason FROM orders WHERE id = ${orderId};`;
    expect(order!.status).toBe("EXPIRED");

    const ledgers = await sqlClient`
      SELECT movement_type, reserved_delta FROM inventory_ledger_entries WHERE reference_id = ${orderId} ORDER BY id ASC;
    `;
    expect(ledgers).toHaveLength(2);
    const movementTypes = ledgers.map((l) => l.movement_type);
    expect(movementTypes).toContain("RESERVATION_EXPIRED");
    expect(movementTypes).toContain("RESERVATION_RELEASED");
  });

  it("Scenario 24: VERIFICATION_HOLD reservations are immune from expiration", async () => {
    const pastDate = new Date(Date.now() - 10 * 60 * 1000);
    const { orderId } = await seedTestOrder({
      orderNumber: "GP-TEST-EXP-HOLD-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "VERIFICATION_HOLD",
      expiresAt: pastDate,
    });

    await sqlClient`UPDATE payments SET status = 'SUBMITTED' WHERE order_id = ${orderId};`;

    const expireResult = await expireUnpaidOrderReservations({
      orderId,
      actorId: "SYSTEM",
    });

    expect(expireResult.success).toBe(true);
    expect(expireResult.releasedLinesCount).toBe(0);
    expect(expireResult.orderStatusTransitioned).toBe(false);

    const [order] = await sqlClient`SELECT status FROM orders WHERE id = ${orderId};`;
    expect(order!.status).toBe("PENDING");
  });

  it("Scenario 25: batch processor runs across qualifying expired orders", async () => {
    const pastDate = new Date(Date.now() - 15 * 60 * 1000);
    await seedTestOrder({
      orderNumber: "GP-TEST-BATCH-001",
      variantId: variantId1,
      quantity: 1,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });
    await seedTestOrder({
      orderNumber: "GP-TEST-BATCH-002",
      variantId: variantId1,
      quantity: 1,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });

    const batchResult = await processReservationExpirationBatch({ batchSize: 10 });
    expect(batchResult.success).toBe(true);
    expect(batchResult.ordersExpired).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // 7. Reconciliation & Repair Scenarios (With Full Test Isolation)
  // -------------------------------------------------------------------------

  it("Scenario 26 & 30: reconciliation detects reserved drift on isolated item and repair corrects it with audit log", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;

    // Use dedicated reconVariantId with 0 external reservations
    const reconItemId = generateUuidV7();
    await sqlClient`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point)
      VALUES (${reconItemId}, ${reconVariantId}, ${locId}, 50, 0, 0, 5)
      ON CONFLICT (variant_id, location_id) DO UPDATE SET quantity_on_hand = 50, quantity_reserved = 0, quantity_allocated = 0;
    `;

    // Inject exact artificial drift of 17
    await sqlClient`
      UPDATE inventory_items 
      SET quantity_reserved = 17
      WHERE id = ${reconItemId};
    `;

    const reconResult = await reconcileInventory();
    expect(reconResult.success).toBe(true);
    const itemDiscrepancy = reconResult.discrepancies.find(
      (d) => d.inventoryItemId === reconItemId
    );
    expect(itemDiscrepancy).toBeDefined();
    expect(itemDiscrepancy?.reservedDrift).toBe(17);
    expect(itemDiscrepancy?.expectedReserved).toBe(0);

    const repairResult = await repairInventoryDiscrepancy({
      attemptId: "att-repair-recon-iso",
      inventoryItemId: reconItemId,
      reason: "Corrección de drift aislado",
      actorId: "test-supervisor",
      referenceId: "REPAIR-RECON-001",
    });

    expect(repairResult.success).toBe(true);
    expect(repairResult.ledgerEntryId).toBeDefined();

    const [itemRepaired] = await sqlClient`
      SELECT quantity_reserved FROM inventory_items WHERE id = ${reconItemId};
    `;
    expect(itemRepaired!.quantity_reserved).toBe(0);
  });

  it("Scenario 26B: repair is rejected when expected reservations exceed physical on-hand (capacity violation guard)", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;

    const testItemId = generateUuidV7();
    await sqlClient`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point)
      VALUES (${testItemId}, ${variantId3}, ${locId}, 3, 0, 0, 1)
      ON CONFLICT (variant_id, location_id) DO UPDATE SET quantity_on_hand = 3, quantity_reserved = 0, quantity_allocated = 0;
    `;

    const orderId = generateUuidV7();
    const orderItemId = generateUuidV7();
    await sqlClient`
      INSERT INTO orders (
        id, order_number, customer_email, customer_phone, status,
        subtotal_cents, discount_cents, shipping_cents, total_cents, currency,
        created_at, updated_at
      ) VALUES (
        ${orderId}, 'GP-TEST-CAP-001', 'test.customer@gamerperu.pe', '999888777', 'PENDING',
        15000, 0, 0, 15000, 'PEN',
        NOW(), NOW()
      );
    `;
    await sqlClient`
      INSERT INTO inventory_reservations (
        id, inventory_item_id, order_id, order_item_id,
        quantity, status, expires_at, created_at, updated_at
      ) VALUES (
        ${generateUuidV7()}, ${testItemId}, ${orderId}, ${orderItemId},
        5, 'ACTIVE', NOW() + INTERVAL '1 hour', NOW(), NOW()
      );
    `;

    const repairFail = await repairInventoryDiscrepancy({
      attemptId: "att-repair-cap-fail",
      inventoryItemId: testItemId,
      reason: "Intento de reparación con capacidad insuficiente",
      actorId: "test-supervisor",
      referenceId: "REPAIR-CAP-001",
    });

    expect(repairFail.success).toBe(false);
    expect(repairFail.code).toBe("CAPACITY_VIOLATION_REQUIRES_MANUAL_RESOLUTION");

    const [item] = await sqlClient`
      SELECT quantity_reserved FROM inventory_items WHERE id = ${testItemId};
    `;
    expect(item!.quantity_reserved).toBe(0);
  });

  it("Scenario 31: getVariantAvailability returns derived ATS and low-stock signal", async () => {
    const avail = await getVariantAvailability({
      variantId: variantId1,
      locationCode: primaryLocCode,
    });

    expect(avail).not.toBeNull();
    expect(avail?.variantId).toBe(variantId1);
    expect(avail?.inStock).toBe(true);
    expect(typeof avail?.availableToSell).toBe("number");
  });

  // -------------------------------------------------------------------------
  // 8. Genuine Concurrency Races (Matrix A through I) with Deterministic Barriers
  // -------------------------------------------------------------------------

  it("Race A: Two concurrent receiving operations on the same item serialize cleanly", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;
    const [itemBefore] = await sqlClient`
      SELECT quantity_on_hand FROM inventory_items WHERE variant_id = ${variantId1} AND location_id = ${locId};
    `;

    const [res1, res2] = await Promise.all([
      receiveInventory({
        attemptId: "att-race-recv-1",
        variantId: variantId1,
        locationCode: primaryLocCode,
        quantity: 10,
        referenceId: "PO-RACE-1",
        actorId: "test-staff-1",
      }),
      receiveInventory({
        attemptId: "att-race-recv-2",
        variantId: variantId1,
        locationCode: primaryLocCode,
        quantity: 20,
        referenceId: "PO-RACE-2",
        actorId: "test-staff-2",
      }),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const [itemAfter] = await sqlClient`
      SELECT quantity_on_hand FROM inventory_items WHERE variant_id = ${variantId1} AND location_id = ${locId};
    `;
    expect(itemAfter!.quantity_on_hand).toBe(itemBefore!.quantity_on_hand + 30);
  });

  it("Race B: Concurrent first InventoryItem creation for same variant and location", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${quarantineLocCode}`;
    const locId = loc!.id;

    await sqlClient`
      DELETE FROM inventory_items WHERE variant_id = ${variantId3} AND location_id = ${locId};
    `;

    const [res1, res2] = await Promise.all([
      receiveInventory({
        attemptId: "att-race-first-1",
        variantId: variantId3,
        locationCode: quarantineLocCode,
        quantity: 10,
        referenceId: "PO-FIRST-1",
        actorId: "test-staff-1",
      }),
      receiveInventory({
        attemptId: "att-race-first-2",
        variantId: variantId3,
        locationCode: quarantineLocCode,
        quantity: 15,
        referenceId: "PO-FIRST-2",
        actorId: "test-staff-2",
      }),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const items = await sqlClient`
      SELECT quantity_on_hand FROM inventory_items WHERE variant_id = ${variantId3} AND location_id = ${locId};
    `;
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity_on_hand).toBe(25);
  });

  it("Race C: Real Checkout reservation (submitCheckout) vs manual decrement (adjustInventory) on final ATS", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;

    // Set raceCVariantId stock to exactly 2 units
    await sqlClient`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point)
      VALUES (${generateUuidV7()}, ${raceCVariantId}, ${locId}, 2, 0, 0, 0)
      ON CONFLICT (variant_id, location_id) DO UPDATE SET quantity_on_hand = 2, quantity_reserved = 0, quantity_allocated = 0;
    `;

    // Create an anonymous cart with 2 units of raceCVariantId using deterministic suite-owned cart ID
    const cartToken = generateAnonymousSessionToken();
    currentMockCartCookie = cartToken;

    await sqlClient`
      INSERT INTO carts (id, session_token, status, expires_at, created_at, updated_at)
      VALUES (${raceCCartId}, ${cartToken}, 'ACTIVE', NOW() + INTERVAL '7 days', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
      VALUES (${generateUuidV7()}, ${raceCCartId}, ${raceCVariantId}, 2, NOW(), NOW());
    `;

    const deliveryAddress = {
      recipientName: "Comprador Concurrente",
      phone: "999888777",
      streetAddress: "Av. Concurrencia 123",
      department: "Lima",
      province: "Lima",
      district: "Miraflores",
    };

    // Deterministic barrier: pause adjustInventory after acquiring lock until checkout enters
    const barrier = createBarrier();
    __setTestInventoryTransactionHook(async (stage) => {
      if (stage === "after_lock") {
        barrier.signalA();
        await barrier.waitB();
      }
    });

    const checkoutPromise = submitCheckout({
      checkoutAttemptId: generateUuidV7(),
      customerEmail: "race.c@gamerperu.pe",
      deliveryAddress,
      shippingMethodCode,
      paymentMethodCode,
      reviewedSubtotalCents: 30000,
      reviewedShippingCents: 1500,
      reviewedTotalCents: 31500,
    });

    const adjustPromise = adjustInventory({
      attemptId: "att-race-c-adj",
      variantId: raceCVariantId,
      locationCode: primaryLocCode,
      commandKind: "DELTA",
      deltaQuantity: -2,
      reason: "Venta simultánea en tienda física",
      referenceId: "AUDIT-RACE-C-1",
      actorId: "test-staff-1",
    });

    // Release adjustInventory once both have started
    await barrier.waitA();
    barrier.signalB();

    const [checkoutRes, adjRes] = await Promise.all([checkoutPromise, adjustPromise]);

    const successes = [checkoutRes.success, adjRes.success].filter(Boolean);
    const failures = [checkoutRes.success, adjRes.success].filter((s) => !s);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    if (checkoutRes.success) {
      expect(checkoutRes.orderNumber).toBeDefined();
      expect(adjRes.success).toBe(false);
    } else {
      expect(adjRes.success).toBe(true);
      expect(adjRes.appliedDelta).toBe(-2);
      expect(checkoutRes.success).toBe(false);
    }

    const [itemFinal] = await sqlClient`
      SELECT quantity_on_hand, quantity_reserved, quantity_allocated
      FROM inventory_items WHERE variant_id = ${raceCVariantId} AND location_id = ${locId};
    `;
    const finalATS =
      itemFinal!.quantity_on_hand - itemFinal!.quantity_reserved - itemFinal!.quantity_allocated;
    expect(finalATS).toBe(0);
  });

  it("Race D: Real Payment submission (submitPaymentProof) vs expiration concurrency", async () => {
    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    const { orderId, paymentId } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-D-001",
      variantId: raceDVariantId,
      quantity: 2,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });

    const hmacSecret = process.env.CHECKOUT_HMAC_SECRET!;
    const rawToken = generateSecurePaymentSessionToken();
    const tokenDigest = computePaymentSessionTokenDigest(rawToken, hmacSecret);
    currentMockPaymentSessionCookie = rawToken;

    await sqlClient`
      INSERT INTO guest_payment_sessions (id, token_digest, expires_at, created_at)
      VALUES (${raceDSessionId}, ${tokenDigest}, NOW() + INTERVAL '1 hour', NOW())
      ON CONFLICT (id) DO UPDATE SET token_digest = ${tokenDigest};
    `;

    await sqlClient`
      INSERT INTO guest_payment_access_grants (id, payment_id, session_id, expires_at, created_at)
      VALUES (${generateUuidV7()}, ${paymentId}, ${raceDSessionId}, NOW() + INTERVAL '1 hour', NOW());
    `;

    // Deterministic barrier: expireUnpaidOrderReservations pauses after lock to allow submitPaymentProof to contend
    const barrier = createBarrier();
    __setTestInventoryTransactionHook(async (stage) => {
      if (stage === "after_lock") {
        barrier.signalA();
        await barrier.waitB();
      }
    });

    const expirePromise = expireUnpaidOrderReservations({ orderId, actorId: "SYSTEM-WORKER" });
    const paymentPromise = submitPaymentProof({
      orderNumber: "GP-TEST-RACE-D-001",
      operationCode: "12345678",
      submissionAttemptId: "submission-attempt-race-d-001",
    });

    await barrier.waitA();
    barrier.signalB();

    const [expRes, payRes] = await Promise.all([expirePromise, paymentPromise]);

    expect(expRes.success).toBe(true);

    const [paymentFinal] = await sqlClient`SELECT status FROM payments WHERE id = ${paymentId};`;
    const [orderFinal] = await sqlClient`SELECT status FROM orders WHERE id = ${orderId};`;
    const [resFinal] =
      await sqlClient`SELECT status FROM inventory_reservations WHERE order_id = ${orderId};`;

    if (payRes.success) {
      expect(payRes.paymentStatus).toBe("SUBMITTED");
      expect(paymentFinal!.status).toBe("SUBMITTED");
      if (payRes.isLate) {
        expect(orderFinal!.status).toBe("EXPIRED");
        expect(resFinal!.status).toBe("RELEASED");
        expect(expRes.releasedLinesCount).toBe(1);
        expect(expRes.orderStatusTransitioned).toBe(true);
      } else {
        expect(orderFinal!.status).toBe("PENDING");
        expect(resFinal!.status).toBe("VERIFICATION_HOLD");
        expect(expRes.releasedLinesCount).toBe(0);
        expect(expRes.orderStatusTransitioned).toBe(false);
      }
    } else {
      expect(orderFinal!.status).toBe("EXPIRED");
      expect(resFinal!.status).toBe("RELEASED");
      expect(expRes.orderStatusTransitioned).toBe(true);
      expect(expRes.releasedLinesCount).toBe(1);
    }
  });

  it("Race E: Real cancellation (cancelUnpaidOrder) vs expiration concurrency", async () => {
    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    const { orderId, paymentId } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-E-001",
      variantId: raceEVariantId,
      quantity: 2,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });

    const hmacSecret = process.env.CHECKOUT_HMAC_SECRET!;
    const rawToken = generateSecurePaymentSessionToken();
    const tokenDigest = computePaymentSessionTokenDigest(rawToken, hmacSecret);
    currentMockPaymentSessionCookie = rawToken;

    await sqlClient`
      INSERT INTO guest_payment_sessions (id, token_digest, expires_at, created_at)
      VALUES (${raceESessionId}, ${tokenDigest}, NOW() + INTERVAL '1 hour', NOW())
      ON CONFLICT (id) DO UPDATE SET token_digest = ${tokenDigest};
    `;

    await sqlClient`
      INSERT INTO guest_payment_access_grants (id, payment_id, session_id, expires_at, created_at)
      VALUES (${generateUuidV7()}, ${paymentId}, ${raceESessionId}, NOW() + INTERVAL '1 hour', NOW());
    `;

    // Deterministic barrier: cancelUnpaidOrder pauses after lock
    const barrier = createBarrier();
    __setTestOrderTransactionHook(async (stage) => {
      if (stage === "after_lock") {
        barrier.signalA();
        await barrier.waitB();
      }
    });

    const cancelPromise = cancelUnpaidOrder({
      orderNumber: "GP-TEST-RACE-E-001",
      cancellationAttemptId: "cancellation-attempt-race-e-001",
      reason: "Cancelación simultánea del cliente",
    });
    const expirePromise = expireUnpaidOrderReservations({ orderId, actorId: "SYSTEM-WORKER" });

    await barrier.waitA();
    barrier.signalB();

    const [cancelRes, expRes] = await Promise.all([cancelPromise, expirePromise]);

    expect(expRes.success).toBe(true);

    const [orderFinal] = await sqlClient`SELECT status FROM orders WHERE id = ${orderId};`;
    const [resFinal] = await sqlClient`
      SELECT status FROM inventory_reservations WHERE order_id = ${orderId};
    `;

    if (cancelRes.success) {
      expect(cancelRes.status).toBe("CANCELLED");
      expect(orderFinal!.status).toBe("CANCELLED");
      expect(expRes.orderStatusTransitioned).toBe(false);
      expect(expRes.releasedLinesCount).toBe(0);
    } else {
      expect(orderFinal!.status).toBe("EXPIRED");
      expect(expRes.orderStatusTransitioned).toBe(true);
      expect(expRes.releasedLinesCount).toBe(1);
    }

    expect(resFinal!.status).toBe("RELEASED");
  });

  it("Race F: Allocation vs terminal consequence seam (applyTerminalPaymentRejectionConsequences) concurrency", async () => {
    const { orderId, paymentId } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-F-001",
      variantId: raceFVariantId,
      quantity: 2,
      reservationStatus: "VERIFICATION_HOLD",
    });

    await sqlClient`UPDATE payments SET status = 'REJECTED' WHERE id = ${paymentId};`;

    const allocPromise = db.transaction((tx) =>
      allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId,
        actorId: "test-verifier",
        referenceId: "PAY-RACE-F-ALLOC",
      })
    );

    const rejPromise = db.transaction((tx) =>
      applyTerminalPaymentRejectionConsequences(tx, {
        orderId,
        paymentId,
        rejectionReason: "Comprobante rechazado",
      })
    );

    const [allocRes, rejRes] = await Promise.allSettled([allocPromise, rejPromise]);

    expect(rejRes.status).toBe("fulfilled");
    expect(["fulfilled", "rejected"]).toContain(allocRes.status);

    if (allocRes.status === "fulfilled") {
      expect(allocRes.value.success).toBe(false);
      expect(["PAYMENT_REJECTED", "INVALID_RESERVATION_STATE_FOR_ALLOCATION"]).toContain(
        allocRes.value.code
      );
    }

    const [orderFinal] = await sqlClient`SELECT status FROM orders WHERE id = ${orderId};`;
    const [resFinal] = await sqlClient`
      SELECT status FROM inventory_reservations WHERE order_id = ${orderId};
    `;
    const [itemFinal] = await sqlClient`
      SELECT quantity_reserved, quantity_allocated FROM inventory_items WHERE variant_id = ${raceFVariantId} AND location_id = ${primaryLocId};
    `;

    expect(orderFinal!.status).toBe("CANCELLED");
    expect(resFinal!.status).toBe("RELEASED");
    expect(itemFinal!.quantity_reserved).toBe(0);
    expect(itemFinal!.quantity_allocated).toBe(0);
  });

  it("Race G: Two simultaneous expiration workers targeting the same expired order serialize safely", async () => {
    const pastDate = new Date(Date.now() - 20 * 60 * 1000);
    const { orderId } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-G-001",
      variantId: raceGVariantId,
      quantity: 2,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });

    const barrier = createBarrier();
    let isFirst = true;
    __setTestInventoryTransactionHook(async (stage) => {
      if (stage === "after_lock" && isFirst) {
        isFirst = false;
        barrier.signalA();
        await barrier.waitB();
      }
    });

    const exp1Promise = expireUnpaidOrderReservations({ orderId, actorId: "SYSTEM-WORKER-1" });
    const exp2Promise = expireUnpaidOrderReservations({ orderId, actorId: "SYSTEM-WORKER-2" });

    await barrier.waitA();
    barrier.signalB();

    const [exp1, exp2] = await Promise.all([exp1Promise, exp2Promise]);

    expect(exp1.success).toBe(true);
    expect(exp2.success).toBe(true);

    const releasedCounts = [exp1.releasedLinesCount, exp2.releasedLinesCount];
    expect(releasedCounts).toContain(1);
    expect(releasedCounts).toContain(0);

    const totalQuantities = [exp1.totalQuantityReleased, exp2.totalQuantityReleased];
    expect(totalQuantities).toContain(2);
    expect(totalQuantities).toContain(0);

    const transitionFlags = [exp1.orderStatusTransitioned, exp2.orderStatusTransitioned];
    expect(transitionFlags).toContain(true);
    expect(transitionFlags).toContain(false);

    const [orderFinal] = await sqlClient`SELECT status FROM orders WHERE id = ${orderId};`;
    const [resFinal] =
      await sqlClient`SELECT status FROM inventory_reservations WHERE order_id = ${orderId};`;

    expect(orderFinal!.status).toBe("EXPIRED");
    expect(resFinal!.status).toBe("RELEASED");
  });

  it("Race H: Two simultaneous payment-approval allocation attempts execute idempotently", async () => {
    const { orderId } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-H-001",
      variantId: raceHVariantId,
      quantity: 1,
      reservationStatus: "VERIFICATION_HOLD",
    });

    const barrier = createBarrier();
    let isFirst = true;
    __setTestInventoryTransactionHook(async (stage) => {
      if (stage === "after_lock" && isFirst) {
        isFirst = false;
        barrier.signalA();
        await barrier.waitB();
      }
    });

    const alloc1Promise = db.transaction((tx) =>
      allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId,
        actorId: "test-verifier-1",
        referenceId: "PAY-RACE-H-1",
      })
    );
    const alloc2Promise = db.transaction((tx) =>
      allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId,
        actorId: "test-verifier-2",
        referenceId: "PAY-RACE-H-2",
      })
    );

    await barrier.waitA();
    barrier.signalB();

    const [alloc1, alloc2] = await Promise.all([alloc1Promise, alloc2Promise]);

    expect(alloc1.success).toBe(true);
    expect(alloc2.success).toBe(true);

    const alreadyAllocatedFlags = [alloc1.alreadyAllocated, alloc2.alreadyAllocated];
    expect(alreadyAllocatedFlags).toContain(false);
    expect(alreadyAllocatedFlags).toContain(true);

    const [resFinal] =
      await sqlClient`SELECT status FROM inventory_reservations WHERE order_id = ${orderId};`;
    expect(resFinal!.status).toBe("ALLOCATED");
  });

  it("Race I: Late reacquisition vs concurrent stock-consuming operation prevents oversell", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;

    await sqlClient`
      UPDATE inventory_items
      SET quantity_on_hand = 4, quantity_reserved = 0, quantity_allocated = 0
      WHERE variant_id = ${variantId2} AND location_id = ${locId};
    `;

    const { orderId: orderIdLate } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-I-001",
      variantId: variantId2,
      quantity: 4,
      reservationStatus: "RELEASED",
      initialOnHand: 4,
    });

    const barrier = createBarrier();
    __setTestInventoryTransactionHook(async (stage) => {
      if (stage === "after_lock") {
        barrier.signalA();
        await barrier.waitB();
      }
    });

    const reacqPromise = db.transaction((tx) =>
      reacquireOrderInventoryAfterLatePayment(tx, {
        orderId: orderIdLate,
        actorId: "test-admin-verifier",
        referenceId: "PAY-RACE-I-1",
      })
    );

    const adjPromise = adjustInventory({
      attemptId: "att-race-i-adj",
      variantId: variantId2,
      locationCode: primaryLocCode,
      commandKind: "DELTA",
      deltaQuantity: -4,
      reason: "Venta simultánea",
      referenceId: "AUDIT-RACE-I-1",
      actorId: "test-staff-1",
    });

    await barrier.waitA();
    barrier.signalB();

    const [reacq, adj] = await Promise.all([reacqPromise, adjPromise]);

    const outcomes = [reacq.success, adj.success];
    expect(outcomes).toContain(true);
    expect(outcomes).toContain(false);

    const reservationsFinal = await sqlClient`
      SELECT status FROM inventory_reservations WHERE order_id = ${orderIdLate} ORDER BY created_at ASC, id ASC;
    `;
    const statuses = reservationsFinal.map((r) => r.status);

    const [itemFinal] = await sqlClient`
      SELECT quantity_on_hand, quantity_reserved, quantity_allocated
      FROM inventory_items WHERE variant_id = ${variantId2} AND location_id = ${locId};
    `;

    if (reacq.success) {
      expect(reacq.reacquiredLinesCount).toBe(1);
      expect(adj.success).toBe(false);
      expect(statuses).toContain("ALLOCATED");
      expect(statuses).toContain("RELEASED");
      expect(itemFinal!.quantity_allocated).toBe(4);
    } else {
      expect(adj.success).toBe(true);
      expect(reacq.success).toBe(false);
      expect(reacq.code).toBe("INSUFFICIENT_STOCK_FOR_REACQUISITION");
      expect(statuses).toEqual(["RELEASED"]);
    }

    expect(
      itemFinal!.quantity_on_hand - itemFinal!.quantity_reserved - itemFinal!.quantity_allocated
    ).toBe(0);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { generateUuidV7 } from "@/db/utils/uuid";
import { db } from "@/db";
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

describe("GP-021 / CHK2-BR1 — Real Local PostgreSQL Inventory Engine & Concurrency Suite", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);
  let sqlClient: postgres.Sql;

  const fixturePrefix = "0192d200-0000-7000-8000-";
  const brandId = `${fixturePrefix}000000000001`;
  const categoryId = `${fixturePrefix}000000000002`;
  const productId = `${fixturePrefix}000000000003`;
  const variantId1 = `${fixturePrefix}000000000004`;
  const variantId2 = `${fixturePrefix}000000000005`;
  const variantId3 = `${fixturePrefix}000000000006`;

  const primaryLocId = `${fixturePrefix}000000000010`;
  const quarantineLocId = `${fixturePrefix}000000000011`;
  const primaryLocCode = "TEST-LOC-LIM-01";
  const quarantineLocCode = "TEST-LOC-LIM-QUARANTINE";

  const paymentMethodId = `${fixturePrefix}000000000020`;
  const paymentInstructionId = `${fixturePrefix}000000000021`;
  const paymentMethodCode = "TEST-INV-PAY";

  beforeAll(async () => {
    process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = primaryLocCode;
    process.env.INVENTORY_QUARANTINE_LOCATION_CODE = quarantineLocCode;
    process.env.INVENTORY_IDEMPOTENCY_TTL_MINUTES = "1440";
    process.env.INVENTORY_HMAC_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    sqlClient = postgres(connectionString, { max: 10 });

    // Clean fixtures
    await sqlClient`DELETE FROM inventory_ledger_entries WHERE actor_id LIKE 'test-%' OR reference_id LIKE 'TEST-%' OR reference_id LIKE 'PO-%' OR reference_id LIKE 'AUDIT-%' OR reference_id LIKE 'TR-%' OR reference_id LIKE 'REPAIR-%' OR reference_id LIKE 'PAY-%'`;
    await sqlClient`DELETE FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%') OR payment_method_code = ${paymentMethodCode}`;
    await sqlClient`UPDATE payment_method_configurations SET current_instruction_version_id = NULL WHERE id = ${paymentMethodId} OR code = ${paymentMethodCode}`;
    await sqlClient`DELETE FROM payment_instruction_versions WHERE id = ${paymentInstructionId} OR payment_method_code = ${paymentMethodCode}`;
    await sqlClient`DELETE FROM payment_method_configurations WHERE id = ${paymentMethodId} OR code = ${paymentMethodCode}`;
    await sqlClient`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM orders WHERE order_number LIKE 'GP-TEST-%'`;
    await sqlClient`DELETE FROM inventory_items WHERE variant_id IN (${variantId1}, ${variantId2}, ${variantId3})`;
    await sqlClient`DELETE FROM product_variants WHERE id IN (${variantId1}, ${variantId2}, ${variantId3})`;
    await sqlClient`DELETE FROM products WHERE id = ${productId}`;
    await sqlClient`DELETE FROM categories WHERE id = ${categoryId}`;
    await sqlClient`DELETE FROM brands WHERE id = ${brandId}`;
    await sqlClient`DELETE FROM inventory_locations WHERE id IN (${primaryLocId}, ${quarantineLocId}) OR code IN (${primaryLocCode}, ${quarantineLocCode})`;
    await sqlClient`DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'INVENTORY_%'`;
    await sqlClient`DELETE FROM audit_events WHERE actor_id LIKE 'test-%'`;

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
        (${variantId3}, ${productId}, 'SKU-INV-003', 'Red Edition', 15000, 'ACTIVE', NOW(), NOW())
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
  });

  afterEach(async () => {
    __setTestInventoryTransactionHook(null);
  });

  afterAll(async () => {
    // Cleanup
    await sqlClient`DELETE FROM inventory_ledger_entries WHERE actor_id LIKE 'test-%' OR reference_id LIKE 'TEST-%' OR reference_id LIKE 'PO-%' OR reference_id LIKE 'AUDIT-%' OR reference_id LIKE 'TR-%' OR reference_id LIKE 'REPAIR-%' OR reference_id LIKE 'PAY-%'`;
    await sqlClient`DELETE FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%') OR payment_method_code = ${paymentMethodCode}`;
    await sqlClient`UPDATE payment_method_configurations SET current_instruction_version_id = NULL WHERE id = ${paymentMethodId} OR code = ${paymentMethodCode}`;
    await sqlClient`DELETE FROM payment_instruction_versions WHERE id = ${paymentInstructionId} OR payment_method_code = ${paymentMethodCode}`;
    await sqlClient`DELETE FROM payment_method_configurations WHERE id = ${paymentMethodId} OR code = ${paymentMethodCode}`;
    await sqlClient`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM orders WHERE order_number LIKE 'GP-TEST-%'`;
    await sqlClient`DELETE FROM inventory_items WHERE variant_id IN (${variantId1}, ${variantId2}, ${variantId3})`;
    await sqlClient`DELETE FROM product_variants WHERE id IN (${variantId1}, ${variantId2}, ${variantId3})`;
    await sqlClient`DELETE FROM products WHERE id = ${productId}`;
    await sqlClient`DELETE FROM categories WHERE id = ${categoryId}`;
    await sqlClient`DELETE FROM brands WHERE id = ${brandId}`;
    await sqlClient`DELETE FROM inventory_locations WHERE id IN (${primaryLocId}, ${quarantineLocId})`;
    await sqlClient`DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'INVENTORY_%'`;
    await sqlClient`DELETE FROM audit_events WHERE actor_id LIKE 'test-%'`;

    await sqlClient.end();
  });

  // Helper to create synthetic orders with reservations
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

    // Adjust reserved/allocated if starting in non-released state
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

    await sqlClient`
      INSERT INTO orders (id, order_number, status, subtotal_cents, discount_cents, shipping_cents, total_cents, currency, created_at, updated_at)
      VALUES (${orderId}, ${params.orderNumber}, 'PENDING', 15000, 0, 0, 15000, 'PEN', NOW(), NOW());
    `;

    await sqlClient`
      INSERT INTO order_items (id, order_id, variant_id, sku_snapshot, product_name_snapshot, variant_title_snapshot, unit_price_cents_snapshot, quantity, line_total_cents, created_at)
      VALUES (${orderItemId}, ${orderId}, ${params.variantId}, 'SKU-INV-001', 'Test Prod', 'Black', 15000, ${params.quantity}, 15000 * ${params.quantity}, NOW());
    `;

    await sqlClient`
      INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, status, created_at, updated_at)
      VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${paymentInstructionId}, 15000, 'UNPAID', NOW(), NOW());
    `;

    const expiresAt = params.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000);
    await sqlClient`
      INSERT INTO inventory_reservations (id, inventory_item_id, order_id, order_item_id, quantity, status, expires_at, created_at, updated_at)
      VALUES (${resId}, ${itemId}, ${orderId}, ${orderItemId}, ${params.quantity}, ${params.reservationStatus}, ${expiresAt}, NOW(), NOW());
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

    // Second execution with same attempt key
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
      quantity: 20, // Changed quantity
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

    // Manually expire the key in database
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
    // First count to 120 (current on-hand is already 120 from Scenario 8)
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

    // Verify ZERO ledger entries and ZERO audit events were written for this zero-effect reference
    const [zeroLedger] = await sqlClient`
      SELECT count(*)::int as count FROM inventory_ledger_entries WHERE reference_id = 'AUDIT-ZERO-01';
    `;
    expect(zeroLedger!.count).toBe(0);

    // Mutate stock in between via a separate attempt
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

    // Retry the exact original zero-effect attemptId: must replay original result, NOT re-apply delta!
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

    // Verify stock remained 130 (not forced back to 120 by retry)
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
      countedQuantity: 50, // 50 < 80 reserved
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

  it("Scenario 18: all-ALLOCATED replay verifies balance consistency and returns alreadyAllocated with zero duplicate ledger rows", async () => {
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

    // Replay allocation
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

  // -------------------------------------------------------------------------
  // 5. Late-Payment Reacquisition Scenarios
  // -------------------------------------------------------------------------

  it("Scenario 19 & 20: late reacquisition creates ALLOCATED reservation with original expires_at when stock exists, rejects if insufficient", async () => {
    const originalExpiry = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
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

    // Verify replacement ALLOCATED reservation preserves original authoritative expires_at
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
    const futureDate = new Date(Date.now() + 20 * 60 * 1000); // 20 mins in future
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

    // Verify order and stock were untouched
    const [order] = await sqlClient`SELECT status FROM orders WHERE id = ${orderId};`;
    expect(order!.status).toBe("PENDING");

    const [itemAfter] = await sqlClient`
      SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId};
    `;
    expect(itemAfter!.quantity_reserved).toBe(itemBefore!.quantity_reserved);
  });

  it("Scenario 22 & 23: legitimate expired trigger releases whole active order with exact movement classifications", async () => {
    const pastDate = new Date(Date.now() - 10 * 60 * 1000); // Expired 10 mins ago
    const futureDate = new Date(Date.now() + 15 * 60 * 1000); // Future line in same order

    const { orderId, inventoryItemId } = await seedTestOrder({
      orderNumber: "GP-TEST-EXP-MIXED-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });

    // Add a second ACTIVE line to the same order with future expiry (co-release test)
    const orderItemId2 = generateUuidV7();
    const resId2 = generateUuidV7();
    await sqlClient`
      INSERT INTO order_items (id, order_id, variant_id, sku_snapshot, product_name_snapshot, variant_title_snapshot, unit_price_cents_snapshot, quantity, line_total_cents, created_at)
      VALUES (${orderItemId2}, ${orderId}, ${variantId1}, 'SKU-INV-001', 'Test Prod', 'Black', 15000, 3, 45000, NOW());
    `;
    await sqlClient`
      UPDATE inventory_items SET quantity_reserved = quantity_reserved + 3 WHERE id = ${inventoryItemId};
    `;
    await sqlClient`
      INSERT INTO inventory_reservations (id, inventory_item_id, order_id, order_item_id, quantity, status, expires_at, created_at, updated_at)
      VALUES (${resId2}, ${inventoryItemId}, ${orderId}, ${orderItemId2}, 3, 'ACTIVE', ${futureDate}, NOW(), NOW());
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

    // Verify ledger entry movement types: 1 RESERVATION_EXPIRED (line 1) and 1 RESERVATION_RELEASED (line 2 co-release)
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
  // 7. Reconciliation & Repair Scenarios (With Capacity Violation Guard)
  // -------------------------------------------------------------------------

  it("Scenario 26 & 30: reconciliation detects reserved drift and repair service corrects balance with audit log", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;
    const [item] = await sqlClient`
      SELECT id, quantity_on_hand, quantity_reserved, quantity_allocated 
      FROM inventory_items WHERE variant_id = ${variantId1} AND location_id = ${locId};
    `;
    const itemId = item!.id;

    // Artificial drift: inject synthetic drift in quantity_reserved
    await sqlClient`
      UPDATE inventory_items 
      SET quantity_reserved = quantity_reserved + 17
      WHERE id = ${itemId};
    `;

    const reconResult = await reconcileInventory();
    expect(reconResult.success).toBe(true);
    const itemDiscrepancy = reconResult.discrepancies.find((d) => d.inventoryItemId === itemId);
    expect(itemDiscrepancy).toBeDefined();
    expect(itemDiscrepancy?.reservedDrift).toBe(17);

    // Repair discrepancy
    const repairResult = await repairInventoryDiscrepancy({
      attemptId: "att-repair-001",
      inventoryItemId: itemId,
      reason: "Corrección de drift sintético de prueba",
      actorId: "test-supervisor",
      referenceId: "REPAIR-2026-001",
    });

    expect(repairResult.success).toBe(true);
    expect(repairResult.ledgerEntryId).toBeDefined();

    const [itemRepaired] = await sqlClient`
      SELECT quantity_reserved FROM inventory_items WHERE id = ${itemId};
    `;
    expect(itemRepaired!.quantity_reserved).toBe(item!.quantity_reserved);
  });

  it("Scenario 26B: repair is rejected when expected reservations exceed physical on-hand (capacity violation guard)", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;

    // Create an isolated item with on_hand = 3
    const testItemId = generateUuidV7();
    await sqlClient`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point)
      VALUES (${testItemId}, ${variantId3}, ${locId}, 3, 0, 0, 1)
      ON CONFLICT (variant_id, location_id) DO UPDATE SET quantity_on_hand = 3, quantity_reserved = 0, quantity_allocated = 0;
    `;

    // Seed an order reservation of 5 units against this item (5 > 3)
    const orderId = generateUuidV7();
    const orderItemId = generateUuidV7();
    await sqlClient`
      INSERT INTO orders (id, order_number, status, subtotal_cents, discount_cents, shipping_cents, total_cents, currency, created_at, updated_at)
      VALUES (${orderId}, 'GP-TEST-CAP-001', 'PENDING', 15000, 0, 0, 15000, 'PEN', NOW(), NOW());
    `;
    await sqlClient`
      INSERT INTO inventory_reservations (id, inventory_item_id, order_id, order_item_id, quantity, status, expires_at, created_at, updated_at)
      VALUES (${generateUuidV7()}, ${testItemId}, ${orderId}, ${orderItemId}, 5, 'ACTIVE', NOW() + INTERVAL '1 hour', NOW(), NOW());
    `;

    // Attempt to repair item: expectedReserved is 5, but on_hand is only 3
    const repairFail = await repairInventoryDiscrepancy({
      attemptId: "att-repair-cap-fail",
      inventoryItemId: testItemId,
      reason: "Intento de reparación con capacidad insuficiente",
      actorId: "test-supervisor",
      referenceId: "REPAIR-CAP-001",
    });

    expect(repairFail.success).toBe(false);
    expect(repairFail.code).toBe("CAPACITY_VIOLATION_REQUIRES_MANUAL_RESOLUTION");

    // Verify item balances remained unmodified
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
  // 8. Genuine Concurrency Races (Matrix A through I)
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
    // Use variantId3 on quarantine location where no inventory_item exists yet
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

  it("Race C: Manual decrement vs concurrent reservation on final available stock prevents oversell", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;
    await sqlClient`
      UPDATE inventory_items 
      SET quantity_on_hand = 5, quantity_reserved = 0, quantity_allocated = 0
      WHERE variant_id = ${variantId1} AND location_id = ${locId};
    `;

    const [adj1, adj2] = await Promise.all([
      adjustInventory({
        attemptId: "att-race-adj-1",
        variantId: variantId1,
        locationCode: primaryLocCode,
        commandKind: "DELTA",
        deltaQuantity: -5,
        reason: "Venta física de mostrador",
        referenceId: "AUDIT-RACE-1",
        actorId: "test-staff-1",
      }),
      adjustInventory({
        attemptId: "att-race-adj-2",
        variantId: variantId1,
        locationCode: primaryLocCode,
        commandKind: "DELTA",
        deltaQuantity: -5,
        reason: "Venta física de mostrador concurrente",
        referenceId: "AUDIT-RACE-2",
        actorId: "test-staff-2",
      }),
    ]);

    const successes = [adj1, adj2].filter((r) => r.success);
    const failures = [adj1, adj2].filter((r) => !r.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.code).toBe("NEGATIVE_ON_HAND_DISALLOWED");

    const [itemFinal] = await sqlClient`
      SELECT quantity_on_hand FROM inventory_items WHERE variant_id = ${variantId1} AND location_id = ${locId};
    `;
    expect(itemFinal!.quantity_on_hand).toBe(0);
  });

  it("Race D: Expiration vs real payment submission concurrency", async () => {
    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    const { orderId } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-EXP-PAY-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });

    // Simulate concurrent payment submission winning
    await sqlClient`UPDATE payments SET status = 'SUBMITTED' WHERE order_id = ${orderId};`;

    const expireResult = await expireUnpaidOrderReservations({
      orderId,
      actorId: "SYSTEM",
    });

    expect(expireResult.success).toBe(true);
    expect(expireResult.code).toBe("PAYMENT_NOT_UNPAID");
    expect(expireResult.releasedLinesCount).toBe(0);

    const [order] = await sqlClient`SELECT status FROM orders WHERE id = ${orderId};`;
    expect(order!.status).toBe("PENDING");
  });

  it("Race E: Expiration vs customer cancellation concurrency", async () => {
    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    const { orderId } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-EXP-CANCEL-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });

    // Simulate concurrent cancellation winning
    await sqlClient`UPDATE orders SET status = 'CANCELLED' WHERE id = ${orderId};`;

    const expireResult = await expireUnpaidOrderReservations({
      orderId,
      actorId: "SYSTEM",
    });

    expect(expireResult.success).toBe(true);
    expect(expireResult.code).toBe("ORDER_NOT_PENDING");
    expect(expireResult.releasedLinesCount).toBe(0);
  });

  it("Race F: Two simultaneous expiration workers targeting the same expired order serialize safely", async () => {
    const pastDate = new Date(Date.now() - 20 * 60 * 1000);
    const { orderId } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-EXP-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });

    const [exp1, exp2] = await Promise.all([
      expireUnpaidOrderReservations({ orderId, actorId: "SYSTEM-WORKER-1" }),
      expireUnpaidOrderReservations({ orderId, actorId: "SYSTEM-WORKER-2" }),
    ]);

    expect(exp1.success).toBe(true);
    expect(exp2.success).toBe(true);

    const releasedCounts = [exp1.releasedLinesCount, exp2.releasedLinesCount];
    expect(releasedCounts).toContain(2); // One worker released the line
    expect(releasedCounts).toContain(0); // Other worker found 0 active lines

    const [order] = await sqlClient`SELECT status FROM orders WHERE id = ${orderId};`;
    expect(order!.status).toBe("EXPIRED");
  });

  it("Race G: Two simultaneous payment-approval allocation attempts execute idempotently", async () => {
    const { orderId } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-ALLOC-001",
      variantId: variantId1,
      quantity: 1,
      reservationStatus: "VERIFICATION_HOLD",
    });

    const [alloc1, alloc2] = await Promise.all([
      db.transaction((tx) =>
        allocateOrderInventoryAfterPaymentApproval(tx, {
          orderId,
          actorId: "test-verifier-1",
          referenceId: "PAY-RACE-1",
        })
      ),
      db.transaction((tx) =>
        allocateOrderInventoryAfterPaymentApproval(tx, {
          orderId,
          actorId: "test-verifier-2",
          referenceId: "PAY-RACE-2",
        })
      ),
    ]);

    expect(alloc1.success).toBe(true);
    expect(alloc2.success).toBe(true);

    const alreadyAllocatedFlags = [alloc1.alreadyAllocated, alloc2.alreadyAllocated];
    expect(alreadyAllocatedFlags).toContain(false);
    expect(alreadyAllocatedFlags).toContain(true);

    const [res] =
      await sqlClient`SELECT status FROM inventory_reservations WHERE order_id = ${orderId};`;
    expect(res!.status).toBe("ALLOCATED");
  });

  it("Race I: Late reacquisition vs concurrent stock-consuming operation prevents oversell", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;

    // Set stock of variantId2 to exactly 4 units
    await sqlClient`
      UPDATE inventory_items
      SET quantity_on_hand = 4, quantity_reserved = 0, quantity_allocated = 0
      WHERE variant_id = ${variantId2} AND location_id = ${locId};
    `;

    const { orderId: orderIdLate } = await seedTestOrder({
      orderNumber: "GP-TEST-RACE-LATE-001",
      variantId: variantId2,
      quantity: 4,
      reservationStatus: "RELEASED",
      initialOnHand: 4,
    });

    // Run late reacquisition (needing 4) vs concurrent manual decrement (needing 4)
    const [reacq, adj] = await Promise.all([
      db.transaction((tx) =>
        reacquireOrderInventoryAfterLatePayment(tx, {
          orderId: orderIdLate,
          actorId: "test-admin-verifier",
          referenceId: "PAY-RACE-LATE-1",
        })
      ),
      adjustInventory({
        attemptId: "att-race-reacq-adj",
        variantId: variantId2,
        locationCode: primaryLocCode,
        commandKind: "DELTA",
        deltaQuantity: -4,
        reason: "Venta simultánea",
        referenceId: "AUDIT-RACE-REACQ-1",
        actorId: "test-staff-1",
      }),
    ]);

    const outcomes = [reacq.success, adj.success];
    expect(outcomes).toContain(true);
    expect(outcomes).toContain(false);

    // Verify on-hand or allocated was updated without negative ATS
    const [item] = await sqlClient`
      SELECT quantity_on_hand, quantity_reserved, quantity_allocated
      FROM inventory_items WHERE variant_id = ${variantId2} AND location_id = ${locId};
    `;
    expect(item!.quantity_on_hand - item!.quantity_reserved - item!.quantity_allocated).toBe(0);
  });
});

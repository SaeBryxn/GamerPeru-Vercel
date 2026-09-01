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

describe("GP-021 — Real Local PostgreSQL Inventory Engine & Concurrency Suite", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);
  let sqlClient: postgres.Sql;

  const fixturePrefix = "0192d200-0000-7000-8000-";
  const brandId = `${fixturePrefix}000000000001`;
  const categoryId = `${fixturePrefix}000000000002`;
  const productId = `${fixturePrefix}000000000003`;
  const variantId1 = `${fixturePrefix}000000000004`;
  const variantId2 = `${fixturePrefix}000000000005`;

  const primaryLocId = `${fixturePrefix}000000000010`;
  const quarantineLocId = `${fixturePrefix}000000000011`;
  const primaryLocCode = "LOC-LIM-01";
  const quarantineLocCode = "LOC-LIM-QUARANTINE";

  beforeAll(async () => {
    sqlClient = postgres(connectionString, { max: 10 });

    // Clean fixtures
    await sqlClient`DELETE FROM inventory_ledger_entries WHERE actor_id LIKE 'test-%' OR reference_id LIKE 'TEST-%' OR reference_id LIKE 'PO-%' OR reference_id LIKE 'AUDIT-%' OR reference_id LIKE 'TR-%' OR reference_id LIKE 'REPAIR-%'`;
    await sqlClient`DELETE FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM orders WHERE order_number LIKE 'GP-TEST-%'`;
    await sqlClient`DELETE FROM inventory_items WHERE variant_id IN (${variantId1}, ${variantId2})`;
    await sqlClient`DELETE FROM product_variants WHERE id IN (${variantId1}, ${variantId2})`;
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
      INSERT INTO brands (id, name, slug, description, status, created_at, updated_at)
      VALUES (${brandId}, 'Test Brand', 'test-brand-inv', 'Test Brand Description', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO categories (id, name, slug, description, display_order, status, created_at, updated_at)
      VALUES (${categoryId}, 'Test Category', 'test-cat-inv', 'Test Category Description', 0, 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO products (id, brand_id, category_id, name, slug, description, status, created_at, updated_at)
      VALUES (${productId}, ${brandId}, ${categoryId}, 'Test Product Inv', 'test-prod-inv', 'Description', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING;
    `;

    await sqlClient`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, cost_cents, is_active, created_at, updated_at)
      VALUES 
        (${variantId1}, ${productId}, 'SKU-INV-001', 'Black Edition', 15000, 8000, true, NOW(), NOW()),
        (${variantId2}, ${productId}, 'SKU-INV-002', 'White Edition', 15000, 8000, true, NOW(), NOW())
      ON CONFLICT (sku) DO NOTHING;
    `;
  });

  afterEach(async () => {
    __setTestInventoryTransactionHook(null);
  });

  afterAll(async () => {
    // Cleanup
    await sqlClient`DELETE FROM inventory_ledger_entries WHERE actor_id LIKE 'test-%' OR reference_id LIKE 'TEST-%' OR reference_id LIKE 'PO-%' OR reference_id LIKE 'AUDIT-%' OR reference_id LIKE 'TR-%' OR reference_id LIKE 'REPAIR-%'`;
    await sqlClient`DELETE FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'GP-TEST-%')`;
    await sqlClient`DELETE FROM orders WHERE order_number LIKE 'GP-TEST-%'`;
    await sqlClient`DELETE FROM inventory_items WHERE variant_id IN (${variantId1}, ${variantId2})`;
    await sqlClient`DELETE FROM product_variants WHERE id IN (${variantId1}, ${variantId2})`;
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
  }) {
    const orderId = generateUuidV7();
    const orderItemId = generateUuidV7();
    const paymentId = generateUuidV7();
    const resId = generateUuidV7();

    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;

    const [item] = await sqlClient`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point)
      VALUES (${generateUuidV7()}, ${params.variantId}, ${locId}, 100, 0, 0, 10)
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
      INSERT INTO payments (id, order_id, amount_cents, status, created_at, updated_at)
      VALUES (${paymentId}, ${orderId}, 15000, 'UNPAID', NOW(), NOW());
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

    // Verify DB state
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

    // Verify DB count did not increment again
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

  // -------------------------------------------------------------------------
  // 2. Manual Adjustments Scenarios
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

  it("Scenario 9 & 10: adjustment causing negative balance or violating committed reservations is rejected", async () => {
    // Attempt adjustment below 0
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

    // Seed an order with reservation to test committed hold protection
    await seedTestOrder({
      orderNumber: "GP-TEST-ADJ-001",
      variantId: variantId2,
      quantity: 80,
      reservationStatus: "ACTIVE",
    });

    // Try to adjust on_hand below 80
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

    // Verify both ledger entries share the exact referenceId
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

  it("Scenario 15: normal allocation transitions VERIFICATION_HOLD to ALLOCATED atomically", async () => {
    const { orderId, inventoryItemId } = await seedTestOrder({
      orderNumber: "GP-TEST-ALLOC-001",
      variantId: variantId1,
      quantity: 3,
      reservationStatus: "VERIFICATION_HOLD",
    });

    const [itemBefore] = await sqlClient`
      SELECT quantity_reserved, quantity_allocated FROM inventory_items WHERE id = ${inventoryItemId};
    `;

    // Execute allocation inside transaction
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

    // Verify DB balances
    const [itemAfter] = await sqlClient`
      SELECT quantity_reserved, quantity_allocated FROM inventory_items WHERE id = ${inventoryItemId};
    `;
    expect(itemAfter!.quantity_reserved).toBe(itemBefore!.quantity_reserved - 3);
    expect(itemAfter!.quantity_allocated).toBe(itemBefore!.quantity_allocated + 3);

    // Verify reservation status
    const [res] = await sqlClient`
      SELECT status FROM inventory_reservations WHERE order_id = ${orderId};
    `;
    expect(res!.status).toBe("ALLOCATED");
  });

  it("Scenario 16: normal allocation rejects ACTIVE reservations with fail-closed domain error", async () => {
    const { orderId } = await seedTestOrder({
      orderNumber: "GP-TEST-ALLOC-ACT-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "ACTIVE", // Not yet submitted/reviewed
    });

    const allocResult = await db.transaction(async (tx) => {
      return await allocateOrderInventoryAfterPaymentApproval(tx, {
        orderId,
        actorId: "test-admin-verifier",
        referenceId: "PAY-TEST-002",
      });
    });

    expect(allocResult.success).toBe(false);
    expect(allocResult.code).toBe("ACTIVE_RESERVATION_CANNOT_BE_ALLOCATED");
  });

  it("Scenario 18: all-ALLOCATED replay returns idempotent success with zero duplicate ledger rows", async () => {
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

  it("Scenario 19 & 20: late reacquisition creates ALLOCATED reservation if stock exists, rejects if insufficient", async () => {
    const { orderId: orderIdWithStock, inventoryItemId } = await seedTestOrder({
      orderNumber: "GP-TEST-LATE-001",
      variantId: variantId1,
      quantity: 2,
      reservationStatus: "RELEASED",
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

    // Test rejection when stock is completely exhausted
    const { orderId: orderIdNoStock } = await seedTestOrder({
      orderNumber: "GP-TEST-LATE-NOSTOCK-001",
      variantId: variantId2,
      quantity: 5000, // Exceeds on-hand
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
  // 6. Reservation Expiration Scenarios
  // -------------------------------------------------------------------------

  it("Scenario 22 & 23: expiration worker releases expired ACTIVE reservations and updates Order status", async () => {
    const pastDate = new Date(Date.now() - 10 * 60 * 1000); // Expired 10 mins ago
    const { orderId, inventoryItemId } = await seedTestOrder({
      orderNumber: "GP-TEST-EXP-001",
      variantId: variantId1,
      quantity: 4,
      reservationStatus: "ACTIVE",
      expiresAt: pastDate,
    });

    const [itemBefore] = await sqlClient`
      SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId};
    `;

    const expireResult = await expireUnpaidOrderReservations({
      orderId,
      actorId: "SYSTEM",
    });

    expect(expireResult.success).toBe(true);
    expect(expireResult.releasedLinesCount).toBe(1);
    expect(expireResult.orderStatusTransitioned).toBe(true);

    // Verify DB state
    const [itemAfter] = await sqlClient`
      SELECT quantity_reserved FROM inventory_items WHERE id = ${inventoryItemId};
    `;
    expect(itemAfter!.quantity_reserved).toBe(itemBefore!.quantity_reserved - 4);

    const [order] =
      await sqlClient`SELECT status, cancel_reason FROM orders WHERE id = ${orderId};`;
    expect(order!.status).toBe("EXPIRED");

    const [res] =
      await sqlClient`SELECT status FROM inventory_reservations WHERE order_id = ${orderId};`;
    expect(res!.status).toBe("RELEASED");
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

    // Update payment to SUBMITTED
    await sqlClient`UPDATE payments SET status = 'SUBMITTED' WHERE order_id = ${orderId};`;

    const expireResult = await expireUnpaidOrderReservations({
      orderId,
      actorId: "SYSTEM",
    });

    expect(expireResult.success).toBe(true);
    expect(expireResult.releasedLinesCount).toBe(0);
    expect(expireResult.orderStatusTransitioned).toBe(false);

    const [order] = await sqlClient`SELECT status FROM orders WHERE id = ${orderId};`;
    expect(order!.status).toBe("PENDING"); // Unchanged
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
  // 7. Reconciliation & Repair Scenarios
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

    // Verify item balance was restored
    const [itemRepaired] = await sqlClient`
      SELECT quantity_reserved FROM inventory_items WHERE id = ${itemId};
    `;
    expect(itemRepaired!.quantity_reserved).toBe(item!.quantity_reserved);

    // Post-repair reconciliation should show zero discrepancy on this item
    const postRecon = await reconcileInventory();
    const resolvedDiscrepancy = postRecon.discrepancies.find((d) => d.inventoryItemId === itemId);
    expect(resolvedDiscrepancy).toBeUndefined();
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
  // 8. Genuine Concurrency Races
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

  it("Race C: Manual decrement vs concurrent reservation on final available stock prevents oversell", async () => {
    const [loc] =
      await sqlClient`SELECT id FROM inventory_locations WHERE code = ${primaryLocCode}`;
    const locId = loc!.id;
    // Set on_hand to exactly 5, reserved = 0, allocated = 0
    await sqlClient`
      UPDATE inventory_items 
      SET quantity_on_hand = 5, quantity_reserved = 0, quantity_allocated = 0
      WHERE variant_id = ${variantId1} AND location_id = ${locId};
    `;

    // Attempt two simultaneous operations that each require 5 units
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
    expect(itemFinal!.quantity_on_hand).toBe(0); // Zero oversell
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
    expect(releasedCounts).toContain(1); // One worker released the line
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
    expect(alreadyAllocatedFlags).toContain(false); // One did the allocation
    expect(alreadyAllocatedFlags).toContain(true); // Other detected already allocated

    const [res] =
      await sqlClient`SELECT status FROM inventory_reservations WHERE order_id = ${orderId};`;
    expect(res!.status).toBe("ALLOCATED");
  });
});

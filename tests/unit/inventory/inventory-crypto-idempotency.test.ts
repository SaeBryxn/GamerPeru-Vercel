import { describe, expect, it } from "vitest";
import {
  computeInventoryAdjustmentFingerprint,
  computeInventoryAuthorityBindingDigest,
  computeInventoryReceivingFingerprint,
  computeInventoryRepairFingerprint,
  computeInventoryTransferFingerprint,
  createInventoryItemAdvisoryLockKey,
  createInventoryOrderAdvisoryLockKey,
} from "@/lib/inventory/crypto";

describe("GP-021 — Inventory Cryptography & Idempotency", () => {
  const secret = "test_inventory_secret_key_12345678901234567890123456789012";

  it("computes deterministic signed 32-bit integer advisory lock keys", () => {
    const key1 = createInventoryItemAdvisoryLockKey("018f0000-0000-7000-8000-000000000011");
    const key2 = createInventoryItemAdvisoryLockKey("018f0000-0000-7000-8000-000000000011");
    const keyDiff = createInventoryItemAdvisoryLockKey("018f0000-0000-7000-8000-000000000022");

    expect(typeof key1).toBe("number");
    expect(key1).toBe(key2);
    expect(key1).not.toBe(keyDiff);

    const orderLock1 = createInventoryOrderAdvisoryLockKey("018f0000-0000-7000-8000-000000000011");
    expect(typeof orderLock1).toBe("number");
  });

  it("computes distinct authority binding digests for different actors", () => {
    const auth1 = computeInventoryAuthorityBindingDigest("user-admin-1", secret);
    const auth2 = computeInventoryAuthorityBindingDigest("user-admin-1", secret);
    const authDiff = computeInventoryAuthorityBindingDigest("user-admin-2", secret);

    expect(auth1).toHaveLength(64);
    expect(auth1).toBe(auth2);
    expect(auth1).not.toBe(authDiff);
  });

  it("computes deterministic receiving request fingerprints", () => {
    const auth = computeInventoryAuthorityBindingDigest("user-1", secret);
    const fp1 = computeInventoryReceivingFingerprint({
      variantId: "018f0000-0000-7000-8000-000000000011",
      locationCode: "LOC-LIM-01",
      quantity: 50,
      referenceId: "PO-100",
      actorId: "user-1",
      authorityBindingDigest: auth,
    });
    const fp2 = computeInventoryReceivingFingerprint({
      variantId: "018f0000-0000-7000-8000-000000000011",
      locationCode: "LOC-LIM-01",
      quantity: 50,
      referenceId: "PO-100",
      actorId: "user-1",
      authorityBindingDigest: auth,
    });
    const fpChanged = computeInventoryReceivingFingerprint({
      variantId: "018f0000-0000-7000-8000-000000000011",
      locationCode: "LOC-LIM-01",
      quantity: 100, // changed
      referenceId: "PO-100",
      actorId: "user-1",
      authorityBindingDigest: auth,
    });

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fpChanged);
  });

  it("computes deterministic adjustment request fingerprints for DELTA and PHYSICAL_COUNT", () => {
    const auth = computeInventoryAuthorityBindingDigest("user-1", secret);
    const fpDelta1 = computeInventoryAdjustmentFingerprint({
      inventoryItemId: "018f0000-0000-7000-8000-000000000011",
      commandKind: "DELTA",
      deltaQuantity: 5,
      reason: "Conteo rápido",
      referenceId: "AUDIT-1",
      actorId: "user-1",
      authorityBindingDigest: auth,
    });
    const fpDelta2 = computeInventoryAdjustmentFingerprint({
      inventoryItemId: "018f0000-0000-7000-8000-000000000011",
      commandKind: "DELTA",
      deltaQuantity: 5,
      reason: "Conteo rápido",
      referenceId: "AUDIT-1",
      actorId: "user-1",
      authorityBindingDigest: auth,
    });
    const fpCounted = computeInventoryAdjustmentFingerprint({
      inventoryItemId: "018f0000-0000-7000-8000-000000000011",
      commandKind: "PHYSICAL_COUNT",
      countedQuantity: 25,
      reason: "Conteo cíclico mensual",
      referenceId: "AUDIT-1",
      actorId: "user-1",
      authorityBindingDigest: auth,
    });

    expect(fpDelta1).toBe(fpDelta2);
    expect(fpDelta1).not.toBe(fpCounted);
  });

  it("computes deterministic transfer and repair request fingerprints", () => {
    const auth = computeInventoryAuthorityBindingDigest("user-1", secret);
    const fpTransfer = computeInventoryTransferFingerprint({
      variantId: "018f0000-0000-7000-8000-000000000011",
      sourceLocationCode: "LOC-LIM-01",
      destinationLocationCode: "LOC-LIM-QUARANTINE",
      quantity: 2,
      reason: "Caja rota",
      referenceId: "TR-001",
      actorId: "user-1",
      authorityBindingDigest: auth,
    });
    expect(fpTransfer).toHaveLength(64);

    const fpRepair = computeInventoryRepairFingerprint({
      inventoryItemId: "018f0000-0000-7000-8000-000000000011",
      reason: "Corrección de drift de reservas",
      referenceId: "REPAIR-001",
      actorId: "user-1",
      authorityBindingDigest: auth,
    });
    expect(fpRepair).toHaveLength(64);
  });
});

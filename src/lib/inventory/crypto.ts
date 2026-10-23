import { createHash, createHmac } from "node:crypto";

/**
 * Gamer Perú — Inventory Engine Cryptography & Fingerprinting (GP-021)
 */

/**
 * Derives a deterministic 32-bit signed integer for PostgreSQL advisory locking
 * on an inventory item or order.
 */
export function createInventoryItemAdvisoryLockKey(inventoryItemId: string): number {
  const hash = createHash("sha256")
    .update(`INVENTORY_ITEM_LOCK:${inventoryItemId.trim().toLowerCase()}`)
    .digest();
  return hash.readInt32BE(0);
}

export function createInventoryOrderAdvisoryLockKey(orderId: string): number {
  const hash = createHash("sha256")
    .update(`ORDER_INVENTORY_LOCK:${orderId.trim().toLowerCase()}`)
    .digest();
  return hash.readInt32BE(0);
}

/**
 * Computes a server-derived cryptographic digest of the operational actor's authority.
 */
export function computeInventoryAuthorityBindingDigest(actorId: string, secret: string): string {
  return createHmac("sha256", secret).update(`ACTOR_AUTHORITY:${actorId.trim()}`).digest("hex");
}

/**
 * Computes request fingerprint (SHA-256) for receiving operations.
 */
export function computeInventoryReceivingFingerprint(params: {
  variantId: string;
  locationCode: string;
  quantity: number;
  referenceId: string;
  actorId: string;
  authorityBindingDigest: string;
}): string {
  const payload = [
    "RECEIVING",
    params.variantId.trim().toLowerCase(),
    params.locationCode.trim().toUpperCase(),
    String(params.quantity),
    params.referenceId.trim(),
    params.actorId.trim(),
    params.authorityBindingDigest.trim(),
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Computes request fingerprint (SHA-256) for manual adjustment operations.
 */
export function computeInventoryAdjustmentFingerprint(params: {
  expectedOnHand?: number;
  inventoryItemId?: string;
  variantId?: string;
  locationCode?: string;
  commandKind: string;
  deltaQuantity?: number;
  countedQuantity?: number;
  reason: string;
  referenceId: string;
  actorId: string;
  authorityBindingDigest: string;
}): string {
  const targetKey = params.inventoryItemId
    ? `ITEM:${params.inventoryItemId.trim().toLowerCase()}`
    : `VAR_LOC:${(params.variantId ?? "").trim().toLowerCase()}:${(params.locationCode ?? "").trim().toUpperCase()}`;

  const quantityKey =
    params.commandKind === "DELTA"
      ? `DELTA:${params.deltaQuantity}`
      : `COUNTED:${params.countedQuantity}`;

  const payload = [
    "ADJUSTMENT",
    params.commandKind,
    targetKey,
    quantityKey,
    params.reason.trim(),
    params.referenceId.trim(),
    params.actorId.trim(),
    params.authorityBindingDigest.trim(),
    ...(params.expectedOnHand === undefined ? [] : [`EXPECTED:${params.expectedOnHand}`]),
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Computes request fingerprint (SHA-256) for quarantine transfer operations.
 */
export function computeInventoryTransferFingerprint(params: {
  variantId: string;
  sourceLocationCode: string;
  destinationLocationCode: string;
  quantity: number;
  reason: string;
  referenceId: string;
  actorId: string;
  authorityBindingDigest: string;
}): string {
  const payload = [
    "TRANSFER",
    params.variantId.trim().toLowerCase(),
    params.sourceLocationCode.trim().toUpperCase(),
    params.destinationLocationCode.trim().toUpperCase(),
    String(params.quantity),
    params.reason.trim(),
    params.referenceId.trim(),
    params.actorId.trim(),
    params.authorityBindingDigest.trim(),
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Computes request fingerprint (SHA-256) for reconciliation repair operations.
 */
export function computeInventoryRepairFingerprint(params: {
  inventoryItemId: string;
  reason: string;
  referenceId: string;
  actorId: string;
  authorityBindingDigest: string;
}): string {
  const payload = [
    "REPAIR",
    params.inventoryItemId.trim().toLowerCase(),
    params.reason.trim(),
    params.referenceId.trim(),
    params.actorId.trim(),
    params.authorityBindingDigest.trim(),
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

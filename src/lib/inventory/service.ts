import "server-only";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  idempotencyKeys,
  inventoryItems,
  inventoryLedgerEntries,
  inventoryLocations,
  inventoryReservations,
  orders,
  payments,
  productVariants,
  type InventoryItem,
} from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { getInventoryConfig } from "./config";
import {
  computeInventoryAdjustmentFingerprint,
  computeInventoryAuthorityBindingDigest,
  computeInventoryReceivingFingerprint,
  computeInventoryRepairFingerprint,
  computeInventoryTransferFingerprint,
  createInventoryItemAdvisoryLockKey,
  createInventoryOrderAdvisoryLockKey,
} from "./crypto";
import type {
  AdjustInventoryInput,
  AdjustInventoryResult,
  AllocateOrderInventoryInput,
  AllocateOrderInventoryResult,
  ExpireUnpaidOrderReservationsInput,
  ExpireUnpaidOrderReservationsResult,
  GetVariantAvailabilityInput,
  InventoryBalances,
  InventoryItemDiscrepancy,
  ProcessExpirationBatchInput,
  ProcessExpirationBatchResult,
  ReacquireOrderInventoryInput,
  ReacquireOrderInventoryResult,
  ReceiveInventoryInput,
  ReceiveInventoryResult,
  ReconcileInventoryResult,
  RepairInventoryDiscrepancyInput,
  RepairInventoryDiscrepancyResult,
  TransferInventoryQuarantineInput,
  TransferInventoryQuarantineResult,
  VariantAvailabilityResult,
} from "./types";
import {
  validateLocationCode,
  validateNonNegativeIntegerQuantity,
  validateNonZeroIntegerDelta,
  validatePositiveIntegerQuantity,
  validateReason,
  validateReferenceId,
  validateUuid,
} from "./validation";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Test-only concurrency synchronization hook (strictly inert in production)
let testInventoryTransactionHook:
  ((stage: "before_lock" | "after_lock" | "before_commit") => Promise<void>) | null = null;

export function __setTestInventoryTransactionHook(
  hook: ((stage: "before_lock" | "after_lock" | "before_commit") => Promise<void>) | null
) {
  if (process.env.NODE_ENV === "production") return;
  testInventoryTransactionHook = hook;
}

function computeBalances(item: {
  quantityOnHand: number;
  quantityReserved: number;
  quantityAllocated: number;
  reorderPoint: number;
}): InventoryBalances {
  return {
    quantityOnHand: item.quantityOnHand,
    quantityReserved: item.quantityReserved,
    quantityAllocated: item.quantityAllocated,
    availableToSell: item.quantityOnHand - item.quantityReserved - item.quantityAllocated,
    reorderPoint: item.reorderPoint,
  };
}

// ---------------------------------------------------------------------------
// 1. Receiving Service
// ---------------------------------------------------------------------------

export async function receiveInventory(
  input: ReceiveInventoryInput
): Promise<ReceiveInventoryResult> {
  if (!input.attemptId || input.attemptId.length < 8) {
    return { success: false, code: "INVALID_INPUT", error: "Identificador de intento inválido." };
  }

  const variantValidation = validateUuid(input.variantId, "variantId");
  if (!variantValidation.valid || !variantValidation.normalized) {
    return { success: false, code: "INVALID_INPUT", error: variantValidation.error };
  }
  const variantId = variantValidation.normalized;

  const qtyValidation = validatePositiveIntegerQuantity(input.quantity, "quantity");
  if (!qtyValidation.valid || !qtyValidation.normalized) {
    return { success: false, code: "INVALID_INPUT", error: qtyValidation.error };
  }
  const quantity = qtyValidation.normalized;

  const refValidation = validateReferenceId(input.referenceId);
  if (!refValidation.valid || !refValidation.normalized) {
    return { success: false, code: "INVALID_INPUT", error: refValidation.error };
  }
  const referenceId = refValidation.normalized;

  const actorValidation = validateReferenceId(input.actorId);
  if (!actorValidation.valid || !actorValidation.normalized) {
    return { success: false, code: "INVALID_INPUT", error: "Identificador de actor inválido." };
  }
  const actorId = actorValidation.normalized;

  const configResult = getInventoryConfig();
  if (!configResult.valid || !configResult.config) {
    return { success: false, code: "SYSTEM_ERROR", error: "Error de configuración de inventario." };
  }
  const { primaryLocationCode, idempotencyTtlMinutes, hmacSecret } = configResult.config;

  const locationCode = (input.locationCode ?? primaryLocationCode).trim().toUpperCase();
  const locCodeValidation = validateLocationCode(locationCode);
  if (!locCodeValidation.valid || !locCodeValidation.normalized) {
    return { success: false, code: "INVALID_INPUT", error: locCodeValidation.error };
  }

  const namespacedKey = `INVENTORY_RECEIVING:${input.attemptId}`;
  const authorityBindingDigest = computeInventoryAuthorityBindingDigest(actorId, hmacSecret);
  const requestFingerprint = computeInventoryReceivingFingerprint({
    variantId,
    locationCode,
    quantity,
    referenceId,
    actorId,
    authorityBindingDigest,
  });

  // Fast Pre-Transaction Committed Idempotency Check
  const [existingKey] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
    .limit(1);

  if (existingKey) {
    if (existingKey.authorityBindingDigest !== authorityBindingDigest) {
      return { success: false, code: "UNAUTHORIZED", error: "No autorizado." };
    }
    if (existingKey.requestFingerprint !== requestFingerprint) {
      return {
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        error: "Conflicto de idempotencia con parámetros distintos.",
      };
    }
    const payload = existingKey.responsePayload as ReceiveInventoryResult;
    return { ...payload, replayed: true };
  }

  const advisoryKey = createInventoryItemAdvisoryLockKey(namespacedKey);

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryKey})`);

    const [lockedKey] = await tx
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
      .for("update")
      .limit(1);

    if (lockedKey) {
      if (lockedKey.authorityBindingDigest !== authorityBindingDigest) {
        return { success: false, code: "UNAUTHORIZED", error: "No autorizado." };
      }
      if (lockedKey.requestFingerprint !== requestFingerprint) {
        return {
          success: false,
          code: "IDEMPOTENCY_CONFLICT",
          error: "Conflicto de idempotencia.",
        };
      }
      const payload = lockedKey.responsePayload as ReceiveInventoryResult;
      return { ...payload, replayed: true };
    }

    if (testInventoryTransactionHook) {
      await testInventoryTransactionHook("before_lock");
    }

    const [location] = await tx
      .select()
      .from(inventoryLocations)
      .where(eq(inventoryLocations.code, locationCode))
      .limit(1);

    if (!location) {
      return {
        success: false,
        code: "LOCATION_NOT_FOUND",
        error: `Ubicación '${locationCode}' no encontrada.`,
      };
    }
    if (!location.isActive) {
      return {
        success: false,
        code: "LOCATION_INACTIVE",
        error: `Ubicación '${locationCode}' no está activa para recepción.`,
      };
    }

    const [variant] = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);

    if (!variant) {
      return {
        success: false,
        code: "VARIANT_NOT_FOUND",
        error: "Variante de producto no encontrada.",
      };
    }

    let [item] = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.variantId, variantId), eq(inventoryItems.locationId, location.id))
      )
      .for("update")
      .limit(1);

    if (!item) {
      const newItemId = generateUuidV7();
      await tx
        .insert(inventoryItems)
        .values({
          id: newItemId,
          variantId,
          locationId: location.id,
          quantityOnHand: 0,
          quantityReserved: 0,
          quantityAllocated: 0,
          reorderPoint: 0,
        })
        .onConflictDoNothing({
          target: [inventoryItems.variantId, inventoryItems.locationId],
        });

      [item] = await tx
        .select()
        .from(inventoryItems)
        .where(
          and(eq(inventoryItems.variantId, variantId), eq(inventoryItems.locationId, location.id))
        )
        .for("update")
        .limit(1);
    }

    if (!item) {
      return {
        success: false,
        code: "ITEM_CREATION_FAILED",
        error: "No se pudo inicializar el registro de inventario.",
      };
    }

    if (testInventoryTransactionHook) {
      await testInventoryTransactionHook("after_lock");
    }

    const newOnHand = item.quantityOnHand + quantity;
    await tx
      .update(inventoryItems)
      .set({
        quantityOnHand: newOnHand,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, item.id));

    const updatedItem = {
      ...item,
      quantityOnHand: newOnHand,
    };
    const resultingBalances = computeBalances(updatedItem);

    const ledgerEntryId = generateUuidV7();
    await tx.insert(inventoryLedgerEntries).values({
      id: ledgerEntryId,
      inventoryItemId: item.id,
      movementType: "RECEIVING",
      onHandDelta: quantity,
      reservedDelta: 0,
      allocatedDelta: 0,
      quantityOnHandAfter: resultingBalances.quantityOnHand,
      quantityReservedAfter: resultingBalances.quantityReserved,
      quantityAllocatedAfter: resultingBalances.quantityAllocated,
      referenceType: "PURCHASE_ORDER",
      referenceId,
      actorId,
      notes: input.notes ?? null,
    });

    await tx.insert(auditEvents).values({
      id: generateUuidV7(),
      actorType: "ADMIN",
      actorId,
      action: "INVENTORY_RECEIVING",
      targetType: "INVENTORY_ITEM",
      targetId: item.id,
      metadata: {
        variantId,
        locationId: location.id,
        locationCode,
        quantityReceived: quantity,
        referenceId,
        resultingBalances,
      },
    });

    const resultPayload: ReceiveInventoryResult = {
      success: true,
      replayed: false,
      inventoryItemId: item.id,
      variantId,
      locationId: location.id,
      locationCode,
      quantityReceived: quantity,
      resultingBalances,
      ledgerEntryId,
    };

    const expiresAt = new Date(Date.now() + idempotencyTtlMinutes * 60 * 1000);
    await tx.insert(idempotencyKeys).values({
      id: generateUuidV7(),
      idempotencyKey: namespacedKey,
      operationType: "INVENTORY_MUTATION",
      authorityBindingDigest,
      requestFingerprint,
      responsePayload: resultPayload,
      expiresAt,
    });

    if (testInventoryTransactionHook) {
      await testInventoryTransactionHook("before_commit");
    }

    return resultPayload;
  });
}

// ---------------------------------------------------------------------------
// 2. Manual Adjustment Service
// ---------------------------------------------------------------------------

export async function adjustInventory(input: AdjustInventoryInput): Promise<AdjustInventoryResult> {
  if (!input.attemptId || input.attemptId.length < 8) {
    return { success: false, code: "INVALID_INPUT", error: "Identificador de intento inválido." };
  }

  const reasonValidation = validateReason(input.reason);
  if (!reasonValidation.valid || !reasonValidation.normalized) {
    return { success: false, code: "INVALID_INPUT", error: reasonValidation.error };
  }
  const reason = reasonValidation.normalized;

  const refValidation = validateReferenceId(input.referenceId);
  if (!refValidation.valid || !refValidation.normalized) {
    return { success: false, code: "INVALID_INPUT", error: refValidation.error };
  }
  const referenceId = refValidation.normalized;

  const actorValidation = validateReferenceId(input.actorId);
  if (!actorValidation.valid || !actorValidation.normalized) {
    return { success: false, code: "INVALID_INPUT", error: "Identificador de actor inválido." };
  }
  const actorId = actorValidation.normalized;

  let deltaQuantity: number | undefined;
  let countedQuantity: number | undefined;

  if (input.commandKind === "DELTA") {
    const deltaVal = validateNonZeroIntegerDelta(input.deltaQuantity, "deltaQuantity");
    if (!deltaVal.valid || deltaVal.normalized === undefined) {
      return { success: false, code: "INVALID_INPUT", error: deltaVal.error };
    }
    deltaQuantity = deltaVal.normalized;
  } else if (input.commandKind === "PHYSICAL_COUNT") {
    const countVal = validateNonNegativeIntegerQuantity(input.countedQuantity, "countedQuantity");
    if (!countVal.valid || countVal.normalized === undefined) {
      return { success: false, code: "INVALID_INPUT", error: countVal.error };
    }
    countedQuantity = countVal.normalized;
  } else {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: "Comando de ajuste desconocido (debe ser DELTA o PHYSICAL_COUNT).",
    };
  }

  const configResult = getInventoryConfig();
  if (!configResult.valid || !configResult.config) {
    return { success: false, code: "SYSTEM_ERROR", error: "Error de configuración de inventario." };
  }
  const { idempotencyTtlMinutes, hmacSecret } = configResult.config;

  const namespacedKey = `INVENTORY_ADJUSTMENT:${input.attemptId}`;
  const authorityBindingDigest = computeInventoryAuthorityBindingDigest(actorId, hmacSecret);
  const requestFingerprint = computeInventoryAdjustmentFingerprint({
    inventoryItemId: input.inventoryItemId,
    variantId: input.variantId,
    locationCode: input.locationCode,
    commandKind: input.commandKind,
    deltaQuantity,
    countedQuantity,
    reason,
    referenceId,
    actorId,
    authorityBindingDigest,
  });

  const [existingKey] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
    .limit(1);

  if (existingKey) {
    if (existingKey.authorityBindingDigest !== authorityBindingDigest) {
      return { success: false, code: "UNAUTHORIZED", error: "No autorizado." };
    }
    if (existingKey.requestFingerprint !== requestFingerprint) {
      return {
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        error: "Conflicto de idempotencia con parámetros distintos.",
      };
    }
    const payload = existingKey.responsePayload as AdjustInventoryResult;
    return { ...payload, replayed: true };
  }

  const advisoryKey = createInventoryItemAdvisoryLockKey(namespacedKey);

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryKey})`);

    const [lockedKey] = await tx
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
      .for("update")
      .limit(1);

    if (lockedKey) {
      if (lockedKey.authorityBindingDigest !== authorityBindingDigest) {
        return { success: false, code: "UNAUTHORIZED", error: "No autorizado." };
      }
      if (lockedKey.requestFingerprint !== requestFingerprint) {
        return {
          success: false,
          code: "IDEMPOTENCY_CONFLICT",
          error: "Conflicto de idempotencia.",
        };
      }
      const payload = lockedKey.responsePayload as AdjustInventoryResult;
      return { ...payload, replayed: true };
    }

    if (testInventoryTransactionHook) {
      await testInventoryTransactionHook("before_lock");
    }

    let item: InventoryItem | undefined;
    if (input.inventoryItemId) {
      const itemVal = validateUuid(input.inventoryItemId, "inventoryItemId");
      if (!itemVal.valid || !itemVal.normalized) {
        return { success: false, code: "INVALID_INPUT", error: itemVal.error };
      }
      [item] = await tx
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, itemVal.normalized))
        .for("update")
        .limit(1);
    } else if (input.variantId) {
      const varVal = validateUuid(input.variantId, "variantId");
      if (!varVal.valid || !varVal.normalized) {
        return { success: false, code: "INVALID_INPUT", error: varVal.error };
      }
      const locCode = (input.locationCode ?? "LOC-LIM-01").trim().toUpperCase();
      const [location] = await tx
        .select()
        .from(inventoryLocations)
        .where(eq(inventoryLocations.code, locCode))
        .limit(1);

      if (!location) {
        return {
          success: false,
          code: "LOCATION_NOT_FOUND",
          error: `Ubicación '${locCode}' no encontrada.`,
        };
      }

      [item] = await tx
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.variantId, varVal.normalized),
            eq(inventoryItems.locationId, location.id)
          )
        )
        .for("update")
        .limit(1);
    }

    if (!item) {
      return {
        success: false,
        code: "INVENTORY_ITEM_NOT_FOUND",
        error: "Registro de inventario no encontrado.",
      };
    }

    if (testInventoryTransactionHook) {
      await testInventoryTransactionHook("after_lock");
    }

    let appliedDelta = 0;
    if (input.commandKind === "DELTA") {
      appliedDelta = deltaQuantity!;
    } else {
      appliedDelta = countedQuantity! - item.quantityOnHand;
    }

    if (appliedDelta === 0) {
      return {
        success: true,
        replayed: false,
        inventoryItemId: item.id,
        appliedDelta: 0,
        resultingBalances: computeBalances(item),
      };
    }

    const newOnHand = item.quantityOnHand + appliedDelta;

    if (newOnHand < 0) {
      return {
        success: false,
        code: "NEGATIVE_ON_HAND_DISALLOWED",
        error: `El ajuste resultaría en un stock físico negativo (${newOnHand}).`,
      };
    }

    const committedTotal = item.quantityReserved + item.quantityAllocated;
    if (newOnHand < committedTotal) {
      return {
        success: false,
        code: "INSUFFICIENT_UNCOMMITTED_STOCK",
        error: `El ajuste (${newOnHand}) violaría las reservas y asignaciones comprometidas (${committedTotal}).`,
      };
    }

    await tx
      .update(inventoryItems)
      .set({
        quantityOnHand: newOnHand,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, item.id));

    const updatedItem = {
      ...item,
      quantityOnHand: newOnHand,
    };
    const resultingBalances = computeBalances(updatedItem);

    const ledgerEntryId = generateUuidV7();
    await tx.insert(inventoryLedgerEntries).values({
      id: ledgerEntryId,
      inventoryItemId: item.id,
      movementType: "MANUAL_ADJUSTMENT",
      onHandDelta: appliedDelta,
      reservedDelta: 0,
      allocatedDelta: 0,
      quantityOnHandAfter: resultingBalances.quantityOnHand,
      quantityReservedAfter: resultingBalances.quantityReserved,
      quantityAllocatedAfter: resultingBalances.quantityAllocated,
      referenceType: "MANUAL_AUDIT",
      referenceId,
      actorId,
      notes: reason,
    });

    await tx.insert(auditEvents).values({
      id: generateUuidV7(),
      actorType: "ADMIN",
      actorId,
      action: "INVENTORY_MANUAL_ADJUSTMENT",
      targetType: "INVENTORY_ITEM",
      targetId: item.id,
      metadata: {
        commandKind: input.commandKind,
        appliedDelta,
        reason,
        referenceId,
        resultingBalances,
      },
    });

    const resultPayload: AdjustInventoryResult = {
      success: true,
      replayed: false,
      inventoryItemId: item.id,
      appliedDelta,
      resultingBalances,
      ledgerEntryId,
    };

    const expiresAt = new Date(Date.now() + idempotencyTtlMinutes * 60 * 1000);
    await tx.insert(idempotencyKeys).values({
      id: generateUuidV7(),
      idempotencyKey: namespacedKey,
      operationType: "INVENTORY_MUTATION",
      authorityBindingDigest,
      requestFingerprint,
      responsePayload: resultPayload,
      expiresAt,
    });

    if (testInventoryTransactionHook) {
      await testInventoryTransactionHook("before_commit");
    }

    return resultPayload;
  });
}

// ---------------------------------------------------------------------------
// 3. Quarantine / Damaged Transfer Service
// ---------------------------------------------------------------------------

export async function transferInventoryQuarantine(
  input: TransferInventoryQuarantineInput
): Promise<TransferInventoryQuarantineResult> {
  if (!input.attemptId || input.attemptId.length < 8) {
    return { success: false, code: "INVALID_INPUT", error: "Identificador de intento inválido." };
  }

  const varVal = validateUuid(input.variantId, "variantId");
  if (!varVal.valid || !varVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: varVal.error };
  }
  const variantId = varVal.normalized;

  const qtyVal = validatePositiveIntegerQuantity(input.quantity, "quantity");
  if (!qtyVal.valid || !qtyVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: qtyVal.error };
  }
  const quantity = qtyVal.normalized;

  const reasonVal = validateReason(input.reason);
  if (!reasonVal.valid || !reasonVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: reasonVal.error };
  }
  const reason = reasonVal.normalized;

  const refVal = validateReferenceId(input.referenceId);
  if (!refVal.valid || !refVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: refVal.error };
  }
  const referenceId = refVal.normalized;

  const actorVal = validateReferenceId(input.actorId);
  if (!actorVal.valid || !actorVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: "Identificador de actor inválido." };
  }
  const actorId = actorVal.normalized;

  const configResult = getInventoryConfig();
  if (!configResult.valid || !configResult.config) {
    return { success: false, code: "SYSTEM_ERROR", error: "Error de configuración de inventario." };
  }
  const { primaryLocationCode, idempotencyTtlMinutes, hmacSecret } = configResult.config;

  const sourceLocationCode = (input.sourceLocationCode ?? primaryLocationCode).trim().toUpperCase();
  const destLocationCode = input.destinationLocationCode.trim().toUpperCase();

  if (sourceLocationCode === destLocationCode) {
    return {
      success: false,
      code: "INVALID_TRANSFER_TARGET",
      error: "La ubicación origen y destino de transferencia deben ser distintas.",
    };
  }

  const namespacedKey = `INVENTORY_TRANSFER:${input.attemptId}`;
  const authorityBindingDigest = computeInventoryAuthorityBindingDigest(actorId, hmacSecret);
  const requestFingerprint = computeInventoryTransferFingerprint({
    variantId,
    sourceLocationCode,
    destinationLocationCode: destLocationCode,
    quantity,
    reason,
    referenceId,
    actorId,
    authorityBindingDigest,
  });

  const [existingKey] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
    .limit(1);

  if (existingKey) {
    if (existingKey.authorityBindingDigest !== authorityBindingDigest) {
      return { success: false, code: "UNAUTHORIZED", error: "No autorizado." };
    }
    if (existingKey.requestFingerprint !== requestFingerprint) {
      return {
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        error: "Conflicto de idempotencia con parámetros distintos.",
      };
    }
    const payload = existingKey.responsePayload as TransferInventoryQuarantineResult;
    return { ...payload, replayed: true };
  }

  const advisoryKey = createInventoryItemAdvisoryLockKey(namespacedKey);

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryKey})`);

    const [lockedKey] = await tx
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
      .for("update")
      .limit(1);

    if (lockedKey) {
      if (lockedKey.authorityBindingDigest !== authorityBindingDigest) {
        return { success: false, code: "UNAUTHORIZED", error: "No autorizado." };
      }
      if (lockedKey.requestFingerprint !== requestFingerprint) {
        return {
          success: false,
          code: "IDEMPOTENCY_CONFLICT",
          error: "Conflicto de idempotencia.",
        };
      }
      const payload = lockedKey.responsePayload as TransferInventoryQuarantineResult;
      return { ...payload, replayed: true };
    }

    if (testInventoryTransactionHook) {
      await testInventoryTransactionHook("before_lock");
    }

    const [sourceLoc] = await tx
      .select()
      .from(inventoryLocations)
      .where(eq(inventoryLocations.code, sourceLocationCode))
      .limit(1);

    if (!sourceLoc) {
      return {
        success: false,
        code: "SOURCE_LOCATION_NOT_FOUND",
        error: `Ubicación origen '${sourceLocationCode}' no encontrada.`,
      };
    }

    const [destLoc] = await tx
      .select()
      .from(inventoryLocations)
      .where(eq(inventoryLocations.code, destLocationCode))
      .limit(1);

    if (!destLoc) {
      return {
        success: false,
        code: "DESTINATION_LOCATION_NOT_FOUND",
        error: `Ubicación destino '${destLocationCode}' no encontrada.`,
      };
    }

    let [destItem] = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.variantId, variantId), eq(inventoryItems.locationId, destLoc.id))
      )
      .limit(1);

    if (!destItem) {
      const newDestItemId = generateUuidV7();
      await tx
        .insert(inventoryItems)
        .values({
          id: newDestItemId,
          variantId,
          locationId: destLoc.id,
          quantityOnHand: 0,
          quantityReserved: 0,
          quantityAllocated: 0,
          reorderPoint: 0,
        })
        .onConflictDoNothing({
          target: [inventoryItems.variantId, inventoryItems.locationId],
        });
    }

    const lockedItems = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.variantId, variantId),
          inArray(inventoryItems.locationId, [sourceLoc.id, destLoc.id])
        )
      )
      .orderBy(asc(inventoryItems.id))
      .for("update");

    const lockedSourceItem = lockedItems.find((i) => i.locationId === sourceLoc.id);
    const lockedDestItem = lockedItems.find((i) => i.locationId === destLoc.id);

    if (!lockedSourceItem || !lockedDestItem) {
      return {
        success: false,
        code: "INVENTORY_ITEMS_UNRESOLVED",
        error: "No se pudieron resolver los registros de inventario para la transferencia.",
      };
    }

    if (testInventoryTransactionHook) {
      await testInventoryTransactionHook("after_lock");
    }

    const sourceCommitted = lockedSourceItem.quantityReserved + lockedSourceItem.quantityAllocated;
    if (lockedSourceItem.quantityOnHand - quantity < sourceCommitted) {
      return {
        success: false,
        code: "INSUFFICIENT_STOCK_FOR_TRANSFER",
        error: `Stock insuficiente en origen (${lockedSourceItem.quantityOnHand} disponible para transferir ${quantity}, comprometido: ${sourceCommitted}).`,
      };
    }

    const newSourceOnHand = lockedSourceItem.quantityOnHand - quantity;
    const newDestOnHand = lockedDestItem.quantityOnHand + quantity;

    await tx
      .update(inventoryItems)
      .set({ quantityOnHand: newSourceOnHand, updatedAt: new Date() })
      .where(eq(inventoryItems.id, lockedSourceItem.id));

    await tx
      .update(inventoryItems)
      .set({ quantityOnHand: newDestOnHand, updatedAt: new Date() })
      .where(eq(inventoryItems.id, lockedDestItem.id));

    const sourceBalancesAfter = computeBalances({
      ...lockedSourceItem,
      quantityOnHand: newSourceOnHand,
    });
    const destinationBalancesAfter = computeBalances({
      ...lockedDestItem,
      quantityOnHand: newDestOnHand,
    });

    const sourceLedgerEntryId = generateUuidV7();
    const destinationLedgerEntryId = generateUuidV7();

    await tx.insert(inventoryLedgerEntries).values([
      {
        id: sourceLedgerEntryId,
        inventoryItemId: lockedSourceItem.id,
        movementType: "MANUAL_ADJUSTMENT",
        onHandDelta: -quantity,
        reservedDelta: 0,
        allocatedDelta: 0,
        quantityOnHandAfter: sourceBalancesAfter.quantityOnHand,
        quantityReservedAfter: sourceBalancesAfter.quantityReserved,
        quantityAllocatedAfter: sourceBalancesAfter.quantityAllocated,
        referenceType: "MANUAL_AUDIT",
        referenceId,
        actorId,
        notes: `[QUARANTINE_TRANSFER_OUT] -> ${destLoc.code}: ${reason}`,
      },
      {
        id: destinationLedgerEntryId,
        inventoryItemId: lockedDestItem.id,
        movementType: "MANUAL_ADJUSTMENT",
        onHandDelta: quantity,
        reservedDelta: 0,
        allocatedDelta: 0,
        quantityOnHandAfter: destinationBalancesAfter.quantityOnHand,
        quantityReservedAfter: destinationBalancesAfter.quantityReserved,
        quantityAllocatedAfter: destinationBalancesAfter.quantityAllocated,
        referenceType: "MANUAL_AUDIT",
        referenceId,
        actorId,
        notes: `[QUARANTINE_TRANSFER_IN] <- ${sourceLoc.code}: ${reason}`,
      },
    ]);

    await tx.insert(auditEvents).values({
      id: generateUuidV7(),
      actorType: "ADMIN",
      actorId,
      action: "INVENTORY_QUARANTINE_TRANSFER",
      targetType: "INVENTORY_ITEM",
      targetId: lockedSourceItem.id,
      metadata: {
        variantId,
        sourceLocationId: sourceLoc.id,
        sourceLocationCode: sourceLoc.code,
        destinationLocationId: destLoc.id,
        destinationLocationCode: destLoc.code,
        quantityTransferred: quantity,
        reason,
        referenceId,
        sourceBalancesAfter,
        destinationBalancesAfter,
      },
    });

    const resultPayload: TransferInventoryQuarantineResult = {
      success: true,
      replayed: false,
      variantId,
      sourceLocationId: sourceLoc.id,
      destinationLocationId: destLoc.id,
      sourceInventoryItemId: lockedSourceItem.id,
      destinationInventoryItemId: lockedDestItem.id,
      quantityTransferred: quantity,
      sourceBalancesAfter,
      destinationBalancesAfter,
      sourceLedgerEntryId,
      destinationLedgerEntryId,
    };

    const expiresAt = new Date(Date.now() + idempotencyTtlMinutes * 60 * 1000);
    await tx.insert(idempotencyKeys).values({
      id: generateUuidV7(),
      idempotencyKey: namespacedKey,
      operationType: "INVENTORY_MUTATION",
      authorityBindingDigest,
      requestFingerprint,
      responsePayload: resultPayload,
      expiresAt,
    });

    if (testInventoryTransactionHook) {
      await testInventoryTransactionHook("before_commit");
    }

    return resultPayload;
  });
}

// ---------------------------------------------------------------------------
// 4. Normal Allocation Consequence Seam (Composable with Tx)
// ---------------------------------------------------------------------------

export async function allocateOrderInventoryAfterPaymentApproval(
  tx: DbTransaction,
  input: AllocateOrderInventoryInput
): Promise<AllocateOrderInventoryResult> {
  const orderIdVal = validateUuid(input.orderId, "orderId");
  if (!orderIdVal.valid || !orderIdVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: orderIdVal.error };
  }
  const orderId = orderIdVal.normalized;

  const reservations = await tx
    .select()
    .from(inventoryReservations)
    .where(eq(inventoryReservations.orderId, orderId))
    .orderBy(asc(inventoryReservations.id))
    .for("update");

  if (!reservations || reservations.length === 0) {
    return {
      success: false,
      code: "RESERVATIONS_NOT_FOUND",
      error: "No se encontraron reservas de inventario para el pedido.",
    };
  }

  const allAllocated = reservations.every(
    (r: typeof inventoryReservations.$inferSelect) => r.status === "ALLOCATED"
  );
  if (allAllocated) {
    return {
      success: true,
      alreadyAllocated: true,
      orderId,
      allocatedLinesCount: reservations.length,
      totalQuantityAllocated: reservations.reduce(
        (acc: number, r: typeof inventoryReservations.$inferSelect) => acc + r.quantity,
        0
      ),
    };
  }

  const hasActive = reservations.some(
    (r: typeof inventoryReservations.$inferSelect) => r.status === "ACTIVE"
  );
  if (hasActive) {
    return {
      success: false,
      code: "ACTIVE_RESERVATION_CANNOT_BE_ALLOCATED",
      error:
        "No se puede asignar stock directamente desde reservas en estado ACTIVE. Requiere revisión previa (VERIFICATION_HOLD).",
    };
  }

  const hasInvalidStatus = reservations.some(
    (r: typeof inventoryReservations.$inferSelect) =>
      r.status !== "VERIFICATION_HOLD" && r.status !== "ALLOCATED"
  );
  if (hasInvalidStatus) {
    return {
      success: false,
      code: "INVALID_RESERVATION_STATE_FOR_ALLOCATION",
      error:
        "El pedido contiene reservas en estado no elegible para asignación normal (por ejemplo, RELEASED o CONSUMED).",
    };
  }

  const linesToAllocate = reservations.filter(
    (r: typeof inventoryReservations.$inferSelect) => r.status === "VERIFICATION_HOLD"
  );
  const itemHoldDeltas = new Map<string, number>();
  for (const line of linesToAllocate) {
    const current = itemHoldDeltas.get(line.inventoryItemId) ?? 0;
    itemHoldDeltas.set(line.inventoryItemId, current + line.quantity);
  }

  const itemIds = Array.from(itemHoldDeltas.keys()).sort();

  const lockedItems = await tx
    .select()
    .from(inventoryItems)
    .where(inArray(inventoryItems.id, itemIds))
    .orderBy(asc(inventoryItems.id))
    .for("update");

  if (lockedItems.length !== itemIds.length) {
    return {
      success: false,
      code: "INVENTORY_ITEMS_UNRESOLVED",
      error: "No se pudieron bloquear todos los items de inventario asociados.",
    };
  }

  const itemMap = new Map<string, InventoryItem>();
  for (const it of lockedItems) {
    itemMap.set(it.id, it);
  }

  for (const [itemId, neededQty] of itemHoldDeltas.entries()) {
    const it = itemMap.get(itemId)!;
    if (it.quantityReserved < neededQty) {
      return {
        success: false,
        code: "INSUFFICIENT_RESERVED_BALANCE",
        error: `Saldo reservado insuficiente para el item ${itemId} (disponible reservado: ${it.quantityReserved}, requerido: ${neededQty}).`,
      };
    }
  }

  const ledgerEntryIds: string[] = [];

  for (const line of linesToAllocate) {
    const it = itemMap.get(line.inventoryItemId)!;
    const newReserved = it.quantityReserved - line.quantity;
    const newAllocated = it.quantityAllocated + line.quantity;

    await tx
      .update(inventoryItems)
      .set({
        quantityReserved: newReserved,
        quantityAllocated: newAllocated,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, it.id));

    it.quantityReserved = newReserved;
    it.quantityAllocated = newAllocated;

    await tx
      .update(inventoryReservations)
      .set({
        status: "ALLOCATED",
        updatedAt: new Date(),
      })
      .where(eq(inventoryReservations.id, line.id));

    const ledgerEntryId = generateUuidV7();
    ledgerEntryIds.push(ledgerEntryId);

    const resultingBalances = computeBalances(it);

    await tx.insert(inventoryLedgerEntries).values({
      id: ledgerEntryId,
      inventoryItemId: it.id,
      movementType: "ALLOCATION_CONFIRMED",
      onHandDelta: 0,
      reservedDelta: -line.quantity,
      allocatedDelta: line.quantity,
      quantityOnHandAfter: resultingBalances.quantityOnHand,
      quantityReservedAfter: resultingBalances.quantityReserved,
      quantityAllocatedAfter: resultingBalances.quantityAllocated,
      referenceType: "ORDER",
      referenceId: input.referenceId ?? orderId,
      actorId: input.actorId,
      notes: input.notes ?? "Asignación confirmada tras aprobación de pago.",
    });
  }

  return {
    success: true,
    alreadyAllocated: false,
    orderId,
    allocatedLinesCount: linesToAllocate.length,
    totalQuantityAllocated: linesToAllocate.reduce(
      (acc: number, r: typeof inventoryReservations.$inferSelect) => acc + r.quantity,
      0
    ),
    ledgerEntryIds,
  };
}

// ---------------------------------------------------------------------------
// 5. Late-Payment Reacquisition Seam (Composable with Tx)
// ---------------------------------------------------------------------------

export async function reacquireOrderInventoryAfterLatePayment(
  tx: DbTransaction,
  input: ReacquireOrderInventoryInput
): Promise<ReacquireOrderInventoryResult> {
  const orderIdVal = validateUuid(input.orderId, "orderId");
  if (!orderIdVal.valid || !orderIdVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: orderIdVal.error };
  }
  const orderId = orderIdVal.normalized;

  const reservations = await tx
    .select()
    .from(inventoryReservations)
    .where(eq(inventoryReservations.orderId, orderId))
    .orderBy(asc(inventoryReservations.id))
    .for("update");

  if (!reservations || reservations.length === 0) {
    return {
      success: false,
      code: "RESERVATIONS_NOT_FOUND",
      error: "No se encontraron reservas de inventario para el pedido.",
    };
  }

  const allAllocated = reservations.every(
    (r: typeof inventoryReservations.$inferSelect) => r.status === "ALLOCATED"
  );
  if (allAllocated) {
    return {
      success: true,
      alreadyAllocated: true,
      orderId,
      reacquiredLinesCount: reservations.length,
      totalQuantityAllocated: reservations.reduce(
        (acc: number, r: typeof inventoryReservations.$inferSelect) => acc + r.quantity,
        0
      ),
    };
  }

  const invalidLines = reservations.filter(
    (r: typeof inventoryReservations.$inferSelect) =>
      r.status !== "RELEASED" && r.status !== "ALLOCATED"
  );
  if (invalidLines.length > 0) {
    return {
      success: false,
      code: "INVALID_STATE_FOR_REACQUISITION",
      error:
        "La reasignación de pago tardío solo puede aplicarse a reservas previamente liberadas (RELEASED).",
    };
  }

  const linesToReacquire = reservations.filter(
    (r: typeof inventoryReservations.$inferSelect) => r.status === "RELEASED"
  );
  const itemQtyMap = new Map<string, number>();
  for (const line of linesToReacquire) {
    const current = itemQtyMap.get(line.inventoryItemId) ?? 0;
    itemQtyMap.set(line.inventoryItemId, current + line.quantity);
  }

  const itemIds = Array.from(itemQtyMap.keys()).sort();

  const lockedItems = await tx
    .select()
    .from(inventoryItems)
    .where(inArray(inventoryItems.id, itemIds))
    .orderBy(asc(inventoryItems.id))
    .for("update");

  if (lockedItems.length !== itemIds.length) {
    return {
      success: false,
      code: "INVENTORY_ITEMS_UNRESOLVED",
      error: "No se pudieron bloquear los items de inventario requeridos para reasignación.",
    };
  }

  const itemMap = new Map<string, InventoryItem>();
  for (const it of lockedItems) {
    itemMap.set(it.id, it);
  }

  for (const [itemId, neededQty] of itemQtyMap.entries()) {
    const it = itemMap.get(itemId)!;
    const ats = it.quantityOnHand - it.quantityReserved - it.quantityAllocated;
    if (ats < neededQty) {
      return {
        success: false,
        code: "INSUFFICIENT_STOCK_FOR_REACQUISITION",
        error: `Stock insuficiente para reasignar el item ${itemId} (disponible para venta: ${ats}, requerido: ${neededQty}).`,
      };
    }
  }

  const ledgerEntryIds: string[] = [];

  for (const line of linesToReacquire) {
    const it = itemMap.get(line.inventoryItemId)!;
    const newAllocated = it.quantityAllocated + line.quantity;

    await tx
      .update(inventoryItems)
      .set({
        quantityAllocated: newAllocated,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, it.id));

    it.quantityAllocated = newAllocated;

    const newResId = generateUuidV7();
    const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await tx.insert(inventoryReservations).values({
      id: newResId,
      inventoryItemId: it.id,
      orderId,
      orderItemId: line.orderItemId,
      quantity: line.quantity,
      status: "ALLOCATED",
      expiresAt: oneYearLater,
    });

    const ledgerEntryId = generateUuidV7();
    ledgerEntryIds.push(ledgerEntryId);

    const resultingBalances = computeBalances(it);

    await tx.insert(inventoryLedgerEntries).values({
      id: ledgerEntryId,
      inventoryItemId: it.id,
      movementType: "ALLOCATION_CONFIRMED",
      onHandDelta: 0,
      reservedDelta: 0,
      allocatedDelta: line.quantity,
      quantityOnHandAfter: resultingBalances.quantityOnHand,
      quantityReservedAfter: resultingBalances.quantityReserved,
      quantityAllocatedAfter: resultingBalances.quantityAllocated,
      referenceType: "ORDER",
      referenceId: input.referenceId ?? orderId,
      actorId: input.actorId,
      notes: input.notes ?? "Reasignación de stock por aprobación de pago tardío.",
    });
  }

  return {
    success: true,
    alreadyAllocated: false,
    orderId,
    reacquiredLinesCount: linesToReacquire.length,
    totalQuantityAllocated: linesToReacquire.reduce(
      (acc: number, r: typeof inventoryReservations.$inferSelect) => acc + r.quantity,
      0
    ),
    ledgerEntryIds,
  };
}

// ---------------------------------------------------------------------------
// 6. Reservation Expiration Service
// ---------------------------------------------------------------------------

export async function expireUnpaidOrderReservations(
  input: ExpireUnpaidOrderReservationsInput
): Promise<ExpireUnpaidOrderReservationsResult> {
  const orderIdVal = validateUuid(input.orderId, "orderId");
  if (!orderIdVal.valid || !orderIdVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: orderIdVal.error };
  }
  const orderId = orderIdVal.normalized;
  const actorId = input.actorId ?? "SYSTEM";

  const advisoryKey = createInventoryOrderAdvisoryLockKey(orderId);

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryKey})`);

    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .for("update")
      .limit(1);

    if (payment && payment.status !== "UNPAID") {
      return {
        success: true,
        code: "PAYMENT_NOT_UNPAID",
        orderId,
        releasedLinesCount: 0,
        totalQuantityReleased: 0,
        orderStatusTransitioned: false,
      };
    }

    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);

    if (!order || order.status !== "PENDING") {
      return {
        success: true,
        code: "ORDER_NOT_PENDING",
        orderId,
        releasedLinesCount: 0,
        totalQuantityReleased: 0,
        orderStatusTransitioned: false,
      };
    }

    const activeReservations = await tx
      .select()
      .from(inventoryReservations)
      .where(
        and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, "ACTIVE"))
      )
      .orderBy(asc(inventoryReservations.id))
      .for("update");

    if (!activeReservations || activeReservations.length === 0) {
      return {
        success: true,
        orderId,
        releasedLinesCount: 0,
        totalQuantityReleased: 0,
        orderStatusTransitioned: false,
      };
    }

    const itemQtyMap = new Map<string, number>();
    for (const r of activeReservations) {
      const current = itemQtyMap.get(r.inventoryItemId) ?? 0;
      itemQtyMap.set(r.inventoryItemId, current + r.quantity);
    }

    const itemIds = Array.from(itemQtyMap.keys()).sort();
    const lockedItems = await tx
      .select()
      .from(inventoryItems)
      .where(inArray(inventoryItems.id, itemIds))
      .orderBy(asc(inventoryItems.id))
      .for("update");

    const itemMap = new Map<string, InventoryItem>();
    for (const it of lockedItems) {
      itemMap.set(it.id, it);
    }

    const ledgerEntryIds: string[] = [];
    const now = new Date();

    for (const r of activeReservations) {
      const it = itemMap.get(r.inventoryItemId)!;
      const newReserved = it.quantityReserved - r.quantity;

      if (newReserved < 0) {
        throw new Error(
          `RESERVED_BALANCE_UNDERFLOW: Intento de liberar reserva por debajo de cero en item ${it.id}.`
        );
      }

      await tx
        .update(inventoryItems)
        .set({
          quantityReserved: newReserved,
          updatedAt: now,
        })
        .where(eq(inventoryItems.id, it.id));

      it.quantityReserved = newReserved;

      await tx
        .update(inventoryReservations)
        .set({
          status: "RELEASED",
          updatedAt: now,
        })
        .where(eq(inventoryReservations.id, r.id));

      const isTriggeringExpiry = r.expiresAt <= now;
      const movementType = isTriggeringExpiry ? "RESERVATION_EXPIRED" : "RESERVATION_RELEASED";

      const ledgerEntryId = generateUuidV7();
      ledgerEntryIds.push(ledgerEntryId);

      const resultingBalances = computeBalances(it);

      await tx.insert(inventoryLedgerEntries).values({
        id: ledgerEntryId,
        inventoryItemId: it.id,
        movementType,
        onHandDelta: 0,
        reservedDelta: -r.quantity,
        allocatedDelta: 0,
        quantityOnHandAfter: resultingBalances.quantityOnHand,
        quantityReservedAfter: resultingBalances.quantityReserved,
        quantityAllocatedAfter: resultingBalances.quantityAllocated,
        referenceType: "ORDER",
        referenceId: orderId,
        actorId,
        notes: isTriggeringExpiry
          ? "Reserva expirada por vencimiento del tiempo de pago."
          : "Co-liberación de línea por expiración de pedido.",
      });
    }

    await tx
      .update(orders)
      .set({
        status: "EXPIRED",
        cancelledAt: now,
        cancelReason: "Expiración automática por falta de pago.",
        updatedAt: now,
      })
      .where(eq(orders.id, orderId));

    return {
      success: true,
      orderId,
      orderStatusTransitioned: true,
      releasedLinesCount: activeReservations.length,
      totalQuantityReleased: activeReservations.reduce(
        (acc: number, r: typeof inventoryReservations.$inferSelect) => acc + r.quantity,
        0
      ),
      ledgerEntryIds,
    };
  });
}

// ---------------------------------------------------------------------------
// 7. Background Expiration Worker
// ---------------------------------------------------------------------------

export async function processReservationExpirationBatch(
  input: ProcessExpirationBatchInput = {}
): Promise<ProcessExpirationBatchResult> {
  const batchSize = Math.min(Math.max(input.batchSize ?? 50, 1), 200);
  const actorId = input.actorId ?? "SYSTEM";

  const expiredCandidates = await db
    .select({ orderId: inventoryReservations.orderId })
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.status, "ACTIVE"),
        lte(inventoryReservations.expiresAt, new Date())
      )
    )
    .groupBy(inventoryReservations.orderId)
    .limit(batchSize);

  let ordersExpired = 0;
  let ordersSkipped = 0;
  const errors: Array<{ orderId: string; error: string }> = [];

  for (const candidate of expiredCandidates) {
    try {
      const res = await expireUnpaidOrderReservations({
        orderId: candidate.orderId,
        actorId,
      });

      if (res.success && res.orderStatusTransitioned) {
        ordersExpired++;
      } else {
        ordersSkipped++;
      }
    } catch (err: unknown) {
      errors.push({
        orderId: candidate.orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    success: errors.length === 0,
    ordersProcessed: expiredCandidates.length,
    ordersExpired,
    ordersSkipped,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 8. Low-Stock & Availability Queries
// ---------------------------------------------------------------------------

export async function getVariantAvailability(
  input: GetVariantAvailabilityInput
): Promise<VariantAvailabilityResult | null> {
  const varVal = validateUuid(input.variantId, "variantId");
  if (!varVal.valid || !varVal.normalized) {
    return null;
  }
  const variantId = varVal.normalized;

  const configResult = getInventoryConfig();
  const primaryLocationCode = configResult.config?.primaryLocationCode ?? "LOC-LIM-01";
  const locationCode = (input.locationCode ?? primaryLocationCode).trim().toUpperCase();

  const [location] = await db
    .select()
    .from(inventoryLocations)
    .where(eq(inventoryLocations.code, locationCode))
    .limit(1);

  if (!location) return null;

  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.variantId, variantId), eq(inventoryItems.locationId, location.id)))
    .limit(1);

  if (!item) {
    return {
      variantId,
      locationId: location.id,
      locationCode,
      quantityOnHand: 0,
      quantityReserved: 0,
      quantityAllocated: 0,
      availableToSell: 0,
      reorderPoint: 0,
      inStock: false,
      isLowStock: false,
    };
  }

  const balances = computeBalances(item);
  const inStock = balances.availableToSell > 0;
  const isLowStock = balances.reorderPoint > 0 && balances.availableToSell <= balances.reorderPoint;

  return {
    variantId,
    locationId: location.id,
    locationCode,
    quantityOnHand: balances.quantityOnHand,
    quantityReserved: balances.quantityReserved,
    quantityAllocated: balances.quantityAllocated,
    availableToSell: balances.availableToSell,
    reorderPoint: balances.reorderPoint,
    inStock,
    isLowStock,
  };
}

// ---------------------------------------------------------------------------
// 9. Reconciliation & Repair
// ---------------------------------------------------------------------------

export async function reconcileInventory(): Promise<ReconcileInventoryResult> {
  const items = await db
    .select({
      item: inventoryItems,
      location: inventoryLocations,
    })
    .from(inventoryItems)
    .innerJoin(inventoryLocations, eq(inventoryItems.locationId, inventoryLocations.id));

  const discrepancies: InventoryItemDiscrepancy[] = [];

  for (const { item, location } of items) {
    const [resResult] = await db
      .select({
        reservedSum: sql<number>`COALESCE(SUM(${inventoryReservations.quantity}), 0)::int`,
      })
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.inventoryItemId, item.id),
          sql`${inventoryReservations.status} IN ('ACTIVE', 'VERIFICATION_HOLD')`
        )
      );
    const expectedReserved = resResult?.reservedSum ?? 0;

    const [allocResult] = await db
      .select({
        allocatedSum: sql<number>`COALESCE(SUM(${inventoryReservations.quantity}), 0)::int`,
      })
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.inventoryItemId, item.id),
          eq(inventoryReservations.status, "ALLOCATED")
        )
      );
    const expectedAllocated = allocResult?.allocatedSum ?? 0;

    const [latestLedger] = await db
      .select()
      .from(inventoryLedgerEntries)
      .where(eq(inventoryLedgerEntries.inventoryItemId, item.id))
      .orderBy(sql`${inventoryLedgerEntries.createdAt} DESC`)
      .limit(1);

    const reservedDrift = item.quantityReserved - expectedReserved;
    const allocatedDrift = item.quantityAllocated - expectedAllocated;
    const hasCapacityViolation =
      item.quantityOnHand < item.quantityReserved + item.quantityAllocated;

    const latestLedgerMatches = latestLedger
      ? latestLedger.quantityOnHandAfter === item.quantityOnHand &&
        latestLedger.quantityReservedAfter === item.quantityReserved &&
        latestLedger.quantityAllocatedAfter === item.quantityAllocated
      : true;

    const hasReservedDiscrepancy = reservedDrift !== 0;
    const hasAllocatedDiscrepancy = allocatedDrift !== 0;
    const hasLedgerDiscrepancy = !latestLedgerMatches;

    if (
      hasReservedDiscrepancy ||
      hasAllocatedDiscrepancy ||
      hasCapacityViolation ||
      hasLedgerDiscrepancy
    ) {
      let discrepancyType: InventoryItemDiscrepancy["discrepancyType"] = "RESERVED_DRIFT";
      const countReasons = [
        hasReservedDiscrepancy,
        hasAllocatedDiscrepancy,
        hasCapacityViolation,
        hasLedgerDiscrepancy,
      ].filter(Boolean).length;

      if (countReasons > 1) {
        discrepancyType = "MULTIPLE_DISCREPANCIES";
      } else if (hasReservedDiscrepancy) {
        discrepancyType = "RESERVED_DRIFT";
      } else if (hasAllocatedDiscrepancy) {
        discrepancyType = "ALLOCATED_DRIFT";
      } else if (hasCapacityViolation) {
        discrepancyType = "CAPACITY_VIOLATION";
      } else if (hasLedgerDiscrepancy) {
        discrepancyType = "LEDGER_MISMATCH";
      }

      discrepancies.push({
        inventoryItemId: item.id,
        variantId: item.variantId,
        locationId: location.id,
        locationCode: location.code,
        quantityOnHand: item.quantityOnHand,
        quantityReserved: item.quantityReserved,
        quantityAllocated: item.quantityAllocated,
        expectedReserved,
        expectedAllocated,
        reservedDrift,
        allocatedDrift,
        hasCapacityViolation,
        latestLedgerMatches,
        discrepancyType,
      });
    }
  }

  return {
    success: true,
    totalItemsAudited: items.length,
    discrepanciesCount: discrepancies.length,
    discrepancies,
  };
}

export async function repairInventoryDiscrepancy(
  input: RepairInventoryDiscrepancyInput
): Promise<RepairInventoryDiscrepancyResult> {
  if (!input.attemptId || input.attemptId.length < 8) {
    return { success: false, code: "INVALID_INPUT", error: "Identificador de intento inválido." };
  }

  const itemVal = validateUuid(input.inventoryItemId, "inventoryItemId");
  if (!itemVal.valid || !itemVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: itemVal.error };
  }
  const inventoryItemId = itemVal.normalized;

  const reasonVal = validateReason(input.reason);
  if (!reasonVal.valid || !reasonVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: reasonVal.error };
  }
  const reason = reasonVal.normalized;

  const refVal = validateReferenceId(input.referenceId);
  if (!refVal.valid || !refVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: refVal.error };
  }
  const referenceId = refVal.normalized;

  const actorVal = validateReferenceId(input.actorId);
  if (!actorVal.valid || !actorVal.normalized) {
    return { success: false, code: "INVALID_INPUT", error: "Identificador de actor inválido." };
  }
  const actorId = actorVal.normalized;

  const configResult = getInventoryConfig();
  if (!configResult.valid || !configResult.config) {
    return { success: false, code: "SYSTEM_ERROR", error: "Error de configuración de inventario." };
  }
  const { idempotencyTtlMinutes, hmacSecret } = configResult.config;

  const namespacedKey = `INVENTORY_RECONCILIATION_REPAIR:${input.attemptId}`;
  const authorityBindingDigest = computeInventoryAuthorityBindingDigest(actorId, hmacSecret);
  const requestFingerprint = computeInventoryRepairFingerprint({
    inventoryItemId,
    reason,
    referenceId,
    actorId,
    authorityBindingDigest,
  });

  const [existingKey] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
    .limit(1);

  if (existingKey) {
    if (existingKey.authorityBindingDigest !== authorityBindingDigest) {
      return { success: false, code: "UNAUTHORIZED", error: "No autorizado." };
    }
    if (existingKey.requestFingerprint !== requestFingerprint) {
      return {
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        error: "Conflicto de idempotencia con parámetros distintos.",
      };
    }
    const payload = existingKey.responsePayload as RepairInventoryDiscrepancyResult;
    return { ...payload, replayed: true };
  }

  const advisoryKey = createInventoryItemAdvisoryLockKey(namespacedKey);

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryKey})`);

    const [lockedKey] = await tx
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
      .for("update")
      .limit(1);

    if (lockedKey) {
      if (lockedKey.authorityBindingDigest !== authorityBindingDigest) {
        return { success: false, code: "UNAUTHORIZED", error: "No autorizado." };
      }
      if (lockedKey.requestFingerprint !== requestFingerprint) {
        return {
          success: false,
          code: "IDEMPOTENCY_CONFLICT",
          error: "Conflicto de idempotencia.",
        };
      }
      const payload = lockedKey.responsePayload as RepairInventoryDiscrepancyResult;
      return { ...payload, replayed: true };
    }

    const [item] = await tx
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, inventoryItemId))
      .for("update")
      .limit(1);

    if (!item) {
      return {
        success: false,
        code: "ITEM_NOT_FOUND",
        error: "Item de inventario no encontrado.",
      };
    }

    const [resResult] = await tx
      .select({
        reservedSum: sql<number>`COALESCE(SUM(${inventoryReservations.quantity}), 0)::int`,
      })
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.inventoryItemId, item.id),
          sql`${inventoryReservations.status} IN ('ACTIVE', 'VERIFICATION_HOLD')`
        )
      );
    const expectedReserved = resResult?.reservedSum ?? 0;

    const [allocResult] = await tx
      .select({
        allocatedSum: sql<number>`COALESCE(SUM(${inventoryReservations.quantity}), 0)::int`,
      })
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.inventoryItemId, item.id),
          eq(inventoryReservations.status, "ALLOCATED")
        )
      );
    const expectedAllocated = allocResult?.allocatedSum ?? 0;

    const reservedDelta = expectedReserved - item.quantityReserved;
    const allocatedDelta = expectedAllocated - item.quantityAllocated;

    if (reservedDelta === 0 && allocatedDelta === 0) {
      return {
        success: true,
        replayed: false,
        inventoryItemId: item.id,
        resultingBalances: computeBalances(item),
      };
    }

    await tx
      .update(inventoryItems)
      .set({
        quantityReserved: expectedReserved,
        quantityAllocated: expectedAllocated,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, item.id));

    const updatedItem = {
      ...item,
      quantityReserved: expectedReserved,
      quantityAllocated: expectedAllocated,
    };
    const resultingBalances = computeBalances(updatedItem);

    const ledgerEntryId = generateUuidV7();
    await tx.insert(inventoryLedgerEntries).values({
      id: ledgerEntryId,
      inventoryItemId: item.id,
      movementType: "MANUAL_ADJUSTMENT",
      onHandDelta: 0,
      reservedDelta,
      allocatedDelta,
      quantityOnHandAfter: resultingBalances.quantityOnHand,
      quantityReservedAfter: resultingBalances.quantityReserved,
      quantityAllocatedAfter: resultingBalances.quantityAllocated,
      referenceType: "MANUAL_AUDIT",
      referenceId,
      actorId,
      notes: `[RECONCILIATION_REPAIR] ${reason}`,
    });

    await tx.insert(auditEvents).values({
      id: generateUuidV7(),
      actorType: "ADMIN",
      actorId,
      action: "INVENTORY_RECONCILIATION_REPAIR",
      targetType: "INVENTORY_ITEM",
      targetId: item.id,
      metadata: {
        beforeBalances: computeBalances(item),
        resultingBalances,
        reservedDelta,
        allocatedDelta,
        reason,
        referenceId,
      },
    });

    const resultPayload: RepairInventoryDiscrepancyResult = {
      success: true,
      replayed: false,
      inventoryItemId: item.id,
      resultingBalances,
      ledgerEntryId,
    };

    const expiresAt = new Date(Date.now() + idempotencyTtlMinutes * 60 * 1000);
    await tx.insert(idempotencyKeys).values({
      id: generateUuidV7(),
      idempotencyKey: namespacedKey,
      operationType: "INVENTORY_MUTATION",
      authorityBindingDigest,
      requestFingerprint,
      responsePayload: resultPayload,
      expiresAt,
    });

    return resultPayload;
  });
}

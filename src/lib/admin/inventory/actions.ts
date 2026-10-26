"use server";

import { randomUUID } from "node:crypto";
import { revalidateStorefrontCatalog } from "@/lib/catalog/catalog-cache";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { adjustInventory, getVariantAvailability } from "@/lib/inventory/service";
import type { ActionResult } from "@/lib/admin/catalog/actions";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { getInventoryConfig } from "@/lib/inventory/config";
import type { InventoryMovementRow } from "./page-reader";

/** The lateral workspace loads history only for the selected variant at the configured location. */
export async function getInventoryMovementsAction(
  variantId: string
): Promise<ActionResult<InventoryMovementRow[]>> {
  const auth = await getVerifiedAuthContext();
  if (auth.status !== "READY" || !auth.permissions.has("inventory:manage")) {
    return { success: false, error: "No tienes permisos para consultar el inventario." };
  }
  const parsed = z.string().uuid().safeParse(variantId);
  const config = getInventoryConfig();
  if (!parsed.success || !config.valid || !config.config) {
    return { success: false, error: "No se pudo identificar la variante o el almacén." };
  }
  try {
    const rows = await db.execute<InventoryMovementRow>(sql`
      SELECT e.id, v.sku, e.movement_type, e.on_hand_delta, e.reserved_delta,
        e.allocated_delta, e.actor_id, e.notes, e.created_at
      FROM inventory_ledger_entries e JOIN inventory_items i ON i.id=e.inventory_item_id
      JOIN inventory_locations l ON l.id=i.location_id JOIN product_variants v ON v.id=i.variant_id
      WHERE l.code=${config.config.primaryLocationCode} AND v.id=${parsed.data}::uuid
      ORDER BY e.created_at DESC, e.id DESC LIMIT 30
    `);
    return {
      success: true,
      data: rows.map((row) => ({ ...row, created_at: new Date(row.created_at).toISOString() })),
    };
  } catch {
    return { success: false, error: "No se pudieron cargar los movimientos. Inténtalo otra vez." };
  }
}

export interface SetVariantStockInput {
  expectedOnHand?: number;
  productId: string;
  variantId: string;
  /** Units physically present at the primary location. */
  quantity: number;
  reason?: string;
}

export interface VariantStockSnapshot {
  onHand: number;
  reserved: number;
  allocated: number;
  available: number;
}

/**
 * Sets the stock of a variant to the counted quantity. It goes through the
 * inventory engine (physical count), so the movement is written to the ledger
 * with its actor and reason instead of silently overwriting a number.
 */
export async function setVariantStockAction(
  input: SetVariantStockInput
): Promise<ActionResult<VariantStockSnapshot>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("inventory:manage")) {
    return {
      success: false,
      error: "No tienes permisos de gestión de inventario (inventory:manage).",
      code: "FORBIDDEN",
    };
  }

  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    return {
      success: false,
      error: "La cantidad debe ser un número entero de 0 o más.",
      code: "INVALID_INPUT",
    };
  }

  const result = await adjustInventory({
    expectedOnHand: input.expectedOnHand,
    attemptId: randomUUID(),
    variantId: input.variantId,
    commandKind: "PHYSICAL_COUNT",
    countedQuantity: input.quantity,
    reason: input.reason?.trim() ? input.reason.trim() : "Conteo físico desde el panel",
    referenceId: `ADMIN-${new Date().toISOString().slice(0, 10)}`,
    actorId: authContext.authUserId,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "No se pudo actualizar el stock.",
      code: result.code,
    };
  }

  const availability = await getVariantAvailability({ variantId: input.variantId });
  // Availability decides which variants and products the storefront can offer.
  revalidateStorefrontCatalog();

  return {
    success: true,
    data: {
      onHand: availability?.quantityOnHand ?? 0,
      reserved: availability?.quantityReserved ?? 0,
      allocated: availability?.quantityAllocated ?? 0,
      available: availability?.availableToSell ?? 0,
    },
  };
}

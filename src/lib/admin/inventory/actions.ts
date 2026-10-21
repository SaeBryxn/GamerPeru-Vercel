"use server";

import { randomUUID } from "node:crypto";
import { markStorefrontCatalogStale } from "@/lib/catalog/catalog-cache";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { adjustInventory, getVariantAvailability } from "@/lib/inventory/service";
import type { ActionResult } from "@/lib/admin/catalog/actions";

export interface SetVariantStockInput {
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
  markStorefrontCatalogStale();

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

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, inventoryLocations } from "@/db/schema";
import { getInventoryConfig } from "@/lib/inventory/config";

export interface VariantStockRow {
  variantId: string;
  onHand: number;
  reserved: number;
  allocated: number;
  available: number;
}

/**
 * Stock of each variant at the primary location, for the product editor.
 * Variants without an inventory row yet report zero instead of disappearing.
 */
export async function getVariantStockMap(
  variantIds: string[]
): Promise<Record<string, VariantStockRow>> {
  const empty: Record<string, VariantStockRow> = {};
  for (const variantId of variantIds) {
    empty[variantId] = { variantId, onHand: 0, reserved: 0, allocated: 0, available: 0 };
  }
  if (variantIds.length === 0) return empty;

  const config = getInventoryConfig();
  if (!config.valid || !config.config) return empty;

  const [location] = await db
    .select({ id: inventoryLocations.id })
    .from(inventoryLocations)
    .where(eq(inventoryLocations.code, config.config.primaryLocationCode))
    .limit(1);

  if (!location) return empty;

  const rows = await db
    .select({
      variantId: inventoryItems.variantId,
      onHand: inventoryItems.quantityOnHand,
      reserved: inventoryItems.quantityReserved,
      allocated: inventoryItems.quantityAllocated,
    })
    .from(inventoryItems)
    .where(
      and(eq(inventoryItems.locationId, location.id), inArray(inventoryItems.variantId, variantIds))
    );

  for (const row of rows) {
    empty[row.variantId] = {
      variantId: row.variantId,
      onHand: row.onHand,
      reserved: row.reserved,
      allocated: row.allocated,
      available: Math.max(0, row.onHand - row.reserved - row.allocated),
    };
  }

  return empty;
}

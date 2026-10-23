import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requirePermission } from "@/lib/auth/rbac";
import { getInventoryConfig } from "@/lib/inventory/config";
import { z } from "zod";
export const inventoryQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  stock: z.enum(["all", "low", "out"]).default("all"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  variant: z.string().uuid().optional(),
});
export interface InventoryPageRow extends Record<string, unknown> {
  product_id: string;
  variant_id: string;
  product_name: string;
  title: string;
  sku: string;
  on_hand: number;
  reserved: number;
  allocated: number;
  available: number;
  reorder_point: number;
}
export interface InventoryMovementRow extends Record<string, unknown> {
  id: string;
  sku: string;
  movement_type: string;
  on_hand_delta: number;
  reserved_delta: number;
  allocated_delta: number;
  actor_id: string;
  notes: string | null;
  created_at: Date | string;
}
export async function getAdminInventoryPage(raw: Record<string, unknown>) {
  await requirePermission("inventory:manage");
  const query = inventoryQuerySchema.parse(raw);
  const config = getInventoryConfig();
  if (!config.valid || !config.config) return { configured: false as const };
  const location = config.config.primaryLocationCode;
  const locations = await db.execute<{ code: string }>(
    sql`SELECT code FROM inventory_locations WHERE code=${location} LIMIT 1`
  );
  if (!locations.length) return { configured: false as const };
  const search = `%${query.q.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
  const [rows, movements] = await Promise.all([
    db.execute<InventoryPageRow>(sql`
      SELECT p.id AS product_id, v.id AS variant_id, p.name AS product_name, v.title, v.sku,
        COALESCE(i.quantity_on_hand,0) AS on_hand, COALESCE(i.quantity_reserved,0) AS reserved,
        COALESCE(i.quantity_allocated,0) AS allocated,
        COALESCE(i.quantity_on_hand-i.quantity_reserved-i.quantity_allocated,0) AS available,
        COALESCE(i.reorder_point,0) AS reorder_point
      FROM product_variants v JOIN products p ON p.id=v.product_id
      LEFT JOIN inventory_locations l ON l.code=${location}
      LEFT JOIN inventory_items i ON i.variant_id=v.id AND i.location_id=l.id
      WHERE v.status='ACTIVE' AND p.status <> 'ARCHIVED'
        AND (${query.q}='' OR p.name ILIKE ${search} OR v.sku ILIKE ${search} OR v.title ILIKE ${search})
        AND (${query.stock}='all' OR (${query.stock}='out' AND COALESCE(i.quantity_on_hand-i.quantity_reserved-i.quantity_allocated,0)<=0)
          OR (${query.stock}='low' AND COALESCE(i.quantity_on_hand-i.quantity_reserved-i.quantity_allocated,0)>0 AND i.quantity_on_hand-i.quantity_reserved-i.quantity_allocated<=i.reorder_point))
      ORDER BY available ASC, p.name, v.sku LIMIT 51 OFFSET ${(query.page - 1) * 50}
    `),
    db.execute<InventoryMovementRow>(sql`
      SELECT e.id, v.sku, e.movement_type, e.on_hand_delta, e.reserved_delta, e.allocated_delta, e.actor_id, e.notes, e.created_at
      FROM inventory_ledger_entries e JOIN inventory_items i ON i.id=e.inventory_item_id
      JOIN inventory_locations l ON l.id=i.location_id JOIN product_variants v ON v.id=i.variant_id
      WHERE l.code=${location} ${query.variant ? sql`AND v.id=${query.variant}::uuid` : sql``}
      ORDER BY e.created_at DESC, e.id DESC LIMIT 50
    `),
  ]);
  return {
    configured: true as const,
    rows: rows.slice(0, 50),
    hasNext: rows.length > 50,
    movements,
    location,
    query,
  };
}

"use server";

import type { OrderItemPreview } from "@/lib/orders/item-previews-sql";
import { getAdminOrderDetail, getAdminOrderItemPreviews } from "./reader";
import type { AdminOrderDetail, AdminOrderDetailResult } from "./types";

export type AdminOrderQuickViewResult =
  | { status: "READY"; detail: AdminOrderDetail; itemPreviews: OrderItemPreview[] }
  | Exclude<AdminOrderDetailResult, { status: "READY" }>;

/**
 * Read-only data for the order quick view in the list. It revalidates nothing, so the action
 * never re-renders the page it is called from.
 */
export async function getAdminOrderQuickViewAction(
  orderNumber: string
): Promise<AdminOrderQuickViewResult> {
  const result = await getAdminOrderDetail(orderNumber);
  if (result.status !== "READY") return result;
  const itemPreviews = (await getAdminOrderItemPreviews(orderNumber)) ?? [];
  return { status: "READY", detail: result.detail, itemPreviews };
}

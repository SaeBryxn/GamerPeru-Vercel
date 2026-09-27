"use server";

import { revalidatePath } from "next/cache";
import {
  dispatchOrder,
  markOrderDelivered,
  startOrderPreparation,
  updateShipmentTracking,
  type FulfillmentResult,
  type ShipmentTrackingInput,
} from "@/lib/fulfillment/service";

function refreshAfter(result: FulfillmentResult): FulfillmentResult {
  if (result.success && !result.replayed) {
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${result.orderNumber}`);
    revalidatePath(`/checkout/confirmacion/${result.orderNumber}`);
    revalidatePath("/cuenta/pedidos");
  }
  return result;
}

export async function startPreparationAction(orderNumber: string): Promise<FulfillmentResult> {
  return refreshAfter(await startOrderPreparation({ orderNumber }));
}

export async function updateTrackingAction(
  input: { orderNumber: string } & ShipmentTrackingInput
): Promise<FulfillmentResult> {
  return refreshAfter(await updateShipmentTracking(input));
}

export async function dispatchOrderAction(
  input: { orderNumber: string } & ShipmentTrackingInput
): Promise<FulfillmentResult> {
  return refreshAfter(await dispatchOrder(input));
}

export async function markDeliveredAction(orderNumber: string): Promise<FulfillmentResult> {
  return refreshAfter(await markOrderDelivered({ orderNumber }));
}

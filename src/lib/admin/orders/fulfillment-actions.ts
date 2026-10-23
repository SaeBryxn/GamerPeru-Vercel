"use server";

import {
  dispatchOrder,
  markOrderDelivered,
  startOrderPreparation,
  updateShipmentTracking,
  type FulfillmentResult,
  type ShipmentTrackingInput,
} from "@/lib/fulfillment/service";

export async function startPreparationAction(orderNumber: string): Promise<FulfillmentResult> {
  return await startOrderPreparation({ orderNumber });
}

export async function updateTrackingAction(
  input: { orderNumber: string } & ShipmentTrackingInput
): Promise<FulfillmentResult> {
  return await updateShipmentTracking(input);
}

export async function dispatchOrderAction(
  input: { orderNumber: string } & ShipmentTrackingInput
): Promise<FulfillmentResult> {
  return await dispatchOrder(input);
}

export async function markDeliveredAction(orderNumber: string): Promise<FulfillmentResult> {
  return await markOrderDelivered({ orderNumber });
}

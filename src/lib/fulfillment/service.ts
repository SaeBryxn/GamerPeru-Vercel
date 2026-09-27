import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  inventoryItems,
  inventoryLedgerEntries,
  inventoryReservations,
  orders,
  outboxEvents,
  payments,
  shipments,
  type Order,
  type Shipment,
} from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { requireOrdersAdmin } from "@/lib/admin/orders/guard";
import { normalizeOrderNumber } from "@/lib/admin/orders/validation";
import type { DbTransaction } from "@/lib/inventory/service";
import { logger } from "@/lib/logger";

export type ShipmentStage = Shipment["status"];

export type FulfillmentFailureCode =
  | "UNAUTHORIZED"
  | "INVALID_INPUT"
  | "NOT_AVAILABLE"
  | "INVALID_ORDER_STATE"
  | "PAYMENT_NOT_CONFIRMED"
  | "SHIPMENT_NOT_AVAILABLE"
  | "INVALID_SHIPMENT_STATE"
  | "ALREADY_DISPATCHED"
  | "INVENTORY_NOT_ALLOCATED"
  | "SYSTEM_ERROR";

export type FulfillmentResult =
  | {
      success: true;
      orderNumber: string;
      orderStatus: Order["status"];
      shipmentStatus: ShipmentStage;
      replayed: boolean;
    }
  | { success: false; code: FulfillmentFailureCode; error: string };

export interface ShipmentTrackingInput {
  courierName: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}

type Tracking = { courierName: string; trackingNumber: string | null; trackingUrl: string | null };

const PREPARING: ShipmentStage[] = ["READY_TO_PACK", "PACKED"];
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

class FulfillmentAbort extends Error {
  constructor(readonly result: Extract<FulfillmentResult, { success: false }>) {
    super(result.code);
  }
}

let testFulfillmentTransactionHook: ((stage: "after_lock") => Promise<void>) | null = null;

export function __setTestFulfillmentTransactionHook(
  hook: ((stage: "after_lock") => Promise<void>) | null
) {
  if (process.env.NODE_ENV === "production") return;
  testFulfillmentTransactionHook = hook;
}

function fail(code: FulfillmentFailureCode, error: string): FulfillmentResult {
  return { success: false, code, error };
}

function abort(code: FulfillmentFailureCode, error: string): never {
  throw new FulfillmentAbort({ success: false, code, error });
}

function normalizeText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || UNSAFE_TEXT.test(value)) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? undefined : trimmed;
}

/** Courier is required; tracking number and URL are optional, and a URL must be https. */
export function validateTracking(input: ShipmentTrackingInput): Tracking | null {
  const courierName = normalizeText(input.courierName, 100);
  const trackingNumber = normalizeText(input.trackingNumber, 100);
  const trackingUrl = normalizeText(input.trackingUrl, 500);
  if (!courierName || courierName.length < 2) return null;
  if (trackingNumber === undefined || trackingUrl === undefined) return null;
  if (trackingUrl) {
    try {
      if (new URL(trackingUrl).protocol !== "https:") return null;
    } catch {
      return null;
    }
  }
  return { courierName, trackingNumber, trackingUrl };
}

type LockedOrderContext = {
  order: Order;
  shipment: Shipment;
  actorId: string;
  now: Date;
};

/**
 * Runs a fulfillment step under the lock order shared with checkout, payment verification and
 * paid cancellation (Payment -> Order -> Shipment -> Reservations -> Items), so these flows can
 * never deadlock against each other.
 */
async function withLockedOrder(
  rawOrderNumber: unknown,
  action: string,
  step: (tx: DbTransaction, context: LockedOrderContext) => Promise<FulfillmentResult>
): Promise<FulfillmentResult> {
  const authority = await requireOrdersAdmin();
  if (!authority.authorized) {
    return fail("UNAUTHORIZED", "No tienes permisos para gestionar despachos.");
  }
  const orderNumber = normalizeOrderNumber(rawOrderNumber);
  if (!orderNumber) return fail("INVALID_INPUT", "Número de pedido inválido.");

  try {
    return await db.transaction(async (tx) => {
      const [orderRef] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber))
        .limit(1);
      if (!orderRef) return fail("NOT_AVAILABLE", "Pedido no disponible.");

      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.orderId, orderRef.id))
        .for("update")
        .limit(1);
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderRef.id))
        .for("update")
        .limit(1);
      const orderShipments = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.orderId, orderRef.id))
        .orderBy(asc(shipments.id))
        .for("update");

      if (testFulfillmentTransactionHook) await testFulfillmentTransactionHook("after_lock");

      if (!order) return fail("NOT_AVAILABLE", "Pedido no disponible.");
      if (!payment || payment.status !== "PAID") {
        return fail("PAYMENT_NOT_CONFIRMED", "El pago de este pedido aún no está confirmado.");
      }
      // v1 policy: exactly one outbound shipment per order.
      if (orderShipments.length !== 1) {
        return fail(
          "SHIPMENT_NOT_AVAILABLE",
          "El pedido no tiene un único envío registrado; revísalo antes de despacharlo."
        );
      }

      return step(tx, {
        order,
        shipment: orderShipments[0]!,
        actorId: authority.context.authUserId,
        now: new Date(),
      });
    });
  } catch (error) {
    if (error instanceof FulfillmentAbort) return error.result;
    logger.error({ event: "fulfillment_step_failed", action, orderNumber, err: error });
    return fail("SYSTEM_ERROR", "No se pudo actualizar el despacho del pedido.");
  }
}

async function audit(
  tx: DbTransaction,
  context: LockedOrderContext,
  action: string,
  metadata: Record<string, unknown>
) {
  await tx.insert(auditEvents).values({
    id: generateUuidV7(),
    timestamp: context.now,
    actorType: "ADMIN",
    actorId: context.actorId,
    action,
    targetType: "Order",
    targetId: context.order.id,
    metadata: {
      orderNumber: context.order.orderNumber,
      shipmentId: context.shipment.id,
      ...metadata,
    },
  });
}

function success(
  context: LockedOrderContext,
  shipmentStatus: ShipmentStage,
  replayed: boolean,
  orderStatus: Order["status"] = context.order.status
): FulfillmentResult {
  return {
    success: true,
    orderNumber: context.order.orderNumber,
    orderStatus,
    shipmentStatus,
    replayed,
  };
}

/**
 * Starts picking and packing (UNFULFILLED -> READY_TO_PACK).
 *
 * The order keeps CONFIRMED, as the canonical state matrix prescribes; the customer already reads
 * "En preparación" from the shipment. Starting fulfillment also closes the pre-shipment paid
 * cancellation path, which requires an UNFULFILLED shipment.
 */
export async function startOrderPreparation(input: { orderNumber: string }) {
  return withLockedOrder(input.orderNumber, "start_preparation", async (tx, context) => {
    const { order, shipment } = context;
    if (order.status !== "CONFIRMED") {
      return fail("INVALID_ORDER_STATE", "Solo se preparan pedidos con el pago confirmado.");
    }
    if (PREPARING.includes(shipment.status)) return success(context, shipment.status, true);
    if (shipment.status !== "UNFULFILLED") {
      return fail("INVALID_SHIPMENT_STATE", "Este pedido ya salió del almacén.");
    }

    const reservations = await tx
      .select({ status: inventoryReservations.status })
      .from(inventoryReservations)
      .where(eq(inventoryReservations.orderId, order.id));
    const live = reservations.filter((r) => r.status !== "RELEASED");
    if (live.length === 0 || live.some((r) => r.status !== "ALLOCATED")) {
      return fail(
        "INVENTORY_NOT_ALLOCATED",
        "El stock de este pedido no está asignado; revisa la verificación del pago."
      );
    }

    await tx
      .update(shipments)
      .set({ status: "READY_TO_PACK", updatedAt: context.now })
      .where(eq(shipments.id, shipment.id));
    await audit(tx, context, "orders:start_preparation", {});

    return success(context, "READY_TO_PACK", false);
  });
}

/** Records or corrects the courier details while preparing or after dispatch. */
export async function updateShipmentTracking(
  input: { orderNumber: string } & ShipmentTrackingInput
) {
  const tracking = validateTracking(input);
  if (!tracking) {
    return fail(
      "INVALID_INPUT",
      "Indica el transportista; el enlace de seguimiento debe empezar con https://."
    );
  }

  return withLockedOrder(input.orderNumber, "update_tracking", async (tx, context) => {
    const { shipment } = context;
    if (!PREPARING.includes(shipment.status) && shipment.status !== "SHIPPED") {
      return fail(
        "INVALID_SHIPMENT_STATE",
        "Inicia la preparación antes de registrar el transportista."
      );
    }

    await tx
      .update(shipments)
      .set({ ...tracking, updatedAt: context.now })
      .where(eq(shipments.id, shipment.id));
    await audit(tx, context, "orders:update_tracking", {
      courierName: tracking.courierName,
      hasTrackingNumber: tracking.trackingNumber !== null,
      hasTrackingUrl: tracking.trackingUrl !== null,
    });

    return success(context, shipment.status, false);
  });
}

/**
 * Hands the parcel to the courier (READY_TO_PACK | PACKED -> SHIPPED).
 *
 * This is where stock leaves the building: every ALLOCATED reservation becomes CONSUMED and its
 * units come off both the allocated and the on-hand balances, one FULFILLMENT_DISPATCHED ledger
 * entry per line. Repeating the same dispatch returns the committed result without consuming
 * anything twice.
 */
export async function dispatchOrder(input: { orderNumber: string } & ShipmentTrackingInput) {
  const tracking = validateTracking(input);
  if (!tracking) {
    return fail(
      "INVALID_INPUT",
      "Indica el transportista; el enlace de seguimiento debe empezar con https://."
    );
  }

  return withLockedOrder(input.orderNumber, "dispatch", async (tx, context) => {
    const { order, shipment, now } = context;
    if (order.status !== "CONFIRMED") {
      return fail("INVALID_ORDER_STATE", "Este pedido no se puede despachar en su estado actual.");
    }
    if (shipment.status === "SHIPPED" || shipment.status === "DELIVERED") {
      const sameParcel =
        shipment.courierName === tracking.courierName &&
        shipment.trackingNumber === tracking.trackingNumber;
      return sameParcel
        ? success(context, shipment.status, true)
        : fail("ALREADY_DISPATCHED", "Este pedido ya fue despachado con otros datos de envío.");
    }
    if (!PREPARING.includes(shipment.status)) {
      return fail("INVALID_SHIPMENT_STATE", "Inicia la preparación antes de despachar.");
    }

    await consumeAllocatedInventory(tx, { orderId: order.id, actorId: context.actorId, now });

    await tx
      .update(shipments)
      .set({ ...tracking, status: "SHIPPED", shippedAt: now, updatedAt: now })
      .where(eq(shipments.id, shipment.id));

    await tx.insert(outboxEvents).values({
      id: generateUuidV7(),
      eventName: "OrderShipped",
      eventVersion: 1,
      aggregateType: "Order",
      aggregateId: order.id,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        shipmentId: shipment.id,
        courierName: tracking.courierName,
        trackingNumber: tracking.trackingNumber,
        trackingUrl: tracking.trackingUrl,
        shippedAt: now.toISOString(),
      },
      status: "PENDING",
    });
    await audit(tx, context, "orders:dispatch", { courierName: tracking.courierName });

    return success(context, "SHIPPED", false);
  });
}

/** Closes the order once the courier confirms delivery (SHIPPED -> DELIVERED, order FULFILLED). */
export async function markOrderDelivered(input: { orderNumber: string }) {
  return withLockedOrder(input.orderNumber, "mark_delivered", async (tx, context) => {
    const { order, shipment, now } = context;
    if (shipment.status === "DELIVERED") return success(context, "DELIVERED", true);
    if (shipment.status !== "SHIPPED" || order.status !== "CONFIRMED") {
      return fail("INVALID_SHIPMENT_STATE", "Solo un pedido despachado puede marcarse entregado.");
    }

    await tx
      .update(shipments)
      .set({ status: "DELIVERED", deliveredAt: now, updatedAt: now })
      .where(eq(shipments.id, shipment.id));
    await tx
      .update(orders)
      .set({ status: "FULFILLED", updatedAt: now })
      .where(eq(orders.id, order.id));

    await tx.insert(outboxEvents).values({
      id: generateUuidV7(),
      eventName: "OrderDelivered",
      eventVersion: 1,
      aggregateType: "Order",
      aggregateId: order.id,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        shipmentId: shipment.id,
        deliveredAt: now.toISOString(),
      },
      status: "PENDING",
    });
    await audit(tx, context, "orders:mark_delivered", {});

    return success(context, "DELIVERED", false, "FULFILLED");
  });
}

async function consumeAllocatedInventory(
  tx: DbTransaction,
  params: { orderId: string; actorId: string; now: Date }
) {
  const reservations = await tx
    .select()
    .from(inventoryReservations)
    .where(eq(inventoryReservations.orderId, params.orderId))
    .orderBy(asc(inventoryReservations.id))
    .for("update");

  const live = reservations.filter((r) => r.status !== "RELEASED");
  if (live.length === 0 || live.some((r) => r.status !== "ALLOCATED")) {
    abort(
      "INVENTORY_NOT_ALLOCATED",
      "El stock de este pedido no está asignado; no se puede despachar."
    );
  }

  const itemIds = Array.from(new Set(live.map((r) => r.inventoryItemId))).sort();
  const items = await tx
    .select()
    .from(inventoryItems)
    .where(inArray(inventoryItems.id, itemIds))
    .orderBy(asc(inventoryItems.id))
    .for("update");
  const itemMap = new Map(items.map((item) => [item.id, item]));

  for (const reservation of live) {
    const item = itemMap.get(reservation.inventoryItemId);
    if (
      !item ||
      item.quantityAllocated < reservation.quantity ||
      item.quantityOnHand < reservation.quantity
    ) {
      // A negative balance would mean the ledger and the reservations disagree; refuse to guess.
      throw new Error(`FULFILLMENT_INVENTORY_INVARIANT: item ${reservation.inventoryItemId}`);
    }

    item.quantityAllocated -= reservation.quantity;
    item.quantityOnHand -= reservation.quantity;

    await tx
      .update(inventoryItems)
      .set({
        quantityAllocated: item.quantityAllocated,
        quantityOnHand: item.quantityOnHand,
        updatedAt: params.now,
      })
      .where(eq(inventoryItems.id, item.id));
    await tx
      .update(inventoryReservations)
      .set({ status: "CONSUMED", updatedAt: params.now })
      .where(
        and(
          eq(inventoryReservations.id, reservation.id),
          eq(inventoryReservations.status, "ALLOCATED")
        )
      );
    await tx.insert(inventoryLedgerEntries).values({
      id: generateUuidV7(),
      inventoryItemId: item.id,
      movementType: "FULFILLMENT_DISPATCHED",
      onHandDelta: -reservation.quantity,
      reservedDelta: 0,
      allocatedDelta: -reservation.quantity,
      quantityOnHandAfter: item.quantityOnHand,
      quantityReservedAfter: item.quantityReserved,
      quantityAllocatedAfter: item.quantityAllocated,
      referenceType: "ORDER",
      referenceId: params.orderId,
      actorId: params.actorId,
      notes: "Unidades despachadas al transportista.",
    });
  }
}

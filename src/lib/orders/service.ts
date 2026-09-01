import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  idempotencyKeys,
  inventoryItems,
  inventoryLedgerEntries,
  inventoryReservations,
  orders,
  outboxEvents,
  paymentSubmissions,
  payments,
  refunds,
  shipments,
  type Order,
  type Payment,
} from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { getOrderManagementConfig } from "./config";
import {
  computeOrderAuthorityBindingDigest,
  computeOrderCancellationFingerprint,
  computePaidOrderCancellationFingerprint,
  computeRefundFingerprint,
  createOrderAdvisoryLockKey,
} from "./crypto";
import { resolveAuthorizedOrder } from "./authority";
import {
  validateCancelReason,
  validateRefundAmountCents,
  validateRefundExternalReference,
} from "./validation";
import type {
  CancelPaidOrderInput,
  CancelPaidOrderResult,
  CancelUnpaidOrderInput,
  CancelUnpaidOrderResult,
  OrderTimelineEntry,
  OrderTimelineResult,
  RecordRefundInput,
  RecordRefundResult,
  TerminalRejectionInput,
} from "./types";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";

// Test-only concurrency synchronization hook (strictly inert in production)
let testOrderTransactionHook:
  ((stage: "before_lock" | "after_lock" | "before_commit") => Promise<void>) | null = null;

export function __setTestOrderTransactionHook(
  hook: ((stage: "before_lock" | "after_lock" | "before_commit") => Promise<void>) | null
) {
  if (process.env.NODE_ENV === "production") return;
  testOrderTransactionHook = hook;
}

/**
 * Cancels an eligible unpaid order (PENDING + UNPAID).
 *
 * Invariants:
 * 1. Authority: Authenticated Customer Owner, Guest Owner (gp_payment_session), or Staff (orders:manage).
 * 2. Shared Global Lock Ordering: Advisory Lock -> Payment (FOR UPDATE) -> Order (FOR UPDATE) -> Shipment (FOR UPDATE) -> Reservations (id ASC, FOR UPDATE) -> InventoryItems (id ASC, FOR UPDATE).
 * 3. Payment Status Invariant: Payment remains UNPAID. Never set to REJECTED.
 * 4. Atomic Inventory Release: All ACTIVE reservations transition to RELEASED; quantity_reserved decremented; RESERVATION_RELEASED ledger entry written.
 * 5. Underflow Protection: Balance underflow triggers full ACID transaction rollback.
 * 6. Audit & Outbox: OrderCancelled outbox event and AuditEvent appended in the same transaction.
 */
export async function cancelUnpaidOrder(
  input: CancelUnpaidOrderInput
): Promise<CancelUnpaidOrderResult> {
  if (!input.cancellationAttemptId || input.cancellationAttemptId.length < 16) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: "Identificador de intento de cancelación inválido.",
    };
  }

  const reasonValidation = validateCancelReason(input.reason, "Cancelado por el cliente");
  if (!reasonValidation.valid) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: reasonValidation.error,
    };
  }
  const normalizedReason = reasonValidation.normalized;

  const authResult = await resolveAuthorizedOrder(input.orderNumber);
  if (!authResult.authorized) {
    return {
      success: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }
  const { order, payment, authorityBindingDigest, role } = authResult;

  const configResult = getOrderManagementConfig();
  if (!configResult.valid || !configResult.config) {
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error de configuración de pedidos.",
    };
  }
  const { idempotencyTtlMinutes, hmacSecret } = configResult.config;

  const namespacedKey = `ORDER_CANCELLATION:${input.cancellationAttemptId}`;
  const requestFingerprint = computeOrderCancellationFingerprint(
    {
      orderId: order.id,
      normalizedReason,
      authorityBindingDigest,
    },
    hmacSecret
  );

  // Fast Pre-Transaction Committed Idempotency Check
  const [existingIdempotency] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
    .limit(1);

  if (existingIdempotency) {
    const lookupNow = new Date();
    if (existingIdempotency.authorityBindingDigest !== authorityBindingDigest) {
      return {
        success: false,
        code: "NOT_AVAILABLE",
        error: "Pedido no disponible.",
      };
    }
    if (existingIdempotency.expiresAt <= lookupNow) {
      return {
        success: false,
        code: "IDEMPOTENCY_EXPIRED",
        error: "El intento de cancelación expiró. Actualiza el estado del pedido.",
      };
    }
    if (existingIdempotency.requestFingerprint !== requestFingerprint) {
      return {
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        error: "Conflicto de idempotencia: el contenido de la cancelación ha cambiado.",
      };
    }
    if (existingIdempotency.responsePayload) {
      return {
        success: true,
        orderNumber: order.orderNumber,
        status: "CANCELLED",
        replayed: true,
      };
    }
  }

  // Execute ACID Transaction
  try {
    const transactionResult = await db.transaction(async (tx) => {
      // Step A: Acquire advisory lock on the attempt ID
      const lockKey = createOrderAdvisoryLockKey(namespacedKey);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      const txNow = new Date();

      // Step B: Re-check idempotency under lock
      const [lockedIdempotency] = await tx
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
        .limit(1);

      if (lockedIdempotency) {
        if (lockedIdempotency.authorityBindingDigest !== authorityBindingDigest) {
          return {
            success: false as const,
            code: "NOT_AVAILABLE" as const,
            error: "Pedido no disponible.",
          };
        }
        if (lockedIdempotency.expiresAt <= txNow) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_EXPIRED" as const,
            error: "El intento de cancelación expiró.",
          };
        }
        if (lockedIdempotency.requestFingerprint !== requestFingerprint) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_CONFLICT" as const,
            error: "Conflicto de idempotencia: el contenido de la cancelación ha cambiado.",
          };
        }
        if (lockedIdempotency.responsePayload) {
          return {
            success: true as const,
            orderNumber: order.orderNumber,
            status: "CANCELLED" as const,
            replayed: true as const,
          };
        }
      }

      // Step C: Global Lock Sequence: 1. Payment -> 2. Order -> 3. Shipment
      if (testOrderTransactionHook) {
        await testOrderTransactionHook("before_lock");
      }

      const [lockedPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id))
        .for("update")
        .limit(1);

      if (!lockedPayment) {
        return {
          success: false as const,
          code: "NOT_AVAILABLE" as const,
          error: "Pedido no disponible.",
        };
      }

      const [lockedOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, order.id))
        .for("update")
        .limit(1);

      if (testOrderTransactionHook) {
        await testOrderTransactionHook("after_lock");
      }

      if (!lockedOrder) {
        return {
          success: false as const,
          code: "NOT_AVAILABLE" as const,
          error: "Pedido no disponible.",
        };
      }

      const [lockedShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.orderId, order.id))
        .for("update")
        .limit(1);

      // Step D: State Validation
      if (lockedOrder.status === "CANCELLED") {
        return {
          success: false as const,
          code: "ALREADY_CANCELLED" as const,
          error: "El pedido ya se encuentra cancelado.",
        };
      }

      if (lockedOrder.status !== "PENDING") {
        return {
          success: false as const,
          code: "INVALID_ORDER_STATE" as const,
          error: "El estado actual del pedido no permite su cancelación directa.",
        };
      }

      if (lockedPayment.status === "SUBMITTED" || lockedPayment.status === "VERIFYING") {
        return {
          success: false as const,
          code: "PAYMENT_REVIEW_IN_PROGRESS" as const,
          error: "El pago se encuentra en proceso de revisión por el equipo de administración.",
        };
      }

      if (lockedPayment.status !== "UNPAID") {
        return {
          success: false as const,
          code: "CANCELLATION_NOT_ALLOWED" as const,
          error: "No es posible cancelar pedidos en el estado de pago actual.",
        };
      }

      if (lockedShipment && lockedShipment.status !== "UNFULFILLED") {
        return {
          success: false as const,
          code: "FULFILLMENT_ALREADY_STARTED" as const,
          error: "El pedido ya se encuentra en proceso de despacho.",
        };
      }

      // Step E: Lock Inventory Reservations and Items in deterministic ID order
      const orderReservations = await tx
        .select()
        .from(inventoryReservations)
        .where(
          and(
            eq(inventoryReservations.orderId, order.id),
            inArray(inventoryReservations.status, ["ACTIVE", "VERIFICATION_HOLD", "ALLOCATED"])
          )
        )
        .orderBy(asc(inventoryReservations.id))
        .for("update");

      const itemIds = Array.from(new Set(orderReservations.map((r) => r.inventoryItemId))).sort();
      const lockedItems =
        itemIds.length > 0
          ? await tx
              .select()
              .from(inventoryItems)
              .where(inArray(inventoryItems.id, itemIds))
              .orderBy(asc(inventoryItems.id))
              .for("update")
          : [];

      const itemMap = new Map(lockedItems.map((item) => [item.id, item]));

      // Step F: Mutate Inventory & Ledger
      for (const res of orderReservations) {
        const item = itemMap.get(res.inventoryItemId);
        if (!item) {
          throw new Error("INVENTORY_ITEM_NOT_FOUND");
        }

        if (res.status === "ACTIVE" || res.status === "VERIFICATION_HOLD") {
          if (item.quantityReserved < res.quantity) {
            throw new Error("INVENTORY_RESERVED_UNDERFLOW");
          }
          const newReserved = item.quantityReserved - res.quantity;

          await tx
            .update(inventoryReservations)
            .set({ status: "RELEASED", updatedAt: txNow })
            .where(eq(inventoryReservations.id, res.id));

          await tx
            .update(inventoryItems)
            .set({ quantityReserved: newReserved, updatedAt: txNow })
            .where(eq(inventoryItems.id, item.id));

          item.quantityReserved = newReserved;

          await tx.insert(inventoryLedgerEntries).values({
            id: generateUuidV7(),
            inventoryItemId: item.id,
            movementType: "RESERVATION_RELEASED",
            onHandDelta: 0,
            reservedDelta: -res.quantity,
            allocatedDelta: 0,
            quantityOnHandAfter: item.quantityOnHand,
            quantityReservedAfter: newReserved,
            quantityAllocatedAfter: item.quantityAllocated,
            referenceType: "ORDER",
            referenceId: order.id,
            actorId: role === "STAFF" ? "ADMIN" : "CUSTOMER",
          });
        }
      }

      // Step G: Mutate Order Status (Payment remains UNPAID)
      await tx
        .update(orders)
        .set({
          status: "CANCELLED",
          cancelledAt: txNow,
          cancelReason: normalizedReason,
          updatedAt: txNow,
        })
        .where(eq(orders.id, order.id));

      // Step H: Insert Outbox Event
      await tx.insert(outboxEvents).values({
        id: generateUuidV7(),
        eventName: "OrderCancelled",
        eventVersion: 1,
        aggregateType: "Order",
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          cancelReason: normalizedReason,
          actorType: role === "STAFF" ? "ADMIN" : "CUSTOMER",
          cancelledAt: txNow.toISOString(),
        },
        status: "PENDING",
      });

      // Step I: Insert Audit Event
      let actorId = "";
      if (role === "STAFF") {
        actorId = authResult.authUserId;
      } else if (role === "CUSTOMER") {
        actorId = authResult.customerProfileId;
      } else {
        actorId = `guest_session:${authResult.sessionId}`;
      }

      await tx.insert(auditEvents).values({
        id: generateUuidV7(),
        timestamp: txNow,
        actorType: role === "STAFF" ? "ADMIN" : "CUSTOMER",
        actorId,
        action: "orders:cancel",
        targetType: "Order",
        targetId: order.id,
        metadata: {
          orderNumber: order.orderNumber,
          previousOrderStatus: lockedOrder.status,
          newOrderStatus: "CANCELLED",
          reason: normalizedReason,
        },
      });

      // Step J: Record Idempotency Key
      const expiresAt = new Date(txNow.getTime() + idempotencyTtlMinutes * 60 * 1000);
      const responsePayload = {
        orderNumber: order.orderNumber,
        status: "CANCELLED",
      };

      if (lockedIdempotency) {
        await tx
          .update(idempotencyKeys)
          .set({ responsePayload })
          .where(eq(idempotencyKeys.id, lockedIdempotency.id));
      } else {
        await tx
          .insert(idempotencyKeys)
          .values({
            id: generateUuidV7(),
            idempotencyKey: namespacedKey,
            operationType: "ORDER_CANCELLATION",
            authorityBindingDigest,
            requestFingerprint,
            targetAggregateId: order.id,
            responsePayload,
            expiresAt,
          })
          .onConflictDoNothing({ target: idempotencyKeys.idempotencyKey });
      }

      if (testOrderTransactionHook) {
        await testOrderTransactionHook("before_commit");
      }

      return {
        success: true as const,
        orderNumber: order.orderNumber,
        status: "CANCELLED" as const,
        replayed: false as const,
      };
    });

    return transactionResult;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "INVENTORY_RESERVED_UNDERFLOW" ||
        error.message === "INVENTORY_ITEM_NOT_FOUND")
    ) {
      return {
        success: false,
        code: "INVENTORY_INVARIANT_VIOLATION",
        error: "Error de consistencia en el inventario durante la cancelación.",
      };
    }
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error al procesar la cancelación del pedido.",
    };
  }
}

/**
 * Cancels a paid pre-shipment order and issues a full refund for the remaining refundable balance.
 *
 * Invariants:
 * 1. Authority: Staff only (requirePermission("orders:manage")).
 * 2. Remaining Balance Calculation: refundableRemainingCents = Payment.amount_cents - Payment.refunded_amount_cents (> 0).
 * 3. Atomic Allocation Release: All ALLOCATED reservations transition to RELEASED; quantity_allocated decremented; ALLOCATION_RELEASED ledger written.
 * 4. Refund Record: Durable Refund row created; Payment.refunded_amount_cents equals total; Payment/Order -> REFUNDED.
 * 5. Snapshot Preservation: Purchase snapshots (pricing, items, address) remain strictly immutable.
 */
export async function cancelPaidPreShipmentAndRefund(
  input: CancelPaidOrderInput
): Promise<CancelPaidOrderResult> {
  const authContext = await getVerifiedAuthContext();
  if (
    authContext.status !== "READY" ||
    !authContext.authUserId ||
    !authContext.permissions.has("orders:manage")
  ) {
    return {
      success: false,
      code: "UNAUTHORIZED",
      error: "No tienes permisos de administración para cancelar este pedido.",
    };
  }
  const staffAuthUserId = authContext.authUserId;

  if (!input.cancellationAttemptId || input.cancellationAttemptId.length < 16) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: "Identificador de intento de cancelación inválido.",
    };
  }

  const reasonValidation = validateCancelReason(input.reason, "Cancelado por el administrador");
  if (!reasonValidation.valid) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: reasonValidation.error,
    };
  }
  const normalizedReason = reasonValidation.normalized;

  const extRefValidation = validateRefundExternalReference(input.externalReference);
  if (!extRefValidation.valid) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: extRefValidation.error,
    };
  }
  const normalizedExtRef = extRefValidation.normalized;

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, input.orderNumber))
    .limit(1);

  if (!order) {
    return {
      success: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }

  const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
  if (!payment) {
    return {
      success: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }

  const configResult = getOrderManagementConfig();
  if (!configResult.valid || !configResult.config) {
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error de configuración de pedidos.",
    };
  }
  const { idempotencyTtlMinutes, hmacSecret } = configResult.config;

  const namespacedKey = `ORDER_CANCELLATION:${input.cancellationAttemptId}`;
  const authorityBindingDigest = computeOrderAuthorityBindingDigest(
    { type: "STAFF", authUserId: staffAuthUserId },
    hmacSecret
  );
  const requestFingerprint = computePaidOrderCancellationFingerprint(
    {
      orderId: order.id,
      normalizedReason,
      externalReference: normalizedExtRef,
      authorityBindingDigest,
    },
    hmacSecret
  );

  // Fast Idempotency Check
  const [existingIdempotency] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
    .limit(1);

  if (existingIdempotency) {
    const lookupNow = new Date();
    // 1. Authority Binding Check (Evaluated FIRST)
    if (existingIdempotency.authorityBindingDigest !== authorityBindingDigest) {
      return {
        success: false,
        code: "UNAUTHORIZED",
        error: "No tienes permisos de administración para este intento.",
      };
    }
    // 2. Expiration Check (Evaluated BEFORE fingerprint)
    if (existingIdempotency.expiresAt <= lookupNow) {
      return {
        success: false,
        code: "IDEMPOTENCY_EXPIRED",
        error: "El intento de cancelación expiró.",
      };
    }
    // 3. Request Fingerprint Check
    if (existingIdempotency.requestFingerprint !== requestFingerprint) {
      return {
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        error: "Conflicto de idempotencia: el contenido de la cancelación ha cambiado.",
      };
    }
    // 4. Committed Replay
    if (existingIdempotency.responsePayload) {
      const payload = existingIdempotency.responsePayload as {
        orderNumber: string;
        status: "REFUNDED";
        refundedAmountCents: number;
      };
      return {
        success: true,
        orderNumber: order.orderNumber,
        status: "REFUNDED",
        refundedAmountCents: payload.refundedAmountCents,
        replayed: true,
      };
    }
  }

  // Execute ACID Transaction
  try {
    const transactionResult = await db.transaction(async (tx) => {
      const lockKey = createOrderAdvisoryLockKey(namespacedKey);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      const txNow = new Date();

      // Re-check idempotency under lock
      const [lockedIdempotency] = await tx
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
        .limit(1);

      if (lockedIdempotency) {
        // 1. Authority Binding Check
        if (lockedIdempotency.authorityBindingDigest !== authorityBindingDigest) {
          return {
            success: false as const,
            code: "UNAUTHORIZED" as const,
            error: "No tienes permisos de administración para este intento.",
          };
        }
        // 2. Expiration Check
        if (lockedIdempotency.expiresAt <= txNow) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_EXPIRED" as const,
            error: "El intento de cancelación expiró.",
          };
        }
        // 3. Request Fingerprint Check
        if (lockedIdempotency.requestFingerprint !== requestFingerprint) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_CONFLICT" as const,
            error: "Conflicto de idempotencia: el contenido de la cancelación ha cambiado.",
          };
        }
        if (lockedIdempotency.responsePayload) {
          const payload = lockedIdempotency.responsePayload as {
            orderNumber: string;
            status: "REFUNDED";
            refundedAmountCents: number;
          };
          return {
            success: true as const,
            orderNumber: order.orderNumber,
            status: "REFUNDED" as const,
            refundedAmountCents: payload.refundedAmountCents,
            replayed: true as const,
          };
        }
      }

      // Lock Sequence: Payment -> Order -> Shipment
      const [lockedPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id))
        .for("update")
        .limit(1);

      if (!lockedPayment) {
        return {
          success: false as const,
          code: "NOT_AVAILABLE" as const,
          error: "Pedido no disponible.",
        };
      }

      const [lockedOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, order.id))
        .for("update")
        .limit(1);

      if (!lockedOrder) {
        return {
          success: false as const,
          code: "NOT_AVAILABLE" as const,
          error: "Pedido no disponible.",
        };
      }

      const [lockedShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.orderId, order.id))
        .for("update")
        .limit(1);

      // Validate states
      if (lockedOrder.status === "REFUNDED" || lockedOrder.status === "CANCELLED") {
        return {
          success: false as const,
          code: "ALREADY_CANCELLED" as const,
          error: "El pedido ya se encuentra cancelado o reembolsado.",
        };
      }

      if (lockedOrder.status !== "CONFIRMED") {
        return {
          success: false as const,
          code: "INVALID_ORDER_STATE" as const,
          error: "El estado actual del pedido no permite su cancelación con reembolso.",
        };
      }

      if (lockedPayment.status !== "PAID") {
        return {
          success: false as const,
          code: "CANCELLATION_NOT_ALLOWED" as const,
          error: "Solo se pueden cancelar pedidos que tengan el pago confirmado (PAID).",
        };
      }

      if (lockedShipment && lockedShipment.status !== "UNFULFILLED") {
        return {
          success: false as const,
          code: "FULFILLMENT_ALREADY_STARTED" as const,
          error: "El pedido ya se encuentra en proceso de empaquetado o despacho.",
        };
      }

      const refundableRemainingCents =
        lockedPayment.amountCents - lockedPayment.refundedAmountCents;

      if (refundableRemainingCents <= 0) {
        return {
          success: false as const,
          code: "CANCELLATION_NOT_ALLOWED" as const,
          error: "No existe saldo pendiente de reembolso para este pedido.",
        };
      }

      // Step E: Lock Inventory Reservations and Items
      const orderReservations = await tx
        .select()
        .from(inventoryReservations)
        .where(
          and(
            eq(inventoryReservations.orderId, order.id),
            inArray(inventoryReservations.status, ["ALLOCATED", "ACTIVE", "VERIFICATION_HOLD"])
          )
        )
        .orderBy(asc(inventoryReservations.id))
        .for("update");

      const itemIds = Array.from(new Set(orderReservations.map((r) => r.inventoryItemId))).sort();
      const lockedItems =
        itemIds.length > 0
          ? await tx
              .select()
              .from(inventoryItems)
              .where(inArray(inventoryItems.id, itemIds))
              .orderBy(asc(inventoryItems.id))
              .for("update")
          : [];

      const itemMap = new Map(lockedItems.map((item) => [item.id, item]));

      // Step F: Mutate Inventory & Ledger
      for (const res of orderReservations) {
        const item = itemMap.get(res.inventoryItemId);
        if (!item) {
          throw new Error("INVENTORY_ITEM_NOT_FOUND");
        }

        if (res.status === "ALLOCATED") {
          if (item.quantityAllocated < res.quantity) {
            throw new Error("INVENTORY_ALLOCATED_UNDERFLOW");
          }
          const newAllocated = item.quantityAllocated - res.quantity;

          await tx
            .update(inventoryReservations)
            .set({ status: "RELEASED", updatedAt: txNow })
            .where(eq(inventoryReservations.id, res.id));

          await tx
            .update(inventoryItems)
            .set({ quantityAllocated: newAllocated, updatedAt: txNow })
            .where(eq(inventoryItems.id, item.id));

          item.quantityAllocated = newAllocated;

          await tx.insert(inventoryLedgerEntries).values({
            id: generateUuidV7(),
            inventoryItemId: item.id,
            movementType: "ALLOCATION_RELEASED",
            onHandDelta: 0,
            reservedDelta: 0,
            allocatedDelta: -res.quantity,
            quantityOnHandAfter: item.quantityOnHand,
            quantityReservedAfter: item.quantityReserved,
            quantityAllocatedAfter: newAllocated,
            referenceType: "ORDER",
            referenceId: order.id,
            actorId: "ADMIN",
          });
        }
      }

      // Step G: Insert Durable Refund Row
      const refundId = generateUuidV7();
      await tx.insert(refunds).values({
        id: refundId,
        orderId: order.id,
        paymentId: payment.id,
        amountCents: refundableRemainingCents,
        reason: normalizedReason,
        externalReference: normalizedExtRef,
        actorAuthUserId: staffAuthUserId,
        createdAt: txNow,
      });

      // Step H: Update Payment & Order to REFUNDED
      await tx
        .update(payments)
        .set({
          refundedAmountCents: lockedPayment.amountCents,
          status: "REFUNDED",
          updatedAt: txNow,
        })
        .where(eq(payments.id, payment.id));

      await tx
        .update(orders)
        .set({
          status: "REFUNDED",
          cancelledAt: txNow,
          cancelReason: normalizedReason,
          updatedAt: txNow,
        })
        .where(eq(orders.id, order.id));

      // Step I: Outbox Events
      await tx.insert(outboxEvents).values({
        id: generateUuidV7(),
        eventName: "RefundIssued",
        eventVersion: 1,
        aggregateType: "Payment",
        aggregateId: payment.id,
        payload: {
          orderId: order.id,
          paymentId: payment.id,
          refundId,
          refundAmountCents: refundableRemainingCents,
          totalRefundedCents: lockedPayment.amountCents,
          currency: payment.currency,
          reason: normalizedReason,
          issuedAt: txNow.toISOString(),
        },
        status: "PENDING",
      });

      await tx.insert(outboxEvents).values({
        id: generateUuidV7(),
        eventName: "OrderCancelled",
        eventVersion: 1,
        aggregateType: "Order",
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          cancelReason: normalizedReason,
          actorType: "ADMIN",
          cancelledAt: txNow.toISOString(),
        },
        status: "PENDING",
      });

      // Step J: Audit Event
      await tx.insert(auditEvents).values({
        id: generateUuidV7(),
        timestamp: txNow,
        actorType: "ADMIN",
        actorId: staffAuthUserId,
        action: "orders:refund_and_cancel",
        targetType: "Order",
        targetId: order.id,
        metadata: {
          orderNumber: order.orderNumber,
          refundAmountCents: refundableRemainingCents,
          totalRefundedCents: lockedPayment.amountCents,
          reason: normalizedReason,
        },
      });

      // Step K: Record Idempotency Key
      const expiresAt = new Date(txNow.getTime() + idempotencyTtlMinutes * 60 * 1000);
      const responsePayload = {
        orderNumber: order.orderNumber,
        status: "REFUNDED",
        refundedAmountCents: refundableRemainingCents,
      };

      if (lockedIdempotency) {
        await tx
          .update(idempotencyKeys)
          .set({ responsePayload })
          .where(eq(idempotencyKeys.id, lockedIdempotency.id));
      } else {
        await tx
          .insert(idempotencyKeys)
          .values({
            id: generateUuidV7(),
            idempotencyKey: namespacedKey,
            operationType: "ORDER_CANCELLATION",
            authorityBindingDigest,
            requestFingerprint,
            targetAggregateId: order.id,
            responsePayload,
            expiresAt,
          })
          .onConflictDoNothing({ target: idempotencyKeys.idempotencyKey });
      }

      return {
        success: true as const,
        orderNumber: order.orderNumber,
        status: "REFUNDED" as const,
        refundedAmountCents: refundableRemainingCents,
        replayed: false as const,
      };
    });

    return transactionResult;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "INVENTORY_ALLOCATED_UNDERFLOW" ||
        error.message === "INVENTORY_ITEM_NOT_FOUND")
    ) {
      return {
        success: false,
        code: "INVENTORY_INVARIANT_VIOLATION",
        error: "Error de consistencia en el inventario durante la cancelación.",
      };
    }
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error al procesar la cancelación y reembolso del pedido.",
    };
  }
}

/**
 * Records a standalone partial or full financial refund for an order.
 *
 * Invariants:
 * 1. Authority: Staff only (requirePermission("orders:manage")).
 * 2. Cumulative Refund Cap: requested amount <= (amount_cents - refunded_amount_cents).
 * 3. Zero Automatic Stock Restock: Does not touch inventory items or reservations.
 * 4. Status Transition: Transitions Payment and Order to REFUNDED only when cumulative refunded equals total.
 */
export async function recordRefund(input: RecordRefundInput): Promise<RecordRefundResult> {
  const authContext = await getVerifiedAuthContext();
  if (
    authContext.status !== "READY" ||
    !authContext.authUserId ||
    !authContext.permissions.has("orders:manage")
  ) {
    return {
      success: false,
      code: "UNAUTHORIZED",
      error: "No tienes permisos de administración para registrar reembolsos.",
    };
  }
  const staffAuthUserId = authContext.authUserId;

  if (!input.refundAttemptId || input.refundAttemptId.length < 16) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: "Identificador de intento de reembolso inválido.",
    };
  }

  const amountValidation = validateRefundAmountCents(input.amountCents);
  if (!amountValidation.valid) {
    return {
      success: false,
      code: "REFUND_AMOUNT_INVALID",
      error: amountValidation.error,
    };
  }
  const validatedAmountCents = amountValidation.amountCents;

  const reasonValidation = validateCancelReason(input.reason, "Reembolso administrativo");
  if (!reasonValidation.valid) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: reasonValidation.error,
    };
  }
  const normalizedReason = reasonValidation.normalized;

  const extRefValidation = validateRefundExternalReference(input.externalReference);
  if (!extRefValidation.valid) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: extRefValidation.error,
    };
  }
  const normalizedExtRef = extRefValidation.normalized;

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, input.orderNumber))
    .limit(1);

  if (!order) {
    return {
      success: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }

  const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
  if (!payment) {
    return {
      success: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }

  const configResult = getOrderManagementConfig();
  if (!configResult.valid || !configResult.config) {
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error de configuración de pedidos.",
    };
  }
  const { idempotencyTtlMinutes, hmacSecret } = configResult.config;

  const namespacedKey = `REFUND_RECORDING:${input.refundAttemptId}`;
  const authorityBindingDigest = computeOrderAuthorityBindingDigest(
    { type: "STAFF", authUserId: staffAuthUserId },
    hmacSecret
  );
  const requestFingerprint = computeRefundFingerprint(
    {
      paymentId: payment.id,
      amountCents: validatedAmountCents,
      normalizedReason,
      externalReference: normalizedExtRef,
      authorityBindingDigest,
    },
    hmacSecret
  );

  // Fast Idempotency Check
  const [existingIdempotency] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
    .limit(1);

  if (existingIdempotency) {
    const lookupNow = new Date();
    // 1. Authority Binding Check (Evaluated FIRST)
    if (existingIdempotency.authorityBindingDigest !== authorityBindingDigest) {
      return {
        success: false,
        code: "UNAUTHORIZED",
        error: "No tienes permisos de administración para este intento.",
      };
    }
    // 2. Expiration Check (Evaluated BEFORE fingerprint)
    if (existingIdempotency.expiresAt <= lookupNow) {
      return {
        success: false,
        code: "IDEMPOTENCY_EXPIRED",
        error: "El intento de reembolso expiró.",
      };
    }
    // 3. Request Fingerprint Check
    if (existingIdempotency.requestFingerprint !== requestFingerprint) {
      return {
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        error: "Conflicto de idempotencia: el contenido del reembolso ha cambiado.",
      };
    }
    // 4. Committed Replay
    if (existingIdempotency.responsePayload) {
      const payload = existingIdempotency.responsePayload as {
        refundId: string;
        orderNumber: string;
        amountCents: number;
        totalRefundedCents: number;
        paymentStatus: Payment["status"];
        orderStatus: Order["status"];
      };
      return {
        success: true,
        refundId: payload.refundId,
        orderNumber: order.orderNumber,
        amountCents: payload.amountCents,
        totalRefundedCents: payload.totalRefundedCents,
        paymentStatus: payload.paymentStatus,
        orderStatus: payload.orderStatus,
        replayed: true,
      };
    }
  }

  // Execute ACID Transaction
  try {
    const transactionResult = await db.transaction(async (tx) => {
      const lockKey = createOrderAdvisoryLockKey(namespacedKey);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      const txNow = new Date();

      // Re-check idempotency under lock
      const [lockedIdempotency] = await tx
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
        .limit(1);

      if (lockedIdempotency) {
        // 1. Authority Binding Check
        if (lockedIdempotency.authorityBindingDigest !== authorityBindingDigest) {
          return {
            success: false as const,
            code: "UNAUTHORIZED" as const,
            error: "No tienes permisos de administración para este intento.",
          };
        }
        // 2. Expiration Check
        if (lockedIdempotency.expiresAt <= txNow) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_EXPIRED" as const,
            error: "El intento de reembolso expiró.",
          };
        }
        // 3. Request Fingerprint Check
        if (lockedIdempotency.requestFingerprint !== requestFingerprint) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_CONFLICT" as const,
            error: "Conflicto de idempotencia: el contenido del reembolso ha cambiado.",
          };
        }
        if (lockedIdempotency.responsePayload) {
          const payload = lockedIdempotency.responsePayload as {
            refundId: string;
            orderNumber: string;
            amountCents: number;
            totalRefundedCents: number;
            paymentStatus: Payment["status"];
            orderStatus: Order["status"];
          };
          return {
            success: true as const,
            refundId: payload.refundId,
            orderNumber: order.orderNumber,
            amountCents: payload.amountCents,
            totalRefundedCents: payload.totalRefundedCents,
            paymentStatus: payload.paymentStatus,
            orderStatus: payload.orderStatus,
            replayed: true as const,
          };
        }
      }

      // Lock Sequence: Payment -> Order
      const [lockedPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id))
        .for("update")
        .limit(1);

      if (!lockedPayment) {
        return {
          success: false as const,
          code: "NOT_AVAILABLE" as const,
          error: "Pedido no disponible.",
        };
      }

      const [lockedOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, order.id))
        .for("update")
        .limit(1);

      if (!lockedOrder) {
        return {
          success: false as const,
          code: "NOT_AVAILABLE" as const,
          error: "Pedido no disponible.",
        };
      }

      if (lockedPayment.status !== "PAID" && lockedPayment.status !== "REFUNDED") {
        return {
          success: false as const,
          code: "REFUND_NOT_ALLOWED" as const,
          error: "Solo se pueden registrar reembolsos en pagos confirmados.",
        };
      }

      const refundableRemainingCents =
        lockedPayment.amountCents - lockedPayment.refundedAmountCents;

      if (validatedAmountCents > refundableRemainingCents) {
        return {
          success: false as const,
          code: "REFUND_EXCEEDS_PAID_AMOUNT" as const,
          error: `El monto solicitado (S/ ${(validatedAmountCents / 100).toFixed(2)}) excede el saldo reembolsable disponible (S/ ${(refundableRemainingCents / 100).toFixed(2)}).`,
        };
      }

      const newTotalRefundedCents = lockedPayment.refundedAmountCents + validatedAmountCents;
      const isFullyRefunded = newTotalRefundedCents === lockedPayment.amountCents;

      if (isFullyRefunded) {
        // Step 4: Lock Shipment row FOR UPDATE when present
        const [lockedShipment] = await tx
          .select()
          .from(shipments)
          .where(eq(shipments.orderId, order.id))
          .for("update")
          .limit(1);

        // Step 5: Lock Inventory Reservations in deterministic order (id ASC)
        const orderReservations = await tx
          .select()
          .from(inventoryReservations)
          .where(eq(inventoryReservations.orderId, order.id))
          .orderBy(asc(inventoryReservations.id))
          .for("update");

        const isShippedOrDelivered =
          lockedShipment &&
          (lockedShipment.status === "SHIPPED" || lockedShipment.status === "DELIVERED");

        if (isShippedOrDelivered) {
          // Case B: SHIPPED / DELIVERED
          // Stock is already CONSUMED. Financial full refund transitions Payment/Order to REFUNDED.
          // Do NOT recreate stock, do NOT decrement allocated balance, do NOT increment on_hand.
        } else if (!lockedShipment || lockedShipment.status === "UNFULFILLED") {
          // Case A: PRE-SHIPMENT
          const allocatedReservations = orderReservations.filter((r) => r.status === "ALLOCATED");

          if (allocatedReservations.length > 0) {
            // Step 6: Lock required inventory items in deterministic order (id ASC)
            const itemIds = Array.from(
              new Set(allocatedReservations.map((r) => r.inventoryItemId))
            ).sort();

            const lockedItems = await tx
              .select()
              .from(inventoryItems)
              .where(inArray(inventoryItems.id, itemIds))
              .orderBy(asc(inventoryItems.id))
              .for("update");

            const itemMap = new Map(lockedItems.map((item) => [item.id, item]));

            // Pre-validation underflow check: assert quantity_allocated >= quantity for ALL lines
            for (const res of allocatedReservations) {
              const item = itemMap.get(res.inventoryItemId);
              if (!item) {
                throw new Error("INVENTORY_ITEM_NOT_FOUND");
              }
              if (item.quantityAllocated < res.quantity) {
                throw new Error("INVENTORY_ALLOCATED_UNDERFLOW");
              }
            }

            // Apply stock release mutations atomically
            for (const res of allocatedReservations) {
              const item = itemMap.get(res.inventoryItemId)!;
              const newAllocated = item.quantityAllocated - res.quantity;

              await tx
                .update(inventoryReservations)
                .set({ status: "RELEASED", updatedAt: txNow })
                .where(eq(inventoryReservations.id, res.id));

              await tx
                .update(inventoryItems)
                .set({ quantityAllocated: newAllocated, updatedAt: txNow })
                .where(eq(inventoryItems.id, item.id));

              item.quantityAllocated = newAllocated;

              await tx.insert(inventoryLedgerEntries).values({
                id: generateUuidV7(),
                inventoryItemId: item.id,
                movementType: "ALLOCATION_RELEASED",
                onHandDelta: 0,
                reservedDelta: 0,
                allocatedDelta: -res.quantity,
                quantityOnHandAfter: item.quantityOnHand,
                quantityReservedAfter: item.quantityReserved,
                quantityAllocatedAfter: newAllocated,
                referenceType: "ORDER",
                referenceId: order.id,
                actorId: "ADMIN",
              });
            }
          }
          // Case C: If no ALLOCATED reservations (e.g. EXPIRED or already RELEASED), zero stock release occurs.
        } else {
          // Case D: Inconsistent pre-shipment/shipment state - fail closed
          return {
            success: false as const,
            code: "FULFILLMENT_INCONSISTENCY" as const,
            error: "El estado de despacho del pedido no permite el reembolso completo automático.",
          };
        }
      }

      // Insert Refund Record
      const refundId = generateUuidV7();
      await tx.insert(refunds).values({
        id: refundId,
        orderId: order.id,
        paymentId: payment.id,
        amountCents: validatedAmountCents,
        reason: normalizedReason,
        externalReference: normalizedExtRef,
        actorAuthUserId: staffAuthUserId,
        createdAt: txNow,
      });

      // Mutate Payment
      const nextPaymentStatus = isFullyRefunded ? "REFUNDED" : lockedPayment.status;
      await tx
        .update(payments)
        .set({
          refundedAmountCents: newTotalRefundedCents,
          status: nextPaymentStatus,
          updatedAt: txNow,
        })
        .where(eq(payments.id, payment.id));

      // Mutate Order if fully refunded
      let nextOrderStatus = lockedOrder.status;
      if (isFullyRefunded && lockedOrder.status !== "REFUNDED") {
        nextOrderStatus = "REFUNDED";
        await tx
          .update(orders)
          .set({
            status: "REFUNDED",
            cancelledAt: txNow,
            cancelReason: normalizedReason,
            updatedAt: txNow,
          })
          .where(eq(orders.id, order.id));
      }

      // Outbox Event
      await tx.insert(outboxEvents).values({
        id: generateUuidV7(),
        eventName: "RefundIssued",
        eventVersion: 1,
        aggregateType: "Payment",
        aggregateId: payment.id,
        payload: {
          orderId: order.id,
          paymentId: payment.id,
          refundId,
          refundAmountCents: validatedAmountCents,
          totalRefundedCents: newTotalRefundedCents,
          currency: payment.currency,
          reason: normalizedReason,
          issuedAt: txNow.toISOString(),
        },
        status: "PENDING",
      });

      // Audit Event
      await tx.insert(auditEvents).values({
        id: generateUuidV7(),
        timestamp: txNow,
        actorType: "ADMIN",
        actorId: staffAuthUserId,
        action: "orders:refund",
        targetType: "Payment",
        targetId: payment.id,
        metadata: {
          orderNumber: order.orderNumber,
          refundAmountCents: validatedAmountCents,
          newTotalRefundedCents,
          isFullyRefunded,
          reason: normalizedReason,
        },
      });

      // Record Idempotency Key
      const expiresAt = new Date(txNow.getTime() + idempotencyTtlMinutes * 60 * 1000);
      const responsePayload = {
        refundId,
        orderNumber: order.orderNumber,
        amountCents: validatedAmountCents,
        totalRefundedCents: newTotalRefundedCents,
        paymentStatus: nextPaymentStatus,
        orderStatus: nextOrderStatus,
      };

      if (lockedIdempotency) {
        await tx
          .update(idempotencyKeys)
          .set({ responsePayload })
          .where(eq(idempotencyKeys.id, lockedIdempotency.id));
      } else {
        await tx
          .insert(idempotencyKeys)
          .values({
            id: generateUuidV7(),
            idempotencyKey: namespacedKey,
            operationType: "REFUND_RECORDING",
            authorityBindingDigest,
            requestFingerprint,
            targetAggregateId: payment.id,
            responsePayload,
            expiresAt,
          })
          .onConflictDoNothing({ target: idempotencyKeys.idempotencyKey });
      }

      return {
        success: true as const,
        refundId,
        orderNumber: order.orderNumber,
        amountCents: validatedAmountCents,
        totalRefundedCents: newTotalRefundedCents,
        paymentStatus: nextPaymentStatus,
        orderStatus: nextOrderStatus,
        replayed: false as const,
      };
    });

    return transactionResult;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "INVENTORY_ALLOCATED_UNDERFLOW" ||
        error.message === "INVENTORY_ITEM_NOT_FOUND")
    ) {
      return {
        success: false,
        code: "INVENTORY_INVARIANT_VIOLATION",
        error: "Error de consistencia en el inventario durante el reembolso.",
      };
    }
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error al procesar el reembolso del pedido.",
    };
  }
}

/**
 * Reusable consequence helper for GP-028 payment rejection decisions.
 *
 * Precondition: The caller has already set Payment.status = 'REJECTED' in the same transaction.
 * Emits OrderCancelled outbox and appends AuditEvent.
 * Does NOT emit a second PaymentRejected event.
 */
export async function applyTerminalPaymentRejectionConsequences(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: TerminalRejectionInput
): Promise<void> {
  const txNow = new Date();

  // 1. Assert Payment is already REJECTED
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.id, input.paymentId))
    .for("update")
    .limit(1);

  if (!payment || payment.status !== "REJECTED") {
    throw new Error("PRECONDITION_FAILED_PAYMENT_NOT_REJECTED");
  }

  // 2. Lock and Update Order
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .for("update")
    .limit(1);

  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }

  await tx
    .update(orders)
    .set({
      status: "CANCELLED",
      cancelledAt: txNow,
      cancelReason: input.rejectionReason,
      updatedAt: txNow,
    })
    .where(eq(orders.id, order.id));

  // 3. Lock and Release VERIFICATION_HOLD Reservations
  const reservations = await tx
    .select()
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.orderId, order.id),
        inArray(inventoryReservations.status, ["ACTIVE", "VERIFICATION_HOLD"])
      )
    )
    .orderBy(asc(inventoryReservations.id))
    .for("update");

  const itemIds = Array.from(new Set(reservations.map((r) => r.inventoryItemId))).sort();
  const items =
    itemIds.length > 0
      ? await tx
          .select()
          .from(inventoryItems)
          .where(inArray(inventoryItems.id, itemIds))
          .orderBy(asc(inventoryItems.id))
          .for("update")
      : [];

  const itemMap = new Map(items.map((i) => [i.id, i]));

  for (const res of reservations) {
    const item = itemMap.get(res.inventoryItemId);
    if (!item) {
      throw new Error("INVENTORY_ITEM_NOT_FOUND");
    }

    if (item.quantityReserved < res.quantity) {
      throw new Error("INVENTORY_RESERVED_UNDERFLOW");
    }

    const newReserved = item.quantityReserved - res.quantity;

    await tx
      .update(inventoryReservations)
      .set({ status: "RELEASED", updatedAt: txNow })
      .where(eq(inventoryReservations.id, res.id));

    await tx
      .update(inventoryItems)
      .set({ quantityReserved: newReserved, updatedAt: txNow })
      .where(eq(inventoryItems.id, item.id));

    item.quantityReserved = newReserved;

    await tx.insert(inventoryLedgerEntries).values({
      id: generateUuidV7(),
      inventoryItemId: item.id,
      movementType: "RESERVATION_RELEASED",
      onHandDelta: 0,
      reservedDelta: -res.quantity,
      allocatedDelta: 0,
      quantityOnHandAfter: item.quantityOnHand,
      quantityReservedAfter: newReserved,
      quantityAllocatedAfter: item.quantityAllocated,
      referenceType: "ORDER",
      referenceId: order.id,
      actorId: "ADMIN",
    });
  }

  // 4. Outbox Event: OrderCancelled (NO duplicate PaymentRejected event)
  await tx.insert(outboxEvents).values({
    id: generateUuidV7(),
    eventName: "OrderCancelled",
    eventVersion: 1,
    aggregateType: "Order",
    aggregateId: order.id,
    payload: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      cancelReason: input.rejectionReason,
      actorType: "ADMIN",
      cancelledAt: txNow.toISOString(),
    },
    status: "PENDING",
  });

  // 5. Audit Event
  await tx.insert(auditEvents).values({
    id: generateUuidV7(),
    timestamp: txNow,
    actorType: "ADMIN",
    actorId: input.actorAuthUserId ?? "SYSTEM",
    action: "orders:apply_terminal_payment_rejection",
    targetType: "Order",
    targetId: order.id,
    metadata: {
      orderNumber: order.orderNumber,
      rejectionReason: input.rejectionReason,
    },
  });
}

/**
 * Retrieves the aggregated chronological timeline of an order.
 * Sanitizes customer view to prevent sensitive information leakage.
 */
export async function getOrderTimeline(orderNumber: string): Promise<OrderTimelineResult> {
  const authResult = await resolveAuthorizedOrder(orderNumber);
  if (!authResult.authorized) {
    return {
      success: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }
  const { order, payment, role } = authResult;

  const entries: OrderTimelineEntry[] = [];

  // 1. Order Placed
  entries.push({
    id: `order-placed-${order.id}`,
    timestamp: order.createdAt.toISOString(),
    type: "ORDER_PLACED",
    title: "Pedido registrado",
    description: `Pedido ${order.orderNumber} creado exitosamente.`,
  });

  // 2. Payment Submissions
  const submissions = await db
    .select()
    .from(paymentSubmissions)
    .where(eq(paymentSubmissions.paymentId, payment.id))
    .orderBy(asc(paymentSubmissions.submittedAt));

  for (const sub of submissions) {
    entries.push({
      id: `submission-${sub.id}`,
      timestamp: sub.submittedAt.toISOString(),
      type: "PAYMENT_SUBMITTED",
      title: `Comprobante de pago enviado (Intento #${sub.attemptNumber})`,
      description: sub.isLate ? "Envío registrado posterior al tiempo regular." : undefined,
    });
  }

  // 3. Refunds
  const orderRefunds = await db
    .select()
    .from(refunds)
    .where(eq(refunds.orderId, order.id))
    .orderBy(asc(refunds.createdAt));

  for (const ref of orderRefunds) {
    entries.push({
      id: `refund-${ref.id}`,
      timestamp: ref.createdAt.toISOString(),
      type: "REFUND_ISSUED",
      title: "Reembolso procesado",
      description:
        `Monto reembolsado: S/ ${(ref.amountCents / 100).toFixed(2)}. ${role === "STAFF" ? `Motivo: ${ref.reason}` : ""}`.trim(),
    });
  }

  // 4. Order Confirmed / Cancelled
  if (order.status === "CONFIRMED") {
    entries.push({
      id: `order-confirmed-${order.id}`,
      timestamp: order.updatedAt.toISOString(),
      type: "ORDER_CONFIRMED",
      title: "Pago confirmado y pedido aprobado",
    });
  }

  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    entries.push({
      id: `order-cancelled-${order.id}`,
      timestamp: (order.cancelledAt ?? order.updatedAt).toISOString(),
      type: "ORDER_CANCELLED",
      title: order.status === "REFUNDED" ? "Pedido reembolsado y cancelado" : "Pedido cancelado",
      description: order.cancelReason ?? undefined,
    });
  }

  // 5. Shipment Status
  const [orderShipment] = await db
    .select()
    .from(shipments)
    .where(eq(shipments.orderId, order.id))
    .limit(1);

  if (orderShipment) {
    if (orderShipment.shippedAt) {
      entries.push({
        id: `shipment-dispatched-${orderShipment.id}`,
        timestamp: orderShipment.shippedAt.toISOString(),
        type: "SHIPMENT_DISPATCHED",
        title: "Pedido despachado",
        description: orderShipment.courierName
          ? `Courier: ${orderShipment.courierName}${orderShipment.trackingNumber ? ` (N° ${orderShipment.trackingNumber})` : ""}`
          : undefined,
      });
    }
    if (orderShipment.deliveredAt) {
      entries.push({
        id: `shipment-delivered-${orderShipment.id}`,
        timestamp: orderShipment.deliveredAt.toISOString(),
        type: "ORDER_DELIVERED",
        title: "Pedido entregado",
      });
    }
  }

  // Sort chronological ASC
  entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    success: true,
    orderNumber: order.orderNumber,
    currentOrderStatus: order.status,
    currentPaymentStatus: payment.status,
    timeline: entries,
  };
}

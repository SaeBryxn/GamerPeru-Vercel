"use server";

import { revalidateStorefrontCatalog } from "@/lib/catalog/catalog-cache";
import { cancelPaidPreShipmentAndRefund, cancelUnpaidOrder } from "@/lib/orders/service";
import { requireOrdersAdmin } from "./guard";
import {
  isValidMutationUuid,
  normalizeAdminCancellationReason,
  normalizeOrderNumber,
} from "./validation";

type AdminActionError = { success: false; code: string };

function refreshOrderPaths(_orderNumber: string): void {
  revalidateStorefrontCatalog();
}

export async function cancelAdminUnpaidOrderAction(
  input: unknown
): Promise<
  { success: true; orderNumber: string; status: "CANCELLED"; replayed: boolean } | AdminActionError
> {
  const authority = await requireOrdersAdmin();
  if (!authority.authorized) return { success: false, code: authority.code };
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, code: "INVALID_INPUT" };
  }
  const payload = input as Record<string, unknown>;
  const orderNumber = normalizeOrderNumber(payload.orderNumber);
  const reason = normalizeAdminCancellationReason(payload.reason);
  const attemptId = payload.cancellationAttemptId;
  if (!orderNumber || !reason || !isValidMutationUuid(attemptId)) {
    return { success: false, code: "INVALID_INPUT" };
  }
  try {
    const result = await cancelUnpaidOrder({
      orderNumber,
      reason,
      cancellationAttemptId: attemptId,
    });
    if (!result.success) return { success: false, code: result.code };
    refreshOrderPaths(orderNumber);
    return result;
  } catch {
    return { success: false, code: "SYSTEM_ERROR" };
  }
}

export async function cancelAdminPaidOrderAction(input: unknown): Promise<
  | {
      success: true;
      orderNumber: string;
      status: "REFUNDED";
      refundedAmountCents: number;
      replayed: boolean;
    }
  | AdminActionError
> {
  const authority = await requireOrdersAdmin();
  if (!authority.authorized) return { success: false, code: authority.code };
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, code: "INVALID_INPUT" };
  }
  const payload = input as Record<string, unknown>;
  const orderNumber = normalizeOrderNumber(payload.orderNumber);
  const reason = normalizeAdminCancellationReason(payload.reason);
  const attemptId = payload.cancellationAttemptId;
  const externalReference = payload.externalReference;
  if (
    !orderNumber ||
    !reason ||
    !isValidMutationUuid(attemptId) ||
    payload.externalRefundCompleted !== true ||
    (externalReference !== undefined && typeof externalReference !== "string")
  ) {
    return { success: false, code: "INVALID_INPUT" };
  }
  try {
    const result = await cancelPaidPreShipmentAndRefund({
      orderNumber,
      reason,
      cancellationAttemptId: attemptId,
      externalReference,
    });
    if (!result.success) return { success: false, code: result.code };
    refreshOrderPaths(orderNumber);
    return result;
  } catch {
    return { success: false, code: "SYSTEM_ERROR" };
  }
}

export async function createAdminOrderNoteAction(input: unknown) {
  const { createAdminOrderNote } = await import("./note-service");
  const result = await createAdminOrderNote(input);
  return result;
}

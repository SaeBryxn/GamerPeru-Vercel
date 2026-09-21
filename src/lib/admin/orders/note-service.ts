import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, orderNotes, orders } from "@/db/schema";
import { noteActorDigest, noteAuditRequestId, noteIntentFingerprint } from "./crypto";
import { requireOrdersAdmin } from "./guard";
import type { AdminNoteResult } from "./types";
import { isValidMutationUuid, normalizeOrderNoteBody, normalizeOrderNumber } from "./validation";

export async function createAdminOrderNote(input: unknown): Promise<AdminNoteResult> {
  const authority = await requireOrdersAdmin();
  if (!authority.authorized) return { success: false, code: authority.code };

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, code: "INVALID_INPUT" };
  }
  const payload = input as Record<string, unknown>;

  const orderNumber = normalizeOrderNumber(payload.orderNumber);
  const body = normalizeOrderNoteBody(payload.body);
  const mutationRequestId = payload.mutationRequestId;
  if (!orderNumber || !body || !isValidMutationUuid(mutationRequestId)) {
    return { success: false, code: "INVALID_INPUT" };
  }

  try {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!order) return { success: false, code: "NOT_AVAILABLE" };

    const actorDigest = noteActorDigest(authority.context.authUserId);
    const fingerprint = noteIntentFingerprint(order.id, actorDigest, body);
    return await db.transaction(async (tx): Promise<AdminNoteResult> => {
      const [created] = await tx
        .insert(orderNotes)
        .values({
          orderId: order.id,
          authorAuthUserId: authority.context.authUserId,
          body,
          mutationRequestId,
          intentFingerprint: fingerprint,
          actorBindingDigest: actorDigest,
        })
        .onConflictDoNothing({ target: orderNotes.mutationRequestId })
        .returning({ id: orderNotes.id, body: orderNotes.body, createdAt: orderNotes.createdAt });

      if (created) {
        await tx.insert(auditEvents).values({
          actorType: "ADMIN",
          actorId: authority.context.authUserId,
          action: "orders:note_added",
          targetType: "Order",
          targetId: order.id,
          metadata: { noteId: created.id },
          requestId: noteAuditRequestId(mutationRequestId),
        });
        return {
          success: true,
          note: { id: created.id, body: created.body, createdAt: created.createdAt.toISOString() },
          replayed: false,
        };
      }

      const [existing] = await tx
        .select({
          id: orderNotes.id,
          orderId: orderNotes.orderId,
          body: orderNotes.body,
          createdAt: orderNotes.createdAt,
          actorDigest: orderNotes.actorBindingDigest,
          fingerprint: orderNotes.intentFingerprint,
        })
        .from(orderNotes)
        .where(eq(orderNotes.mutationRequestId, mutationRequestId))
        .limit(1);
      if (!existing || existing.actorDigest !== actorDigest) {
        return { success: false, code: "NOT_AVAILABLE" };
      }
      if (existing.orderId !== order.id || existing.fingerprint !== fingerprint) {
        return { success: false, code: "IDEMPOTENCY_CONFLICT" };
      }
      return {
        success: true,
        note: { id: existing.id, body: existing.body, createdAt: existing.createdAt.toISOString() },
        replayed: true,
      };
    });
  } catch {
    return { success: false, code: "SYSTEM_ERROR" };
  }
}

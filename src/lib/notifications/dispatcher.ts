import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationDeliveries, outboxEvents } from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import type { EmailConfig } from "@/lib/email/config";
import type { EmailProvider } from "@/lib/email/types";
import { logger } from "@/lib/logger";
import { loadOrderEmailContext } from "./order-context";
import { renderOrderPlaced } from "./templates/order-placed";
import { renderPaymentApproved } from "./templates/payment-approved";
import type { OrderEmailContext, RenderedEmail } from "./templates/types";

type Template = { template: string; render: (context: OrderEmailContext) => RenderedEmail };

/**
 * Events with templates. Others stay PENDING untouched until their template ships, so adding one
 * later picks up the backlog (bounded by MAX_EVENT_AGE_HOURS) instead of silently skipping it.
 */
const TEMPLATES: Record<string, Template[]> = {
  OrderPlaced: [{ template: "order_placed", render: renderOrderPlaced }],
  PaymentApproved: [{ template: "payment_approved", render: renderPaymentApproved }],
};

export const HANDLED_EVENT_NAMES = Object.keys(TEMPLATES);

export const DISPATCH_BATCH_SIZE = 25;
/** A claimed event is invisible to other workers this long; a crashed worker's events come back. */
export const LEASE_MINUTES = 5;
export const MAX_ATTEMPTS = 8;
const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360, 720];
/** A transactional email that arrives days late confuses more than it informs. */
export const MAX_EVENT_AGE_HOURS = 48;

export interface ClaimedEvent {
  id: string;
  eventName: string;
}

export type DeliveryOutcome =
  "DELIVERED" | "RETRY_SCHEDULED" | "FAILED" | "STALE_SKIPPED" | "NOT_PENDING";

/**
 * Claims up to `limit` due events. SKIP LOCKED lets concurrent runs split the queue without
 * waiting on each other, and pushing next_attempt_at forward is the lease: a claimed event is
 * not due again until the lease expires, so no second run picks it up meanwhile.
 */
export async function claimOutboxBatch(limit = DISPATCH_BATCH_SIZE): Promise<ClaimedEvent[]> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string; event_name: string }>(sql`
      SELECT id, event_name FROM outbox_events
      WHERE status = 'PENDING'
        AND next_attempt_at <= now()
        AND event_name IN ${HANDLED_EVENT_NAMES}
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    await tx
      .update(outboxEvents)
      .set({ nextAttemptAt: sql`now() + make_interval(mins => ${LEASE_MINUTES})` })
      .where(inArray(outboxEvents.id, ids));
    return rows.map((row) => ({ id: row.id, eventName: row.event_name }));
  });
}

async function markDelivered(eventId: string, note: string | null = null) {
  await db
    .update(outboxEvents)
    .set({ status: "DELIVERED", deliveredAt: new Date(), lastError: note })
    .where(and(eq(outboxEvents.id, eventId), eq(outboxEvents.status, "PENDING")));
}

async function markFailed(eventId: string, error: string) {
  await db
    .update(outboxEvents)
    .set({ status: "FAILED", lastError: error.slice(0, 500) })
    .where(and(eq(outboxEvents.id, eventId), eq(outboxEvents.status, "PENDING")));
}

/** Exponential backoff; the last allowed attempt turns the event FAILED for manual review. */
async function scheduleRetry(eventId: string, retryCount: number, error: string) {
  const attempts = retryCount + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await db
      .update(outboxEvents)
      .set({ status: "FAILED", retryCount: attempts, lastError: error.slice(0, 500) })
      .where(and(eq(outboxEvents.id, eventId), eq(outboxEvents.status, "PENDING")));
    return "FAILED" as const;
  }
  const delayMinutes = BACKOFF_MINUTES[Math.min(retryCount, BACKOFF_MINUTES.length - 1)]!;
  await db
    .update(outboxEvents)
    .set({
      retryCount: attempts,
      lastError: error.slice(0, 500),
      nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
    })
    .where(and(eq(outboxEvents.id, eventId), eq(outboxEvents.status, "PENDING")));
  return "RETRY_SCHEDULED" as const;
}

/**
 * Sends every template of one claimed event, at most once each.
 *
 * Two guards make a retry safe at any point: the provider receives an idempotency key derived
 * from the event and template, and notification_deliveries is UNIQUE per event and template, so
 * a template already recorded is skipped. The event turns DELIVERED only once all its templates
 * are recorded.
 */
export async function deliverOutboxEvent(
  eventId: string,
  deps: { provider: EmailProvider; config: EmailConfig }
): Promise<DeliveryOutcome> {
  const [event] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, eventId)).limit(1);
  if (!event || event.status !== "PENDING") return "NOT_PENDING";

  const templates = TEMPLATES[event.eventName];
  if (!templates) return "NOT_PENDING";

  if (Date.now() - event.createdAt.getTime() > MAX_EVENT_AGE_HOURS * 3_600_000) {
    await markDelivered(eventId, "stale: not sent");
    return "STALE_SKIPPED";
  }

  const payload = (event.payload ?? {}) as { orderId?: string };
  const orderId = payload.orderId ?? event.aggregateId;
  const context = await loadOrderEmailContext(orderId, deps.config.siteUrl);
  if (!context) {
    await markFailed(eventId, "order_not_found");
    return "FAILED";
  }

  const sent = await db
    .select({ template: notificationDeliveries.template })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.outboxEventId, eventId));
  const alreadySent = new Set(sent.map((row) => row.template));

  for (const { template, render } of templates) {
    if (alreadySent.has(template)) continue;

    const email = render(context);
    const result = await deps.provider.send({
      to: context.customerEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: `outbox:${eventId}:${template}`,
      tags: { event: event.eventName, template },
    });

    if (!result.ok) {
      logger.warn({
        event: "notification_send_failed",
        outboxEventId: eventId,
        template,
        permanent: result.permanent,
        error: result.error,
      });
      if (result.permanent) {
        await markFailed(eventId, result.error);
        return "FAILED";
      }
      return scheduleRetry(eventId, event.retryCount, result.error);
    }

    await db
      .insert(notificationDeliveries)
      .values({
        id: generateUuidV7(),
        outboxEventId: eventId,
        template,
        recipient: context.customerEmail,
        provider: deps.provider.name,
        providerMessageId: result.messageId,
      })
      .onConflictDoNothing();
  }

  await markDelivered(eventId);
  return "DELIVERED";
}

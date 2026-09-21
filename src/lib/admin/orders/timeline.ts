import "server-only";

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { AdminTimelinePage, AdminTimelineType } from "./types";
import { isValidMutationUuid } from "./validation";

const EVENT_TYPES: AdminTimelineType[] = [
  "ORDER_PLACED",
  "PAYMENT_SUBMITTED",
  "ORDER_CONFIRMED",
  "ORDER_CANCELLED",
  "REFUND_ISSUED",
  "SHIPMENT_DISPATCHED",
  "ORDER_DELIVERED",
  "INTERNAL_NOTE",
];

interface TimelineCursor {
  timestamp: Date;
  precedence: number;
  sourceId: string;
}

function cursorDigest(orderId: string): string {
  return createHash("sha256").update(`admin_order_timeline:${orderId}`).digest("hex");
}

function encodeCursor(orderId: string, cursor: TimelineCursor): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      timestamp: cursor.timestamp.toISOString(),
      precedence: cursor.precedence,
      sourceId: cursor.sourceId,
      digest: cursorDigest(orderId),
    })
  ).toString("base64url");
}

function decodeCursor(orderId: string, raw: string): TimelineCursor | null {
  if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (
      Object.keys(value).length !== 5 ||
      value.v !== 1 ||
      typeof value.timestamp !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.timestamp) ||
      typeof value.precedence !== "number" ||
      !Number.isInteger(value.precedence) ||
      value.precedence < 1 ||
      value.precedence > 8 ||
      !isValidMutationUuid(value.sourceId) ||
      value.digest !== cursorDigest(orderId)
    )
      return null;
    const timestamp = new Date(value.timestamp);
    if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== value.timestamp)
      return null;
    return { timestamp, precedence: value.precedence, sourceId: value.sourceId };
  } catch {
    return null;
  }
}

export async function loadAdminTimelinePage(
  orderId: string,
  paymentId: string | null,
  rawCursor: string | null = null
): Promise<AdminTimelinePage | null> {
  const cursor = rawCursor === null ? null : decodeCursor(orderId, rawCursor);
  if (rawCursor !== null && !cursor) return null;
  const cursorCondition = cursor
    ? sql`AND (e.event_at, e.precedence, e.source_id) < (${cursor.timestamp.toISOString()}::timestamptz, ${cursor.precedence}, ${cursor.sourceId}::uuid)`
    : sql``;
  const rows = await db.execute<{
    event_type: string;
    source_id: string;
    event_at: Date | string;
    precedence: number;
    note_body: string | null;
  }>(sql`
    WITH approval_evidence AS (
      SELECT a.id, a.timestamp AS event_at
      FROM audit_events a
      WHERE (a.target_type = 'Order' AND a.target_id = ${orderId}
             AND a.action IN ('orders:approve_payment', 'orders:late_allocate'))
         OR (a.target_type = 'Payment' AND a.target_id = ${paymentId ?? ""}
             AND a.action = 'payments:approve')
      UNION ALL
      SELECT x.id, x.created_at
      FROM outbox_events x
      WHERE (x.aggregate_type = 'Order' AND x.aggregate_id = ${orderId}
             AND x.event_name = 'OrderConfirmed')
         OR (x.aggregate_type = 'Payment' AND x.aggregate_id = ${paymentId ?? ""}
             AND x.event_name = 'PaymentApproved')
    ), approval AS (
      SELECT id, event_at FROM approval_evidence ORDER BY event_at, id LIMIT 1
    ), cancellation_audit AS (
      SELECT a.id, a.timestamp AS event_at
      FROM audit_events a
      WHERE a.target_type = 'Order' AND a.target_id = ${orderId}
        AND a.action IN ('orders:cancel', 'orders:refund_and_cancel', 'orders:apply_terminal_payment_rejection')
      ORDER BY a.timestamp, a.id LIMIT 1
    ), cancellation AS (
      SELECT id, event_at FROM cancellation_audit
      UNION ALL
      SELECT o.id, o.cancelled_at FROM orders o
      WHERE o.id = ${orderId}::uuid AND o.cancelled_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM cancellation_audit)
    ), events AS (
      SELECT 'ORDER_PLACED'::text AS event_type, o.id AS source_id, o.created_at AS event_at,
             1 AS precedence, NULL::text AS note_body
      FROM orders o WHERE o.id = ${orderId}::uuid
      UNION ALL
      SELECT 'PAYMENT_SUBMITTED', s.id, s.submitted_at, 2, NULL::text
      FROM payment_submissions s JOIN payments p ON p.id = s.payment_id
      WHERE p.order_id = ${orderId}::uuid
      UNION ALL
      SELECT 'ORDER_CONFIRMED', a.id, a.event_at, 3, NULL::text FROM approval a
      UNION ALL
      SELECT 'ORDER_CANCELLED', c.id, c.event_at, 4, NULL::text FROM cancellation c
      UNION ALL
      SELECT 'REFUND_ISSUED', r.id, r.created_at, 5, NULL::text
      FROM refunds r WHERE r.order_id = ${orderId}::uuid
      UNION ALL
      SELECT 'SHIPMENT_DISPATCHED', s.id, s.shipped_at, 6, NULL::text
      FROM shipments s WHERE s.order_id = ${orderId}::uuid AND s.shipped_at IS NOT NULL
      UNION ALL
      SELECT 'ORDER_DELIVERED', s.id, s.delivered_at, 7, NULL::text
      FROM shipments s WHERE s.order_id = ${orderId}::uuid AND s.delivered_at IS NOT NULL
      UNION ALL
      SELECT 'INTERNAL_NOTE', n.id, n.created_at, 8, n.body
      FROM order_notes n WHERE n.order_id = ${orderId}::uuid
    )
    SELECT e.event_type, e.source_id, e.event_at, e.precedence, e.note_body
    FROM events e WHERE TRUE ${cursorCondition}
    ORDER BY e.event_at DESC, e.precedence DESC, e.source_id DESC
    LIMIT 51
  `);
  const hasOlder = rows.length > 50;
  const selected = rows.slice(0, 50);
  const oldest = selected.at(-1);
  return {
    entries: selected.reverse().map((row) => {
      const type = EVENT_TYPES[row.precedence - 1];
      if (!type || type !== row.event_type) throw new Error("Invalid timeline event projection");
      return {
        id: `${row.event_type.toLowerCase()}-${row.source_id}`,
        timestamp: new Date(row.event_at).toISOString(),
        type,
        ...(type === "INTERNAL_NOTE" && row.note_body ? { noteBody: row.note_body } : {}),
      };
    }),
    olderCursor:
      hasOlder && oldest
        ? encodeCursor(orderId, {
            timestamp: new Date(oldest.event_at),
            precedence: oldest.precedence,
            sourceId: oldest.source_id,
          })
        : null,
  };
}

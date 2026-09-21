import "server-only";

import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
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
  timestamp: string;
  precedence: number;
  sourceId: string;
}

interface TimelineSource {
  type: AdminTimelineType;
  precedence: number;
  source: SQL;
  limit: number;
}

interface TimelineSourceRow extends Record<string, unknown> {
  source_id: string;
  event_at: Date | string;
  exact_timestamp: string;
  note_body: string | null;
}

interface TimelineEvent extends TimelineCursor {
  type: AdminTimelineType;
  noteBody: string | null;
}

const PAGE_SIZE = 50;

function cursorDigest(orderId: string): string {
  return createHash("sha256").update(`admin_order_timeline:${orderId}`).digest("hex");
}

function encodeCursor(orderId: string, cursor: TimelineCursor): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      timestamp: cursor.timestamp,
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
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/.test(value.timestamp) ||
      typeof value.precedence !== "number" ||
      !Number.isInteger(value.precedence) ||
      value.precedence < 1 ||
      value.precedence > 8 ||
      !isValidMutationUuid(value.sourceId) ||
      value.digest !== cursorDigest(orderId)
    )
      return null;
    const millisecondTimestamp = value.timestamp.replace(/\.(\d{3})\d{3}Z$/, ".$1Z");
    const timestamp = new Date(millisecondTimestamp);
    if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== millisecondTimestamp)
      return null;
    return {
      timestamp: value.timestamp,
      precedence: value.precedence,
      sourceId: value.sourceId,
    };
  } catch {
    return null;
  }
}

async function loadSourceWindow(
  descriptor: TimelineSource,
  cursor: TimelineCursor | null
): Promise<TimelineEvent[]> {
  if (EVENT_TYPES[descriptor.precedence - 1] !== descriptor.type) {
    throw new Error("Invalid timeline source precedence");
  }
  const cursorCondition = cursor
    ? sql`WHERE (e.event_at, ${descriptor.precedence}, e.source_id) < (${cursor.timestamp}::timestamptz, ${cursor.precedence}, ${cursor.sourceId}::uuid)`
    : sql``;
  const rows = await db.execute<TimelineSourceRow>(sql`
    SELECT e.source_id, e.event_at, e.note_body,
           to_char(e.event_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_timestamp
    FROM (${descriptor.source}) e ${cursorCondition}
    ORDER BY e.event_at DESC, e.source_id DESC
    LIMIT ${descriptor.limit}
  `);
  return rows.map((row) => ({
    type: descriptor.type,
    precedence: descriptor.precedence,
    sourceId: row.source_id,
    timestamp: row.exact_timestamp,
    noteBody: row.note_body,
  }));
}

export async function loadAdminTimelinePage(
  orderId: string,
  paymentId: string | null,
  rawCursor: string | null = null
): Promise<AdminTimelinePage | null> {
  const cursor = rawCursor === null ? null : decodeCursor(orderId, rawCursor);
  if (rawCursor !== null && !cursor) return null;
  const sources: TimelineSource[] = [
    {
      type: "ORDER_PLACED",
      precedence: 1,
      limit: 1,
      source: sql`
        SELECT o.id AS source_id, o.created_at AS event_at, NULL::text AS note_body
        FROM orders o WHERE o.id = ${orderId}::uuid
      `,
    },
    {
      type: "PAYMENT_SUBMITTED",
      precedence: 2,
      limit: PAGE_SIZE + 1,
      source: sql`
        SELECT s.id AS source_id, s.submitted_at AS event_at, NULL::text AS note_body
        FROM payment_submissions s JOIN payments p ON p.id = s.payment_id
        WHERE p.order_id = ${orderId}::uuid
      `,
    },
    {
      type: "ORDER_CONFIRMED",
      precedence: 3,
      limit: 1,
      source: sql`
        SELECT evidence.id AS source_id, evidence.event_at, NULL::text AS note_body
        FROM (
          SELECT a.id, a.timestamp AS event_at FROM audit_events a
          WHERE (a.target_type = 'Order' AND a.target_id = ${orderId}
                 AND a.action IN ('orders:approve_payment', 'orders:late_allocate'))
             OR (a.target_type = 'Payment' AND a.target_id = ${paymentId ?? ""}
                 AND a.action = 'payments:approve')
          UNION ALL
          SELECT x.id, x.created_at FROM outbox_events x
          WHERE (x.aggregate_type = 'Order' AND x.aggregate_id = ${orderId}
                 AND x.event_name = 'OrderConfirmed')
             OR (x.aggregate_type = 'Payment' AND x.aggregate_id = ${paymentId ?? ""}
                 AND x.event_name = 'PaymentApproved')
        ) evidence ORDER BY evidence.event_at, evidence.id LIMIT 1
      `,
    },
    {
      type: "ORDER_CANCELLED",
      precedence: 4,
      limit: 1,
      source: sql`
        WITH cancellation_audit AS (
          SELECT a.id, a.timestamp AS event_at FROM audit_events a
          WHERE a.target_type = 'Order' AND a.target_id = ${orderId}
            AND a.action IN ('orders:cancel', 'orders:refund_and_cancel', 'orders:apply_terminal_payment_rejection')
          ORDER BY a.timestamp, a.id LIMIT 1
        )
        SELECT c.id AS source_id, c.event_at, NULL::text AS note_body FROM cancellation_audit c
        UNION ALL
        SELECT o.id, o.cancelled_at, NULL::text FROM orders o
        WHERE o.id = ${orderId}::uuid AND o.cancelled_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM cancellation_audit)
      `,
    },
    {
      type: "REFUND_ISSUED",
      precedence: 5,
      limit: PAGE_SIZE + 1,
      source: sql`
        SELECT r.id AS source_id, r.created_at AS event_at, NULL::text AS note_body
        FROM refunds r WHERE r.order_id = ${orderId}::uuid
      `,
    },
    {
      type: "SHIPMENT_DISPATCHED",
      precedence: 6,
      limit: PAGE_SIZE + 1,
      source: sql`
        SELECT s.id AS source_id, s.shipped_at AS event_at, NULL::text AS note_body
        FROM shipments s WHERE s.order_id = ${orderId}::uuid AND s.shipped_at IS NOT NULL
      `,
    },
    {
      type: "ORDER_DELIVERED",
      precedence: 7,
      limit: PAGE_SIZE + 1,
      source: sql`
        SELECT s.id AS source_id, s.delivered_at AS event_at, NULL::text AS note_body
        FROM shipments s WHERE s.order_id = ${orderId}::uuid AND s.delivered_at IS NOT NULL
      `,
    },
    {
      type: "INTERNAL_NOTE",
      precedence: 8,
      limit: PAGE_SIZE + 1,
      source: sql`
        SELECT n.id AS source_id, n.created_at AS event_at, n.body AS note_body
        FROM order_notes n WHERE n.order_id = ${orderId}::uuid
      `,
    },
  ];
  const windows = await Promise.all(sources.map((source) => loadSourceWindow(source, cursor)));
  const rows = windows.flat().sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? 1 : -1;
    if (a.precedence !== b.precedence) return b.precedence - a.precedence;
    return a.sourceId < b.sourceId ? 1 : a.sourceId > b.sourceId ? -1 : 0;
  });
  const hasOlder = rows.length > PAGE_SIZE;
  const selected = rows.slice(0, PAGE_SIZE);
  const oldest = selected.at(-1);
  return {
    entries: selected.reverse().map((row) => {
      return {
        id: `${row.type.toLowerCase()}-${row.sourceId}`,
        timestamp: new Date(row.timestamp).toISOString(),
        type: row.type,
        ...(row.type === "INTERNAL_NOTE" && row.noteBody ? { noteBody: row.noteBody } : {}),
      };
    }),
    olderCursor:
      hasOlder && oldest
        ? encodeCursor(orderId, {
            timestamp: oldest.timestamp,
            precedence: oldest.precedence,
            sourceId: oldest.sourceId,
          })
        : null,
  };
}

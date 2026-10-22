import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderAddressSnapshots,
  orderItems,
  orderNotes,
  orderPricingSnapshots,
  orders,
  paymentMethodConfigurations,
  payments,
  refunds,
  shipments,
  type OrderStatus,
  type PaymentStatus,
} from "@/db/schema";
import { orderItemPreviewsSql, type OrderItemPreview } from "@/lib/orders/item-previews-sql";
import { requireOrdersAdmin } from "./guard";
import { loadAdminTimelinePage } from "./timeline";
import type {
  AdminNotePage,
  AdminOrderDetail,
  AdminOrderDetailResult,
  AdminOrderListResult,
  AdminOrderListRow,
  OrderIntegrityIssue,
  ShipmentDisplayStatus,
} from "./types";
import {
  encodeOrderCursor,
  isValidMutationUuid,
  maskOrderEmail,
  normalizeOrderNumber,
  parseAdminOrderListQuery,
  safeTrackingUrl,
} from "./validation";

/** Thumbnails per row in the admin list; the rest of the lines show as "+N". */
const LIST_THUMBNAIL_LIMIT = 3;

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function safeCount(value: string | number | bigint): number {
  const count = BigInt(value);
  if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Invalid aggregate count");
  }
  return Number(count);
}

function currencyIssues(
  orderCurrency: string,
  pricingCurrency: string | null,
  paymentCurrency: string | null
): OrderIntegrityIssue[] {
  const issues: OrderIntegrityIssue[] = [];
  if (pricingCurrency === null) issues.push("MISSING_PRICING_SNAPSHOT");
  if (paymentCurrency === null) issues.push("MISSING_PAYMENT");
  if (
    [orderCurrency, pricingCurrency, paymentCurrency].some(
      (value) => value !== null && value !== "PEN"
    )
  ) {
    issues.push("UNSUPPORTED_CURRENCY");
  }
  if (
    (pricingCurrency !== null && pricingCurrency !== orderCurrency) ||
    (paymentCurrency !== null && paymentCurrency !== orderCurrency)
  ) {
    issues.push("CURRENCY_MISMATCH");
  }
  return issues;
}

export async function getAdminOrderList(
  input: URLSearchParams | Record<string, string | string[] | undefined>
): Promise<AdminOrderListResult> {
  const authority = await requireOrdersAdmin();
  if (!authority.authorized) return { status: authority.code };
  const parsed = parseAdminOrderListQuery(input);
  if (!parsed.valid) return { status: "INVALID_INPUT" };
  const query = parsed.query;
  try {
    const conditions = [sql`TRUE`];
    if (query.search?.kind === "EMAIL")
      conditions.push(sql`lower(o.customer_email) = ${query.search.value}`);
    if (query.search?.kind === "ORDER_PREFIX")
      conditions.push(sql`o.order_number LIKE ${`${query.search.value}%`}`);
    if (query.orderStatus) conditions.push(sql`o.status = ${query.orderStatus}`);
    if (query.paymentStatus === "NOT_RECORDED") {
      conditions.push(sql`NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)`);
    } else if (query.paymentStatus) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = ${query.paymentStatus})`
      );
    }
    if (query.shipmentStatus === "NOT_RECORDED") {
      conditions.push(sql`NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id)`);
    } else if (query.shipmentStatus) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id AND s.status = ${query.shipmentStatus})`
      );
    }
    if (query.fromUtc && query.toUtcExclusive) {
      conditions.push(sql`o.created_at >= ${query.fromUtc.toISOString()}::timestamptz`);
      conditions.push(sql`o.created_at < ${query.toUtcExclusive.toISOString()}::timestamptz`);
    }
    if (query.cursor) {
      conditions.push(
        sql`(o.created_at, o.id) < (${query.cursor.createdAt.toISOString()}::timestamptz, ${query.cursor.id}::uuid)`
      );
    }
    const where = sql.join(conditions, sql` AND `);
    const page = await db.execute<{ id: string; created_at: Date | string }>(sql`
      SELECT o.id, o.created_at FROM orders o
      WHERE ${where}
      ORDER BY o.created_at DESC NULLS LAST, o.id DESC NULLS LAST
      LIMIT ${query.pageSize + 1}
    `);
    const hasNext = page.length > query.pageSize;
    const selected = page.slice(0, query.pageSize);
    if (selected.length === 0) return { status: "READY", rows: [], nextCursor: null };
    const ids = sql.join(
      selected.map((row) => sql`${row.id}::uuid`),
      sql`, `
    );
    const data = await db.execute<{
      id: string;
      order_number: string;
      created_at: Date | string;
      customer_email: string;
      customer_id: string | null;
      order_status: OrderStatus;
      total_cents: number;
      order_currency: string;
      pricing_currency: string | null;
      payment_status: PaymentStatus | null;
      payment_currency: string | null;
      method_code: string | null;
      method_label: string | null;
      unit_count: string | number;
      line_count: string | number;
      item_previews: OrderItemPreview[] | null;
      recipient_name: string | null;
      submission_id: string | null;
      submission_has_proof: boolean | null;
      confirmation_email_sent: boolean;
      shipment_count: string | number;
      single_shipment_status: ShipmentDisplayStatus | null;
      latest_operational_at: Date | string;
    }>(sql`
      WITH item_totals AS (
        SELECT i.order_id, SUM(i.quantity)::bigint AS unit_count, COUNT(*)::bigint AS line_count
        FROM order_items i WHERE i.order_id IN (${ids}) GROUP BY i.order_id
      ), shipment_summary AS (
        SELECT s.order_id, COUNT(*)::bigint AS shipment_count,
               MIN(s.status::text) AS single_shipment_status, MAX(s.updated_at) AS latest_at
        FROM shipments s WHERE s.order_id IN (${ids}) GROUP BY s.order_id
      ), refund_summary AS (
        SELECT r.order_id, MAX(r.created_at) AS latest_at
        FROM refunds r WHERE r.order_id IN (${ids}) GROUP BY r.order_id
      ), note_summary AS (
        SELECT n.order_id, MAX(n.created_at) AS latest_at
        FROM order_notes n WHERE n.order_id IN (${ids}) GROUP BY n.order_id
      )
      SELECT o.id, o.order_number, o.created_at, o.customer_email, o.customer_id,
             o.status AS order_status, o.total_cents, o.currency AS order_currency,
             ps.currency AS pricing_currency, p.status AS payment_status,
             p.currency AS payment_currency, p.payment_method_code AS method_code,
             pm.name AS method_label, COALESCE(it.unit_count, 0)::bigint AS unit_count,
             COALESCE(it.line_count, 0)::bigint AS line_count,
             ${orderItemPreviewsSql(sql`o.id`, LIST_THUMBNAIL_LIMIT)} AS item_previews,
             oas.recipient_name, sub.id AS submission_id, sub.has_proof AS submission_has_proof,
             EXISTS (
               SELECT 1 FROM notification_deliveries nd
               JOIN outbox_events oe ON oe.id = nd.outbox_event_id
               WHERE oe.aggregate_id = o.id::text AND oe.event_name = 'OrderPlaced'
             ) AS confirmation_email_sent,
             COALESCE(ss.shipment_count, 0)::bigint AS shipment_count,
             ss.single_shipment_status,
             GREATEST(o.updated_at, p.updated_at, ss.latest_at, rs.latest_at, ns.latest_at) AS latest_operational_at
      FROM orders o
      LEFT JOIN order_pricing_snapshots ps ON ps.order_id = o.id
      LEFT JOIN payments p ON p.order_id = o.id
      LEFT JOIN payment_method_configurations pm ON pm.code = p.payment_method_code
      LEFT JOIN order_address_snapshots oas ON oas.order_id = o.id
      LEFT JOIN LATERAL (
        SELECT s.id, s.proof_media_id IS NOT NULL AS has_proof
        FROM payment_submissions s WHERE s.payment_id = p.id
        ORDER BY s.attempt_number DESC LIMIT 1
      ) sub ON true
      LEFT JOIN item_totals it ON it.order_id = o.id
      LEFT JOIN shipment_summary ss ON ss.order_id = o.id
      LEFT JOIN refund_summary rs ON rs.order_id = o.id
      LEFT JOIN note_summary ns ON ns.order_id = o.id
      WHERE o.id IN (${ids})
      ORDER BY o.created_at DESC, o.id DESC
    `);
    const rows: AdminOrderListRow[] = data.map((row) => {
      const shipmentCount = safeCount(row.shipment_count);
      const integrityIssues = currencyIssues(
        row.order_currency,
        row.pricing_currency,
        row.payment_currency
      );
      if (shipmentCount > 1) integrityIssues.push("MULTIPLE_SHIPMENTS");
      return {
        orderNumber: row.order_number,
        createdAt: iso(row.created_at),
        customerEmailMasked: maskOrderEmail(row.customer_email),
        recipientName: row.recipient_name ?? null,
        itemPreviews: row.item_previews ?? [],
        itemLineCount: safeCount(row.line_count),
        latestSubmission: row.submission_id
          ? { id: row.submission_id, hasProof: row.submission_has_proof === true }
          : null,
        confirmationEmailSent: row.confirmation_email_sent === true,
        accountLinkState: row.customer_id ? "LINKED" : "NOT_LINKED",
        orderStatus: row.order_status,
        paymentStatus: row.payment_status ?? "NOT_RECORDED",
        shipmentStatus:
          shipmentCount === 0
            ? "NOT_RECORDED"
            : shipmentCount > 1
              ? "MULTIPLE"
              : (row.single_shipment_status ?? "NOT_RECORDED"),
        totalCents: row.total_cents,
        currency: row.order_currency,
        unitCount: safeCount(row.unit_count),
        paymentMethod: row.method_code
          ? { code: row.method_code, label: row.method_label ?? row.method_code }
          : null,
        latestOperationalAt: iso(row.latest_operational_at),
        integrityIssues,
      };
    });
    const last = selected.at(-1);
    return {
      status: "READY",
      rows,
      nextCursor:
        hasNext && last ? encodeOrderCursor(new Date(last.created_at), last.id, query) : null,
    };
  } catch {
    return { status: "SYSTEM_ERROR" };
  }
}

function noteCursorDigest(orderId: string): string {
  return createHash("sha256").update(`admin_order_notes:${orderId}`).digest("hex");
}

function decodeNoteCursor(orderId: string, raw: string): { createdAt: Date; id: string } | null {
  if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length !== 4 ||
      record.v !== 1 ||
      typeof record.createdAt !== "string" ||
      !isValidMutationUuid(record.id) ||
      record.digest !== noteCursorDigest(orderId)
    )
      return null;
    const createdAt = new Date(record.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== record.createdAt)
      return null;
    return { createdAt, id: record.id };
  } catch {
    return null;
  }
}

async function loadNotePage(
  orderId: string,
  rawCursor: string | null
): Promise<AdminNotePage | null> {
  const cursor = rawCursor === null ? null : decodeNoteCursor(orderId, rawCursor);
  if (rawCursor !== null && !cursor) return null;
  const condition = cursor
    ? and(
        eq(orderNotes.orderId, orderId),
        or(
          lt(orderNotes.createdAt, cursor.createdAt),
          and(eq(orderNotes.createdAt, cursor.createdAt), lt(orderNotes.id, cursor.id))
        )
      )
    : eq(orderNotes.orderId, orderId);
  const rows = await db
    .select({
      id: orderNotes.id,
      body: orderNotes.body,
      createdAt: orderNotes.createdAt,
      authorAuthUserId: orderNotes.authorAuthUserId,
    })
    .from(orderNotes)
    .where(condition)
    .orderBy(desc(orderNotes.createdAt), desc(orderNotes.id))
    .limit(51);
  const selected = rows.slice(0, 50);
  const last = selected.at(-1);
  return {
    notes: selected.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      authorAuthUserId: note.authorAuthUserId,
    })),
    olderCursor:
      rows.length > 50 && last
        ? Buffer.from(
            JSON.stringify({
              v: 1,
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              digest: noteCursorDigest(orderId),
            })
          ).toString("base64url")
        : null,
  };
}

export async function getAdminOrderDetail(
  orderNumberInput: unknown
): Promise<AdminOrderDetailResult> {
  const authority = await requireOrdersAdmin();
  if (!authority.authorized) return { status: authority.code };
  const orderNumber = normalizeOrderNumber(orderNumberInput);
  if (!orderNumber) return { status: "INVALID_INPUT" };
  try {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!order) return { status: "NOT_AVAILABLE" };
    const [items, addresses, prices, paymentRows, refundRows, shipmentRows, notes] =
      await Promise.all([
        db
          .select({
            id: orderItems.id,
            sku: orderItems.skuSnapshot,
            productName: orderItems.productNameSnapshot,
            variantTitle: orderItems.variantTitleSnapshot,
            unitPriceCents: orderItems.unitPriceCentsSnapshot,
            quantity: orderItems.quantity,
            lineTotalCents: orderItems.lineTotalCents,
          })
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id))
          .orderBy(orderItems.createdAt, orderItems.id),
        db
          .select()
          .from(orderAddressSnapshots)
          .where(eq(orderAddressSnapshots.orderId, order.id))
          .limit(1),
        db
          .select()
          .from(orderPricingSnapshots)
          .where(eq(orderPricingSnapshots.orderId, order.id))
          .limit(1),
        db
          .select({
            id: payments.id,
            status: payments.status,
            amountCents: payments.amountCents,
            refundedAmountCents: payments.refundedAmountCents,
            currency: payments.currency,
            methodCode: payments.paymentMethodCode,
            methodLabel: paymentMethodConfigurations.name,
            createdAt: payments.createdAt,
            updatedAt: payments.updatedAt,
          })
          .from(payments)
          .leftJoin(
            paymentMethodConfigurations,
            eq(payments.paymentMethodCode, paymentMethodConfigurations.code)
          )
          .where(eq(payments.orderId, order.id))
          .limit(1),
        db
          .select({
            id: refunds.id,
            amountCents: refunds.amountCents,
            reason: refunds.reason,
            createdAt: refunds.createdAt,
          })
          .from(refunds)
          .where(eq(refunds.orderId, order.id))
          .orderBy(refunds.createdAt, refunds.id),
        db
          .select({
            id: shipments.id,
            status: shipments.status,
            courierName: shipments.courierName,
            trackingNumber: shipments.trackingNumber,
            trackingUrl: shipments.trackingUrl,
            shippedAt: shipments.shippedAt,
            deliveredAt: shipments.deliveredAt,
          })
          .from(shipments)
          .where(eq(shipments.orderId, order.id))
          .orderBy(shipments.createdAt, shipments.id),
        loadNotePage(order.id, null),
      ]);
    const payment = paymentRows[0] ?? null;
    const address = addresses[0] ?? null;
    const pricing = prices[0] ?? null;
    const timeline = await loadAdminTimelinePage(order.id, payment?.id ?? null);
    if (!notes || !timeline) return { status: "SYSTEM_ERROR" };
    const integrityIssues = currencyIssues(
      order.currency,
      pricing?.currency ?? null,
      payment?.currency ?? null
    );
    if (!address) integrityIssues.push("MISSING_ADDRESS_SNAPSHOT");
    if (shipmentRows.length > 1) integrityIssues.push("MULTIPLE_SHIPMENTS");
    const detail: AdminOrderDetail = {
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        cancelledAt: order.cancelledAt?.toISOString() ?? null,
        cancelReason: order.cancelReason,
        customerNote: order.customerNotes,
        currency: order.currency,
      },
      contact: {
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        accountLinkState: order.customerId ? "LINKED" : "NOT_LINKED",
      },
      items,
      address: address
        ? {
            recipientName: address.recipientName,
            phone: address.phone,
            streetAddress: address.streetAddress,
            apartmentSuite: address.apartmentSuite,
            department: address.department,
            province: address.province,
            district: address.district,
            postalCode: address.postalCode,
            referenceNotes: address.referenceNotes,
          }
        : null,
      pricing: pricing
        ? {
            subtotalCents: pricing.subtotalCents,
            discountCents: pricing.discountCents,
            shippingCents: pricing.shippingCents,
            totalCents: pricing.totalCents,
            currency: pricing.currency,
          }
        : null,
      payment: payment
        ? {
            methodCode: payment.methodCode,
            methodLabel: payment.methodLabel ?? payment.methodCode,
            status: payment.status,
            amountCents: payment.amountCents,
            refundedAmountCents: payment.refundedAmountCents,
            currency: payment.currency,
            createdAt: payment.createdAt.toISOString(),
            updatedAt: payment.updatedAt.toISOString(),
          }
        : null,
      refunds: refundRows.map((refund) => ({
        id: refund.id,
        amountCents: refund.amountCents,
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
      })),
      shipments: shipmentRows.map((shipment) => ({
        id: shipment.id,
        status: shipment.status,
        courierName: shipment.courierName,
        trackingNumber: shipment.trackingNumber,
        trackingUrl: safeTrackingUrl(shipment.trackingUrl),
        shippedAt: shipment.shippedAt?.toISOString() ?? null,
        deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
      })),
      notes,
      timeline,
      integrityIssues,
      moneyActionsAllowed:
        payment !== null &&
        !integrityIssues.some(
          (issue) =>
            issue === "CURRENCY_MISMATCH" ||
            issue === "UNSUPPORTED_CURRENCY" ||
            issue === "MISSING_PRICING_SNAPSHOT"
        ),
    };
    return { status: "READY", detail };
  } catch {
    return { status: "SYSTEM_ERROR" };
  }
}

export async function getAdminOrderNotesPage(
  orderNumberInput: unknown,
  cursor: string
): Promise<
  | { status: "READY"; page: AdminNotePage }
  | { status: "INVALID_INPUT" | "NOT_AVAILABLE" | "SYSTEM_ERROR" }
> {
  const authority = await requireOrdersAdmin();
  if (!authority.authorized) return { status: authority.code };
  const orderNumber = normalizeOrderNumber(orderNumberInput);
  if (!orderNumber || typeof cursor !== "string") return { status: "INVALID_INPUT" };
  try {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!order) return { status: "NOT_AVAILABLE" };
    const page = await loadNotePage(order.id, cursor);
    return page ? { status: "READY", page } : { status: "INVALID_INPUT" };
  } catch {
    return { status: "SYSTEM_ERROR" };
  }
}

export async function getAdminOrderTimelinePage(
  orderNumberInput: unknown,
  cursor: string
): Promise<
  | { status: "READY"; page: NonNullable<Awaited<ReturnType<typeof loadAdminTimelinePage>>> }
  | { status: "INVALID_INPUT" | "NOT_AVAILABLE" | "SYSTEM_ERROR" }
> {
  const authority = await requireOrdersAdmin();
  if (!authority.authorized) return { status: authority.code };
  const orderNumber = normalizeOrderNumber(orderNumberInput);
  if (!orderNumber || typeof cursor !== "string") return { status: "INVALID_INPUT" };
  try {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!order) return { status: "NOT_AVAILABLE" };
    const [payment] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .limit(1);
    const page = await loadAdminTimelinePage(order.id, payment?.id ?? null, cursor);
    return page ? { status: "READY", page } : { status: "INVALID_INPUT" };
  } catch {
    return { status: "SYSTEM_ERROR" };
  }
}

/** Every line of one order with its catalog image, in order; used by the quick view. */
export async function getAdminOrderItemPreviews(
  orderNumberInput: unknown
): Promise<OrderItemPreview[] | null> {
  const authority = await requireOrdersAdmin();
  if (!authority.authorized) return null;
  const orderNumber = normalizeOrderNumber(orderNumberInput);
  if (!orderNumber) return null;
  const [row] = await db.execute<{ previews: OrderItemPreview[] | null }>(sql`
    SELECT ${orderItemPreviewsSql(sql`o.id`, 100)} AS previews
    FROM orders o WHERE o.order_number = ${orderNumber}
  `);
  return row?.previews ?? [];
}

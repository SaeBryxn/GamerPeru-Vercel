import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type VerificationQueueStatus = "SUBMITTED" | "VERIFYING";

export interface VerificationQueueItem {
  paymentId: string;
  paymentStatus: VerificationQueueStatus;
  amountCents: number;
  currency: string;
  methodName: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  customerEmail: string;
  customerPhone: string;
  itemCount: number;
  claimedByAuthUserId: string | null;
  claimedByEmail: string | null;
  claimedAt: string | null;
  submission: {
    id: string;
    attemptNumber: number;
    operationCode: string;
    submittedAt: string;
    isLate: boolean;
    hasProof: boolean;
  };
  /** Other orders whose submissions used the same operation code (anti-fraud index). */
  duplicateOrderNumbers: string[];
}

export interface VerificationDetail {
  paymentId: string;
  orderNumber: string;
  customerNotes: string | null;
  submissionNotes: string | null;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  orderCreatedAt: string;
  items: Array<{
    id: string;
    productName: string;
    variantTitle: string;
    sku: string;
    quantity: number;
    lineTotalCents: number;
  }>;
  address: {
    recipientName: string;
    phone: string;
    streetAddress: string;
    apartmentSuite: string | null;
    district: string;
    province: string;
    department: string;
    referenceNotes: string | null;
  } | null;
  history: Array<{
    submissionId: string;
    attemptNumber: number;
    operationCode: string;
    submittedAt: string;
    isLate: boolean;
    decision: string | null;
    rejectionReason: string | null;
    verifiedAt: string | null;
    verifierEmail: string | null;
  }>;
  /**
   * Only for late submissions, whose reservations were released: whether the stock can still be
   * reacquired. Approval is refused server-side when it cannot; this lets the UI say so upfront.
   */
  lateStock: {
    available: boolean;
    shortfalls: Array<{ sku: string; needed: number; available: number }>;
  } | null;
}

const QUEUE_LIMIT = 200;

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

/** Payments waiting on staff: submitted vouchers first-in first-out, claimed ones included. */
export async function listPaymentVerificationQueue(): Promise<VerificationQueueItem[]> {
  const rows = await db.execute<{
    payment_id: string;
    payment_status: VerificationQueueStatus;
    amount_cents: number;
    currency: string;
    method_name: string;
    order_id: string;
    order_number: string;
    order_status: string;
    customer_email: string;
    customer_phone: string;
    item_count: number;
    claimed_by: string | null;
    claimed_by_email: string | null;
    claimed_at: Date | null;
    submission_id: string;
    attempt_number: number;
    operation_code: string;
    submitted_at: Date;
    is_late: boolean;
    has_proof: boolean;
    duplicate_orders: string[] | null;
  }>(sql`
    SELECT
      p.id AS payment_id,
      p.status AS payment_status,
      p.amount_cents,
      p.currency,
      pm.name AS method_name,
      o.id AS order_id,
      o.order_number,
      o.status AS order_status,
      o.customer_email,
      o.customer_phone,
      (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
      p.verification_claimed_by_auth_user_id AS claimed_by,
      claimant.email AS claimed_by_email,
      p.verification_claimed_at AS claimed_at,
      s.id AS submission_id,
      s.attempt_number,
      s.operation_code,
      s.submitted_at,
      s.is_late,
      s.proof_media_id IS NOT NULL AS has_proof,
      dup.order_numbers AS duplicate_orders
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    JOIN payment_method_configurations pm ON pm.code = p.payment_method_code
    JOIN LATERAL (
      SELECT ps.id, ps.attempt_number, ps.operation_code, ps.submitted_at, ps.is_late, ps.proof_media_id
      FROM payment_submissions ps
      WHERE ps.payment_id = p.id
      ORDER BY ps.attempt_number DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN auth.users claimant ON claimant.id = p.verification_claimed_by_auth_user_id
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT o2.order_number ORDER BY o2.order_number) AS order_numbers
      FROM payment_submissions s2
      JOIN payments p2 ON p2.id = s2.payment_id
      JOIN orders o2 ON o2.id = p2.order_id
      WHERE s2.operation_code = s.operation_code AND s2.payment_id <> p.id
    ) dup ON true
    WHERE p.status IN ('SUBMITTED', 'VERIFYING')
    ORDER BY s.submitted_at ASC
    LIMIT ${QUEUE_LIMIT}
  `);

  return rows.map((row) => ({
    paymentId: row.payment_id,
    paymentStatus: row.payment_status,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    methodName: row.method_name,
    orderId: row.order_id,
    orderNumber: row.order_number,
    orderStatus: row.order_status,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    itemCount: Number(row.item_count),
    claimedByAuthUserId: row.claimed_by,
    claimedByEmail: row.claimed_by_email,
    claimedAt: iso(row.claimed_at),
    submission: {
      id: row.submission_id,
      attemptNumber: Number(row.attempt_number),
      operationCode: row.operation_code,
      submittedAt: iso(row.submitted_at)!,
      isLate: row.is_late,
      hasProof: row.has_proof,
    },
    duplicateOrderNumbers: row.duplicate_orders ?? [],
  }));
}

export async function getPaymentVerificationDetail(
  paymentId: string
): Promise<VerificationDetail | null> {
  const [order] = await db.execute<{
    order_id: string;
    order_number: string;
    customer_notes: string | null;
    subtotal_cents: number;
    shipping_cents: number;
    discount_cents: number;
    total_cents: number;
    created_at: Date;
  }>(sql`
    SELECT o.id AS order_id, o.order_number, o.customer_notes, o.subtotal_cents,
           o.shipping_cents, o.discount_cents, o.total_cents, o.created_at
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE p.id = ${paymentId}
  `);
  if (!order) return null;

  const [items, addresses, history, reservations] = await Promise.all([
    db.execute<{
      id: string;
      product_name_snapshot: string;
      variant_title_snapshot: string;
      sku_snapshot: string;
      quantity: number;
      line_total_cents: number;
    }>(sql`
      SELECT id, product_name_snapshot, variant_title_snapshot, sku_snapshot, quantity, line_total_cents
      FROM order_items WHERE order_id = ${order.order_id} ORDER BY created_at, id
    `),
    db.execute<{
      recipient_name: string;
      phone: string;
      street_address: string;
      apartment_suite: string | null;
      district: string;
      province: string;
      department: string;
      reference_notes: string | null;
    }>(sql`
      SELECT recipient_name, phone, street_address, apartment_suite, district, province,
             department, reference_notes
      FROM order_address_snapshots WHERE order_id = ${order.order_id} LIMIT 1
    `),
    db.execute<{
      submission_id: string;
      attempt_number: number;
      operation_code: string;
      submitted_at: Date;
      is_late: boolean;
      customer_notes: string | null;
      decision: string | null;
      rejection_reason: string | null;
      verified_at: Date | null;
      verifier_email: string | null;
    }>(sql`
      SELECT s.id AS submission_id, s.attempt_number, s.operation_code, s.submitted_at, s.is_late,
             s.customer_notes, v.decision, v.rejection_reason, v.verified_at,
             verifier.email AS verifier_email
      FROM payment_submissions s
      LEFT JOIN payment_verifications v ON v.submission_id = s.id
      LEFT JOIN auth.users verifier ON verifier.id = v.verifier_auth_user_id
      WHERE s.payment_id = ${paymentId}
      ORDER BY s.attempt_number DESC
    `),
    db.execute<{
      status: string;
      sku: string;
      needed: number;
      available: number;
    }>(sql`
      SELECT r.status, oi.sku_snapshot AS sku, sum(r.quantity)::int AS needed,
             (ii.quantity_on_hand - ii.quantity_reserved - ii.quantity_allocated)::int AS available
      FROM inventory_reservations r
      JOIN inventory_items ii ON ii.id = r.inventory_item_id
      JOIN order_items oi ON oi.id = r.order_item_id
      WHERE r.order_id = ${order.order_id}
      GROUP BY r.status, oi.sku_snapshot, ii.id
    `),
  ]);

  const latest = history[0];
  let lateStock: VerificationDetail["lateStock"] = null;
  if (latest?.is_late && reservations.length > 0) {
    const allReleased = reservations.every((r) => r.status === "RELEASED");
    const shortfalls = allReleased
      ? reservations
          .filter((r) => Number(r.available) < Number(r.needed))
          .map((r) => ({ sku: r.sku, needed: Number(r.needed), available: Number(r.available) }))
      : [];
    lateStock = { available: allReleased && shortfalls.length === 0, shortfalls };
  }

  const address = addresses[0];

  return {
    paymentId,
    orderNumber: order.order_number,
    customerNotes: order.customer_notes,
    submissionNotes: latest?.customer_notes ?? null,
    subtotalCents: Number(order.subtotal_cents),
    shippingCents: Number(order.shipping_cents),
    discountCents: Number(order.discount_cents),
    totalCents: Number(order.total_cents),
    orderCreatedAt: iso(order.created_at)!,
    items: items.map((item) => ({
      id: item.id,
      productName: item.product_name_snapshot,
      variantTitle: item.variant_title_snapshot,
      sku: item.sku_snapshot,
      quantity: Number(item.quantity),
      lineTotalCents: Number(item.line_total_cents),
    })),
    address: address
      ? {
          recipientName: address.recipient_name,
          phone: address.phone,
          streetAddress: address.street_address,
          apartmentSuite: address.apartment_suite,
          district: address.district,
          province: address.province,
          department: address.department,
          referenceNotes: address.reference_notes,
        }
      : null,
    history: history.map((entry) => ({
      submissionId: entry.submission_id,
      attemptNumber: Number(entry.attempt_number),
      operationCode: entry.operation_code,
      submittedAt: iso(entry.submitted_at)!,
      isLate: entry.is_late,
      decision: entry.decision,
      rejectionReason: entry.rejection_reason,
      verifiedAt: iso(entry.verified_at),
      verifierEmail: entry.verifier_email,
    })),
    lateStock,
  };
}

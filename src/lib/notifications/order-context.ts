import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { OrderEmailContext } from "./templates/types";

/**
 * Everything an order email shows, read at send time from the order itself. Outbox payloads
 * carry identifiers only, so no customer data is duplicated into the event log.
 */
export async function loadOrderEmailContext(
  orderId: string,
  siteUrl: string
): Promise<OrderEmailContext | null> {
  const [order] = await db.execute<{
    id: string;
    order_number: string;
    customer_email: string;
    subtotal_cents: number;
    discount_cents: number;
    shipping_cents: number;
    total_cents: number;
    recipient_name: string | null;
    method_name: string | null;
    instruction_recipient: string | null;
    account_identifier: string | null;
    instruction_text: string | null;
    pay_by: Date | null;
  }>(sql`
    SELECT o.id, o.order_number, o.customer_email, o.subtotal_cents, o.discount_cents,
           o.shipping_cents, o.total_cents,
           a.recipient_name,
           pm.name AS method_name,
           piv.recipient_name AS instruction_recipient,
           piv.account_identifier,
           piv.instruction_text,
           (SELECT min(r.expires_at) FROM inventory_reservations r
             WHERE r.order_id = o.id AND r.status = 'ACTIVE') AS pay_by
    FROM orders o
    LEFT JOIN order_address_snapshots a ON a.order_id = o.id
    LEFT JOIN payments p ON p.order_id = o.id
    LEFT JOIN payment_method_configurations pm ON pm.code = p.payment_method_code
    LEFT JOIN payment_instruction_versions piv ON piv.id = p.instruction_version_id
    WHERE o.id = ${orderId}
  `);
  if (!order) return null;

  const items = await db.execute<{
    product_name_snapshot: string;
    variant_title_snapshot: string;
    sku_snapshot: string;
    quantity: number;
    line_total_cents: number;
  }>(sql`
    SELECT product_name_snapshot, variant_title_snapshot, sku_snapshot, quantity, line_total_cents
    FROM order_items WHERE order_id = ${orderId} ORDER BY created_at, id
  `);

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    customerEmail: order.customer_email,
    recipientName: order.recipient_name,
    subtotalCents: Number(order.subtotal_cents),
    discountCents: Number(order.discount_cents),
    shippingCents: Number(order.shipping_cents),
    totalCents: Number(order.total_cents),
    items: items.map((item) => ({
      name: item.product_name_snapshot,
      variant: item.variant_title_snapshot,
      sku: item.sku_snapshot,
      quantity: Number(item.quantity),
      lineTotalCents: Number(item.line_total_cents),
    })),
    payment:
      order.method_name && order.instruction_recipient && order.account_identifier
        ? {
            methodName: order.method_name,
            recipientName: order.instruction_recipient,
            accountIdentifier: order.account_identifier,
            instructionText: order.instruction_text ?? "",
          }
        : null,
    payBy: order.pay_by ? new Date(order.pay_by).toISOString() : null,
    confirmationUrl: `${siteUrl}/checkout/confirmacion/${encodeURIComponent(order.order_number)}`,
  };
}

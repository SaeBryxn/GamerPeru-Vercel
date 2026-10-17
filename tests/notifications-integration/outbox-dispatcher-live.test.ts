import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { generateUuidV7 } from "@/db/utils/uuid";
import { generateAnonymousSessionToken } from "@/lib/cart/session";
import { submitCheckout } from "@/lib/checkout";
import type { EmailConfig } from "@/lib/email/config";
import type { EmailMessage, EmailProvider, EmailSendResult } from "@/lib/email/types";
import {
  claimOutboxBatch,
  deliverOutboxEvent,
  MAX_ATTEMPTS,
  MAX_EVENT_AGE_HOURS,
} from "@/lib/notifications/dispatcher";
import { submitPaymentProof } from "@/lib/payments/service";
import { approvePayment, claimPaymentVerification } from "@/lib/payments/verification-service";

function assertAuthorizedLocalPostgresTarget(rawUrl: string | undefined): string {
  const urlString = rawUrl ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
  const parsed = new URL(urlString);
  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "54322" ||
    parsed.pathname !== "/postgres"
  ) {
    throw new Error("[SAFETY_ERROR] Live dispatcher tests only run against 127.0.0.1:54322.");
  }
  return urlString;
}

type MockIdentity = { success: boolean; identity?: { authUserId: string; email: string } };

let currentMockCartCookie: string | null = null;
let currentMockPaymentSessionCookie: string | null = null;
let currentMockIdentity: MockIdentity = { success: false };

vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: (name: string) => {
        if (name === "gp_cart_session") {
          return currentMockCartCookie ? { value: currentMockCartCookie } : null;
        }
        if (name === "gp_payment_session" || name === "__Secure-gp_payment_session") {
          return currentMockPaymentSessionCookie
            ? { value: currentMockPaymentSessionCookie }
            : null;
        }
        return null;
      },
      set: vi.fn((name: string, val: string) => {
        if (name === "gp_cart_session") currentMockCartCookie = val;
        if (name === "gp_payment_session" || name === "__Secure-gp_payment_session") {
          currentMockPaymentSessionCookie = val;
        }
      }),
      delete: vi.fn(),
    })
  ),
  headers: vi.fn(() => Promise.resolve({ get: () => "127.0.0.1" })),
}));

vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: vi.fn(() => Promise.resolve(currentMockIdentity)),
}));

/**
 * Stand-in for Resend. Like Resend it accepts an idempotency key once, so `accepted` counts the
 * emails a customer would actually receive, while `calls` counts every attempt.
 */
class FakeProvider implements EmailProvider {
  readonly name = "fake";
  calls: EmailMessage[] = [];
  accepted = new Map<string, EmailMessage>();
  private script: EmailSendResult[] = [];

  failNext(...results: EmailSendResult[]) {
    this.script.push(...results);
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.calls.push(message);
    const scripted = this.script.shift();
    if (scripted) return scripted;
    if (!this.accepted.has(message.idempotencyKey)) {
      this.accepted.set(message.idempotencyKey, message);
    }
    return { ok: true, messageId: `fake-${message.idempotencyKey}` };
  }
}

const config: EmailConfig = {
  apiKey: "test",
  from: "Gamer Perú <pedidos@gamerperu.test>",
  replyTo: null,
  siteUrl: "https://gamerperu.test",
};

describe("GP-NOTIF — Live PostgreSQL outbox email dispatcher", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);
  let sql: postgres.Sql;

  const prefix = "0193e0a1-0000-7000-8000-";
  const brandId = `${prefix}000000000001`;
  const categoryId = `${prefix}000000000002`;
  const productId = `${prefix}000000000003`;
  const variantId = `${prefix}000000000004`;
  const locationId = `${prefix}000000000010`;
  const locationCode = "TEST-NOTIF-LOC";
  const shippingMethodId = `${prefix}000000000020`;
  const shippingMethodCode = "TEST_NOTIF_SHIPPING";
  const paymentMethodId = `${prefix}000000000030`;
  const paymentMethodCode = "TEST_NOTIF_YAPE";
  const paymentInstructionId = `${prefix}000000000031`;
  const inventoryItemId = `${prefix}000000000050`;
  const operator = `${prefix}000000000061`;
  const emailDomain = "notif.gamerperu.test";

  async function cleanFixtures() {
    const ourOrders = sql`SELECT id FROM orders WHERE customer_email LIKE ${`%@${emailDomain}`}`;
    const ourPayments = sql`SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode}`;
    const ourEvents = sql`
      SELECT id FROM outbox_events
      WHERE aggregate_id IN (SELECT id::text FROM orders WHERE customer_email LIKE ${`%@${emailDomain}`})
         OR aggregate_id IN (SELECT id::text FROM payments WHERE payment_method_code = ${paymentMethodCode})
    `;
    await sql`DELETE FROM notification_deliveries WHERE outbox_event_id IN (${ourEvents})`;
    await sql`DELETE FROM outbox_events WHERE id IN (${ourEvents})`;
    await sql`DELETE FROM payment_verifications WHERE payment_id IN (${ourPayments})`;
    await sql`DELETE FROM audit_events WHERE actor_id = ${operator}`;
    await sql`DELETE FROM payment_submissions WHERE payment_id IN (${ourPayments})`;
    await sql`DELETE FROM guest_payment_access_grants WHERE payment_id IN (${ourPayments})`;
    await sql`DELETE FROM inventory_ledger_entries WHERE inventory_item_id = ${inventoryItemId}`;
    await sql`DELETE FROM inventory_reservations WHERE inventory_item_id = ${inventoryItemId}`;
    await sql`DELETE FROM payments WHERE payment_method_code = ${paymentMethodCode}`;
    await sql`DELETE FROM order_pricing_snapshots WHERE order_id IN (${ourOrders})`;
    await sql`DELETE FROM order_address_snapshots WHERE order_id IN (${ourOrders})`;
    await sql`DELETE FROM shipments WHERE order_id IN (${ourOrders})`;
    await sql`DELETE FROM order_items WHERE variant_id = ${variantId}`;
    await sql`DELETE FROM orders WHERE customer_email LIKE ${`%@${emailDomain}`}`;
    await sql`DELETE FROM cart_items WHERE variant_id = ${variantId}`;
    await sql`DELETE FROM inventory_items WHERE id = ${inventoryItemId}`;
    await sql`DELETE FROM inventory_locations WHERE id = ${locationId}`;
    await sql`UPDATE payment_method_configurations SET current_instruction_version_id = NULL WHERE code = ${paymentMethodCode}`;
    await sql`DELETE FROM payment_instruction_versions WHERE payment_method_code = ${paymentMethodCode}`;
    await sql`DELETE FROM payment_method_configurations WHERE code = ${paymentMethodCode}`;
    await sql`DELETE FROM shipping_methods WHERE id = ${shippingMethodId}`;
    await sql`DELETE FROM product_variants WHERE id = ${variantId}`;
    await sql`DELETE FROM products WHERE id = ${productId}`;
    await sql`DELETE FROM categories WHERE id = ${categoryId}`;
    await sql`DELETE FROM brands WHERE id = ${brandId}`;
    await sql`DELETE FROM user_roles WHERE auth_user_id = ${operator}`;
    await sql`DELETE FROM auth.users WHERE id = ${operator}`;
  }

  beforeAll(async () => {
    process.env.CHECKOUT_HMAC_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = locationCode;
    process.env.CHECKOUT_RESERVATION_TTL_MINUTES = "30";
    process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES = "60";
    process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES = "60";
    process.env.ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES = "60";

    sql = postgres(connectionString, { max: 10, onnotice: () => {} });
    await cleanFixtures();

    await sql`INSERT INTO brands (id, name, slug, status) VALUES (${brandId}, 'Notif Brand', 'notif-brand', 'PUBLISHED')`;
    await sql`INSERT INTO categories (id, name, slug, status, display_order) VALUES (${categoryId}, 'Notif Category', 'notif-category', 'PUBLISHED', 1)`;
    await sql`
      INSERT INTO products (id, brand_id, category_id, name, slug, description, status)
      VALUES (${productId}, ${brandId}, ${categoryId}, 'Notif Mouse', 'notif-mouse', 'Mouse for dispatcher tests', 'PUBLISHED')
    `;
    await sql`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, status)
      VALUES (${variantId}, ${productId}, 'SKU-NOTIF-1', 'Negro', 15000, 'ACTIVE')
    `;
    await sql`
      INSERT INTO shipping_methods (id, code, name, base_price_cents, estimated_days_min, estimated_days_max, is_active)
      VALUES (${shippingMethodId}, ${shippingMethodCode}, 'Envío Notif', 1500, 1, 2, true)
    `;
    await sql`
      INSERT INTO payment_method_configurations (id, code, name, is_active, display_order)
      VALUES (${paymentMethodId}, ${paymentMethodCode}, 'Yape', true, 1)
    `;
    await sql`
      INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active)
      VALUES (${paymentInstructionId}, ${paymentMethodCode}, 1, 'Gamer Peru SAC', '987654321', 'Yapea el monto exacto e indica tu número de pedido.', true)
    `;
    await sql`UPDATE payment_method_configurations SET current_instruction_version_id = ${paymentInstructionId} WHERE id = ${paymentMethodId}`;
    await sql`INSERT INTO inventory_locations (id, code, name, is_active) VALUES (${locationId}, ${locationCode}, 'Almacén Notif', true)`;
    await sql`
      INSERT INTO inventory_items (id, location_id, variant_id, quantity_on_hand, quantity_reserved, quantity_allocated)
      VALUES (${inventoryItemId}, ${locationId}, ${variantId}, 100, 0, 0)
    `;
    await sql`
      INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
      VALUES (${operator}, ${`operator@${emailDomain}`}, '{"provider":"email","providers":["email"]}', '{}', false, NOW(), NOW())
    `;
    await sql`INSERT INTO user_roles (auth_user_id, role_id) VALUES (${operator}, (SELECT id FROM roles WHERE name = 'ADMIN_ORDERS'))`;
  });

  afterAll(async () => {
    if (!sql) return;
    await cleanFixtures();
    await sql.end();
  });

  let provider: FakeProvider;
  beforeEach(() => {
    provider = new FakeProvider();
  });

  async function placeOrder() {
    const cartToken = generateAnonymousSessionToken();
    currentMockCartCookie = cartToken;
    currentMockPaymentSessionCookie = null;
    currentMockIdentity = { success: false };
    const cartId = generateUuidV7();
    await sql`INSERT INTO carts (id, customer_id, session_token, status, expires_at) VALUES (${cartId}, NULL, ${cartToken}, 'ACTIVE', NOW() + INTERVAL '1 day')`;
    await sql`INSERT INTO cart_items (id, cart_id, variant_id, quantity) VALUES (${generateUuidV7()}, ${cartId}, ${variantId}, 2)`;

    const customerEmail = `cliente-${generateUuidV7().slice(-6)}@${emailDomain}`;
    const result = await submitCheckout({
      checkoutAttemptId: generateUuidV7(),
      shippingMethodCode,
      paymentMethodCode,
      customerEmail,
      deliveryAddress: {
        mode: "INLINE",
        address: {
          recipientName: "Lucía Mendoza",
          phone: "999888777",
          streetAddress: "Av. Arequipa 1234",
          district: "Lince",
          province: "Lima",
          department: "Lima",
          postalCode: "15046",
        },
      },
      reviewedSubtotalCents: 30000,
      reviewedShippingCents: 1500,
      reviewedTotalCents: 31500,
    });
    if (!result.success) throw new Error(`Checkout failed: ${result.code}`);

    const [row] = await sql`
      SELECT o.id AS order_id, p.id AS payment_id, e.id AS event_id
      FROM orders o
      JOIN payments p ON p.order_id = o.id
      JOIN outbox_events e ON e.aggregate_id = o.id::text AND e.event_name = 'OrderPlaced'
      WHERE o.order_number = ${result.orderNumber}
    `;
    return {
      orderNumber: result.orderNumber,
      customerEmail,
      orderId: row!.order_id as string,
      paymentId: row!.payment_id as string,
      eventId: row!.event_id as string,
      guestSession: currentMockPaymentSessionCookie,
    };
  }

  async function eventRow(eventId: string) {
    const [row] = await sql`
      SELECT status, retry_count, next_attempt_at, last_error, delivered_at
      FROM outbox_events WHERE id = ${eventId}
    `;
    return row!;
  }

  async function deliveries(eventId: string) {
    return sql`SELECT template, recipient, provider, provider_message_id FROM notification_deliveries WHERE outbox_event_id = ${eventId}`;
  }

  it("sends the OrderPlaced email with the Yape instructions and records one delivery", async () => {
    const order = await placeOrder();

    expect(await deliverOutboxEvent(order.eventId, { provider, config })).toBe("DELIVERED");

    expect(provider.calls).toHaveLength(1);
    const email = provider.calls[0]!;
    expect(email.to).toBe(order.customerEmail);
    expect(email.idempotencyKey).toBe(`outbox:${order.eventId}:order_placed`);
    expect(email.subject).toContain(order.orderNumber);
    expect(email.html).toContain("987654321");
    expect(email.html).toContain("Gamer Peru SAC");
    expect(email.html).toContain("S/ 315.00");
    expect(email.text).toContain("Hola, Lucía.");
    expect(email.text).toContain(
      `https://gamerperu.test/checkout/confirmacion/${order.orderNumber}`
    );
    expect(email.text).toMatch(/Paga antes del /);

    expect(await deliveries(order.eventId)).toEqual([
      {
        template: "order_placed",
        recipient: order.customerEmail,
        provider: "fake",
        provider_message_id: `fake-outbox:${order.eventId}:order_placed`,
      },
    ]);
    const event = await eventRow(order.eventId);
    expect(event.status).toBe("DELIVERED");
    expect(event.delivered_at).not.toBeNull();

    expect(await deliverOutboxEvent(order.eventId, { provider, config })).toBe("NOT_PENDING");
    expect(provider.calls).toHaveLength(1);
  });

  it("sends the PaymentApproved confirmation after staff verification", async () => {
    const order = await placeOrder();
    currentMockIdentity = { success: false };
    currentMockPaymentSessionCookie = order.guestSession;
    const submitted = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "04718233",
    });
    expect(submitted.success).toBe(true);
    const [submission] =
      await sql`SELECT id FROM payment_submissions WHERE payment_id = ${order.paymentId}`;

    currentMockIdentity = {
      success: true,
      identity: { authUserId: operator, email: `operator@${emailDomain}` },
    };
    await claimPaymentVerification({ paymentId: order.paymentId });
    const approved = await approvePayment({
      paymentId: order.paymentId,
      submissionId: submission!.id as string,
      verificationAttemptId: generateUuidV7(),
    });
    expect(approved.success).toBe(true);

    const [approvedEvent] = await sql`
      SELECT id FROM outbox_events WHERE aggregate_id = ${order.paymentId} AND event_name = 'PaymentApproved'
    `;
    const eventId = approvedEvent!.id as string;

    expect(await deliverOutboxEvent(eventId, { provider, config })).toBe("DELIVERED");
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({
      to: order.customerEmail,
      subject: `Pago confirmado · pedido ${order.orderNumber}`,
      idempotencyKey: `outbox:${eventId}:payment_approved`,
    });
    expect((await deliveries(eventId)).map((d) => d.template)).toEqual(["payment_approved"]);
  });

  it("suppresses the preparation email for a payment immediately refunded", async () => {
    const order = await placeOrder();
    const eventId = generateUuidV7();
    await sql`
      INSERT INTO outbox_events (id, event_name, event_version, aggregate_type, aggregate_id, payload, status)
      VALUES (${eventId}, 'PaymentApproved', 1, 'Payment', ${order.paymentId},
              ${sql.json({ orderId: order.orderId, immediatelyRefunded: true })}, 'PENDING')
    `;

    expect(await deliverOutboxEvent(eventId, { provider, config })).toBe("DELIVERED");
    expect(provider.calls).toHaveLength(0);
    expect(await deliveries(eventId)).toHaveLength(0);
    expect(await eventRow(eventId)).toMatchObject({
      status: "DELIVERED",
      last_error: "immediate refund: approval email suppressed",
    });
  });

  it("lets concurrent claims split the queue so no event is claimed twice", async () => {
    // Sequential: checkout reads the mocked cart cookie, which parallel orders would share.
    const orders = [await placeOrder(), await placeOrder(), await placeOrder()];
    const ours = new Set(orders.map((order) => order.eventId));

    const [first, second] = await Promise.all([claimOutboxBatch(500), claimOutboxBatch(500)]);
    const claimedOurs = [...first, ...second].filter((event) => ours.has(event.id));

    expect(claimedOurs).toHaveLength(3);
    expect(new Set(claimedOurs.map((event) => event.id)).size).toBe(3);

    // Leased: not claimable again until the lease expires.
    const third = await claimOutboxBatch(500);
    expect(third.filter((event) => ours.has(event.id))).toHaveLength(0);

    await sql`UPDATE outbox_events SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE id IN ${sql([...ours])}`;
    const afterLease = await claimOutboxBatch(500);
    expect(afterLease.filter((event) => ours.has(event.id))).toHaveLength(3);
  });

  it("never sends the same email twice when two workers deliver one event at once", async () => {
    const order = await placeOrder();

    const outcomes = await Promise.all([
      deliverOutboxEvent(order.eventId, { provider, config }),
      deliverOutboxEvent(order.eventId, { provider, config }),
    ]);

    expect(outcomes).toContain("DELIVERED");
    expect(provider.accepted.size).toBe(1);
    expect(await deliveries(order.eventId)).toHaveLength(1);
    expect((await eventRow(order.eventId)).status).toBe("DELIVERED");
  });

  it("resumes without resending when a crash hit between the send and the event update", async () => {
    const order = await placeOrder();
    await sql`
      INSERT INTO notification_deliveries (id, outbox_event_id, template, recipient, provider)
      VALUES (${generateUuidV7()}, ${order.eventId}, 'order_placed', ${order.customerEmail}, 'fake')
    `;

    expect(await deliverOutboxEvent(order.eventId, { provider, config })).toBe("DELIVERED");
    expect(provider.calls).toHaveLength(0);
  });

  it("backs off on a transient failure and delivers on the next attempt", async () => {
    const order = await placeOrder();
    provider.failNext({ ok: false, permanent: false, error: "resend_429: rate_limit_exceeded" });

    const startedAt = Date.now();
    expect(await deliverOutboxEvent(order.eventId, { provider, config })).toBe("RETRY_SCHEDULED");
    let event = await eventRow(order.eventId);
    expect(event).toMatchObject({
      status: "PENDING",
      retry_count: 1,
      last_error: "resend_429: rate_limit_exceeded",
    });
    const delayMs = new Date(event.next_attempt_at as Date).getTime() - startedAt;
    expect(delayMs).toBeGreaterThan(50_000);
    expect(delayMs).toBeLessThan(70_000);

    const notDue = await claimOutboxBatch(500);
    expect(notDue.map((e) => e.id)).not.toContain(order.eventId);

    expect(await deliverOutboxEvent(order.eventId, { provider, config })).toBe("DELIVERED");
    event = await eventRow(order.eventId);
    expect(event.status).toBe("DELIVERED");
    expect(provider.accepted.size).toBe(1);
  });

  it("fails permanently rejected messages without retrying", async () => {
    const order = await placeOrder();
    provider.failNext({ ok: false, permanent: true, error: "resend_422: validation_error" });

    expect(await deliverOutboxEvent(order.eventId, { provider, config })).toBe("FAILED");
    expect(await eventRow(order.eventId)).toMatchObject({
      status: "FAILED",
      last_error: "resend_422: validation_error",
    });
    expect(await deliveries(order.eventId)).toHaveLength(0);
  });

  it("gives up after the maximum number of attempts", async () => {
    const order = await placeOrder();
    await sql`UPDATE outbox_events SET retry_count = ${MAX_ATTEMPTS - 1} WHERE id = ${order.eventId}`;
    provider.failNext({ ok: false, permanent: false, error: "resend_500: internal_server_error" });

    expect(await deliverOutboxEvent(order.eventId, { provider, config })).toBe("FAILED");
    expect(await eventRow(order.eventId)).toMatchObject({
      status: "FAILED",
      retry_count: MAX_ATTEMPTS,
    });
  });

  it("skips events too old to be useful instead of emailing them late", async () => {
    const order = await placeOrder();
    await sql`
      UPDATE outbox_events SET created_at = NOW() - make_interval(hours => ${MAX_EVENT_AGE_HOURS + 1})
      WHERE id = ${order.eventId}
    `;

    expect(await deliverOutboxEvent(order.eventId, { provider, config })).toBe("STALE_SKIPPED");
    expect(provider.calls).toHaveLength(0);
    expect(await eventRow(order.eventId)).toMatchObject({
      status: "DELIVERED",
      last_error: "stale: not sent",
    });
  });

  it("leaves events without a template pending for when their template ships", async () => {
    const order = await placeOrder();
    currentMockIdentity = { success: false };
    currentMockPaymentSessionCookie = order.guestSession;
    await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: "55190027",
    });
    const [submittedEvent] = await sql`
      SELECT id FROM outbox_events WHERE aggregate_id = ${order.paymentId} AND event_name = 'PaymentSubmitted'
    `;

    const claimed = await claimOutboxBatch(500);
    expect(claimed.map((event) => event.id)).not.toContain(submittedEvent!.id);
    expect(await deliverOutboxEvent(submittedEvent!.id as string, { provider, config })).toBe(
      "NOT_PENDING"
    );
    expect((await eventRow(submittedEvent!.id as string)).status).toBe("PENDING");
  });
});

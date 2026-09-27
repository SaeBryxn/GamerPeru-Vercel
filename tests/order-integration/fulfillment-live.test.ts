import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { generateUuidV7 } from "@/db/utils/uuid";
import { generateAnonymousSessionToken } from "@/lib/cart/session";
import { submitCheckout } from "@/lib/checkout";
import {
  __setTestFulfillmentTransactionHook,
  dispatchOrder,
  markOrderDelivered,
  startOrderPreparation,
  updateShipmentTracking,
} from "@/lib/fulfillment/service";
import { cancelPaidPreShipmentAndRefund } from "@/lib/orders/service";
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
    throw new Error("[SAFETY_ERROR] Live fulfillment tests only run against 127.0.0.1:54322.");
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

describe("GP-027 — Live PostgreSQL order fulfillment", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);
  let sql: postgres.Sql;

  const prefix = "0193f027-0000-7000-8000-";
  const brandId = `${prefix}000000000001`;
  const categoryId = `${prefix}000000000002`;
  const productId = `${prefix}000000000003`;
  const variantId = `${prefix}000000000004`;
  const locationId = `${prefix}000000000010`;
  const locationCode = "TEST-FULFIL-LOC";
  const shippingMethodId = `${prefix}000000000020`;
  const shippingMethodCode = "TEST_FULFIL_SHIPPING";
  const paymentMethodId = `${prefix}000000000030`;
  const paymentMethodCode = "TEST_FULFIL_YAPE";
  const paymentInstructionId = `${prefix}000000000031`;
  const inventoryItemId = `${prefix}000000000050`;
  const operator = `${prefix}000000000061`;
  const catalogStaff = `${prefix}000000000062`;
  const staffIds = [operator, catalogStaff];
  const emailDomain = "fulfil.gamerperu.test";

  const actAs = (authUserId: string) => {
    currentMockIdentity = {
      success: true,
      identity: { authUserId, email: `staff-${authUserId.slice(-2)}@${emailDomain}` },
    };
  };

  const tracking = {
    courierName: "Olva Courier",
    trackingNumber: "OLV-000123",
    trackingUrl: "https://tracking.olvacourier.com/?guia=OLV-000123",
  };

  async function cleanFixtures() {
    const ourOrders = sql`SELECT id FROM orders WHERE customer_email LIKE ${`%@${emailDomain}`}`;
    const ourPayments = sql`SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode}`;
    await sql`DELETE FROM payment_verifications WHERE payment_id IN (${ourPayments})`;
    await sql`DELETE FROM refunds WHERE order_id IN (${ourOrders})`;
    await sql`DELETE FROM audit_events WHERE actor_id IN ${sql(staffIds)}`;
    await sql`DELETE FROM audit_events WHERE target_id IN (SELECT id::text FROM orders WHERE customer_email LIKE ${`%@${emailDomain}`})`;
    await sql`DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id::text FROM orders WHERE customer_email LIKE ${`%@${emailDomain}`})`;
    await sql`DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id::text FROM payments WHERE payment_method_code = ${paymentMethodCode})`;
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
    await sql`DELETE FROM user_roles WHERE auth_user_id IN ${sql(staffIds)}`;
    await sql`DELETE FROM auth.users WHERE id IN ${sql(staffIds)}`;
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

    await sql`INSERT INTO brands (id, name, slug, status) VALUES (${brandId}, 'Fulfil Brand', 'fulfil-brand', 'PUBLISHED')`;
    await sql`INSERT INTO categories (id, name, slug, status, display_order) VALUES (${categoryId}, 'Fulfil Category', 'fulfil-category', 'PUBLISHED', 1)`;
    await sql`
      INSERT INTO products (id, brand_id, category_id, name, slug, description, status)
      VALUES (${productId}, ${brandId}, ${categoryId}, 'Fulfil Mouse', 'fulfil-mouse', 'Mouse for fulfillment tests', 'PUBLISHED')
    `;
    await sql`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, status)
      VALUES (${variantId}, ${productId}, 'SKU-FULFIL-1', 'Fulfil Mouse Black', 15000, 'ACTIVE')
    `;
    await sql`
      INSERT INTO shipping_methods (id, code, name, base_price_cents, estimated_days_min, estimated_days_max, is_active)
      VALUES (${shippingMethodId}, ${shippingMethodCode}, 'Envío Fulfil', 1500, 1, 2, true)
    `;
    await sql`
      INSERT INTO payment_method_configurations (id, code, name, is_active, display_order)
      VALUES (${paymentMethodId}, ${paymentMethodCode}, 'Yape Fulfil', true, 1)
    `;
    await sql`
      INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active)
      VALUES (${paymentInstructionId}, ${paymentMethodCode}, 1, 'Gamer Peru SAC', '999888111', 'Yapea el monto exacto', true)
    `;
    await sql`UPDATE payment_method_configurations SET current_instruction_version_id = ${paymentInstructionId} WHERE id = ${paymentMethodId}`;
    await sql`INSERT INTO inventory_locations (id, code, name, is_active) VALUES (${locationId}, ${locationCode}, 'Almacén Fulfil', true)`;
    await sql`
      INSERT INTO inventory_items (id, location_id, variant_id, quantity_on_hand, quantity_reserved, quantity_allocated)
      VALUES (${inventoryItemId}, ${locationId}, ${variantId}, 100, 0, 0)
    `;
    for (const id of staffIds) {
      await sql`
        INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
        VALUES (${id}, ${`staff-${id.slice(-2)}@${emailDomain}`}, '{"provider":"email","providers":["email"]}', '{}', false, NOW(), NOW())
      `;
    }
    await sql`INSERT INTO user_roles (auth_user_id, role_id) VALUES (${operator}, (SELECT id FROM roles WHERE name = 'ADMIN_ORDERS'))`;
    await sql`INSERT INTO user_roles (auth_user_id, role_id) VALUES (${catalogStaff}, (SELECT id FROM roles WHERE name = 'ADMIN_CATALOG'))`;
  });

  afterEach(() => __setTestFulfillmentTransactionHook(null));

  afterAll(async () => {
    if (!sql) return;
    await cleanFixtures();
    await sql.end();
  });

  async function createOrder(quantity = 1) {
    const cartToken = generateAnonymousSessionToken();
    currentMockCartCookie = cartToken;
    currentMockPaymentSessionCookie = null;
    currentMockIdentity = { success: false };
    const cartId = generateUuidV7();
    await sql`INSERT INTO carts (id, customer_id, session_token, status, expires_at) VALUES (${cartId}, NULL, ${cartToken}, 'ACTIVE', NOW() + INTERVAL '1 day')`;
    await sql`INSERT INTO cart_items (id, cart_id, variant_id, quantity) VALUES (${generateUuidV7()}, ${cartId}, ${variantId}, ${quantity})`;

    const result = await submitCheckout({
      checkoutAttemptId: generateUuidV7(),
      shippingMethodCode,
      paymentMethodCode,
      customerEmail: `cliente-${generateUuidV7().slice(-6)}@${emailDomain}`,
      deliveryAddress: {
        mode: "INLINE",
        address: {
          recipientName: "Cliente Despacho",
          phone: "999888777",
          streetAddress: "Av. Brasil 2020",
          district: "Jesús María",
          province: "Lima",
          department: "Lima",
          postalCode: "15072",
        },
      },
      reviewedSubtotalCents: 15000 * quantity,
      reviewedShippingCents: 1500,
      reviewedTotalCents: 15000 * quantity + 1500,
    });
    if (!result.success) throw new Error(`Checkout failed: ${result.code}`);
    const [row] = await sql`
      SELECT o.id AS order_id, p.id AS payment_id FROM orders o JOIN payments p ON p.order_id = o.id
      WHERE o.order_number = ${result.orderNumber}
    `;
    return {
      orderNumber: result.orderNumber,
      orderId: row!.order_id as string,
      paymentId: row!.payment_id as string,
      guestSession: currentMockPaymentSessionCookie,
    };
  }

  async function paidOrder(quantity = 1, options: { late?: boolean } = {}) {
    const order = await createOrder(quantity);
    if (options.late) {
      await sql`UPDATE inventory_reservations SET expires_at = NOW() - INTERVAL '5 minutes' WHERE order_id = ${order.orderId}`;
    }
    currentMockIdentity = { success: false };
    currentMockPaymentSessionCookie = order.guestSession;
    const submitted = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: `OP-${generateUuidV7().slice(-8)}`,
    });
    if (!submitted.success) throw new Error(`Submission failed: ${submitted.code}`);
    const [submission] =
      await sql`SELECT id FROM payment_submissions WHERE payment_id = ${order.paymentId}`;

    actAs(operator);
    await claimPaymentVerification({ paymentId: order.paymentId });
    const approved = await approvePayment({
      paymentId: order.paymentId,
      submissionId: submission!.id as string,
      verificationAttemptId: generateUuidV7(),
    });
    if (!approved.success) throw new Error(`Approval failed: ${approved.code}`);
    return order;
  }

  async function inventory() {
    const [row] = await sql`
      SELECT quantity_on_hand, quantity_reserved, quantity_allocated FROM inventory_items WHERE id = ${inventoryItemId}
    `;
    return {
      onHand: row!.quantity_on_hand as number,
      reserved: row!.quantity_reserved as number,
      allocated: row!.quantity_allocated as number,
    };
  }

  async function state(orderId: string) {
    const [row] = await sql`
      SELECT o.status AS order_status, s.status AS shipment_status, s.courier_name, s.tracking_number,
             s.tracking_url, s.shipped_at, s.delivered_at
      FROM orders o JOIN shipments s ON s.order_id = o.id WHERE o.id = ${orderId}
    `;
    return row!;
  }

  async function reservationStatuses(orderId: string) {
    const rows = await sql`SELECT status FROM inventory_reservations WHERE order_id = ${orderId}`;
    return rows.map((r) => r.status as string).sort();
  }

  it("takes a paid order through preparation, dispatch and delivery, consuming stock once", async () => {
    const before = await inventory();
    const order = await paidOrder(2);
    const afterApproval = await inventory();
    expect(afterApproval.allocated).toBe(before.allocated + 2);

    actAs(operator);
    expect(await startOrderPreparation({ orderNumber: order.orderNumber })).toMatchObject({
      success: true,
      orderStatus: "CONFIRMED",
      shipmentStatus: "READY_TO_PACK",
      replayed: false,
    });

    const dispatched = await dispatchOrder({ orderNumber: order.orderNumber, ...tracking });
    expect(dispatched).toMatchObject({ success: true, shipmentStatus: "SHIPPED", replayed: false });

    const shipped = await state(order.orderId);
    expect(shipped).toMatchObject({
      order_status: "CONFIRMED",
      shipment_status: "SHIPPED",
      courier_name: tracking.courierName,
      tracking_number: tracking.trackingNumber,
      tracking_url: tracking.trackingUrl,
    });
    expect(shipped.shipped_at).not.toBeNull();
    expect(await reservationStatuses(order.orderId)).toEqual(["CONSUMED"]);

    const afterDispatch = await inventory();
    expect(afterDispatch.onHand).toBe(afterApproval.onHand - 2);
    expect(afterDispatch.allocated).toBe(afterApproval.allocated - 2);
    expect(afterDispatch.reserved).toBe(afterApproval.reserved);

    const ledger = await sql`
      SELECT on_hand_delta, allocated_delta, quantity_on_hand_after, quantity_allocated_after
      FROM inventory_ledger_entries
      WHERE reference_id = ${order.orderId} AND movement_type = 'FULFILLMENT_DISPATCHED'
    `;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      on_hand_delta: -2,
      allocated_delta: -2,
      quantity_on_hand_after: afterDispatch.onHand,
      quantity_allocated_after: afterDispatch.allocated,
    });

    expect(await markOrderDelivered({ orderNumber: order.orderNumber })).toMatchObject({
      success: true,
      orderStatus: "FULFILLED",
      shipmentStatus: "DELIVERED",
    });
    const delivered = await state(order.orderId);
    expect(delivered.order_status).toBe("FULFILLED");
    expect(delivered.delivered_at).not.toBeNull();

    const events = await sql`
      SELECT event_name FROM outbox_events WHERE aggregate_id = ${order.orderId} ORDER BY created_at
    `;
    expect(events.map((e) => e.event_name)).toEqual(
      expect.arrayContaining(["OrderShipped", "OrderDelivered"])
    );
    const audits = await sql`
      SELECT action FROM audit_events WHERE target_id = ${order.orderId} AND actor_id = ${operator}
    `;
    expect(audits.map((a) => a.action).sort()).toEqual([
      "orders:dispatch",
      "orders:mark_delivered",
      "orders:start_preparation",
    ]);
  });

  it("refuses steps out of order and callers without orders:manage", async () => {
    const unpaid = await createOrder(1);
    actAs(operator);
    expect(await startOrderPreparation({ orderNumber: unpaid.orderNumber })).toMatchObject({
      success: false,
      code: "PAYMENT_NOT_CONFIRMED",
    });

    const order = await paidOrder(1);
    actAs(catalogStaff);
    expect(await startOrderPreparation({ orderNumber: order.orderNumber })).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });

    actAs(operator);
    expect(await dispatchOrder({ orderNumber: order.orderNumber, ...tracking })).toMatchObject({
      success: false,
      code: "INVALID_SHIPMENT_STATE",
    });
    expect(await markOrderDelivered({ orderNumber: order.orderNumber })).toMatchObject({
      success: false,
      code: "INVALID_SHIPMENT_STATE",
    });
    expect((await state(order.orderId)).shipment_status).toBe("UNFULFILLED");
  });

  it("closes the paid pre-shipment cancellation once preparation starts", async () => {
    const order = await paidOrder(1);
    actAs(operator);
    await startOrderPreparation({ orderNumber: order.orderNumber });

    const cancellation = await cancelPaidPreShipmentAndRefund({
      orderNumber: order.orderNumber,
      reason: "Cliente se arrepintió",
      cancellationAttemptId: generateUuidV7(),
    });
    expect(cancellation).toMatchObject({ success: false, code: "FULFILLMENT_ALREADY_STARTED" });
  });

  it("validates courier details and lets them be corrected after dispatch", async () => {
    const order = await paidOrder(1);
    actAs(operator);
    await startOrderPreparation({ orderNumber: order.orderNumber });

    expect(
      await updateShipmentTracking({ orderNumber: order.orderNumber, courierName: " " })
    ).toMatchObject({ success: false, code: "INVALID_INPUT" });
    expect(
      await dispatchOrder({
        orderNumber: order.orderNumber,
        courierName: "Shalom",
        trackingUrl: "http://inseguro.example/guia",
      })
    ).toMatchObject({ success: false, code: "INVALID_INPUT" });

    await dispatchOrder({ orderNumber: order.orderNumber, ...tracking });
    const corrected = await updateShipmentTracking({
      orderNumber: order.orderNumber,
      courierName: "Olva Courier",
      trackingNumber: "OLV-000124",
      trackingUrl: null,
    });
    expect(corrected).toMatchObject({ success: true, shipmentStatus: "SHIPPED" });
    expect(await state(order.orderId)).toMatchObject({
      tracking_number: "OLV-000124",
      tracking_url: null,
    });
  });

  it("treats a repeated dispatch as a replay and refuses a conflicting one", async () => {
    const order = await paidOrder(1);
    actAs(operator);
    await startOrderPreparation({ orderNumber: order.orderNumber });
    await dispatchOrder({ orderNumber: order.orderNumber, ...tracking });
    const afterFirst = await inventory();

    expect(await dispatchOrder({ orderNumber: order.orderNumber, ...tracking })).toMatchObject({
      success: true,
      replayed: true,
    });
    expect(
      await dispatchOrder({ orderNumber: order.orderNumber, courierName: "Shalom Empresarial" })
    ).toMatchObject({ success: false, code: "ALREADY_DISPATCHED" });
    expect(await inventory()).toEqual(afterFirst);
  });

  it("consumes stock exactly once when two dispatches race", async () => {
    const order = await paidOrder(3);
    actAs(operator);
    await startOrderPreparation({ orderNumber: order.orderNumber });
    const before = await inventory();

    let releaseFirst: () => void = () => {};
    const firstHolding = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    __setTestFulfillmentTransactionHook(async () => {
      if (calls++ === 0) await firstHolding;
    });

    const first = dispatchOrder({ orderNumber: order.orderNumber, ...tracking });
    const second = dispatchOrder({ orderNumber: order.orderNumber, ...tracking });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [lockWait] = await sql`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND datname = 'postgres'
    `;
    expect(lockWait!.waiting).toBeGreaterThanOrEqual(1);
    releaseFirst();

    const results = await Promise.all([first, second]);
    expect(results.filter((r) => r.success && !r.replayed)).toHaveLength(1);
    expect(results.filter((r) => r.success && r.replayed)).toHaveLength(1);

    const after = await inventory();
    expect(after.onHand).toBe(before.onHand - 3);
    expect(after.allocated).toBe(before.allocated - 3);
    const [ledgerCount] = await sql`
      SELECT count(*)::int AS entries FROM inventory_ledger_entries
      WHERE reference_id = ${order.orderId} AND movement_type = 'FULFILLMENT_DISPATCHED'
    `;
    expect(ledgerCount!.entries).toBe(1);
  });

  it("dispatches a late-approved order, consuming only its replacement allocation", async () => {
    const before = await inventory();
    const order = await paidOrder(1, { late: true });
    expect(await reservationStatuses(order.orderId)).toEqual(["ALLOCATED", "RELEASED"]);

    actAs(operator);
    await startOrderPreparation({ orderNumber: order.orderNumber });
    expect(await dispatchOrder({ orderNumber: order.orderNumber, ...tracking })).toMatchObject({
      success: true,
      shipmentStatus: "SHIPPED",
    });
    expect(await reservationStatuses(order.orderId)).toEqual(["CONSUMED", "RELEASED"]);
    const after = await inventory();
    expect(after.onHand).toBe(before.onHand - 1);
    expect(after.allocated).toBe(before.allocated);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { S3Client } from "@aws-sdk/client-s3";
import { generateUuidV7 } from "@/db/utils/uuid";
import { logger } from "@/lib/logger";
import { generateAnonymousSessionToken } from "@/lib/cart/session";
import { submitCheckout } from "@/lib/checkout";
import { getPaymentProofViewUrl } from "@/lib/payments/proof-viewer";
import { submitPaymentProof } from "@/lib/payments/service";
import { setTestStorageClientOverride } from "@/lib/storage/private-config";
import {
  approvePayment,
  claimPaymentVerification,
  LATE_PAYMENT_STOCK_UNAVAILABLE_MESSAGE,
  recordLatePaymentRefund,
  rejectPayment,
  releasePaymentVerificationClaim,
  __setTestPaymentVerificationTransactionHook,
} from "@/lib/payments/verification-service";

function assertAuthorizedLocalPostgresTarget(rawUrl: string | undefined): string {
  const urlString = rawUrl ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
  const parsed = new URL(urlString);
  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "54322" ||
    parsed.pathname !== "/postgres"
  ) {
    throw new Error(
      "[SAFETY_ERROR] Live payment verification tests only run against 127.0.0.1:54322/postgres."
    );
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
      delete: vi.fn((name: string) => {
        if (name === "gp_cart_session") currentMockCartCookie = null;
        if (name === "gp_payment_session" || name === "__Secure-gp_payment_session") {
          currentMockPaymentSessionCookie = null;
        }
      }),
    })
  ),
  headers: vi.fn(() => Promise.resolve({ get: () => "127.0.0.1" })),
}));

// The identity is read synchronously when a service call starts, so concurrent calls issued
// one after another under different identities each keep their own operator.
vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: vi.fn(() => Promise.resolve(currentMockIdentity)),
}));

describe("GP-028 — Live PostgreSQL payment verification", () => {
  const connectionString = assertAuthorizedLocalPostgresTarget(process.env.DATABASE_URL);
  let sql: postgres.Sql;

  const prefix = "0193a028-0000-7000-8000-";
  const brandId = `${prefix}000000000001`;
  const categoryId = `${prefix}000000000002`;
  const productId = `${prefix}000000000003`;
  const variantId1 = `${prefix}000000000004`;
  const variantId2 = `${prefix}000000000005`;
  const locationId = `${prefix}000000000010`;
  const locationCode = "TEST-VERIF-LOC";
  const shippingMethodId = `${prefix}000000000020`;
  const shippingMethodCode = "TEST_VERIF_SHIPPING";
  const paymentMethodId = `${prefix}000000000030`;
  const paymentMethodCode = "TEST_VERIF_YAPE";
  const paymentInstructionId = `${prefix}000000000031`;
  const inventoryItemId1 = `${prefix}000000000050`;
  const inventoryItemId2 = `${prefix}000000000051`;

  const operatorA = `${prefix}000000000061`;
  const operatorB = `${prefix}000000000062`;
  const superAdmin = `${prefix}000000000063`;
  const catalogStaff = `${prefix}000000000064`;
  const staffIds = [operatorA, operatorB, superAdmin, catalogStaff];

  // Other live suites clean orders by '%@gamerperu.pe'; a separate domain keeps their cleanup
  // from tripping over the RESTRICT foreign keys of payment_verifications.
  const emailDomain = "verif.gamerperu.test";

  const inlineDeliveryAddress = {
    mode: "INLINE" as const,
    address: {
      recipientName: "Operador Pruebas",
      phone: "999888777",
      streetAddress: "Av. Arequipa 1234",
      district: "Lince",
      province: "Lima",
      department: "Lima",
      postalCode: "15046",
    },
  };

  const actAs = (authUserId: string) => {
    currentMockIdentity = {
      success: true,
      identity: { authUserId, email: `staff-${authUserId.slice(-2)}@${emailDomain}` },
    };
  };

  async function cleanFixtures() {
    const ourOrders = sql`SELECT id FROM orders WHERE customer_email LIKE ${`%@${emailDomain}`}`;
    const ourPayments = sql`SELECT id FROM payments WHERE payment_method_code = ${paymentMethodCode}`;
    await sql`DELETE FROM payment_verifications WHERE payment_id IN (${ourPayments})`;
    await sql`DELETE FROM audit_events WHERE actor_id IN ${sql(staffIds)}`;
    await sql`DELETE FROM audit_events WHERE target_id IN (SELECT id::text FROM orders WHERE customer_email LIKE ${`%@${emailDomain}`})`;
    await sql`DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id::text FROM payments WHERE payment_method_code = ${paymentMethodCode})`;
    await sql`DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id::text FROM orders WHERE customer_email LIKE ${`%@${emailDomain}`})`;
    await sql`DELETE FROM refunds WHERE payment_id IN (${ourPayments})`;
    await sql`DELETE FROM payment_submissions WHERE payment_id IN (${ourPayments})`;
    await sql`DELETE FROM media_assets WHERE object_key LIKE 'payment-proofs/final/%/test/proof.png'`;
    await sql`DELETE FROM payment_proof_upload_intents WHERE payment_id IN (${ourPayments})`;
    await sql`DELETE FROM guest_payment_access_grants WHERE payment_id IN (${ourPayments})`;
    await sql`DELETE FROM inventory_ledger_entries WHERE inventory_item_id IN (${inventoryItemId1}, ${inventoryItemId2})`;
    await sql`DELETE FROM inventory_reservations WHERE inventory_item_id IN (${inventoryItemId1}, ${inventoryItemId2})`;
    await sql`DELETE FROM payments WHERE payment_method_code = ${paymentMethodCode}`;
    await sql`DELETE FROM order_pricing_snapshots WHERE order_id IN (${ourOrders})`;
    await sql`DELETE FROM order_address_snapshots WHERE order_id IN (${ourOrders})`;
    await sql`DELETE FROM shipments WHERE order_id IN (${ourOrders})`;
    await sql`DELETE FROM order_items WHERE variant_id IN (${variantId1}, ${variantId2})`;
    await sql`DELETE FROM orders WHERE customer_email LIKE ${`%@${emailDomain}`}`;
    await sql`DELETE FROM cart_items WHERE variant_id IN (${variantId1}, ${variantId2})`;
    await sql`DELETE FROM inventory_items WHERE id IN (${inventoryItemId1}, ${inventoryItemId2})`;
    await sql`DELETE FROM inventory_locations WHERE id = ${locationId}`;
    await sql`UPDATE payment_method_configurations SET current_instruction_version_id = NULL WHERE code = ${paymentMethodCode}`;
    await sql`DELETE FROM payment_instruction_versions WHERE payment_method_code = ${paymentMethodCode}`;
    await sql`DELETE FROM payment_method_configurations WHERE code = ${paymentMethodCode}`;
    await sql`DELETE FROM shipping_methods WHERE id = ${shippingMethodId}`;
    await sql`DELETE FROM product_variants WHERE id IN (${variantId1}, ${variantId2})`;
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
    delete process.env.PAYMENT_RESUBMISSION_GRACE_HOURS;

    sql = postgres(connectionString, { max: 10, onnotice: () => {} });
    await cleanFixtures();

    await sql`INSERT INTO brands (id, name, slug, status) VALUES (${brandId}, 'Verif Brand', 'verif-brand', 'PUBLISHED')`;
    await sql`INSERT INTO categories (id, name, slug, status, display_order) VALUES (${categoryId}, 'Verif Category', 'verif-category', 'PUBLISHED', 1)`;
    await sql`
      INSERT INTO products (id, brand_id, category_id, name, slug, description, status)
      VALUES (${productId}, ${brandId}, ${categoryId}, 'Verif Mouse', 'verif-mouse', 'Mouse for verification tests', 'PUBLISHED')
    `;
    await sql`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, status)
      VALUES
        (${variantId1}, ${productId}, 'SKU-VERIF-1', 'Verif Mouse Black', 15000, 'ACTIVE'),
        (${variantId2}, ${productId}, 'SKU-VERIF-2', 'Verif Mouse White', 15000, 'ACTIVE')
    `;
    await sql`
      INSERT INTO shipping_methods (id, code, name, base_price_cents, estimated_days_min, estimated_days_max, is_active)
      VALUES (${shippingMethodId}, ${shippingMethodCode}, 'Envío Verif', 1500, 1, 2, true)
    `;
    await sql`
      INSERT INTO payment_method_configurations (id, code, name, is_active, display_order)
      VALUES (${paymentMethodId}, ${paymentMethodCode}, 'Yape Verif', true, 1)
    `;
    await sql`
      INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active)
      VALUES (${paymentInstructionId}, ${paymentMethodCode}, 1, 'Gamer Peru SAC', '999888111', 'Yapea el monto exacto', true)
    `;
    await sql`UPDATE payment_method_configurations SET current_instruction_version_id = ${paymentInstructionId} WHERE id = ${paymentMethodId}`;
    await sql`INSERT INTO inventory_locations (id, code, name, is_active) VALUES (${locationId}, ${locationCode}, 'Almacén Verif', true)`;
    await sql`
      INSERT INTO inventory_items (id, location_id, variant_id, quantity_on_hand, quantity_reserved, quantity_allocated)
      VALUES (${inventoryItemId1}, ${locationId}, ${variantId1}, 100, 0, 0),
             (${inventoryItemId2}, ${locationId}, ${variantId2}, 100, 0, 0)
    `;

    for (const id of staffIds) {
      await sql`
        INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
        VALUES (${id}, ${`staff-${id.slice(-2)}@${emailDomain}`}, '{"provider":"email","providers":["email"]}', '{}', false, NOW(), NOW())
      `;
    }
    const grant = (id: string, role: string) =>
      sql`INSERT INTO user_roles (auth_user_id, role_id) VALUES (${id}, (SELECT id FROM roles WHERE name = ${role}))`;
    await grant(operatorA, "ADMIN_ORDERS");
    await grant(operatorB, "ADMIN_ORDERS");
    await grant(superAdmin, "SUPER_ADMIN");
    await grant(catalogStaff, "ADMIN_CATALOG");
  });

  afterEach(() => {
    __setTestPaymentVerificationTransactionHook(null);
    delete process.env.PAYMENT_RESUBMISSION_GRACE_HOURS;
  });

  afterAll(async () => {
    if (!sql) return;
    await cleanFixtures();
    await sql.end();
  });

  async function createOrder(variantId = variantId1, quantity = 1) {
    const cartToken = generateAnonymousSessionToken();
    currentMockCartCookie = cartToken;
    currentMockPaymentSessionCookie = null;
    currentMockIdentity = { success: false };

    const cartId = generateUuidV7();
    await sql`
      INSERT INTO carts (id, customer_id, session_token, status, expires_at)
      VALUES (${cartId}, NULL, ${cartToken}, 'ACTIVE', NOW() + INTERVAL '1 day')
    `;
    await sql`
      INSERT INTO cart_items (id, cart_id, variant_id, quantity)
      VALUES (${generateUuidV7()}, ${cartId}, ${variantId}, ${quantity})
    `;

    const subtotal = 15000 * quantity;
    const result = await submitCheckout({
      checkoutAttemptId: generateUuidV7(),
      shippingMethodCode,
      paymentMethodCode,
      customerEmail: `cliente-${generateUuidV7().slice(-6)}@${emailDomain}`,
      deliveryAddress: inlineDeliveryAddress,
      reviewedSubtotalCents: subtotal,
      reviewedShippingCents: 1500,
      reviewedTotalCents: subtotal + 1500,
    });
    if (!result.success) throw new Error(`Checkout failed: ${result.code}`);

    const [row] = await sql`
      SELECT o.id AS order_id, p.id AS payment_id
      FROM orders o JOIN payments p ON p.order_id = o.id
      WHERE o.order_number = ${result.orderNumber}
    `;
    return {
      orderNumber: result.orderNumber,
      orderId: row!.order_id as string,
      paymentId: row!.payment_id as string,
      guestSession: currentMockPaymentSessionCookie,
    };
  }

  async function submitAsCustomer(order: Awaited<ReturnType<typeof createOrder>>) {
    currentMockIdentity = { success: false };
    currentMockPaymentSessionCookie = order.guestSession;
    const result = await submitPaymentProof({
      orderNumber: order.orderNumber,
      submissionAttemptId: generateUuidV7(),
      operationCode: `OP-${generateUuidV7().slice(-8)}`,
    });
    if (!result.success) throw new Error(`Submission failed: ${result.code}`);
    const [submission] = await sql`
      SELECT id FROM payment_submissions WHERE payment_id = ${order.paymentId}
      ORDER BY attempt_number DESC LIMIT 1
    `;
    return submission!.id as string;
  }

  async function submittedOrder(variantId = variantId1, quantity = 1) {
    const order = await createOrder(variantId, quantity);
    const submissionId = await submitAsCustomer(order);
    return { ...order, submissionId };
  }

  async function scalar(query: Promise<postgres.RowList<postgres.Row[]>>): Promise<number> {
    const [row] = await query;
    return Object.values(row!)[0] as number;
  }

  async function inventory(itemId: string) {
    const [row] = await sql`
      SELECT quantity_on_hand, quantity_reserved, quantity_allocated
      FROM inventory_items WHERE id = ${itemId}
    `;
    return {
      onHand: row!.quantity_on_hand as number,
      reserved: row!.quantity_reserved as number,
      allocated: row!.quantity_allocated as number,
    };
  }

  async function paymentRow(paymentId: string) {
    const [row] = await sql`
      SELECT status, verification_claimed_by_auth_user_id, verification_claimed_at, resubmission_grace_expires_at
      FROM payments WHERE id = ${paymentId}
    `;
    return row!;
  }

  async function orderStatus(orderId: string) {
    const [row] = await sql`SELECT status FROM orders WHERE id = ${orderId}`;
    return row!.status as string;
  }

  async function reservationStatuses(orderId: string) {
    const rows = await sql`SELECT status FROM inventory_reservations WHERE order_id = ${orderId}`;
    return rows.map((r) => r.status as string).sort();
  }

  describe("authorization", () => {
    it("refuses callers without orders:verify", async () => {
      const order = await submittedOrder();

      currentMockIdentity = { success: false };
      expect(await claimPaymentVerification({ paymentId: order.paymentId })).toMatchObject({
        success: false,
        code: "UNAUTHORIZED",
      });

      actAs(catalogStaff);
      expect(await claimPaymentVerification({ paymentId: order.paymentId })).toMatchObject({
        success: false,
        code: "UNAUTHORIZED",
      });
      expect(
        await approvePayment({
          paymentId: order.paymentId,
          submissionId: order.submissionId,
          verificationAttemptId: generateUuidV7(),
        })
      ).toMatchObject({ success: false, code: "UNAUTHORIZED" });
      expect(
        await recordLatePaymentRefund({
          paymentId: order.paymentId,
          submissionId: order.submissionId,
          verificationAttemptId: generateUuidV7(),
          externalRefundCompleted: true,
          externalReference: "REF-UNAUTHORIZED-028",
        })
      ).toMatchObject({ success: false, code: "UNAUTHORIZED" });

      expect((await paymentRow(order.paymentId)).status).toBe("SUBMITTED");
    });

    it("requires a claim before deciding", async () => {
      const order = await submittedOrder();
      actAs(operatorA);

      const result = await approvePayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
      });

      expect(result).toMatchObject({ success: false, code: "CLAIM_REQUIRED" });
      expect((await paymentRow(order.paymentId)).status).toBe("SUBMITTED");
    });
  });

  describe("claiming", () => {
    it("assigns the payment to the operator and blocks everyone else", async () => {
      const order = await submittedOrder();

      actAs(operatorA);
      const claim = await claimPaymentVerification({ paymentId: order.paymentId });
      expect(claim).toMatchObject({ success: true, claimedByAuthUserId: operatorA });

      const row = await paymentRow(order.paymentId);
      expect(row.status).toBe("VERIFYING");
      expect(row.verification_claimed_by_auth_user_id).toBe(operatorA);
      expect(row.verification_claimed_at).not.toBeNull();

      expect(await claimPaymentVerification({ paymentId: order.paymentId })).toMatchObject({
        success: true,
        alreadyClaimed: true,
      });

      actAs(operatorB);
      expect(await claimPaymentVerification({ paymentId: order.paymentId })).toMatchObject({
        success: false,
        code: "CLAIMED_BY_OTHER",
      });
      expect(
        await approvePayment({
          paymentId: order.paymentId,
          submissionId: order.submissionId,
          verificationAttemptId: generateUuidV7(),
        })
      ).toMatchObject({ success: false, code: "CLAIMED_BY_OTHER" });
    });

    it("lets exactly one of two operators win a simultaneous claim", async () => {
      const order = await submittedOrder();

      actAs(operatorA);
      const claimA = claimPaymentVerification({ paymentId: order.paymentId });
      actAs(operatorB);
      const claimB = claimPaymentVerification({ paymentId: order.paymentId });
      const results = await Promise.all([claimA, claimB]);

      const winners = results.filter((r) => r.success);
      const losers = results.filter((r) => !r.success);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0]).toMatchObject({ code: "CLAIMED_BY_OTHER" });

      const winner = winners[0] as Extract<(typeof results)[number], { success: true }>;
      const row = await paymentRow(order.paymentId);
      expect(row.verification_claimed_by_auth_user_id).toBe(winner.claimedByAuthUserId);
    });

    it("releases a claim only for its owner or a staff manager", async () => {
      const order = await submittedOrder();
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });

      actAs(operatorB);
      expect(await releasePaymentVerificationClaim({ paymentId: order.paymentId })).toMatchObject({
        success: false,
        code: "CLAIMED_BY_OTHER",
      });

      actAs(operatorA);
      expect(await releasePaymentVerificationClaim({ paymentId: order.paymentId })).toMatchObject({
        success: true,
      });
      let row = await paymentRow(order.paymentId);
      expect(row.status).toBe("SUBMITTED");
      expect(row.verification_claimed_by_auth_user_id).toBeNull();

      actAs(operatorB);
      await claimPaymentVerification({ paymentId: order.paymentId });
      actAs(superAdmin);
      expect(await releasePaymentVerificationClaim({ paymentId: order.paymentId })).toMatchObject({
        success: true,
      });
      row = await paymentRow(order.paymentId);
      expect(row.status).toBe("SUBMITTED");
    });
  });

  describe("approval", () => {
    it("marks the payment PAID, confirms the order and allocates the held stock", async () => {
      const before = await inventory(inventoryItemId1);
      const order = await submittedOrder(variantId1, 2);
      expect(await reservationStatuses(order.orderId)).toEqual(["VERIFICATION_HOLD"]);

      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });
      const result = await approvePayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        notes: "Monto verificado en el app de Yape",
      });

      expect(result).toMatchObject({
        success: true,
        decision: "APPROVED",
        paymentStatus: "PAID",
        orderStatus: "CONFIRMED",
        replayed: false,
      });

      const row = await paymentRow(order.paymentId);
      expect(row.status).toBe("PAID");
      expect(row.verification_claimed_by_auth_user_id).toBeNull();
      expect(row.verification_claimed_at).toBeNull();
      expect(await orderStatus(order.orderId)).toBe("CONFIRMED");
      expect(await reservationStatuses(order.orderId)).toEqual(["ALLOCATED"]);

      const after = await inventory(inventoryItemId1);
      expect(after.reserved).toBe(before.reserved);
      expect(after.allocated).toBe(before.allocated + 2);
      expect(after.onHand).toBe(before.onHand);

      const [verification] = await sql`
        SELECT decision, verifier_auth_user_id, verification_notes, submission_id
        FROM payment_verifications WHERE payment_id = ${order.paymentId}
      `;
      expect(verification).toMatchObject({
        decision: "APPROVED",
        verifier_auth_user_id: operatorA,
        verification_notes: "Monto verificado en el app de Yape",
        submission_id: order.submissionId,
      });

      const events = await sql`
        SELECT event_name FROM outbox_events WHERE aggregate_id = ${order.paymentId} ORDER BY created_at
      `;
      expect(events.map((e) => e.event_name)).toEqual(["PaymentSubmitted", "PaymentApproved"]);

      const [audit] = await sql`
        SELECT actor_id, metadata FROM audit_events
        WHERE action = 'orders:verify_payment' AND target_id = ${order.paymentId}
      `;
      expect(audit!.actor_id).toBe(operatorA);
      expect(audit!.metadata).toMatchObject({ decision: "APPROVED", hasNotes: true });
      expect(JSON.stringify(audit!.metadata)).not.toContain("Yape");
    });

    it("replays the same attempt without a second decision and rejects a changed payload", async () => {
      const order = await submittedOrder();
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });

      const attemptId = generateUuidV7();
      const input = {
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: attemptId,
      };
      const first = await approvePayment(input);
      const replay = await approvePayment(input);
      expect(first).toMatchObject({ success: true, replayed: false });
      expect(replay).toMatchObject({ success: true, replayed: true });
      if (first.success && replay.success) {
        expect(replay.verificationId).toBe(first.verificationId);
      }

      const conflict = await approvePayment({ ...input, notes: "otra nota" });
      expect(conflict).toMatchObject({ success: false, code: "IDEMPOTENCY_CONFLICT" });

      const count = await scalar(sql`
        SELECT count(*)::int AS count FROM payment_verifications WHERE payment_id = ${order.paymentId}
      `);
      expect(count).toBe(1);
    });

    it("serializes two approvals racing on the same payment and allocates stock once", async () => {
      const before = await inventory(inventoryItemId1);
      const order = await submittedOrder(variantId1, 1);
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });

      // Hold the first transaction after it has the row locks so the others must queue behind it.
      let releaseFirst: () => void = () => {};
      const firstHolding = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let hookCalls = 0;
      __setTestPaymentVerificationTransactionHook(async (stage) => {
        if (stage === "after_lock" && hookCalls++ === 0) {
          await firstHolding;
        }
      });

      actAs(operatorA);
      const approvalA1 = approvePayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
      });
      actAs(operatorB);
      const approvalB = approvePayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
      });
      actAs(operatorA);
      const approvalA2 = approvePayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
      });

      await new Promise((resolve) => setTimeout(resolve, 300));
      const waiting = await scalar(sql`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = 'postgres'
      `);
      expect(waiting).toBeGreaterThanOrEqual(1);
      releaseFirst();

      const results = await Promise.all([approvalA1, approvalB, approvalA2]);
      const successes = results.filter((r) => r.success);
      expect(successes).toHaveLength(1);
      expect(results[1]).toMatchObject({ success: false });
      const failureCodes = results.filter((r) => !r.success).map((r) => !r.success && r.code);
      for (const code of failureCodes) {
        expect(["CLAIMED_BY_OTHER", "INVALID_PAYMENT_STATE"]).toContain(code);
      }

      const count = await scalar(sql`
        SELECT count(*)::int AS count FROM payment_verifications WHERE payment_id = ${order.paymentId}
      `);
      expect(count).toBe(1);

      const ledger = await sql`
        SELECT count(*)::int AS count FROM inventory_ledger_entries
        WHERE reference_id = ${order.orderId} AND movement_type = 'ALLOCATION_CONFIRMED'
      `;
      expect(ledger[0]!.count).toBe(1);

      const after = await inventory(inventoryItemId1);
      expect(after.allocated).toBe(before.allocated + 1);
      expect(after.reserved).toBe(before.reserved);
    });

    it("refuses a decision on a voucher that is no longer the latest", async () => {
      const order = await submittedOrder();
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });
      await rejectPayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        mode: "RETRYABLE",
        reason: "Captura ilegible",
      });

      const secondSubmissionId = await submitAsCustomer(order);
      expect(secondSubmissionId).not.toBe(order.submissionId);

      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });
      const stale = await approvePayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
      });
      expect(stale).toMatchObject({ success: false, code: "STALE_SUBMISSION" });

      const approved = await approvePayment({
        paymentId: order.paymentId,
        submissionId: secondSubmissionId,
        verificationAttemptId: generateUuidV7(),
      });
      expect(approved).toMatchObject({ success: true, paymentStatus: "PAID" });
      expect(await reservationStatuses(order.orderId)).toEqual(["ALLOCATED"]);
    });
  });

  describe("rejection", () => {
    it("retryable rejection reopens submission for 24h and keeps the stock hold", async () => {
      const before = await inventory(inventoryItemId1);
      const order = await submittedOrder();
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });

      const startedAt = Date.now();
      const result = await rejectPayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        mode: "RETRYABLE",
        reason: "La captura no muestra el código de operación",
      });

      expect(result).toMatchObject({
        success: true,
        decision: "REJECTED_RETRYABLE",
        paymentStatus: "UNPAID",
        orderStatus: "PENDING",
      });

      const row = await paymentRow(order.paymentId);
      expect(row.status).toBe("UNPAID");
      expect(row.verification_claimed_at).toBeNull();
      const graceMs = new Date(row.resubmission_grace_expires_at as Date).getTime() - startedAt;
      expect(graceMs).toBeGreaterThan(24 * 3_600_000 - 60_000);
      expect(graceMs).toBeLessThan(24 * 3_600_000 + 60_000);

      expect(await reservationStatuses(order.orderId)).toEqual(["VERIFICATION_HOLD"]);
      const after = await inventory(inventoryItemId1);
      expect(after.reserved).toBe(before.reserved + 1);

      const [event] = await sql`
        SELECT payload FROM outbox_events
        WHERE aggregate_id = ${order.paymentId} AND event_name = 'PaymentRejected'
      `;
      expect(event!.payload).toMatchObject({ retryable: true });
    });

    it("honours PAYMENT_RESUBMISSION_GRACE_HOURS and fails closed on a malformed value", async () => {
      const order = await submittedOrder();
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });

      process.env.PAYMENT_RESUBMISSION_GRACE_HOURS = "doce";
      const malformed = await rejectPayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        mode: "RETRYABLE",
        reason: "Monto distinto",
      });
      expect(malformed).toMatchObject({ success: false, code: "SYSTEM_ERROR" });
      expect((await paymentRow(order.paymentId)).status).toBe("VERIFYING");

      process.env.PAYMENT_RESUBMISSION_GRACE_HOURS = "2";
      const startedAt = Date.now();
      const result = await rejectPayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        mode: "RETRYABLE",
        reason: "Monto distinto",
      });
      expect(result.success).toBe(true);
      const row = await paymentRow(order.paymentId);
      const graceMs = new Date(row.resubmission_grace_expires_at as Date).getTime() - startedAt;
      expect(graceMs).toBeGreaterThan(2 * 3_600_000 - 60_000);
      expect(graceMs).toBeLessThan(2 * 3_600_000 + 60_000);
    });

    it("terminal rejection cancels the order and returns the stock", async () => {
      const before = await inventory(inventoryItemId1);
      const order = await submittedOrder(variantId1, 3);
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });

      const result = await rejectPayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        mode: "TERMINAL",
        reason: "El pago no aparece en la cuenta",
        notes: "Revisado el extracto del día",
      });

      expect(result).toMatchObject({
        success: true,
        decision: "REJECTED_TERMINAL",
        paymentStatus: "REJECTED",
        orderStatus: "CANCELLED",
      });
      expect((await paymentRow(order.paymentId)).status).toBe("REJECTED");
      expect(await orderStatus(order.orderId)).toBe("CANCELLED");
      expect(await reservationStatuses(order.orderId)).toEqual(["RELEASED"]);

      const after = await inventory(inventoryItemId1);
      expect(after.reserved).toBe(before.reserved);
      expect(after.allocated).toBe(before.allocated);

      const paymentEvents = await sql`
        SELECT event_name, payload FROM outbox_events WHERE aggregate_id = ${order.paymentId}
      `;
      const rejected = paymentEvents.filter((e) => e.event_name === "PaymentRejected");
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.payload).toMatchObject({ retryable: false });
      const [cancelled] = await sql`
        SELECT count(*)::int AS count FROM outbox_events
        WHERE aggregate_id = ${order.orderId} AND event_name = 'OrderCancelled'
      `;
      expect(cancelled!.count).toBe(1);
    });

    it("requires a reason", async () => {
      const order = await submittedOrder();
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });

      const result = await rejectPayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        mode: "TERMINAL",
        reason: "   ",
      });
      expect(result).toMatchObject({ success: false, code: "INVALID_INPUT" });
      expect((await paymentRow(order.paymentId)).status).toBe("VERIFYING");
    });
  });

  describe("late payments", () => {
    async function lateSubmittedOrder(variantId: string) {
      const order = await createOrder(variantId, 1);
      await sql`
        UPDATE inventory_reservations SET expires_at = NOW() - INTERVAL '5 minutes'
        WHERE order_id = ${order.orderId}
      `;
      const submissionId = await submitAsCustomer(order);
      const [submission] =
        await sql`SELECT is_late FROM payment_submissions WHERE id = ${submissionId}`;
      expect(submission!.is_late).toBe(true);
      expect(await reservationStatuses(order.orderId)).toEqual(["RELEASED"]);
      return { ...order, submissionId };
    }

    it("reacquires stock when it is still available", async () => {
      const before = await inventory(inventoryItemId2);
      const order = await lateSubmittedOrder(variantId2);

      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });
      const result = await approvePayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
      });

      expect(result).toMatchObject({
        success: true,
        paymentStatus: "PAID",
        orderStatus: "CONFIRMED",
      });
      expect(await reservationStatuses(order.orderId)).toEqual(["ALLOCATED", "RELEASED"]);
      const after = await inventory(inventoryItemId2);
      expect(after.allocated).toBe(before.allocated + 1);
      expect(after.reserved).toBe(before.reserved);
    });

    it("records received late funds and the completed external refund without allocating stock", async () => {
      const order = await lateSubmittedOrder(variantId2);

      // Someone else bought the last units while this payment was late.
      await sql`
        UPDATE inventory_items SET quantity_on_hand = quantity_reserved + quantity_allocated
        WHERE id = ${inventoryItemId2}
      `;
      const before = await inventory(inventoryItemId2);

      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });
      const attemptId = generateUuidV7();
      const result = await approvePayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: attemptId,
      });

      expect(result).toEqual({
        success: false,
        code: "LATE_PAYMENT_STOCK_UNAVAILABLE",
        error: LATE_PAYMENT_STOCK_UNAVAILABLE_MESSAGE,
      });
      expect(LATE_PAYMENT_STOCK_UNAVAILABLE_MESSAGE).toBe(
        "Sin stock disponible. Si recibiste los fondos, registra la devolución externa confirmada."
      );

      const row = await paymentRow(order.paymentId);
      expect(row.status).toBe("VERIFYING");
      expect(row.verification_claimed_by_auth_user_id).toBe(operatorA);
      expect(await orderStatus(order.orderId)).toBe("PENDING");
      expect(await reservationStatuses(order.orderId)).toEqual(["RELEASED"]);
      expect(await inventory(inventoryItemId2)).toEqual(before);

      const verifications = await scalar(sql`
        SELECT count(*)::int AS verifications FROM payment_verifications WHERE payment_id = ${order.paymentId}
      `);
      expect(verifications).toBe(0);
      const keys = await scalar(sql`
        SELECT count(*)::int AS keys FROM idempotency_keys
        WHERE idempotency_key = ${`PAYMENT_VERIFICATION:${attemptId}`}
      `);
      expect(keys).toBe(0);
      const approvals = await scalar(sql`
        SELECT count(*)::int AS approvals FROM outbox_events
        WHERE aggregate_id = ${order.paymentId} AND event_name = 'PaymentApproved'
      `);
      expect(approvals).toBe(0);

      const refundInput = {
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        externalRefundCompleted: true,
        externalReference: "  REEMB-OP-49281  ",
      };
      const refund = await recordLatePaymentRefund(refundInput);
      expect(refund).toMatchObject({
        success: true,
        decision: "APPROVED",
        paymentStatus: "REFUNDED",
        orderStatus: "REFUNDED",
        replayed: false,
      });
      expect(await orderStatus(order.orderId)).toBe("REFUNDED");
      expect(await reservationStatuses(order.orderId)).toEqual(["RELEASED"]);
      expect(await inventory(inventoryItemId2)).toEqual(before);

      const [record] = await sql`
        SELECT r.amount_cents, r.external_reference, r.actor_auth_user_id,
               p.refunded_amount_cents, p.amount_cents, p.status
        FROM refunds r JOIN payments p ON p.id = r.payment_id
        WHERE r.payment_id = ${order.paymentId}
      `;
      expect(record).toMatchObject({
        external_reference: "REEMB-OP-49281",
        actor_auth_user_id: operatorA,
        status: "REFUNDED",
      });
      expect(record!.amount_cents).toBeGreaterThan(0);
      expect(record!.refunded_amount_cents).toBe(record!.amount_cents);
      const [verification] = await sql`
        SELECT decision FROM payment_verifications WHERE payment_id = ${order.paymentId}
      `;
      expect(verification!.decision).toBe("APPROVED");
      const [audit] = await sql`
        SELECT metadata FROM audit_events WHERE action = 'orders:late_refund'
        AND metadata->>'paymentId' = ${order.paymentId}
      `;
      expect(audit!.metadata).toMatchObject({ externalRefundCompleted: true });
      const events = await sql`
        SELECT event_name, payload FROM outbox_events
        WHERE aggregate_id = ${order.paymentId}
          AND event_name IN ('PaymentApproved', 'RefundIssued')
      `;
      expect(events.map((event) => event.event_name).sort()).toEqual([
        "PaymentApproved",
        "RefundIssued",
      ]);
      expect(events.find((event) => event.event_name === "PaymentApproved")!.payload).toMatchObject(
        { immediatelyRefunded: true }
      );

      const replay = await recordLatePaymentRefund(refundInput);
      expect(replay).toMatchObject({ success: true, replayed: true });
      const changed = await recordLatePaymentRefund({
        ...refundInput,
        externalReference: "OTHER-REF",
      });
      expect(changed).toMatchObject({ success: false, code: "IDEMPOTENCY_CONFLICT" });
      expect(
        await scalar(sql`SELECT count(*)::int FROM refunds WHERE payment_id = ${order.paymentId}`)
      ).toBe(1);
      const secondAttempt = await recordLatePaymentRefund({
        ...refundInput,
        verificationAttemptId: generateUuidV7(),
      });
      expect(secondAttempt).toMatchObject({ success: false, code: "INVALID_PAYMENT_STATE" });

      await sql`UPDATE inventory_items SET quantity_on_hand = 100 WHERE id = ${inventoryItemId2}`;
    });

    it("rolls back every refund write when finalization fails and permits a safe retry", async () => {
      const order = await lateSubmittedOrder(variantId2);
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });
      const input = {
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        externalRefundCompleted: true,
        externalReference: "REF-ROLLBACK-028",
      };

      const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
      __setTestPaymentVerificationTransactionHook(async (stage) => {
        if (stage === "before_commit") throw new Error("simulated commit failure");
      });
      try {
        expect(await recordLatePaymentRefund(input)).toMatchObject({
          success: false,
          code: "SYSTEM_ERROR",
        });
        expect(errorLog).toHaveBeenCalledOnce();
      } finally {
        __setTestPaymentVerificationTransactionHook(null);
        errorLog.mockRestore();
      }

      expect((await paymentRow(order.paymentId)).status).toBe("VERIFYING");
      expect(await orderStatus(order.orderId)).toBe("PENDING");
      expect(await reservationStatuses(order.orderId)).toEqual(["RELEASED"]);
      expect(
        await scalar(sql`SELECT count(*)::int FROM refunds WHERE payment_id = ${order.paymentId}`)
      ).toBe(0);
      expect(
        await scalar(
          sql`SELECT count(*)::int FROM payment_verifications WHERE payment_id = ${order.paymentId}`
        )
      ).toBe(0);
      expect(
        await scalar(
          sql`SELECT count(*)::int FROM outbox_events WHERE aggregate_id = ${order.paymentId} AND event_name IN ('PaymentApproved', 'RefundIssued')`
        )
      ).toBe(0);
      expect(
        await scalar(
          sql`SELECT count(*)::int FROM audit_events WHERE action = 'orders:late_refund' AND metadata->>'paymentId' = ${order.paymentId}`
        )
      ).toBe(0);
      expect(
        await scalar(
          sql`SELECT count(*)::int FROM idempotency_keys WHERE idempotency_key = ${`PAYMENT_VERIFICATION:${input.verificationAttemptId}`}`
        )
      ).toBe(0);

      expect(await recordLatePaymentRefund(input)).toMatchObject({
        success: true,
        paymentStatus: "REFUNDED",
        replayed: false,
      });
    });

    it("requires declaration and reference, but records a completed refund if stock later returns", async () => {
      const order = await lateSubmittedOrder(variantId2);
      await sql`
        UPDATE inventory_items SET quantity_on_hand = quantity_reserved + quantity_allocated
        WHERE id = ${inventoryItemId2}
      `;
      await sql`UPDATE inventory_items SET quantity_on_hand = 100 WHERE id = ${inventoryItemId2}`;
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });
      const input = {
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        externalRefundCompleted: true,
        externalReference: "REF-50010",
      };
      expect(
        await recordLatePaymentRefund({ ...input, externalRefundCompleted: false })
      ).toMatchObject({ success: false, code: "INVALID_INPUT" });
      expect(await recordLatePaymentRefund({ ...input, externalReference: "  " })).toMatchObject({
        success: false,
        code: "INVALID_INPUT",
      });
      expect((await paymentRow(order.paymentId)).status).toBe("VERIFYING");
      expect(
        await scalar(sql`SELECT count(*)::int FROM refunds WHERE payment_id = ${order.paymentId}`)
      ).toBe(0);
      expect(await recordLatePaymentRefund(input)).toMatchObject({
        success: true,
        paymentStatus: "REFUNDED",
        orderStatus: "REFUNDED",
      });
      expect(await reservationStatuses(order.orderId)).toEqual(["RELEASED"]);
      expect(
        await scalar(sql`SELECT count(*)::int FROM refunds WHERE payment_id = ${order.paymentId}`)
      ).toBe(1);
    });

    it("serializes concurrent retries of one external refund intent", async () => {
      const order = await lateSubmittedOrder(variantId2);
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });
      const input = {
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
        externalRefundCompleted: true,
        externalReference: "REF-CONCURRENT-018",
      };
      const results = await Promise.all([
        recordLatePaymentRefund(input),
        recordLatePaymentRefund(input),
      ]);
      expect(results.every((result) => result.success)).toBe(true);
      expect(results.filter((result) => result.success && result.replayed)).toHaveLength(1);
      expect(
        await scalar(sql`SELECT count(*)::int FROM refunds WHERE payment_id = ${order.paymentId}`)
      ).toBe(1);
      expect(
        await scalar(
          sql`SELECT count(*)::int FROM payment_verifications WHERE payment_id = ${order.paymentId}`
        )
      ).toBe(1);
    });
  });

  describe("proof viewer", () => {
    afterEach(() => setTestStorageClientOverride(null));

    async function orderWithProof() {
      const order = await submittedOrder();
      const mediaId = generateUuidV7();
      const objectKey = `payment-proofs/final/${order.paymentId}/test/proof.png`;
      await sql`
        INSERT INTO media_assets (id, object_key, security_class, media_type, mime_type, file_size_bytes, checksum_sha256)
        VALUES (${mediaId}, ${objectKey}, 'PRIVATE_PAYMENT_PROOF', 'IMAGE', 'image/png', 1024, ${"0".repeat(64)})
      `;
      await sql`UPDATE payment_submissions SET proof_media_id = ${mediaId} WHERE id = ${order.submissionId}`;
      return { ...order, objectKey };
    }

    it("signs a 5-minute, no-store URL only for orders:verify and audits every view", async () => {
      setTestStorageClientOverride(
        new S3Client({
          region: "auto",
          endpoint: "https://test-account.r2.cloudflarestorage.com",
          credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" },
        })
      );
      const order = await orderWithProof();

      actAs(catalogStaff);
      expect(await getPaymentProofViewUrl(order.submissionId)).toMatchObject({
        success: false,
        code: "UNAUTHORIZED",
      });

      actAs(operatorA);
      const result = await getPaymentProofViewUrl(order.submissionId);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const url = new URL(result.url);
      expect(decodeURIComponent(url.pathname)).toContain(order.objectKey);
      expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
      expect(url.searchParams.get("response-cache-control")).toBe("private, no-store, max-age=0");
      expect(result.mimeType).toBe("image/png");

      const audits = await sql`
        SELECT actor_id FROM audit_events
        WHERE action = 'orders:view_payment_proof' AND target_id = ${order.submissionId}
      `;
      expect(audits.map((row) => row.actor_id)).toEqual([operatorA]);
    });

    it("reports a submission without a voucher instead of signing anything", async () => {
      const order = await submittedOrder();
      actAs(operatorA);
      expect(await getPaymentProofViewUrl(order.submissionId)).toMatchObject({
        success: false,
        code: "NO_PROOF",
      });
    });
  });

  describe("database invariants", () => {
    it("allows only one decision per submission and requires a reason for rejections", async () => {
      const order = await submittedOrder();
      actAs(operatorA);
      await claimPaymentVerification({ paymentId: order.paymentId });
      await approvePayment({
        paymentId: order.paymentId,
        submissionId: order.submissionId,
        verificationAttemptId: generateUuidV7(),
      });

      await expect(
        sql`
          INSERT INTO payment_verifications (id, payment_id, submission_id, decision, rejection_reason)
          VALUES (${generateUuidV7()}, ${order.paymentId}, ${order.submissionId}, 'REJECTED_TERMINAL', 'duplicado')
        `
      ).rejects.toThrow(/payment_verifications_submission_id_unique/);

      const other = await submittedOrder();
      await expect(
        sql`
          INSERT INTO payment_verifications (id, payment_id, submission_id, decision, rejection_reason)
          VALUES (${generateUuidV7()}, ${other.paymentId}, ${other.submissionId}, 'REJECTED_TERMINAL', '  ')
        `
      ).rejects.toThrow(/payment_verifications_rejection_reason_required/);
    });

    it("rejects a VERIFYING payment without a claim", async () => {
      const order = await submittedOrder();
      await expect(
        sql`UPDATE payments SET status = 'VERIFYING' WHERE id = ${order.paymentId}`
      ).rejects.toThrow(/payments_verification_claim_consistency/);
    });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import { getAdminDashboardData } from "@/lib/admin/dashboard-reader";
import * as rbac from "@/lib/auth/rbac";
import type * as RbacModule from "@/lib/auth/rbac";

vi.mock("@/lib/auth/rbac", async () => {
  const actual = await vi.importActual<typeof RbacModule>("@/lib/auth/rbac");
  return {
    ...actual,
    requireAdminAccess: vi.fn(),
  };
});

describe("GP-023 / CHK1 — Admin Dashboard Real PostgreSQL Physical Live Scenarios", () => {
  const rawDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";

  let sql: postgres.Sql;

  // Dedicated test UUID prefixes for isolation
  const prefix = "018f0000-0023-7000-8000-";
  const brandId = `${prefix}000000000001`;
  const categoryId = `${prefix}000000000002`;
  const prodPublishedId = `${prefix}000000000003`;
  const prodDraftId = `${prefix}000000000004`;

  const varActiveWithStockId = `${prefix}000000000010`;
  const varActiveNoStockId = `${prefix}000000000011`;
  const varActiveMultiLocId = `${prefix}000000000012`;
  const varInactiveWithStockId = `${prefix}000000000013`;

  const loc1Id = `${prefix}000000000021`;
  const loc2Id = `${prefix}000000000022`;

  const paymentMethodCode = "GP023_YAPE";
  const paymentMethodId = `${prefix}000000000031`;
  const instructionVersionId = `${prefix}000000000032`;

  // GP-023 order number namespace for scoped cleanup
  const GP023_ORDER_PREFIX = "GP023-%";

  // Dedicated synthetic timestamp namespace for temporal metric isolation
  // (ensures isolation from real-time NOW() orders created by other test suites in shared CI databases)
  const TEST_NOW = new Date("2035-05-15T15:00:00.000Z");

  // Sentinel: deterministic non-GP023 record proving cleanup isolation
  const sentinelOrderId = "018faaaa-0099-7000-8000-000000000001";
  const sentinelOrderNumber = "SENTINEL-NONGP023-001";

  beforeAll(async () => {
    const databaseUrl = assertLocalDatabaseTarget(rawDatabaseUrl);
    sql = postgres(databaseUrl, { max: 5 });

    // Mock SUPER_ADMIN context for all live reader tests
    vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
      status: "READY",
      authUserId: "018f0000-0000-7000-8000-00000000ad01",
      email: "superadmin.gp023@gamerperu.pe",
      roles: ["SUPER_ADMIN"],
      permissions: new Set([
        "staff:manage",
        "catalog:manage",
        "catalog:publish",
        "orders:manage",
        "orders:verify",
        "inventory:manage",
      ]),
    });

    // Clean any prior synthetic fixtures
    await cleanupGp023CommerceFixtures();

    // Seed base catalog & location fixtures
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO brands (id, name, slug, status, created_at, updated_at)
        VALUES (${brandId}, 'GP023 Brand', 'gp023-brand', 'PUBLISHED', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
      await tx`
        INSERT INTO categories (id, name, slug, status, display_order, created_at, updated_at)
        VALUES (${categoryId}, 'GP023 Category', 'gp023-cat', 'PUBLISHED', 1, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
      await tx`
        INSERT INTO products (id, brand_id, category_id, name, slug, description, status, created_at, updated_at)
        VALUES
          (${prodPublishedId}, ${brandId}, ${categoryId}, 'GP023 Pub Product', 'gp023-pub-prod', 'Desc', 'PUBLISHED', NOW(), NOW()),
          (${prodDraftId}, ${brandId}, ${categoryId}, 'GP023 Draft Product', 'gp023-draft-prod', 'Desc', 'DRAFT', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
      await tx`
        INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, created_at, updated_at)
        VALUES
          (${varActiveWithStockId}, ${prodPublishedId}, 'GP023-SKU-1', 'Active In Stock', 10000, 'ACTIVE', NOW(), NOW()),
          (${varActiveNoStockId}, ${prodPublishedId}, 'GP023-SKU-2', 'Active No Stock', 15000, 'ACTIVE', NOW(), NOW()),
          (${varActiveMultiLocId}, ${prodPublishedId}, 'GP023-SKU-3', 'Active Multi Loc', 20000, 'ACTIVE', NOW(), NOW()),
          (${varInactiveWithStockId}, ${prodPublishedId}, 'GP023-SKU-4', 'Inactive With Stock', 25000, 'INACTIVE', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
      await tx`
        INSERT INTO inventory_locations (id, code, name, is_active, created_at)
        VALUES
          (${loc1Id}, 'LOC-GP023-1', 'Almacén Central', true, NOW()),
          (${loc2Id}, 'LOC-GP023-2', 'Almacén Secundario', true, NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
      await tx`
        INSERT INTO payment_method_configurations (id, code, name, is_active, created_at, updated_at)
        VALUES (${paymentMethodId}, ${paymentMethodCode}, 'Yape GP023', true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
      await tx`
        INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active, created_at)
        VALUES (${instructionVersionId}, ${paymentMethodCode}, 1, 'Gamer Perú SAC', '999888777', 'Pagar con Yape', true, NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
    });
  });

  /**
   * Scoped cleanup: deletes ONLY rows provably owned by GP-023 test fixtures.
   * Never uses unqualified DELETE or TRUNCATE on shared commerce tables.
   */
  async function cleanupGp023CommerceFixtures() {
    await sql.begin(async (tx) => {
      // Delete payment submissions for GP-023 payments only
      await tx`
        DELETE FROM payment_submissions
        WHERE payment_id IN (
          SELECT id FROM payments WHERE order_id IN (
            SELECT id FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
          )
        )
      `;

      // Delete payment proof upload intents for GP-023 payments only
      await tx`
        DELETE FROM payment_proof_upload_intents
        WHERE payment_id IN (
          SELECT id FROM payments WHERE order_id IN (
            SELECT id FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
          )
        )
      `;

      // Delete guest payment access grants for GP-023 orders only
      await tx`
        DELETE FROM guest_payment_access_grants
        WHERE payment_id IN (
          SELECT id FROM payments WHERE order_id IN (
            SELECT id FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
          )
        )
      `;

      // Delete refunds for GP-023 orders only
      await tx`
        DELETE FROM refunds
        WHERE order_id IN (
          SELECT id FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
        )
      `;

      // Delete payments for GP-023 orders only
      await tx`
        DELETE FROM payments
        WHERE order_id IN (
          SELECT id FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
        )
      `;

      // Delete inventory ledger entries for GP-023 locations only
      await tx`
        DELETE FROM inventory_ledger_entries
        WHERE inventory_item_id IN (
          SELECT id FROM inventory_items WHERE location_id IN (${loc1Id}, ${loc2Id})
        )
      `;

      // Delete inventory reservations for GP-023 orders only
      await tx`
        DELETE FROM inventory_reservations
        WHERE order_id IN (
          SELECT id FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
        )
      `;

      // Delete shipments for GP-023 orders only
      await tx`
        DELETE FROM shipments
        WHERE order_id IN (
          SELECT id FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
        )
      `;

      // Delete order pricing snapshots for GP-023 orders only
      await tx`
        DELETE FROM order_pricing_snapshots
        WHERE order_id IN (
          SELECT id FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
        )
      `;

      // Delete order address snapshots for GP-023 orders only
      await tx`
        DELETE FROM order_address_snapshots
        WHERE order_id IN (
          SELECT id FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
        )
      `;

      // Delete order items for GP-023 orders only
      await tx`
        DELETE FROM order_items
        WHERE order_id IN (
          SELECT id FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
        )
      `;

      // Delete GP-023 orders only
      await tx`
        DELETE FROM orders WHERE order_number LIKE ${GP023_ORDER_PREFIX}
      `;

      // Delete inventory items only for GP-023 fixture locations
      await tx`
        DELETE FROM inventory_items WHERE location_id IN (${loc1Id}, ${loc2Id})
      `;
    });
  }

  beforeEach(async () => {
    await cleanupGp023CommerceFixtures();
  });

  afterAll(async () => {
    if (sql) {
      await cleanupGp023CommerceFixtures();
      await sql`DELETE FROM inventory_locations WHERE id IN (${loc1Id}, ${loc2Id})`;
      await sql`DELETE FROM payment_instruction_versions WHERE id = ${instructionVersionId}`;
      await sql`DELETE FROM payment_method_configurations WHERE id = ${paymentMethodId}`;
      await sql`DELETE FROM product_variants WHERE id IN (${varActiveWithStockId}, ${varActiveNoStockId}, ${varActiveMultiLocId}, ${varInactiveWithStockId})`;
      await sql`DELETE FROM products WHERE id IN (${prodPublishedId}, ${prodDraftId})`;
      await sql`DELETE FROM categories WHERE id = ${categoryId}`;
      await sql`DELETE FROM brands WHERE id = ${brandId}`;
      await sql.end();
    }
  });

  it("1. Empty dataset: returns clean zero state across all metrics", async () => {
    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    expect(result.financialCohort.status).toBe("READY");
    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(0n);
      expect(result.financialCohort.data.current.cohortNetCents).toBe(0n);
      expect(result.financialCohort.data.current.cohortPaidOrders).toBe(0);
      expect(result.financialCohort.data.current.aovCents).toBe(0n);
    }

    expect(result.orderPipeline.status).toBe("READY");
    if (result.orderPipeline.status === "READY") {
      expect(result.orderPipeline.data.current.totalCreatedOrders).toBe(0);
    }

    expect(result.paymentVerification.status).toBe("READY");
    if (result.paymentVerification.status === "READY") {
      expect(result.paymentVerification.data.periodActivity.submissionAttemptsCount).toBe(0);
      expect(result.paymentVerification.data.periodActivity.distinctPaymentsSubmittedCount).toBe(0);
      expect(result.paymentVerification.data.snapshotQueue.queueAmount.status).toBe("READY");
    }
  });

  it("2. Unpaid order: counted in totalCreatedOrders, 0 in paid and revenue", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000101";
    const paymentId = "018f0000-0023-7000-8000-000000000102";

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-UNPAID', 'test.gp023.unpaid@gamerperu.pe', '999111222', 'PENDING', 10000, 10000, 'PEN', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 10000, 'PEN', 'UNPAID', ${TEST_NOW});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    if (result.orderPipeline.status === "READY") {
      expect(result.orderPipeline.data.current.totalCreatedOrders).toBe(1);
      expect(result.orderPipeline.data.current.pendingOrders).toBe(1);
    }
    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortPaidOrders).toBe(0);
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(0n);
      expect(result.financialCohort.data.current.cohortNetCents).toBe(0n);
      expect(result.financialCohort.data.current.aovCents).toBe(0n);
    }
  });

  it("3. Paid order: recognized in gross/net realized revenue and AOV", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000201";
    const paymentId = "018f0000-0023-7000-8000-000000000202";

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-PAID', 'test.gp023.paid@gamerperu.pe', '999111222', 'CONFIRMED', 15000, 15000, 'PEN', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 15000, 'PEN', 'PAID', ${TEST_NOW});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortPaidOrders).toBe(1);
      expect(result.financialCohort.data.current.cohortActivePaidOrders).toBe(1);
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(15000n);
      expect(result.financialCohort.data.current.cohortNetCents).toBe(15000n);
      expect(result.financialCohort.data.current.aovCents).toBe(15000n);
    }
  });

  it("4. Partially refunded order: net value reduced by refund, retained in AOV denominator", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000301";
    const paymentId = "018f0000-0023-7000-8000-000000000302";
    const refundId = "018f0000-0023-7000-8000-000000000303";

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-PARTIAL', 'test.gp023.partial@gamerperu.pe', '999111222', 'CONFIRMED', 10000, 10000, 'PEN', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, refunded_amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 10000, 3000, 'PEN', 'PAID', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO refunds (id, order_id, payment_id, amount_cents, reason, created_at)
        VALUES (${refundId}, ${orderId}, ${paymentId}, 3000, 'Devolución parcial', ${TEST_NOW});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(10000n);
      expect(result.financialCohort.data.current.cohortNetCents).toBe(7000n);
      expect(result.financialCohort.data.current.cohortActivePaidOrders).toBe(1);
      expect(result.financialCohort.data.current.aovCents).toBe(7000n);
    }
  });

  it("5. Fully refunded order: excluded from AOV denominator, AOV = 0 if no active paid orders", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000401";
    const paymentId = "018f0000-0023-7000-8000-000000000402";
    const refundId = "018f0000-0023-7000-8000-000000000403";

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-FULL', 'test.gp023.full@gamerperu.pe', '999111222', 'REFUNDED', 5000, 5000, 'PEN', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, refunded_amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 5000, 5000, 'PEN', 'REFUNDED', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO refunds (id, order_id, payment_id, amount_cents, reason, created_at)
        VALUES (${refundId}, ${orderId}, ${paymentId}, 5000, 'Devolución total', ${TEST_NOW});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(5000n);
      expect(result.financialCohort.data.current.cohortNetCents).toBe(0n);
      expect(result.financialCohort.data.current.cohortPaidOrders).toBe(1);
      expect(result.financialCohort.data.current.cohortActivePaidOrders).toBe(0);
      expect(result.financialCohort.data.current.aovCents).toBe(0n);
    }
  });

  it("6. Missing Payment anomaly: order counted in totalCreatedOrders, 0 in payments, does not crash", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000501";

    // Insert order without any corresponding payment row
    await sql`
      INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
      VALUES (${orderId}, 'GP023-ORD-NOPAY', 'test.gp023.nopay@gamerperu.pe', '999111222', 'PENDING', 8000, 8000, 'PEN', ${TEST_NOW});
    `;

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    if (result.orderPipeline.status === "READY") {
      expect(result.orderPipeline.data.current.totalCreatedOrders).toBe(1);
    }
    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortPaidOrders).toBe(0);
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(0n);
    }
  });

  it("7. Mixed-currency anomaly: Order PEN + Payment USD causes financial cohort to fail closed to CURRENCY_INTEGRITY_ERROR", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000601";
    const paymentId = "018f0000-0023-7000-8000-000000000602";

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-USD', 'test.gp023.usd@gamerperu.pe', '999111222', 'CONFIRMED', 10000, 10000, 'PEN', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 10000, 'USD', 'PAID', ${TEST_NOW});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    expect(result.financialCohort.status).toBe("UNAVAILABLE");
    if (result.financialCohort.status === "UNAVAILABLE") {
      expect(result.financialCohort.error).toBe("CURRENCY_INTEGRITY_ERROR");
    }
    // Total created orders is currency-independent and remains available
    if (result.orderPipeline.status === "READY") {
      expect(result.orderPipeline.data.current.totalCreatedOrders).toBe(1);
    }
  });

  it("8. Payment verification queue: snapshot count and amount reported in real time", async () => {
    // Record baseline snapshot queue (in case pre-existing payments exist in shared CI test DB)
    const baseResult = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });
    const baseCount =
      baseResult.paymentVerification.status === "READY"
        ? baseResult.paymentVerification.data.snapshotQueue.queueCount
        : 0;
    const baseAmount =
      baseResult.paymentVerification.status === "READY" &&
      baseResult.paymentVerification.data.snapshotQueue.queueAmount.status === "READY"
        ? baseResult.paymentVerification.data.snapshotQueue.queueAmount.amountCents
        : 0n;

    const order1Id = "018f0000-0023-7000-8000-000000000701";
    const payment1Id = "018f0000-0023-7000-8000-000000000702";
    const order2Id = "018f0000-0023-7000-8000-000000000703";
    const payment2Id = "018f0000-0023-7000-8000-000000000704";

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES
          (${order1Id}, 'GP023-ORD-Q1', 'test.gp023.q1@gamerperu.pe', '999111222', 'PENDING', 5000, 5000, 'PEN', ${TEST_NOW}),
          (${order2Id}, 'GP023-ORD-Q2', 'test.gp023.q2@gamerperu.pe', '999111222', 'PENDING', 7000, 7000, 'PEN', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, verification_claimed_at, created_at)
        VALUES
          (${payment1Id}, ${order1Id}, ${paymentMethodCode}, ${instructionVersionId}, 5000, 'PEN', 'SUBMITTED', NULL, ${TEST_NOW}),
          (${payment2Id}, ${order2Id}, ${paymentMethodCode}, ${instructionVersionId}, 7000, 'PEN', 'VERIFYING', ${TEST_NOW}, ${TEST_NOW});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    if (result.paymentVerification.status === "READY") {
      const queue = result.paymentVerification.data.snapshotQueue;
      expect(queue.queueCount).toBe(baseCount + 2);
      expect(queue.queueAmount.status).toBe("READY");
      if (queue.queueAmount.status === "READY") {
        expect(queue.queueAmount.amountCents).toBe(baseAmount + 12000n);
      }
    }
  });

  it("9. Submission attempts in period: counted correctly via submitted_at", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000801";
    const paymentId = "018f0000-0023-7000-8000-000000000802";
    const subId = "018f0000-0023-7000-8000-000000000803";

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-SUB', 'test.gp023.sub@gamerperu.pe', '999111222', 'PENDING', 10000, 10000, 'PEN', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 10000, 'PEN', 'SUBMITTED', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO payment_submissions (id, payment_id, attempt_number, operation_code, submitted_at)
        VALUES (${subId}, ${paymentId}, 1, 'OP-998877', ${TEST_NOW});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    if (result.paymentVerification.status === "READY") {
      const act = result.paymentVerification.data.periodActivity;
      expect(act.submissionAttemptsCount).toBe(1);
      expect(act.distinctPaymentsSubmittedCount).toBe(1);
    }
  });

  it("10. Multiple submission attempts for same payment: distinct payments count = 1, attempts = 2", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000901";
    const paymentId = "018f0000-0023-7000-8000-000000000902";
    const sub1Id = "018f0000-0023-7000-8000-000000000903";
    const sub2Id = "018f0000-0023-7000-8000-000000000904";

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-MULTISUB', 'test.gp023.multisub@gamerperu.pe', '999111222', 'PENDING', 10000, 10000, 'PEN', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 10000, 'PEN', 'SUBMITTED', ${TEST_NOW});
      `;
      await tx`
        INSERT INTO payment_submissions (id, payment_id, attempt_number, operation_code, submitted_at)
        VALUES
          (${sub1Id}, ${paymentId}, 1, 'OP-ATTEMPT-1', ${TEST_NOW}),
          (${sub2Id}, ${paymentId}, 2, 'OP-ATTEMPT-2', ${TEST_NOW});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    if (result.paymentVerification.status === "READY") {
      const act = result.paymentVerification.data.periodActivity;
      expect(act.submissionAttemptsCount).toBe(2);
      expect(act.distinctPaymentsSubmittedCount).toBe(1);
    }
  });

  it("11. Active variant with no inventory row: effective ATS = 0 and counted as Out-of-Stock", async () => {
    // varActiveNoStockId has 0 rows in inventory_items
    const result = await getAdminDashboardData();

    if (result.inventoryOverview.status === "READY") {
      // Must be at least 1 (the active variant with zero rows)
      expect(result.inventoryOverview.data.outOfStockActiveSkus).toBeGreaterThanOrEqual(1);
    }
  });

  it("12. Multi-location ATS: variant with stock across 2 locations aggregated globally", async () => {
    const inv1Id = "018f0000-0023-7000-8000-000000001001";
    const inv2Id = "018f0000-0023-7000-8000-000000001002";

    await sql`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated)
      VALUES
        (${inv1Id}, ${varActiveMultiLocId}, ${loc1Id}, 10, 2, 1),
        (${inv2Id}, ${varActiveMultiLocId}, ${loc2Id}, 15, 0, 0);
    `;

    const result = await getAdminDashboardData();

    if (result.inventoryOverview.status === "READY") {
      const bal = result.inventoryOverview.data.globalPhysicalBalances;
      // loc1 ATS: 10 - 2 - 1 = 7. loc2 ATS: 15. Total = 22.
      expect(bal.onHandUnits).toBeGreaterThanOrEqual(25);
      expect(bal.availableToSellUnits).toBeGreaterThanOrEqual(22);
    }
  });

  it("13. Inactive variant with physical stock: included in global physical balances", async () => {
    const invInactiveId = "018f0000-0023-7000-8000-000000001101";

    await sql`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated)
      VALUES (${invInactiveId}, ${varInactiveWithStockId}, ${loc1Id}, 8, 0, 0);
    `;

    const result = await getAdminDashboardData();

    if (result.inventoryOverview.status === "READY") {
      const bal = result.inventoryOverview.data.globalPhysicalBalances;
      expect(bal.onHandUnits).toBeGreaterThanOrEqual(8);
      expect(bal.availableToSellUnits).toBeGreaterThanOrEqual(8);
    }
  });

  it("14. Low-stock active location position: counted when ATS <= reorder_point and ATS > 0", async () => {
    const invLowStockId = "018f0000-0023-7000-8000-000000001201";

    // ATS = 4, reorder_point = 5 => Low stock!
    await sql`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point)
      VALUES (${invLowStockId}, ${varActiveWithStockId}, ${loc1Id}, 5, 1, 0, 5);
    `;

    const result = await getAdminDashboardData();

    if (result.inventoryOverview.status === "READY") {
      expect(result.inventoryOverview.data.lowStockActivePositions).toBe(1);
    }
  });

  it("15. Temporal boundary rows: half-open interval [start, end) includes start and excludes end", async () => {
    // For TODAY with TEST_NOW (2035-05-15T15:00:00.000Z):
    // current window in Lima time (UTC-5) is [2035-05-15T05:00:00.000Z, 2035-05-16T05:00:00.000Z)
    const exactStart = new Date("2035-05-15T05:00:00.000Z");
    const exactEnd = new Date("2035-05-16T05:00:00.000Z");

    const orderStartId = "018f0000-0023-7000-8000-000000001301";
    const orderEndId = "018f0000-0023-7000-8000-000000001302";

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderStartId}, 'GP023-ORD-START', 'test.gp023.start@gamerperu.pe', '999111222', 'PENDING', 1000, 1000, 'PEN', ${exactStart});
      `;
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderEndId}, 'GP023-ORD-END', 'test.gp023.end@gamerperu.pe', '999111222', 'PENDING', 2000, 2000, 'PEN', ${exactEnd});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: TEST_NOW });

    if (result.orderPipeline.status === "READY") {
      // Exactly 1 order (the one at exactStart), the one at exactEnd is excluded!
      expect(result.orderPipeline.data.current.totalCreatedOrders).toBe(1);
    }
  });

  describe("16. Fixture Isolation Safety", () => {
    it("16a. Sentinel record outside GP-023 namespace survives GP-023 cleanup", async () => {
      // Create a sentinel order with a non-GP023 order number
      await sql`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${sentinelOrderId}, ${sentinelOrderNumber}, 'sentinel@gamerperu.pe', '999000000', 'PENDING', 1000, 1000, 'PEN', NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      // Verify sentinel exists before cleanup
      const beforeRows = await sql`SELECT id FROM orders WHERE id = ${sentinelOrderId}`;
      expect(beforeRows.length).toBe(1);

      // Run GP-023 scoped cleanup
      await cleanupGp023CommerceFixtures();

      // Verify sentinel still exists after cleanup
      const afterRows =
        await sql`SELECT id, order_number FROM orders WHERE id = ${sentinelOrderId}`;
      expect(afterRows.length).toBe(1);
      expect(afterRows[0]!.order_number).toBe(sentinelOrderNumber);

      // Clean up sentinel explicitly
      await sql`DELETE FROM orders WHERE id = ${sentinelOrderId}`;
    });

    it("16b. No unqualified DELETE or TRUNCATE on shared commerce tables in test source", async () => {
      // Read the source of this test file and verify no unqualified DELETEs exist
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const fullSource = await fs.readFile(
        path.resolve(__dirname, "admin-dashboard-live-scenarios.test.ts"),
        "utf-8"
      );

      // Inspect test fixtures, setup, cleanup, and scenarios 1-16a (excluding this verification test)
      const operationalSource = fullSource.slice(0, fullSource.indexOf("16b."));

      // Strip single-line and multi-line comments so explanatory JSDoc does not trigger false positives
      const codeWithoutComments = operationalSource
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      // Shared commerce tables that must never be globally cleared
      const sharedTables = [
        "orders",
        "payments",
        "refunds",
        "payment_submissions",
        "payment_proof_upload_intents",
        "guest_payment_access_grants",
        "order_items",
        "order_pricing_snapshots",
        "order_address_snapshots",
        "shipments",
        "inventory_reservations",
        "inventory_ledger_entries",
      ];

      for (const table of sharedTables) {
        // Match unqualified DELETE FROM <table> (no WHERE clause before statement terminator ; or backtick)
        const unqualifiedPattern = new RegExp(`DELETE\\s+FROM\\s+${table}\\s*[;\`]`, "i");
        expect(
          unqualifiedPattern.test(codeWithoutComments),
          `Found unqualified DELETE FROM ${table} without WHERE clause`
        ).toBe(false);
      }

      // No TRUNCATE SQL statements anywhere in operational code
      expect(codeWithoutComments).not.toMatch(/\bTRUNCATE\b/i);
    });
  });
});

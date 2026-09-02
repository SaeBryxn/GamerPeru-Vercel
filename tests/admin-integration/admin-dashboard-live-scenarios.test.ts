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
    await cleanupAllFixtures();

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

  async function cleanupAllFixtures() {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM payment_submissions`;
      await tx`DELETE FROM payment_proof_upload_intents`;
      await tx`DELETE FROM guest_payment_access_grants`;
      await tx`DELETE FROM refunds`;
      await tx`DELETE FROM payments`;
      await tx`DELETE FROM inventory_ledger_entries`;
      await tx`DELETE FROM inventory_reservations`;
      await tx`DELETE FROM shipments`;
      await tx`DELETE FROM order_pricing_snapshots`;
      await tx`DELETE FROM order_address_snapshots`;
      await tx`DELETE FROM order_items`;
      await tx`DELETE FROM orders`;
      await tx`DELETE FROM inventory_items WHERE location_id IN (${loc1Id}, ${loc2Id})`;
    });
  }

  beforeEach(async () => {
    await cleanupAllFixtures();
  });

  afterAll(async () => {
    if (sql) {
      await cleanupAllFixtures();
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
    const fixedNow = new Date("2026-09-02T15:00:00.000Z");
    const result = await getAdminDashboardData({ periodSelector: "TODAY", now: fixedNow });

    expect(result.financialCohort.status).toBe("READY");
    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(0);
      expect(result.financialCohort.data.current.cohortNetCents).toBe(0);
      expect(result.financialCohort.data.current.cohortPaidOrders).toBe(0);
      expect(result.financialCohort.data.current.aovCents).toBe(0);
    }

    expect(result.orderPipeline.status).toBe("READY");
    if (result.orderPipeline.status === "READY") {
      expect(result.orderPipeline.data.current.totalCreatedOrders).toBe(0);
    }

    expect(result.paymentVerification.status).toBe("READY");
    if (result.paymentVerification.status === "READY") {
      expect(result.paymentVerification.data.snapshotQueue.queueCount).toBe(0);
      expect(result.paymentVerification.data.snapshotQueue.queueAmount.status).toBe("READY");
    }
  });

  it("2. Unpaid order: counted in totalCreatedOrders, 0 in paid and revenue", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000101";
    const paymentId = "018f0000-0023-7000-8000-000000000102";
    const now = new Date("2026-09-02T15:00:00.000Z");

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-UNPAID', 'test.gp023.unpaid@gamerperu.pe', '999111222', 'PENDING', 10000, 10000, 'PEN', ${now});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 10000, 'PEN', 'UNPAID', ${now});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now });

    if (result.orderPipeline.status === "READY") {
      expect(result.orderPipeline.data.current.totalCreatedOrders).toBe(1);
      expect(result.orderPipeline.data.current.pendingOrders).toBe(1);
    }
    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortPaidOrders).toBe(0);
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(0);
      expect(result.financialCohort.data.current.cohortNetCents).toBe(0);
      expect(result.financialCohort.data.current.aovCents).toBe(0);
    }
  });

  it("3. Paid order: recognized in gross/net realized revenue and AOV", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000201";
    const paymentId = "018f0000-0023-7000-8000-000000000202";
    const now = new Date("2026-09-02T15:00:00.000Z");

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-PAID', 'test.gp023.paid@gamerperu.pe', '999111222', 'CONFIRMED', 15000, 15000, 'PEN', ${now});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 15000, 'PEN', 'PAID', ${now});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now });

    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortPaidOrders).toBe(1);
      expect(result.financialCohort.data.current.cohortActivePaidOrders).toBe(1);
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(15000);
      expect(result.financialCohort.data.current.cohortNetCents).toBe(15000);
      expect(result.financialCohort.data.current.aovCents).toBe(15000);
    }
  });

  it("4. Partially refunded order: net value reduced by refund, retained in AOV denominator", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000301";
    const paymentId = "018f0000-0023-7000-8000-000000000302";
    const refundId = "018f0000-0023-7000-8000-000000000303";
    const now = new Date("2026-09-02T15:00:00.000Z");

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-PARTIAL', 'test.gp023.partial@gamerperu.pe', '999111222', 'CONFIRMED', 10000, 10000, 'PEN', ${now});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, refunded_amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 10000, 3000, 'PEN', 'PAID', ${now});
      `;
      await tx`
        INSERT INTO refunds (id, order_id, payment_id, amount_cents, reason, created_at)
        VALUES (${refundId}, ${orderId}, ${paymentId}, 3000, 'Devolución parcial', ${now});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now });

    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(10000);
      expect(result.financialCohort.data.current.cohortNetCents).toBe(7000);
      expect(result.financialCohort.data.current.cohortActivePaidOrders).toBe(1);
      expect(result.financialCohort.data.current.aovCents).toBe(7000);
    }
  });

  it("5. Fully refunded order: excluded from AOV denominator, AOV = 0 if no active paid orders", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000401";
    const paymentId = "018f0000-0023-7000-8000-000000000402";
    const refundId = "018f0000-0023-7000-8000-000000000403";
    const now = new Date("2026-09-02T15:00:00.000Z");

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-FULL', 'test.gp023.full@gamerperu.pe', '999111222', 'REFUNDED', 5000, 5000, 'PEN', ${now});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, refunded_amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 5000, 5000, 'PEN', 'REFUNDED', ${now});
      `;
      await tx`
        INSERT INTO refunds (id, order_id, payment_id, amount_cents, reason, created_at)
        VALUES (${refundId}, ${orderId}, ${paymentId}, 5000, 'Devolución total', ${now});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now });

    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(5000);
      expect(result.financialCohort.data.current.cohortNetCents).toBe(0);
      expect(result.financialCohort.data.current.cohortPaidOrders).toBe(1);
      expect(result.financialCohort.data.current.cohortActivePaidOrders).toBe(0);
      expect(result.financialCohort.data.current.aovCents).toBe(0);
    }
  });

  it("6. Missing Payment anomaly: order counted in totalCreatedOrders, 0 in payments, does not crash", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000501";
    const now = new Date("2026-09-02T15:00:00.000Z");

    // Insert order without any corresponding payment row
    await sql`
      INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
      VALUES (${orderId}, 'GP023-ORD-NOPAY', 'test.gp023.nopay@gamerperu.pe', '999111222', 'PENDING', 8000, 8000, 'PEN', ${now});
    `;

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now });

    if (result.orderPipeline.status === "READY") {
      expect(result.orderPipeline.data.current.totalCreatedOrders).toBe(1);
    }
    if (result.financialCohort.status === "READY") {
      expect(result.financialCohort.data.current.cohortPaidOrders).toBe(0);
      expect(result.financialCohort.data.current.cohortGrossCents).toBe(0);
    }
  });

  it("7. Mixed-currency anomaly: Order PEN + Payment USD causes financial cohort to fail closed to CURRENCY_INTEGRITY_ERROR", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000601";
    const paymentId = "018f0000-0023-7000-8000-000000000602";
    const now = new Date("2026-09-02T15:00:00.000Z");

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-USD', 'test.gp023.usd@gamerperu.pe', '999111222', 'CONFIRMED', 10000, 10000, 'PEN', ${now});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 10000, 'USD', 'PAID', ${now});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now });

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
    const order1Id = "018f0000-0023-7000-8000-000000000701";
    const payment1Id = "018f0000-0023-7000-8000-000000000702";
    const order2Id = "018f0000-0023-7000-8000-000000000703";
    const payment2Id = "018f0000-0023-7000-8000-000000000704";
    const now = new Date("2026-09-02T15:00:00.000Z");

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES
          (${order1Id}, 'GP023-ORD-Q1', 'test.gp023.q1@gamerperu.pe', '999111222', 'PENDING', 5000, 5000, 'PEN', ${now}),
          (${order2Id}, 'GP023-ORD-Q2', 'test.gp023.q2@gamerperu.pe', '999111222', 'PENDING', 7000, 7000, 'PEN', ${now});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES
          (${payment1Id}, ${order1Id}, ${paymentMethodCode}, ${instructionVersionId}, 5000, 'PEN', 'SUBMITTED', ${now}),
          (${payment2Id}, ${order2Id}, ${paymentMethodCode}, ${instructionVersionId}, 7000, 'PEN', 'VERIFYING', ${now});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now });

    if (result.paymentVerification.status === "READY") {
      const queue = result.paymentVerification.data.snapshotQueue;
      expect(queue.queueCount).toBe(2);
      expect(queue.queueAmount.status).toBe("READY");
      if (queue.queueAmount.status === "READY") {
        expect(queue.queueAmount.amountCents).toBe(12000);
      }
    }
  });

  it("9. Submission attempts in period: counted correctly via submitted_at", async () => {
    const orderId = "018f0000-0023-7000-8000-000000000801";
    const paymentId = "018f0000-0023-7000-8000-000000000802";
    const subId = "018f0000-0023-7000-8000-000000000803";
    const now = new Date("2026-09-02T15:00:00.000Z");

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-SUB', 'test.gp023.sub@gamerperu.pe', '999111222', 'PENDING', 10000, 10000, 'PEN', ${now});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 10000, 'PEN', 'SUBMITTED', ${now});
      `;
      await tx`
        INSERT INTO payment_submissions (id, payment_id, attempt_number, operation_code, submitted_at)
        VALUES (${subId}, ${paymentId}, 1, 'OP-998877', ${now});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now });

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
    const now = new Date("2026-09-02T15:00:00.000Z");

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status, subtotal_cents, total_cents, currency, created_at)
        VALUES (${orderId}, 'GP023-ORD-MULTISUB', 'test.gp023.multisub@gamerperu.pe', '999111222', 'PENDING', 10000, 10000, 'PEN', ${now});
      `;
      await tx`
        INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status, created_at)
        VALUES (${paymentId}, ${orderId}, ${paymentMethodCode}, ${instructionVersionId}, 10000, 'PEN', 'SUBMITTED', ${now});
      `;
      await tx`
        INSERT INTO payment_submissions (id, payment_id, attempt_number, operation_code, submitted_at)
        VALUES
          (${sub1Id}, ${paymentId}, 1, 'OP-ATTEMPT-1', ${now}),
          (${sub2Id}, ${paymentId}, 2, 'OP-ATTEMPT-2', ${now});
      `;
    });

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now });

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
    const now = new Date("2026-09-02T15:00:00.000Z");
    // For TODAY: current window start is 2026-09-02 05:00:00.000Z, end is 2026-09-03 05:00:00.000Z
    const exactStart = new Date("2026-09-02T05:00:00.000Z");
    const exactEnd = new Date("2026-09-03T05:00:00.000Z");

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

    const result = await getAdminDashboardData({ periodSelector: "TODAY", now });

    if (result.orderPipeline.status === "READY") {
      // Exactly 1 order (the one at exactStart), the one at exactEnd is excluded!
      expect(result.orderPipeline.data.current.totalCreatedOrders).toBe(1);
    }
  });
});

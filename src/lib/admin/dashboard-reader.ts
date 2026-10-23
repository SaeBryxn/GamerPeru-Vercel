import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdminAccess } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import {
  type DashboardPeriodRange,
  type DashboardPeriodSelector,
  type ResolvedDashboardPeriod,
  resolveDashboardPeriod,
} from "./dashboard-period";
import {
  calculateAovCents,
  calculateCountTrend,
  calculateMonetaryTrend,
} from "./dashboard-metrics";
import { fetchCatalogHealth, fetchHomeStatus, fetchOrderQueue } from "./dashboard-operations";
import type {
  AdminDashboardPayload,
  CatalogHealthResult,
  CatalogOverviewResult,
  CohortFinancialsResult,
  CohortFinancialSummary,
  CohortFinancialTrends,
  HomeStatusResult,
  InventoryOverviewResult,
  MonetaryQueueAmountResult,
  MonetaryRefundOutflowResult,
  OrderPipelineResult,
  OrderPipelineSummary,
  OrderQueueResult,
  PaymentVerificationResult,
} from "./dashboard-types";

/**
 * Executes cohort financial aggregation for a single half-open period [start, end).
 *
 * Invariants:
 * 1. Evaluates orders created in [start, end) via LEFT JOIN payments.
 * 2. Validates currency integrity fail-closed:
 *    If any row has currency != 'PEN' or mismatch, fails closed to CURRENCY_INTEGRITY_ERROR.
 * 3. Never silently omits non-PEN rows with WHERE currency = 'PEN'.
 * 4. AOV is computed in exact integer PEN cents using BigInt ROUND HALF UP.
 */
async function fetchSingleCohortFinancials(
  range: DashboardPeriodRange
): Promise<
  | { status: "READY"; summary: CohortFinancialSummary }
  | { status: "UNAVAILABLE"; error: "CURRENCY_INTEGRITY_ERROR"; message: string }
> {
  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();

  const rows = await db.execute<{
    total_created_orders: string | number;
    currency_anomaly_count: string | number;
    cohort_paid_orders: string | number;
    cohort_active_paid_orders: string | number;
    cohort_gross_cents: string | number;
    cohort_net_cents: string | number;
    cohort_pending_cents: string | number;
  }>(sql`
    SELECT
      COUNT(O.id) AS total_created_orders,
      COUNT(O.id) FILTER (
        WHERE P.id IS NOT NULL AND (
          O.currency != 'PEN' OR P.currency != 'PEN' OR O.currency != P.currency
        )
      ) AS currency_anomaly_count,
      COUNT(O.id) FILTER (WHERE P.status IN ('PAID', 'REFUNDED')) AS cohort_paid_orders,
      COUNT(O.id) FILTER (
        WHERE P.status IN ('PAID', 'REFUNDED') AND (P.amount_cents - P.refunded_amount_cents) > 0
      ) AS cohort_active_paid_orders,
      COALESCE(SUM(P.amount_cents) FILTER (WHERE P.status IN ('PAID', 'REFUNDED')), 0) AS cohort_gross_cents,
      COALESCE(SUM(P.amount_cents - P.refunded_amount_cents) FILTER (WHERE P.status IN ('PAID', 'REFUNDED')), 0) AS cohort_net_cents,
      COALESCE(SUM(P.amount_cents) FILTER (WHERE P.status IN ('SUBMITTED', 'VERIFYING')), 0) AS cohort_pending_cents
    FROM orders O
    LEFT JOIN payments P ON P.order_id = O.id
    WHERE O.created_at >= ${startIso}::timestamptz AND O.created_at < ${endIso}::timestamptz
  `);

  const row = rows[0] ?? {
    total_created_orders: 0,
    currency_anomaly_count: 0,
    cohort_paid_orders: 0,
    cohort_active_paid_orders: 0,
    cohort_gross_cents: 0,
    cohort_net_cents: 0,
    cohort_pending_cents: 0,
  };

  const currencyAnomalyCount = BigInt(row.currency_anomaly_count ?? 0);
  if (currencyAnomalyCount > 0n) {
    logger.warn(
      {
        anomalyCount: Number(currencyAnomalyCount),
        rangeStart: startIso,
        rangeEnd: endIso,
      },
      "Currency integrity anomaly detected in cohort orders/payments population. Financial metrics failing closed."
    );
    return {
      status: "UNAVAILABLE",
      error: "CURRENCY_INTEGRITY_ERROR",
      message:
        "Financial metrics unavailable due to non-PEN or mismatched currency in cohort population.",
    };
  }

  const cohortGrossCents = BigInt(row.cohort_gross_cents ?? 0);
  const cohortNetCents = BigInt(row.cohort_net_cents ?? 0);
  const cohortPendingCents = BigInt(row.cohort_pending_cents ?? 0);
  const cohortPaidOrders = Number(row.cohort_paid_orders ?? 0);
  const cohortActivePaidOrders = Number(row.cohort_active_paid_orders ?? 0);

  const aovCents = calculateAovCents(cohortNetCents, BigInt(cohortActivePaidOrders));

  return {
    status: "READY",
    summary: {
      cohortGrossCents,
      cohortNetCents,
      cohortPendingCents,
      cohortPaidOrders,
      cohortActivePaidOrders,
      aovCents,
    },
  };
}

/**
 * Computes comparative Cohort Financial KPIs between the current and previous period.
 */
async function fetchCohortFinancials(
  period: ResolvedDashboardPeriod
): Promise<CohortFinancialsResult> {
  const [currResult, prevResult] = await Promise.all([
    fetchSingleCohortFinancials(period.current),
    fetchSingleCohortFinancials(period.previous),
  ]);

  if (currResult.status === "UNAVAILABLE") {
    return currResult;
  }
  if (prevResult.status === "UNAVAILABLE") {
    return prevResult;
  }

  const current = currResult.summary;
  const previous = prevResult.summary;

  const trends: CohortFinancialTrends = {
    gross: calculateMonetaryTrend(current.cohortGrossCents, previous.cohortGrossCents),
    net: calculateMonetaryTrend(current.cohortNetCents, previous.cohortNetCents),
    aov: calculateMonetaryTrend(current.aovCents, previous.aovCents),
    paidOrders: calculateCountTrend(current.cohortPaidOrders, previous.cohortPaidOrders),
  };

  return {
    status: "READY",
    data: {
      current,
      previous,
      trends,
    },
  };
}

/**
 * Executes order volume and status breakdown query for a single half-open period.
 * Derived directly from orders, completely resilient to missing payment rows.
 */
async function fetchSingleOrderPipeline(
  range: DashboardPeriodRange
): Promise<OrderPipelineSummary> {
  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();

  const rows = await db.execute<{
    total_created_orders: string | number;
    pending_orders: string | number;
    confirmed_orders: string | number;
    processing_orders: string | number;
    fulfilled_orders: string | number;
    cancelled_orders: string | number;
    expired_orders: string | number;
    refunded_orders: string | number;
  }>(sql`
    SELECT
      COUNT(id) AS total_created_orders,
      COUNT(id) FILTER (WHERE status = 'PENDING') AS pending_orders,
      COUNT(id) FILTER (WHERE status = 'CONFIRMED') AS confirmed_orders,
      COUNT(id) FILTER (WHERE status = 'PROCESSING') AS processing_orders,
      COUNT(id) FILTER (WHERE status = 'FULFILLED') AS fulfilled_orders,
      COUNT(id) FILTER (WHERE status = 'CANCELLED') AS cancelled_orders,
      COUNT(id) FILTER (WHERE status = 'EXPIRED') AS expired_orders,
      COUNT(id) FILTER (WHERE status = 'REFUNDED') AS refunded_orders
    FROM orders
    WHERE created_at >= ${startIso}::timestamptz AND created_at < ${endIso}::timestamptz
  `);

  const row = rows[0] ?? {
    total_created_orders: 0,
    pending_orders: 0,
    confirmed_orders: 0,
    processing_orders: 0,
    fulfilled_orders: 0,
    cancelled_orders: 0,
    expired_orders: 0,
    refunded_orders: 0,
  };

  return {
    totalCreatedOrders: Number(row.total_created_orders ?? 0),
    pendingOrders: Number(row.pending_orders ?? 0),
    confirmedOrders: Number(row.confirmed_orders ?? 0),
    processingOrders: Number(row.processing_orders ?? 0),
    fulfilledOrders: Number(row.fulfilled_orders ?? 0),
    cancelledOrders: Number(row.cancelled_orders ?? 0),
    expiredOrders: Number(row.expired_orders ?? 0),
    refundedOrders: Number(row.refunded_orders ?? 0),
  };
}

/**
 * Computes comparative Order Pipeline volume and status breakdown.
 */
async function fetchOrderPipeline(period: ResolvedDashboardPeriod): Promise<OrderPipelineResult> {
  const [current, previous] = await Promise.all([
    fetchSingleOrderPipeline(period.current),
    fetchSingleOrderPipeline(period.previous),
  ]);

  return {
    status: "READY",
    data: {
      current,
      previous,
      trends: {
        totalCreatedOrders: calculateCountTrend(
          current.totalCreatedOrders,
          previous.totalCreatedOrders
        ),
      },
    },
  };
}

/**
 * Executes Payment Verification snapshot queue, historical submission activity,
 * and period refund outflow.
 */
async function fetchPaymentVerification(
  period: ResolvedDashboardPeriod
): Promise<PaymentVerificationResult> {
  const startIso = period.current.start.toISOString();
  const endIso = period.current.end.toISOString();

  // 1. Current Snapshot Queue (Real-Time snapshot regardless of order creation date)
  const queuePromise = db.execute<{
    oldest_pending_at?: Date | string | null;
    queue_count: string | number;
    queue_currency_anomaly_count: string | number;
    queue_amount_cents: string | number;
  }>(sql`
    SELECT
      MIN((SELECT MAX(ps.submitted_at) FROM payment_submissions ps WHERE ps.payment_id = payments.id)) AS oldest_pending_at,
      COUNT(id) AS queue_count,
      COUNT(id) FILTER (WHERE currency != 'PEN') AS queue_currency_anomaly_count,
      COALESCE(SUM(amount_cents) FILTER (WHERE currency = 'PEN'), 0) AS queue_amount_cents
    FROM payments
    WHERE status IN ('SUBMITTED', 'VERIFYING')
  `);

  // 2. Historical submission activity in period
  const submissionsPromise = db.execute<{
    submission_attempts_count: string | number;
    distinct_payments_count: string | number;
    rejected_decisions_count?: string | number;
  }>(sql`
    SELECT
      COUNT(id) AS submission_attempts_count,
      COUNT(DISTINCT payment_id) AS distinct_payments_count,
      (SELECT COUNT(*) FROM payment_verifications
        WHERE decision <> 'APPROVED'
          AND verified_at >= ${startIso}::timestamptz AND verified_at < ${endIso}::timestamptz
      ) AS rejected_decisions_count
    FROM payment_submissions
    WHERE submitted_at >= ${startIso}::timestamptz AND submitted_at < ${endIso}::timestamptz
  `);

  // 3. Period refund outflow
  const refundsPromise = db.execute<{
    refund_count: string | number;
    refund_currency_anomaly_count: string | number;
    refund_outflow_cents: string | number;
  }>(sql`
    SELECT
      COUNT(R.id) AS refund_count,
      COUNT(R.id) FILTER (WHERE P.currency != 'PEN' OR O.currency != 'PEN' OR P.currency != O.currency) AS refund_currency_anomaly_count,
      COALESCE(SUM(R.amount_cents), 0) AS refund_outflow_cents
    FROM refunds R
    INNER JOIN payments P ON P.id = R.payment_id
    INNER JOIN orders O ON O.id = R.order_id
    WHERE R.created_at >= ${startIso}::timestamptz AND R.created_at < ${endIso}::timestamptz
  `);

  const [queueRows, submissionRows, refundRows] = await Promise.all([
    queuePromise,
    submissionsPromise,
    refundsPromise,
  ]);

  const queueRow = queueRows[0] ?? {
    queue_count: 0,
    queue_currency_anomaly_count: 0,
    queue_amount_cents: 0,
  };
  const queueCount = Number(queueRow.queue_count ?? 0);
  const queueAnomalyCount = BigInt(queueRow.queue_currency_anomaly_count ?? 0);

  let queueAmount: MonetaryQueueAmountResult;
  if (queueAnomalyCount > 0n) {
    logger.warn(
      { queueAnomalyCount: Number(queueAnomalyCount) },
      "Currency anomaly detected in unverified payment queue. queueAmount entering UNAVAILABLE."
    );
    queueAmount = {
      status: "UNAVAILABLE",
      error: "CURRENCY_INTEGRITY_ERROR",
      message: "Queue amount unavailable due to non-PEN currency in pending verification payments.",
    };
  } else {
    queueAmount = {
      status: "READY",
      amountCents: BigInt(queueRow.queue_amount_cents ?? 0),
    };
  }

  const subRow = submissionRows[0] ?? {
    submission_attempts_count: 0,
    distinct_payments_count: 0,
  };
  const submissionAttemptsCount = Number(subRow.submission_attempts_count ?? 0);
  const distinctPaymentsSubmittedCount = Number(subRow.distinct_payments_count ?? 0);
  const rejectedDecisionsCount = Number(
    "rejected_decisions_count" in subRow ? (subRow.rejected_decisions_count ?? 0) : 0
  );

  const refRow = refundRows[0] ?? {
    refund_count: 0,
    refund_currency_anomaly_count: 0,
    refund_outflow_cents: 0,
  };
  const refundCount = Number(refRow.refund_count ?? 0);
  const refundAnomalyCount = BigInt(refRow.refund_currency_anomaly_count ?? 0);

  let refundOutflow: MonetaryRefundOutflowResult;
  if (refundAnomalyCount > 0n) {
    logger.warn(
      { refundAnomalyCount: Number(refundAnomalyCount) },
      "Currency anomaly detected in period refunds population. refundOutflow entering UNAVAILABLE."
    );
    refundOutflow = {
      status: "UNAVAILABLE",
      error: "CURRENCY_INTEGRITY_ERROR",
      message:
        "Refund outflow unavailable due to non-PEN or mismatched currency in refund records.",
    };
  } else {
    refundOutflow = {
      status: "READY",
      outflowCents: BigInt(refRow.refund_outflow_cents ?? 0),
    };
  }

  return {
    status: "READY",
    data: {
      snapshotQueue: {
        queueCount,
        oldestPendingAt:
          "oldest_pending_at" in queueRow && queueRow.oldest_pending_at
            ? new Date(queueRow.oldest_pending_at).toISOString()
            : null,
        queueAmount,
      },
      periodActivity: {
        submissionAttemptsCount,
        distinctPaymentsSubmittedCount,
        rejectedDecisionsCount,
      },
      periodRefunds: {
        refundCount,
        refundOutflow,
      },
    },
  };
}

/**
 * Executes catalog overview query in a single pass.
 */
async function fetchCatalogOverview(): Promise<CatalogOverviewResult> {
  const rows = await db.execute<{
    published_products: string | number;
    draft_products: string | number;
    archived_products: string | number;
    active_sellable_skus: string | number;
    total_active_variants: string | number;
    total_variants: string | number;
    published_products_without_skus: string | number;
  }>(sql`
    SELECT
      COUNT(DISTINCT PR.id) FILTER (WHERE PR.status = 'PUBLISHED') AS published_products,
      COUNT(DISTINCT PR.id) FILTER (WHERE PR.status = 'DRAFT') AS draft_products,
      COUNT(DISTINCT PR.id) FILTER (WHERE PR.status = 'ARCHIVED') AS archived_products,
      COUNT(PV.id) FILTER (WHERE PV.status = 'ACTIVE' AND PR.status = 'PUBLISHED') AS active_sellable_skus,
      COUNT(PV.id) FILTER (WHERE PV.status = 'ACTIVE') AS total_active_variants,
      COUNT(PV.id) AS total_variants,
      (
        SELECT COUNT(*)
        FROM products P2
        WHERE P2.status = 'PUBLISHED'
          AND NOT EXISTS (
            SELECT 1 FROM product_variants PV2
            WHERE PV2.product_id = P2.id AND PV2.status = 'ACTIVE'
          )
      ) AS published_products_without_skus
    FROM products PR
    LEFT JOIN product_variants PV ON PV.product_id = PR.id
  `);

  const row = rows[0] ?? {
    published_products: 0,
    draft_products: 0,
    archived_products: 0,
    active_sellable_skus: 0,
    total_active_variants: 0,
    total_variants: 0,
    published_products_without_skus: 0,
  };

  return {
    status: "READY",
    data: {
      publishedProducts: Number(row.published_products ?? 0),
      draftProducts: Number(row.draft_products ?? 0),
      archivedProducts: Number(row.archived_products ?? 0),
      activeSellableSkus: Number(row.active_sellable_skus ?? 0),
      totalActiveVariants: Number(row.total_active_variants ?? 0),
      totalVariants: Number(row.total_variants ?? 0),
      publishedProductsWithoutSkus: Number(row.published_products_without_skus ?? 0),
    },
  };
}

/**
 * Executes physical inventory overview queries:
 * 1. Global physical stock balances across all locations (without catalog filter).
 * 2. Out-of-Stock active SKUs (variants with status ACTIVE whose global ATS <= 0, including zero-inventory variants).
 * 3. Low-Stock active location positions (where 0 < ATS <= reorder_point).
 */
async function fetchInventoryOverview(): Promise<InventoryOverviewResult> {
  const [balanceRows, oosRows, lowStockRows, restockRows] = await Promise.all([
    db.execute<{
      total_positions: string | number;
      on_hand_units: string | number;
      reserved_units: string | number;
      allocated_units: string | number;
      available_to_sell_units: string | number;
    }>(sql`
      SELECT
        COUNT(id) AS total_positions,
        COALESCE(SUM(quantity_on_hand), 0) AS on_hand_units,
        COALESCE(SUM(quantity_reserved), 0) AS reserved_units,
        COALESCE(SUM(quantity_allocated), 0) AS allocated_units,
        COALESCE(SUM(quantity_on_hand - quantity_reserved - quantity_allocated), 0) AS available_to_sell_units
      FROM inventory_items
    `),

    db.execute<{
      oos_skus: string | number;
    }>(sql`
      SELECT COUNT(*) AS oos_skus FROM (
        SELECT PV.id
        FROM product_variants PV
        LEFT JOIN inventory_items II ON II.variant_id = PV.id
        WHERE PV.status = 'ACTIVE'
        GROUP BY PV.id
        HAVING COALESCE(SUM(II.quantity_on_hand - II.quantity_reserved - II.quantity_allocated), 0) <= 0
      ) sub
    `),

    db.execute<{
      low_stock_active_positions: string | number;
    }>(sql`
      SELECT COUNT(*) AS low_stock_active_positions
      FROM inventory_items II
      INNER JOIN product_variants PV ON PV.id = II.variant_id
      WHERE PV.status = 'ACTIVE'
        AND (II.quantity_on_hand - II.quantity_reserved - II.quantity_allocated) <= II.reorder_point
        AND (II.quantity_on_hand - II.quantity_reserved - II.quantity_allocated) > 0
    `),

    db.execute<{
      variant_id: string;
      product_name: string;
      variant_title: string;
      sku: string;
      available_units: string | number;
      reorder_point: string | number;
    }>(sql`
      SELECT
        PV.id AS variant_id,
        P.name AS product_name,
        PV.title AS variant_title,
        PV.sku,
        SUM(II.quantity_on_hand - II.quantity_reserved - II.quantity_allocated) AS available_units,
        SUM(II.reorder_point) AS reorder_point
      FROM inventory_items II
      INNER JOIN product_variants PV ON PV.id = II.variant_id
      INNER JOIN products P ON P.id = PV.product_id
      WHERE PV.status = 'ACTIVE'
      GROUP BY PV.id, P.name, PV.title, PV.sku
      HAVING SUM(II.quantity_on_hand - II.quantity_reserved - II.quantity_allocated) <= SUM(II.reorder_point)
      ORDER BY available_units ASC, P.name ASC
      LIMIT 5
    `),
  ]);

  const bRow = balanceRows[0] ?? {
    total_positions: 0,
    on_hand_units: 0,
    reserved_units: 0,
    allocated_units: 0,
    available_to_sell_units: 0,
  };

  const oRow = oosRows[0] ?? { oos_skus: 0 };
  const lRow = lowStockRows[0] ?? { low_stock_active_positions: 0 };

  return {
    status: "READY",
    data: {
      globalPhysicalBalances: {
        totalPositions: Number(bRow.total_positions ?? 0),
        onHandUnits: Number(bRow.on_hand_units ?? 0),
        reservedUnits: Number(bRow.reserved_units ?? 0),
        allocatedUnits: Number(bRow.allocated_units ?? 0),
        availableToSellUnits: Number(bRow.available_to_sell_units ?? 0),
      },
      outOfStockActiveSkus: Number(oRow.oos_skus ?? 0),
      lowStockActivePositions: Number(lRow.low_stock_active_positions ?? 0),
      restockItems: restockRows
        .filter((row) => typeof row.variant_id === "string")
        .map((row) => ({
          variantId: row.variant_id,
          productName: row.product_name,
          variantTitle: row.variant_title,
          sku: row.sku,
          availableUnits: Math.max(0, Number(row.available_units ?? 0)),
          reorderPoint: Number(row.reorder_point ?? 0),
        })),
    },
  };
}

/**
 * Production Server-Only Entrypoint for the Admin Dashboard.
 *
 * Guaranteed Invariants:
 * 1. Takes NO caller-controlled identity arguments (no authUserId, no roles, no permissions).
 * 2. Resolves authoritative staff session strictly through requireAdminAccess().
 * 3. Enforces permission-aware execution BEFORE queries run:
 *    - Financial: orders:manage OR orders:verify
 *    - Orders Pipeline: orders:manage
 *    - Payment Queue: orders:verify
 *    - Catalog: catalog:manage OR catalog:publish
 *    - Inventory: inventory:manage
 *    Unauthorized sections NEVER dispatch their privileged database queries.
 * 4. Exactly ONE referenceNow instant drives all period calculations for the request.
 * 5. Analytical / read-only: zero database mutations.
 */
export async function getAdminDashboardData(params?: {
  periodSelector?: DashboardPeriodSelector;
  now?: Date;
}): Promise<AdminDashboardPayload> {
  const auth = await requireAdminAccess();
  const period = resolveDashboardPeriod(params?.periodSelector, params?.now ?? new Date());

  const canViewFinancials =
    auth.permissions.has("orders:manage") || auth.permissions.has("orders:verify");
  const canViewOrders = auth.permissions.has("orders:manage");
  const canViewPaymentQueue = auth.permissions.has("orders:verify");
  const canViewCatalog =
    auth.permissions.has("catalog:manage") || auth.permissions.has("catalog:publish");
  const canViewInventory = auth.permissions.has("inventory:manage");
  // The home and catalog health link to editors that require catalog:manage.
  const canManageCatalog = auth.permissions.has("catalog:manage");

  // Concurrently execute ONLY authorized queries. Unauthorized sections do not run.
  const [
    financialCohort,
    orderPipeline,
    paymentVerification,
    catalogOverview,
    inventoryOverview,
    orderQueue,
    homeStatus,
    catalogHealth,
  ] = await Promise.all([
    canViewFinancials
      ? fetchCohortFinancials(period)
      : Promise.resolve<CohortFinancialsResult>({ status: "UNAUTHORIZED" }),
    canViewOrders
      ? fetchOrderPipeline(period)
      : Promise.resolve<OrderPipelineResult>({ status: "UNAUTHORIZED" }),
    canViewPaymentQueue
      ? fetchPaymentVerification(period)
      : Promise.resolve<PaymentVerificationResult>({ status: "UNAUTHORIZED" }),
    canViewCatalog
      ? fetchCatalogOverview()
      : Promise.resolve<CatalogOverviewResult>({ status: "UNAUTHORIZED" }),
    canViewInventory
      ? fetchInventoryOverview()
      : Promise.resolve<InventoryOverviewResult>({ status: "UNAUTHORIZED" }),
    canViewOrders
      ? fetchOrderQueue().then((data): OrderQueueResult => ({ status: "READY", data }))
      : Promise.resolve<OrderQueueResult>({ status: "UNAUTHORIZED" }),
    canManageCatalog
      ? fetchHomeStatus()
      : Promise.resolve<HomeStatusResult>({ status: "UNAUTHORIZED" }),
    canManageCatalog
      ? fetchCatalogHealth()
      : Promise.resolve<CatalogHealthResult>({ status: "UNAUTHORIZED" }),
  ]);

  return {
    period,
    actor: {
      authUserId: auth.authUserId,
      email: auth.email,
      roles: auth.roles,
      permissions: Array.from(auth.permissions),
    },
    financialCohort,
    orderPipeline,
    paymentVerification,
    catalogOverview,
    inventoryOverview,
    orderQueue,
    homeStatus,
    catalogHealth,
  };
}

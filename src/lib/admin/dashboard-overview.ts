import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "@/lib/logger";
import type { PermissionName } from "@/lib/auth/rbac";
import { MENU_ENTRY_DESCRIPTORS } from "@/lib/navigation/menu-entries";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { orderItemPreviewsSql } from "@/lib/orders/item-previews-sql";
import { requireAdminAccess } from "@/lib/auth/rbac";
import { calculateAovCents } from "./dashboard-metrics";
import { fetchHomeStatus } from "./dashboard-operations";
import { formatInteger, formatWaiting } from "./dashboard-format";
import {
  resolveDashboardPeriod,
  type DashboardPeriodSelector,
  type ResolvedDashboardPeriod,
} from "./dashboard-period";
import type { HomeStatusResult } from "./dashboard-types";
import type {
  AttentionItem,
  AttentionSnapshot,
  CatalogHealthSummary,
  InventorySummary,
  Kpi,
  KpiTrend,
  OverviewResult,
  RecentOrder,
  SalesOverview,
  SalesPoint,
  StoreStatus,
  StoreStatusRow,
  TopProduct,
} from "./dashboard-overview-types";

/**
 * Readers of the Inicio overview. Each one is a single aggregate query: the database does the
 * counting and summing, JavaScript only formats a few dozen numbers. Unauthorized sections never
 * query. The workers plan allows ~10 ms of CPU per request, so no reader loads whole tables.
 */

type Can = (permission: PermissionName) => boolean;

const WHOLE_SOLES = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const LIMA_OFFSET_MS = 5 * 3_600_000;

/**
 * Lima calendar parts by arithmetic: America/Lima is UTC−5 all year. Cheaper than building an
 * Intl formatter per call, which matters with a bucket per day on a 10 ms CPU budget.
 */
function limaParts(instant: Date) {
  const shifted = new Date(instant.getTime() - LIMA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const dayLabel = (parts: ReturnType<typeof limaParts>) => `${parts.day} ${MONTHS[parts.month - 1]}`;

/** «S/ 4,820»: the dashboard reads whole soles; cents stay on the detail screens. */
export function formatSoles(cents: bigint | number): string {
  const value = Number(cents) / 100;
  return `${value < 0 ? "-" : ""}S/ ${WHOLE_SOLES.format(Math.abs(Math.round(value)))}`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Percentage change in whole numbers, with the semantic states of the existing trend helpers. */
export function describeTrend(
  current: bigint | number,
  previous: bigint | number,
  comparisonLabel: string
): KpiTrend {
  const cur = Number(current);
  const prev = Number(previous);
  if (prev === 0 && cur === 0) {
    return {
      direction: "flat",
      label: "0%",
      description: `Sin cambio frente a ${comparisonLabel}`,
    };
  }
  if (prev <= 0) {
    return { direction: "new", label: "Nuevo", description: `Sin datos ${comparisonLabel}` };
  }
  const percent = Math.round(((cur - prev) / prev) * 100);
  if (percent === 0) {
    return { direction: "flat", label: "0%", description: `Igual que ${comparisonLabel}` };
  }
  const label = `${Math.abs(percent)}%`;
  return percent > 0
    ? { direction: "up", label, description: `${label} más que ${comparisonLabel}` }
    : { direction: "down", label, description: `${label} menos que ${comparisonLabel}` };
}

/** The words after «vs.» under each KPI. */
export function comparisonLabelOf(period: ResolvedDashboardPeriod): string {
  switch (period.selector) {
    case "TODAY":
      return "ayer";
    case "LAST_7_DAYS":
      return "los 7 días anteriores";
    case "LAST_30_DAYS":
      return "los 30 días anteriores";
    case "THIS_MONTH":
      return "el mes anterior";
  }
}

/** Every bucket of the current window, so quiet hours and days still draw as zero. */
export function bucketsOf(period: ResolvedDashboardPeriod): Array<{ key: string; label: string }> {
  const { start, end } = period.current;
  if (period.selector === "TODAY") {
    // Up to the current hour: the rest of the day has not happened yet.
    const lastHour = limaParts(
      new Date(Math.min(end.getTime() - 1, period.referenceNow.getTime()))
    ).hour;
    const day = limaParts(start);
    const date = `${day.year}-${pad(day.month)}-${pad(day.day)}`;
    return Array.from({ length: lastHour + 1 }, (_, hour) => ({
      key: `${date}T${pad(hour)}`,
      label: `${pad(hour)}:00`,
    }));
  }
  const buckets: Array<{ key: string; label: string }> = [];
  // Lima has no daylight saving: every day is exactly 24 h after the first midnight.
  for (let time = start.getTime(); time < end.getTime(); time += 86_400_000) {
    const parts = limaParts(new Date(time));
    buckets.push({
      key: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
      label: dayLabel(parts),
    });
  }
  return buckets;
}

type SalesRow = {
  slot: "C" | "P";
  bucket: string | null;
  created_orders: string | number;
  currency_anomalies: string | number;
  paid_orders: string | number;
  active_paid_orders: string | number;
  net_cents: string | number;
  profit_cents: string | number | null;
  costed_line_cents: string | number;
  line_cents: string | number;
};

/**
 * Sales of the period, bucketed, plus the previous window's totals: one query feeds the four KPIs,
 * their sparklines and the period chart. Same cohort as before: orders created in the window, with
 * the payment's net amount once it is PAID or REFUNDED. Fails closed on any non-PEN money.
 *
 * Estimated profit uses each variant's current cost (order lines keep no cost snapshot), scaled by
 * the share of the payment that was not refunded. Lines without a cost are left out of it and
 * reported through `profitCoverage`.
 */
export async function fetchSalesOverview(
  period: ResolvedDashboardPeriod
): Promise<OverviewResult<SalesOverview>> {
  const hourly = period.selector === "TODAY";
  const bucketFormat = hourly ? `YYYY-MM-DD"T"HH24` : "YYYY-MM-DD";
  const cur = period.current;
  const prev = period.previous;

  const rows = await db.execute<SalesRow>(sql`
    WITH scoped AS (
      SELECT O.id, O.currency AS order_currency, P.id AS payment_id, P.currency AS payment_currency,
        P.status AS payment_status, P.amount_cents, P.refunded_amount_cents,
        CASE WHEN O.created_at >= ${cur.start.toISOString()}::timestamptz THEN 'C' ELSE 'P' END AS slot,
        to_char(O.created_at AT TIME ZONE 'America/Lima', ${bucketFormat}) AS bucket
      FROM orders O
      LEFT JOIN payments P ON P.order_id = O.id
      WHERE (O.created_at >= ${cur.start.toISOString()}::timestamptz AND O.created_at < ${cur.end.toISOString()}::timestamptz)
         OR (O.created_at >= ${prev.start.toISOString()}::timestamptz AND O.created_at < ${prev.end.toISOString()}::timestamptz)
    ),
    margins AS (
      SELECT OI.order_id,
        SUM(OI.line_total_cents - OI.quantity * PV.cost_cents) FILTER (WHERE PV.cost_cents IS NOT NULL) AS margin_cents,
        COALESCE(SUM(OI.line_total_cents) FILTER (WHERE PV.cost_cents IS NOT NULL), 0) AS costed_line_cents,
        SUM(OI.line_total_cents) AS line_cents
      FROM order_items OI
      JOIN product_variants PV ON PV.id = OI.variant_id
      WHERE OI.order_id IN (SELECT id FROM scoped WHERE payment_status IN ('PAID', 'REFUNDED'))
      GROUP BY OI.order_id
    )
    SELECT S.slot, CASE WHEN S.slot = 'C' THEN S.bucket END AS bucket,
      COUNT(S.id) AS created_orders,
      COUNT(S.id) FILTER (
        WHERE S.payment_id IS NOT NULL AND (
          S.order_currency != 'PEN' OR S.payment_currency != 'PEN' OR S.order_currency != S.payment_currency
        )
      ) AS currency_anomalies,
      COUNT(S.id) FILTER (WHERE S.payment_status IN ('PAID', 'REFUNDED')) AS paid_orders,
      COUNT(S.id) FILTER (
        WHERE S.payment_status IN ('PAID', 'REFUNDED') AND (S.amount_cents - S.refunded_amount_cents) > 0
      ) AS active_paid_orders,
      COALESCE(SUM(S.amount_cents - S.refunded_amount_cents) FILTER (WHERE S.payment_status IN ('PAID', 'REFUNDED')), 0) AS net_cents,
      ROUND(SUM(
        M.margin_cents * (S.amount_cents - S.refunded_amount_cents)::numeric / NULLIF(S.amount_cents, 0)
      ) FILTER (WHERE S.payment_status IN ('PAID', 'REFUNDED') AND M.margin_cents IS NOT NULL)) AS profit_cents,
      COALESCE(SUM(M.costed_line_cents) FILTER (WHERE S.payment_status IN ('PAID', 'REFUNDED')), 0) AS costed_line_cents,
      COALESCE(SUM(M.line_cents) FILTER (WHERE S.payment_status IN ('PAID', 'REFUNDED')), 0) AS line_cents
    FROM scoped S
    LEFT JOIN margins M ON M.order_id = S.id
    GROUP BY 1, 2
  `);

  if (rows.some((row) => Number(row.currency_anomalies) > 0)) {
    logger.warn(
      { rangeStart: prev.start.toISOString(), rangeEnd: cur.end.toISOString() },
      "Currency integrity anomaly in dashboard sales. Sales metrics failing closed."
    );
    return {
      status: "UNAVAILABLE",
      message: "Hay pagos en otra moneda en este período. Revisa los pedidos antes de leer ventas.",
    };
  }

  const sum = (window: "C" | "P", field: keyof SalesRow) =>
    rows
      .filter((row) => row.slot === window)
      .reduce((total, row) => total + BigInt(row[field] ?? 0), 0n);
  const hasProfit = (window: "C" | "P") =>
    rows.some((row) => row.slot === window && row.profit_cents !== null);

  const byBucket = new Map(rows.filter((row) => row.slot === "C").map((row) => [row.bucket, row]));
  const points: SalesPoint[] = bucketsOf(period).map(({ key, label }) => {
    const row = byBucket.get(key);
    return {
      key,
      label,
      netCents: Number(row?.net_cents ?? 0),
      paidOrders: Number(row?.paid_orders ?? 0),
      profitCents:
        row?.profit_cents === null || row?.profit_cents === undefined
          ? null
          : Number(row.profit_cents),
    };
  });

  const comparisonLabel = comparisonLabelOf(period);
  const kpi = (current: bigint, previous: bigint, format: (value: bigint) => string): Kpi => ({
    value: format(current),
    previous: format(previous),
    trend: describeTrend(current, previous, comparisonLabel),
  });
  const net = { C: sum("C", "net_cents"), P: sum("P", "net_cents") };
  const paid = { C: sum("C", "paid_orders"), P: sum("P", "paid_orders") };
  const aov = {
    C: calculateAovCents(net.C, sum("C", "active_paid_orders")),
    P: calculateAovCents(net.P, sum("P", "active_paid_orders")),
  };
  const lineCents = sum("C", "line_cents");

  return {
    status: "READY",
    data: {
      granularity: hourly ? "hour" : "day",
      points,
      comparisonLabel,
      netSales: kpi(net.C, net.P, formatSoles),
      paidOrders: kpi(paid.C, paid.P, (value) => formatInteger(value)),
      averageTicket: kpi(aov.C, aov.P, formatSoles),
      estimatedProfit: hasProfit("C")
        ? kpi(sum("C", "profit_cents"), sum("P", "profit_cents"), formatSoles)
        : null,
      profitCoverage:
        lineCents > 0n ? Number(sum("C", "costed_line_cents")) / Number(lineCents) : 0,
    },
  };
}

/** Best sellers of the period by revenue, with the change against the previous window. */
export async function fetchTopProducts(
  period: ResolvedDashboardPeriod,
  can: Can,
  limit = 5
): Promise<OverviewResult<TopProduct[]>> {
  const cur = period.current;
  const prev = period.previous;
  const rows = await db.execute<{
    product_id: string;
    name: string;
    object_key: string | null;
    units: string | number;
    revenue_cents: string | number;
    previous_revenue_cents: string | number;
  }>(sql`
    WITH lines AS (
      SELECT PV.product_id, OI.quantity, OI.line_total_cents,
        O.created_at >= ${cur.start.toISOString()}::timestamptz AS is_current
      FROM order_items OI
      JOIN orders O ON O.id = OI.order_id
      JOIN payments P ON P.order_id = O.id AND P.status IN ('PAID', 'REFUNDED')
      JOIN product_variants PV ON PV.id = OI.variant_id
      WHERE (O.created_at >= ${cur.start.toISOString()}::timestamptz AND O.created_at < ${cur.end.toISOString()}::timestamptz)
         OR (O.created_at >= ${prev.start.toISOString()}::timestamptz AND O.created_at < ${prev.end.toISOString()}::timestamptz)
    ),
    ranked AS (
      SELECT product_id,
        COALESCE(SUM(quantity) FILTER (WHERE is_current), 0) AS units,
        COALESCE(SUM(line_total_cents) FILTER (WHERE is_current), 0) AS revenue_cents,
        COALESCE(SUM(line_total_cents) FILTER (WHERE NOT is_current), 0) AS previous_revenue_cents
      FROM lines GROUP BY product_id
      HAVING COALESCE(SUM(quantity) FILTER (WHERE is_current), 0) > 0
      ORDER BY revenue_cents DESC, units DESC
      LIMIT ${limit}
    )
    SELECT R.*, PR.name, MA.object_key
    FROM ranked R
    JOIN products PR ON PR.id = R.product_id
    LEFT JOIN media_assets MA ON MA.id = PR.primary_media_id
    ORDER BY R.revenue_cents DESC, R.units DESC
  `);

  const comparisonLabel = comparisonLabelOf(period);
  return {
    status: "READY",
    data: rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      imageUrl: resolvePublicMediaUrl(row.object_key),
      units: Number(row.units),
      revenue: formatSoles(BigInt(row.revenue_cents)),
      trend: describeTrend(
        BigInt(row.revenue_cents),
        BigInt(row.previous_revenue_cents),
        comparisonLabel
      ),
      href: can("catalog:manage") ? `/admin/products/${row.product_id}` : null,
    })),
  };
}

/** One badge per order, in the words of the reference: what the store has to do next. */
export function describeOrderStatus(
  orderStatus: string,
  paymentStatus: string | null,
  shipmentStatus: string | null
): RecentOrder["status"] {
  if (orderStatus === "CANCELLED" || orderStatus === "EXPIRED")
    return { label: "Cancelado", tone: "danger" };
  if (orderStatus === "REFUNDED" || paymentStatus === "REFUNDED")
    return { label: "Reembolsado", tone: "neutral" };
  if (orderStatus === "FULFILLED" || shipmentStatus === "DELIVERED")
    return { label: "Entregado", tone: "success" };
  if (shipmentStatus === "SHIPPED") return { label: "Enviado", tone: "info" };
  if (paymentStatus === "SUBMITTED" || paymentStatus === "VERIFYING")
    return { label: "Por validar", tone: "warning" };
  if (paymentStatus === "PAID") {
    // «Por preparar» is exactly what the queue counts: paid, nothing done on the shipment yet.
    if (shipmentStatus === "PACKED") return { label: "Empacado", tone: "info" };
    if (shipmentStatus === "READY_TO_PACK") return { label: "En preparación", tone: "info" };
    return { label: "Por preparar", tone: "warning" };
  }
  if (paymentStatus === "REJECTED") return { label: "Pago rechazado", tone: "danger" };
  return { label: "Sin pagar", tone: "neutral" };
}

export async function fetchRecentOrders(
  now: Date,
  limit = 5
): Promise<OverviewResult<RecentOrder[]>> {
  const rows = await db.execute<{
    order_number: string;
    created_at: Date | string;
    status: string;
    payment_status: string | null;
    shipment_status: string | null;
    total_cents: number;
    currency: string;
    recipient_name: string | null;
    customer_email: string;
    line_count: string | number;
    unit_count: string | number;
    previews: Array<{ imageObjectKey: string | null }> | null;
  }>(sql`
    SELECT O.order_number, O.created_at, O.status, O.total_cents, O.currency, O.customer_email,
      P.status AS payment_status,
      (SELECT S.status FROM shipments S WHERE S.order_id = O.id ORDER BY S.created_at DESC LIMIT 1) AS shipment_status,
      (SELECT A.recipient_name FROM order_address_snapshots A WHERE A.order_id = O.id LIMIT 1) AS recipient_name,
      (SELECT COUNT(*) FROM order_items I WHERE I.order_id = O.id) AS line_count,
      (SELECT COALESCE(SUM(I.quantity), 0) FROM order_items I WHERE I.order_id = O.id) AS unit_count,
      ${orderItemPreviewsSql(sql`O.id`, 1)} AS previews
    FROM orders O
    LEFT JOIN payments P ON P.order_id = O.id
    ORDER BY O.created_at DESC, O.id DESC
    LIMIT ${limit}
  `);

  const today = limaParts(now);
  const yesterday = limaParts(new Date(now.getTime() - 86_400_000));
  const sameDay = (a: ReturnType<typeof limaParts>, b: typeof a) =>
    a.year === b.year && a.month === b.month && a.day === b.day;

  return {
    status: "READY",
    data: rows.map((row) => {
      const created = new Date(row.created_at);
      const day = limaParts(created);
      const time = `${pad(day.hour)}:${pad(day.minute)}`;
      const units = Number(row.unit_count);
      return {
        orderNumber: row.order_number,
        // Orders keep no customer name besides the delivery recipient; the email name is the fallback.
        customer: row.recipient_name?.trim()
          ? row.recipient_name.trim()
          : (row.customer_email.split("@")[0] ?? "Cliente"),
        imageUrl: resolvePublicMediaUrl(row.previews?.[0]?.imageObjectKey ?? null),
        products: `${formatInteger(units)} ${units === 1 ? "producto" : "productos"}`,
        total:
          row.currency === "PEN"
            ? formatSoles(row.total_cents)
            : `${row.currency} ${formatInteger(Math.round(row.total_cents / 100))}`,
        status: describeOrderStatus(row.status, row.payment_status, row.shipment_status),
        createdAt: created.toISOString(),
        createdLabel: sameDay(day, today)
          ? `Hoy, ${time}`
          : sameDay(day, yesterday)
            ? `Ayer, ${time}`
            : `${dayLabel(day)}, ${time}`,
        href: `/admin/orders/${encodeURIComponent(row.order_number)}`,
      };
    }),
  };
}

type StatusRow = {
  to_prepare: { n: number; oldest: string | null } | null;
  payments: { n: number; oldest: string | null; stale: number } | null;
  pending_reviews: string | number | null;
  catalog: {
    published: number;
    withPhoto: number;
    withPrice: number;
    withDescription: number;
    withStory: number;
    complete: number;
    withoutPrice: number;
    withoutPhoto: number;
    outOfStock: number;
    lowStock: number;
    available: number;
  } | null;
  menu: Array<[string, boolean]> | null;
};

export interface StoreSnapshot {
  toPrepare: { count: number; oldest: string | null } | null;
  payments: { count: number; oldest: string | null; stale: number } | null;
  pendingReviews: number | null;
  /** Published products only: what customers see, and exactly what the product filters count. */
  catalog: NonNullable<StatusRow["catalog"]> | null;
  menu: { visible: number; total: number } | null;
}

/**
 * Everything waiting on the store, in one query: order and payment queues, reviews, catalog gaps,
 * stock and the menu. Sections the operator may not see are not queried (they come back null).
 * Catalog counts cover published products and match the product list filters one to one.
 */
export async function fetchStoreSnapshot(can: Can): Promise<StoreSnapshot> {
  const canOrders = can("orders:manage");
  const canPayments = can("orders:verify");
  const canCatalog = can("catalog:manage");
  const canStock = can("inventory:manage");
  const none = sql`NULL`;

  const rows = await db.execute<StatusRow>(sql`
    SELECT
      ${
        canOrders
          ? sql`(SELECT json_build_object('n', COUNT(*), 'oldest', MIN(o.created_at))
              FROM orders o JOIN payments p ON p.order_id = o.id
              WHERE o.status = 'CONFIRMED' AND p.status = 'PAID'
                AND EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id AND s.status = 'UNFULFILLED'))`
          : none
      } AS to_prepare,
      ${
        canPayments
          ? sql`(SELECT json_build_object('n', COUNT(*), 'oldest', MIN(q.submitted_at),
                'stale', COUNT(*) FILTER (WHERE q.submitted_at < now() - interval '24 hours'))
              FROM (
                SELECT (SELECT MAX(ps.submitted_at) FROM payment_submissions ps WHERE ps.payment_id = p.id) AS submitted_at
                FROM payments p WHERE p.status IN ('SUBMITTED', 'VERIFYING')
              ) q)`
          : none
      } AS payments,
      ${
        canCatalog ? sql`(SELECT COUNT(*) FROM product_reviews r WHERE r.status = 'PENDING')` : none
      } AS pending_reviews,
      ${
        canCatalog || canStock
          ? sql`(SELECT json_build_object(
                'published', COUNT(*),
                'withPhoto', COUNT(*) FILTER (WHERE primary_media_id IS NOT NULL),
                'withPrice', COUNT(*) FILTER (WHERE priced_variants > 0),
                'withDescription', COUNT(*) FILTER (WHERE has_description),
                'withStory', COUNT(*) FILTER (WHERE has_story),
                'complete', COUNT(*) FILTER (
                  WHERE primary_media_id IS NOT NULL AND priced_variants > 0 AND has_description AND has_story
                ),
                'withoutPrice', COUNT(*) FILTER (WHERE priced_variants = 0),
                'withoutPhoto', COUNT(*) FILTER (WHERE primary_media_id IS NULL),
                'outOfStock', COUNT(*) FILTER (WHERE available <= 0),
                'lowStock', COUNT(*) FILTER (WHERE available > 0 AND low_variants > 0),
                'available', COUNT(*) FILTER (WHERE available > 0 AND low_variants = 0))
              FROM (
                SELECT p.id, p.primary_media_id,
                  COALESCE(btrim(p.description), '') <> '' AS has_description,
                  EXISTS (SELECT 1 FROM product_stories st WHERE st.product_id = p.id AND st.published_revision_id IS NOT NULL) AS has_story,
                  COUNT(v.id) FILTER (WHERE v.price_cents > 0) AS priced_variants,
                  COALESCE(SUM(v.available), 0) AS available,
                  COUNT(v.id) FILTER (WHERE v.available <= v.reorder_point) AS low_variants
                FROM products p
                LEFT JOIN LATERAL (
                  SELECT pv.id, pv.price_cents,
                    SUM(ii.quantity_on_hand - ii.quantity_reserved - ii.quantity_allocated) AS available,
                    SUM(ii.reorder_point) AS reorder_point
                  FROM product_variants pv
                  LEFT JOIN inventory_items ii ON ii.variant_id = pv.id
                  WHERE pv.product_id = p.id AND pv.status = 'ACTIVE'
                  GROUP BY pv.id
                ) v ON TRUE
                WHERE p.status = 'PUBLISHED'
                GROUP BY p.id
              ) per_product)`
          : none
      } AS catalog,
      ${
        canCatalog
          ? sql`(SELECT json_agg(json_build_array(entry_id, is_visible)) FROM storefront_menu_entries)`
          : none
      } AS menu
  `);

  const row = rows[0];
  const visibleMenu = () => {
    const overrides = new Map(row?.menu ?? []);
    return MENU_ENTRY_DESCRIPTORS.filter((entry) => overrides.get(entry.id) ?? entry.defaultVisible)
      .length;
  };
  return {
    toPrepare: row?.to_prepare
      ? { count: Number(row.to_prepare.n), oldest: row.to_prepare.oldest }
      : null,
    payments: row?.payments
      ? {
          count: Number(row.payments.n),
          oldest: row.payments.oldest,
          stale: Number(row.payments.stale),
        }
      : null,
    pendingReviews:
      row?.pending_reviews === null || row?.pending_reviews === undefined
        ? null
        : Number(row.pending_reviews),
    catalog: row?.catalog
      ? (Object.fromEntries(
          Object.entries(row.catalog).map(([key, value]) => [key, Number(value)])
        ) as StoreSnapshot["catalog"])
      : null,
    menu: canCatalog ? { visible: visibleMenu(), total: MENU_ENTRY_DESCRIPTORS.length } : null,
  };
}

/** Where each number leads, limited to screens the operator may open. */
export const OVERVIEW_LINKS = {
  toPrepare: "/admin/orders?orderStatus=CONFIRMED&shipmentStatus=UNFULFILLED",
  payments: "/admin/pagos",
  reviews: "/admin/resenas",
  published: "/admin/products?status=PUBLISHED",
  publishedGap: (pending: "price" | "stock" | "media" | "issues") =>
    `/admin/products?status=PUBLISHED&pending=${pending}`,
  inventory: (stock?: "low" | "out") =>
    stock ? `/admin/inventario?stock=${stock}` : "/admin/inventario",
  home: "/admin/home",
  menu: "/admin/menu",
} as const;

const plural = (count: number, one: string, many: string) =>
  `${formatInteger(count)} ${count === 1 ? one : many}`;

/** «Por atender»: only real, actionable work, most urgent first. Zero counts are left out. */
export function buildAttentionItems(snapshot: StoreSnapshot, can: Can, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  const catalog = snapshot.catalog;
  const canCatalog = can("catalog:manage");

  if (snapshot.payments && snapshot.payments.count > 0) {
    const waiting = snapshot.payments.oldest
      ? formatWaiting(snapshot.payments.oldest, now).text
      : null;
    items.push({
      id: "payments",
      count: snapshot.payments.count,
      title: snapshot.payments.count === 1 ? "pago por validar" : "pagos por validar",
      detail: waiting ? `Yape/Plin · el más antiguo ${waiting}` : "Comprobantes Yape/Plin",
      href: OVERVIEW_LINKS.payments,
      tone: snapshot.payments.stale > 0 ? "danger" : "warning",
    });
  }
  if (snapshot.toPrepare && snapshot.toPrepare.count > 0) {
    items.push({
      id: "ordersToPrepare",
      count: snapshot.toPrepare.count,
      title: snapshot.toPrepare.count === 1 ? "pedido por preparar" : "pedidos por preparar",
      detail: "Pagados, listos para el envío",
      href: OVERVIEW_LINKS.toPrepare,
      tone: "warning",
    });
  }
  if (catalog && canCatalog && catalog.withoutPrice > 0) {
    items.push({
      id: "publishedWithoutPrice",
      count: catalog.withoutPrice,
      title:
        catalog.withoutPrice === 1
          ? "producto publicado sin precio"
          : "productos publicados sin precio",
      detail: "Se ven en la tienda pero no se pueden comprar",
      href: OVERVIEW_LINKS.publishedGap("price"),
      tone: "danger",
    });
  }
  if (catalog && catalog.outOfStock > 0) {
    items.push({
      id: "publishedWithoutStock",
      count: catalog.outOfStock,
      title: catalog.outOfStock === 1 ? "producto sin stock" : "productos sin stock",
      detail: "Publicados y agotados",
      href: canCatalog ? OVERVIEW_LINKS.publishedGap("stock") : OVERVIEW_LINKS.inventory("out"),
      tone: "warning",
    });
  }
  if (snapshot.pendingReviews && snapshot.pendingReviews > 0) {
    items.push({
      id: "pendingReviews",
      count: snapshot.pendingReviews,
      title: snapshot.pendingReviews === 1 ? "reseña por aprobar" : "reseñas por aprobar",
      detail: "Opiniones de compradores",
      href: OVERVIEW_LINKS.reviews,
      tone: "info",
    });
  }
  if (catalog && canCatalog && catalog.withoutPhoto > 0) {
    items.push({
      id: "publishedWithoutPhoto",
      count: catalog.withoutPhoto,
      title:
        catalog.withoutPhoto === 1 ? "producto sin foto principal" : "productos sin foto principal",
      detail: "Información incompleta en la tienda",
      href: OVERVIEW_LINKS.publishedGap("media"),
      tone: "warning",
    });
  }
  return items;
}

export function buildAttentionSnapshot(
  snapshot: StoreSnapshot,
  can: Can,
  now: Date
): AttentionSnapshot {
  return {
    badges: {
      ordersToPrepare: snapshot.toPrepare?.count ?? 0,
      paymentsToReview: snapshot.payments?.count ?? 0,
      outOfStock: can("inventory:manage") ? (snapshot.catalog?.outOfStock ?? 0) : 0,
      pendingReviews: snapshot.pendingReviews ?? 0,
    },
    items: buildAttentionItems(snapshot, can, now),
  };
}

export function buildInventorySummary(snapshot: StoreSnapshot, can: Can): InventorySummary | null {
  const catalog = snapshot.catalog;
  if (!catalog || !can("inventory:manage")) return null;
  return {
    outOfStock: {
      count: catalog.outOfStock,
      href: can("catalog:manage")
        ? OVERVIEW_LINKS.publishedGap("stock")
        : OVERVIEW_LINKS.inventory("out"),
    },
    lowStock: { count: catalog.lowStock, href: OVERVIEW_LINKS.inventory("low") },
    available: { count: catalog.available, href: OVERVIEW_LINKS.inventory() },
  };
}

const percentOf = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

export function buildCatalogHealthSummary(
  snapshot: StoreSnapshot,
  can: Can
): CatalogHealthSummary | null {
  const catalog = snapshot.catalog;
  if (!catalog || !can("catalog:manage")) return null;
  const total = catalog.published;
  const score = percentOf(catalog.complete, total);
  return {
    publishedProducts: total,
    score,
    rating:
      total === 0
        ? "Sin productos"
        : score >= 90
          ? "Excelente"
          : score >= 75
            ? "Bueno"
            : score >= 50
              ? "Mejorable"
              : "Crítico",
    checks: [
      {
        label: "Con foto principal",
        percent: percentOf(catalog.withPhoto, total),
        href: catalog.withoutPhoto > 0 ? OVERVIEW_LINKS.publishedGap("media") : null,
      },
      {
        label: "Con precio",
        percent: percentOf(catalog.withPrice, total),
        href: catalog.withoutPrice > 0 ? OVERVIEW_LINKS.publishedGap("price") : null,
      },
      {
        label: "Con descripción",
        percent: percentOf(catalog.withDescription, total),
        href: null,
      },
      {
        label: "Con página publicada",
        percent: percentOf(catalog.withStory, total),
        href: null,
      },
    ],
  };
}

/** Computable facts only: nothing here claims a service is «operativo». */
export function buildStoreStatus(
  snapshot: StoreSnapshot,
  home: HomeStatusResult,
  can: Can
): StoreStatus | null {
  const rows: StoreStatusRow[] = [];
  const catalog = snapshot.catalog;
  const canCatalog = can("catalog:manage");

  if (home.status === "READY") {
    const { invalid, emptyImageSlots, visible, total } = home.data;
    rows.push({
      label: "Página de inicio",
      value:
        invalid > 0
          ? plural(invalid, "sección con errores", "secciones con errores")
          : emptyImageSlots > 0
            ? plural(emptyImageSlots, "imagen por subir", "imágenes por subir")
            : `${formatInteger(visible)} de ${formatInteger(total)} visibles`,
      tone: invalid > 0 ? "danger" : emptyImageSlots > 0 ? "warning" : "success",
      href: OVERVIEW_LINKS.home,
    });
  }
  if (snapshot.menu) {
    rows.push({
      label: "Menú y navegación",
      value:
        snapshot.menu.visible > 0
          ? `${formatInteger(snapshot.menu.visible)} de ${formatInteger(snapshot.menu.total)} visibles`
          : "Sin secciones visibles",
      tone: snapshot.menu.visible > 0 ? "success" : "danger",
      href: OVERVIEW_LINKS.menu,
    });
  }
  if (catalog && canCatalog) {
    rows.push({
      label: "Productos publicados",
      value: formatInteger(catalog.published),
      tone: catalog.published > 0 ? "success" : "danger",
      href: OVERVIEW_LINKS.published,
    });
    const incomplete = catalog.published - catalog.complete;
    rows.push({
      label: "Publicados incompletos",
      value: incomplete > 0 ? formatInteger(incomplete) : "Ninguno",
      tone: catalog.withoutPrice > 0 ? "danger" : incomplete > 0 ? "warning" : "success",
      href: incomplete > 0 ? OVERVIEW_LINKS.publishedGap("issues") : null,
    });
  }
  if (snapshot.payments) {
    rows.push({
      label: "Pagos en espera",
      value:
        snapshot.payments.stale > 0
          ? `${formatInteger(snapshot.payments.stale)} con más de 24 h`
          : snapshot.payments.count > 0
            ? "Ninguno con más de 24 h"
            : "Al día",
      tone: snapshot.payments.stale > 0 ? "warning" : "success",
      href: OVERVIEW_LINKS.payments,
    });
  }
  if (rows.length === 0) return null;
  return { allClear: rows.every((row) => row.tone === "success"), rows };
}

export interface DashboardOverview {
  period: ResolvedDashboardPeriod;
  actor: { displayRoles: readonly string[] };
  sales: OverviewResult<SalesOverview>;
  topProducts: OverviewResult<TopProduct[]>;
  recentOrders: OverviewResult<RecentOrder[]>;
  attention: AttentionItem[] | null;
  inventory: InventorySummary | null;
  catalogHealth: CatalogHealthSummary | null;
  storeStatus: StoreStatus | null;
}

const UNAUTHORIZED = { status: "UNAUTHORIZED" } as const;

/**
 * The whole Inicio in five parallel queries (sales, best sellers, recent orders, store snapshot,
 * home sections); the previous screen needed 24. Each section runs only with its permission.
 */
export async function getDashboardOverview(params?: {
  periodSelector?: DashboardPeriodSelector;
  now?: Date;
}): Promise<DashboardOverview> {
  const auth = await requireAdminAccess();
  const can: Can = (permission) => auth.permissions.has(permission);
  const period = resolveDashboardPeriod(params?.periodSelector, params?.now ?? new Date());
  const canSales = can("orders:manage") || can("orders:verify");

  const [sales, topProducts, recentOrders, snapshot, home] = await Promise.all([
    canSales ? fetchSalesOverview(period) : UNAUTHORIZED,
    canSales ? fetchTopProducts(period, can) : UNAUTHORIZED,
    can("orders:manage") ? fetchRecentOrders(period.referenceNow) : UNAUTHORIZED,
    fetchStoreSnapshot(can),
    can("catalog:manage") ? fetchHomeStatus() : UNAUTHORIZED,
  ]);

  const anyQueue =
    snapshot.toPrepare !== null || snapshot.payments !== null || snapshot.catalog !== null;
  return {
    period,
    actor: { displayRoles: auth.roles },
    sales,
    topProducts,
    recentOrders,
    attention:
      anyQueue || snapshot.pendingReviews !== null
        ? buildAttentionItems(snapshot, can, period.referenceNow)
        : null,
    inventory: buildInventorySummary(snapshot, can),
    catalogHealth: buildCatalogHealthSummary(snapshot, can),
    storeStatus: buildStoreStatus(snapshot, home, can),
  };
}

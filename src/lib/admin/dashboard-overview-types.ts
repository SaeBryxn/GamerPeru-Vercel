/**
 * Shapes of the Inicio overview. Plain numbers and strings only, so client components (the
 * period chart, the attention bell) can receive them as props.
 */

export type OverviewResult<T> =
  | { status: "READY"; data: T }
  | { status: "UNAUTHORIZED" }
  | { status: "UNAVAILABLE"; message: string };

/** One bucket of the selected period: an hour for «Hoy», a Lima calendar day otherwise. */
export interface SalesPoint {
  /** `YYYY-MM-DD` or `YYYY-MM-DDTHH`, Lima time. */
  key: string;
  /** Axis label: «14 nov» or «15:00». */
  label: string;
  netCents: number;
  paidOrders: number;
  /** Estimated from today's variant costs; null when no sold line in the bucket has a cost. */
  profitCents: number | null;
}

export type TrendDirection = "up" | "down" | "flat" | "new";

export interface KpiTrend {
  direction: TrendDirection;
  /** «12%», «Nuevo», «0%». */
  label: string;
  /** For screen readers: «12% más que ayer». */
  description: string;
}

export interface Kpi {
  value: string;
  previous: string;
  trend: KpiTrend;
}

export interface SalesOverview {
  granularity: "hour" | "day";
  points: SalesPoint[];
  /** «ayer», «los 7 días anteriores»… completes «vs. S/ 4,290 ayer». */
  comparisonLabel: string;
  netSales: Kpi;
  paidOrders: Kpi;
  averageTicket: Kpi;
  /** Null when no sold line of the period has a cost registered. */
  estimatedProfit: Kpi | null;
  /** Share of the period's paid line revenue whose variant has a cost, 0 to 1. */
  profitCoverage: number;
}

export interface AttentionItem {
  id:
    | "payments"
    | "ordersToPrepare"
    | "publishedWithoutPrice"
    | "publishedWithoutStock"
    | "pendingReviews"
    | "publishedWithoutPhoto";
  count: number;
  title: string;
  detail: string;
  href: string;
  tone: "danger" | "warning" | "info";
}

export interface InventorySummary {
  outOfStock: { count: number; href: string | null };
  lowStock: { count: number; href: string | null };
  available: { count: number; href: string | null };
}

export interface CatalogHealthSummary {
  publishedProducts: number;
  /** Published products with a main photo, a price, a description and a published page, 0–100. */
  score: number;
  rating: "Excelente" | "Bueno" | "Mejorable" | "Crítico" | "Sin productos";
  checks: Array<{ label: string; percent: number; href: string | null }>;
}

export interface StoreStatusRow {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger";
  href: string | null;
}

export interface StoreStatus {
  allClear: boolean;
  rows: StoreStatusRow[];
}

export interface TopProduct {
  productId: string;
  name: string;
  imageUrl: string | null;
  units: number;
  revenue: string;
  trend: KpiTrend;
  href: string | null;
}

export interface RecentOrder {
  orderNumber: string;
  customer: string;
  imageUrl: string | null;
  products: string;
  total: string;
  status: { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" };
  createdAt: string;
  createdLabel: string;
  href: string;
}

/** Pending counts for the sidebar badges and the bell; zero means nothing to show. */
export interface AttentionSnapshot {
  badges: {
    ordersToPrepare: number;
    paymentsToReview: number;
    outOfStock: number;
    pendingReviews: number;
  };
  items: AttentionItem[];
}

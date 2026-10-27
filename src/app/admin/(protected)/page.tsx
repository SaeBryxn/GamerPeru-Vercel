import React from "react";
import {
  CANONICAL_PERIOD_SELECTORS,
  type DashboardPeriodSelector,
} from "@/lib/admin/dashboard-period";
import { getDashboardOverview } from "@/lib/admin/dashboard-overview";
import { PageHeader } from "@/components/admin/ui";
import { NoMetricsAssigned } from "@/components/admin/dashboard/no-metrics-assigned";
import {
  AttentionCard,
  CatalogHealthCard,
  InventoryCard,
  MetricCard,
  RecentOrdersCard,
  StoreStatusCard,
  TopProductsCard,
  profitNote,
} from "@/components/admin/overview/overview-cards";
import { SalesChart } from "@/components/admin/overview/sales-chart";
import { PeriodTabs } from "@/components/admin/overview/period-tabs";
import { RefreshButton } from "@/components/admin/overview/refresh-button";
import styles from "@/components/admin/overview/overview.module.css";

export const dynamic = "force-dynamic";

interface AdminDashboardPageProps {
  searchParams?: Promise<{ period?: string }>;
}

/** How each period reads inside a sentence: «Esto está pasando hoy», «Más vendidos hoy». */
const PERIOD_PHRASE: Record<DashboardPeriodSelector, string> = {
  TODAY: "hoy",
  LAST_7_DAYS: "en los últimos 7 días",
  LAST_30_DAYS: "en los últimos 30 días",
  THIS_MONTH: "en este mes",
};

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const rawPeriod = (searchParams ? await searchParams : {}).period;
  // Inicio answers "how is today going" first; other periods stay one click away.
  const selected: DashboardPeriodSelector =
    typeof rawPeriod === "string" &&
    (CANONICAL_PERIOD_SELECTORS as readonly string[]).includes(rawPeriod)
      ? (rawPeriod as DashboardPeriodSelector)
      : "TODAY";

  const overview = await getDashboardOverview({ periodSelector: selected });
  const phrase = PERIOD_PHRASE[selected];
  const sales = overview.sales.status === "READY" ? overview.sales.data : null;
  const hasSales = overview.sales.status !== "UNAUTHORIZED";
  const nothingToShow =
    !hasSales &&
    overview.attention === null &&
    overview.inventory === null &&
    overview.catalogHealth === null &&
    overview.storeStatus === null &&
    overview.recentOrders.status === "UNAUTHORIZED";

  const series = (pick: (point: NonNullable<typeof sales>["points"][number]) => number) =>
    sales?.points.map(pick) ?? [];

  return (
    <div>
      <PageHeader
        title="Resumen de la tienda"
        description={`Resumen general de Gamer Perú. Esto está pasando ${phrase}.`}
        actions={
          hasSales ? (
            <>
              <PeriodTabs selected={selected} />
              <RefreshButton />
            </>
          ) : (
            <RefreshButton />
          )
        }
      />

      {nothingToShow ? (
        <NoMetricsAssigned />
      ) : (
        <div className={styles.grid}>
          {hasSales &&
            (sales ? (
              <>
                <MetricCard
                  className={styles.kpi}
                  kind="netSales"
                  kpi={sales.netSales}
                  series={series((point) => point.netCents)}
                  comparisonLabel={sales.comparisonLabel}
                />
                <MetricCard
                  className={styles.kpi}
                  kind="paidOrders"
                  kpi={sales.paidOrders}
                  series={series((point) => point.paidOrders)}
                  comparisonLabel={sales.comparisonLabel}
                />
                <MetricCard
                  className={styles.kpi}
                  kind="averageTicket"
                  kpi={sales.averageTicket}
                  series={series((point) =>
                    point.paidOrders > 0 ? point.netCents / point.paidOrders : 0
                  )}
                  comparisonLabel={sales.comparisonLabel}
                />
                <MetricCard
                  className={styles.kpi}
                  kind="estimatedProfit"
                  kpi={sales.estimatedProfit}
                  series={series((point) => point.profitCents ?? 0)}
                  comparisonLabel={sales.comparisonLabel}
                  note={profitNote(sales)}
                />
              </>
            ) : (
              <section className={`${styles.card} ${styles.chart}`} role="alert">
                <h2 className={styles.cardTitle}>Ventas no disponibles</h2>
                <p className={styles.cardSubtitle}>
                  {overview.sales.status === "UNAVAILABLE" ? overview.sales.message : ""}
                </p>
              </section>
            ))}

          {sales && (
            <SalesChart
              className={overview.attention ? styles.chart : undefined}
              points={sales.points}
              periodLabel={phrase}
              hasProfit={sales.estimatedProfit !== null}
            />
          )}
          {overview.attention && (
            <AttentionCard
              className={sales ? styles.side : styles.halfLg}
              items={overview.attention}
            />
          )}

          {overview.inventory && (
            <InventoryCard
              className={`${styles.third} ${styles.halfLg}`}
              summary={overview.inventory}
            />
          )}
          {overview.catalogHealth && (
            <CatalogHealthCard
              className={`${styles.third} ${styles.halfLg}`}
              health={overview.catalogHealth}
            />
          )}
          {overview.storeStatus && (
            <StoreStatusCard
              className={`${styles.third} ${styles.halfLg}`}
              status={overview.storeStatus}
            />
          )}

          {overview.topProducts.status === "READY" && (
            <TopProductsCard
              className={styles.top}
              products={overview.topProducts.data}
              periodLabel={phrase}
            />
          )}
          {overview.recentOrders.status === "READY" && (
            <RecentOrdersCard className={styles.orders} orders={overview.recentOrders.data} />
          )}
        </div>
      )}
    </div>
  );
}

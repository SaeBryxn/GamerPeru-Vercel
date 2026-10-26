import React from "react";
import {
  CANONICAL_PERIOD_SELECTORS,
  type DashboardPeriodSelector,
  type ResolvedDashboardPeriod,
} from "@/lib/admin/dashboard-period";
import { getAdminDashboardData } from "@/lib/admin/dashboard-reader";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { DashboardHeader } from "@/components/admin/dashboard/dashboard-header";
import { FinancialCohortSection } from "@/components/admin/dashboard/financial-cohort-section";
import { OrderPipelineSection } from "@/components/admin/dashboard/order-pipeline-section";
import { OrderQueueSection } from "@/components/admin/dashboard/order-queue-section";
import { InventoryOverviewSection } from "@/components/admin/dashboard/inventory-overview-section";
import { NoMetricsAssigned } from "@/components/admin/dashboard/no-metrics-assigned";
import { DashboardFocus } from "@/components/admin/dashboard/dashboard-focus";
import { HomeStatusSection } from "@/components/admin/dashboard/home-status-section";
import { CatalogHealthSection } from "@/components/admin/dashboard/catalog-health-section";
import { buildDashboardLinks } from "@/components/admin/dashboard/dashboard-links";
import { Stagger } from "@/components/admin/ui";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface AdminDashboardPageProps {
  searchParams?: Promise<{ period?: string }>;
}

const LIMA_DAY = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "numeric",
  month: "short",
});

/** What every trend on the page is measured against, in the operator's words. */
function describeComparison(period: ResolvedDashboardPeriod): string {
  const { start, end } = period.previous;
  const lastDay = new Date(end.getTime() - 1);
  return period.selector === "TODAY"
    ? `Comparado con ayer, ${LIMA_DAY.format(start)}`
    : `Comparado con ${LIMA_DAY.format(start)} – ${LIMA_DAY.format(lastDay)}`;
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const rawPeriod = resolvedParams.period;

  // Inicio answers "how is today going" first; other periods stay one click away.
  const selectedPeriod: DashboardPeriodSelector =
    typeof rawPeriod === "string" &&
    (CANONICAL_PERIOD_SELECTORS as readonly string[]).includes(rawPeriod)
      ? (rawPeriod as DashboardPeriodSelector)
      : "TODAY";

  // Execute canonical aggregate data reader exactly once per page request
  const payload = await getAdminDashboardData({ periodSelector: selectedPeriod });

  const hasAnyMetricAccess =
    payload.financialCohort.status !== "UNAUTHORIZED" ||
    payload.orderPipeline.status !== "UNAUTHORIZED" ||
    payload.paymentVerification.status !== "UNAUTHORIZED" ||
    payload.catalogOverview.status !== "UNAUTHORIZED" ||
    payload.inventoryOverview.status !== "UNAUTHORIZED";
  const hasPeriodMetrics =
    payload.financialCohort.status !== "UNAUTHORIZED" ||
    payload.orderPipeline.status !== "UNAUTHORIZED";
  const links = buildDashboardLinks(payload.actor.permissions, payload.period);
  const comparison = describeComparison(payload.period);
  const now = payload.period.referenceNow;
  const hasAside =
    payload.orderQueue.status === "READY" || payload.inventoryOverview.status === "READY";
  const catalogHealth = payload.catalogHealth.status === "READY" ? payload.catalogHealth : null;
  // A catalog-only account has no queues or sales here: its upkeep is the whole page, so it opens.
  const upkeepOpen = !hasPeriodMetrics && !hasAside;

  return (
    <div className={styles.container}>
      <DashboardHeader
        selectedPeriod={selectedPeriod}
        showPeriodSelector={hasPeriodMetrics}
        updatedAt={now.toISOString()}
        comparison={comparison}
      />

      {hasAnyMetricAccess ? (
        <Stagger className={styles.dashboardBody}>
          <DashboardFocus payload={payload} links={links} />

          {hasPeriodMetrics && (
            <FinancialCohortSection
              compact
              financialCohort={payload.financialCohort}
              paidOrdersHref={links.periodOrders?.({ paymentStatus: "PAID" })}
              comparisonLabel={comparison}
            />
          )}

          <div className={styles.secondary}>
            {hasPeriodMetrics && (
              <details className={styles.fold}>
                <summary>
                  <span>Detalle del período</span>
                  <span className={styles.foldCount}>Estados de pedidos y devoluciones</span>
                </summary>
                <div className={styles.foldBody}>
                  <OrderPipelineSection
                    orderPipeline={payload.orderPipeline}
                    periodOrdersHref={links.periodOrders}
                    comparisonLabel={comparison}
                  />
                  {payload.paymentVerification.status === "READY" &&
                    payload.paymentVerification.data.periodRefunds.refundCount > 0 && (
                      <p className={styles.refundNote}>
                        {formatInteger(payload.paymentVerification.data.periodRefunds.refundCount)}{" "}
                        reembolsos registrados en este período. <a href="/admin/pagos">Ver pagos</a>
                      </p>
                    )}
                </div>
              </details>
            )}
            {payload.orderQueue.status === "READY" && (
              <details className={styles.fold}>
                <summary>
                  <span>Estado de pedidos</span>
                  <span className={styles.foldCount}>
                    {formatInteger(payload.orderQueue.data.inProgress)} en preparación o envío
                  </span>
                </summary>
                <div className={styles.foldBody}>
                  <OrderQueueSection orderQueue={payload.orderQueue} links={links} now={now} />
                </div>
              </details>
            )}
            {payload.inventoryOverview.status === "READY" && (
              <details className={styles.fold}>
                <summary>
                  <span>Inventario</span>
                  <span className={styles.foldCount}>
                    {formatInteger(
                      payload.inventoryOverview.data.globalPhysicalBalances.availableToSellUnits
                    )}{" "}
                    unidades disponibles
                  </span>
                </summary>
                <div className={styles.foldBody}>
                  <InventoryOverviewSection
                    inventoryOverview={payload.inventoryOverview}
                    inventoryHref={links.inventory}
                    outOfStockHref={links.products?.({ pending: "stock" })}
                  />
                </div>
              </details>
            )}
          </div>

          {(catalogHealth !== null || payload.homeStatus.status !== "UNAUTHORIZED") && (
            <div className={styles.secondary}>
              {catalogHealth && (
                <details className={styles.fold} open={upkeepOpen}>
                  <summary>
                    <span>Catálogo por completar</span>
                    <span className={styles.foldCount}>
                      {catalogHealth.data.productsWithIssues === 0
                        ? "Todo listo"
                        : `${formatInteger(catalogHealth.data.productsWithIssues)} productos · ${formatInteger(catalogHealth.data.productsWithBlockers)} con bloqueos`}
                    </span>
                  </summary>
                  <div className={styles.foldBody}>
                    <CatalogHealthSection
                      catalogHealth={catalogHealth}
                      productsHref={links.products?.({ pending: "issues" }) ?? null}
                    />
                  </div>
                </details>
              )}
              {payload.homeStatus.status !== "UNAUTHORIZED" && (
                <details className={styles.fold} open={upkeepOpen}>
                  <summary>
                    <span>Portada de la tienda</span>
                    {payload.homeStatus.status === "READY" && (
                      <span className={styles.foldCount}>
                        {formatInteger(payload.homeStatus.data.visible)} de{" "}
                        {formatInteger(payload.homeStatus.data.total)} secciones visibles
                      </span>
                    )}
                  </summary>
                  <div className={styles.foldBody}>
                    <HomeStatusSection homeStatus={payload.homeStatus} href={links.home} />
                  </div>
                </details>
              )}
            </div>
          )}
        </Stagger>
      ) : (
        <div className={styles.dashboardBody}>
          <NoMetricsAssigned />
        </div>
      )}
    </div>
  );
}

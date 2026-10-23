import React from "react";
import {
  CANONICAL_PERIOD_SELECTORS,
  type DashboardPeriodSelector,
} from "@/lib/admin/dashboard-period";
import { getAdminDashboardData } from "@/lib/admin/dashboard-reader";
import { DashboardHeader, PeriodSelector } from "@/components/admin/dashboard/dashboard-header";
import { FinancialCohortSection } from "@/components/admin/dashboard/financial-cohort-section";
import { OrderPipelineSection } from "@/components/admin/dashboard/order-pipeline-section";
import { PaymentVerificationSection } from "@/components/admin/dashboard/payment-verification-section";
import { CatalogOverviewSection } from "@/components/admin/dashboard/catalog-overview-section";
import { InventoryOverviewSection } from "@/components/admin/dashboard/inventory-overview-section";
import { NoMetricsAssigned } from "@/components/admin/dashboard/no-metrics-assigned";
import { AttentionSection } from "@/components/admin/dashboard/attention-section";
import { QuickActions } from "@/components/admin/dashboard/quick-actions";
import { HomeStatusSection } from "@/components/admin/dashboard/home-status-section";
import { CatalogHealthSection } from "@/components/admin/dashboard/catalog-health-section";
import { buildDashboardLinks } from "@/components/admin/dashboard/dashboard-links";
import { SegmentedNav, Stagger } from "@/components/admin/ui";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface AdminDashboardPageProps {
  searchParams?: Promise<{ period?: string; vista?: string }>;
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const rawPeriod = resolvedParams.period;

  // Validate search param safely against frozen period selectors with fallback to LAST_30_DAYS
  const selectedPeriod: DashboardPeriodSelector =
    typeof rawPeriod === "string" &&
    (CANONICAL_PERIOD_SELECTORS as readonly string[]).includes(rawPeriod)
      ? (rawPeriod as DashboardPeriodSelector)
      : "LAST_30_DAYS";

  // Execute canonical aggregate data reader exactly once per page request
  const payload = await getAdminDashboardData({ periodSelector: selectedPeriod });

  // Determine if actor has any authorized metric section
  const hasAnyMetricAccess =
    payload.financialCohort.status !== "UNAUTHORIZED" ||
    payload.orderPipeline.status !== "UNAUTHORIZED" ||
    payload.paymentVerification.status !== "UNAUTHORIZED" ||
    payload.catalogOverview.status !== "UNAUTHORIZED" ||
    payload.inventoryOverview.status !== "UNAUTHORIZED";
  const links = buildDashboardLinks(payload.actor.permissions, payload.period);
  const hasCatalogContext =
    payload.catalogHealth.status === "READY" ||
    payload.catalogOverview.status === "READY" ||
    payload.inventoryOverview.status === "READY";
  // Two views instead of one long page: today's work, or the numbers of the chosen period.
  const view = resolvedParams.vista === "metricas" ? "metrics" : "operations";
  const viewNav = hasAnyMetricAccess ? (
    <SegmentedNav
      label="Vista del resumen"
      options={[
        { href: "/admin", label: "Resumen operativo", active: view === "operations" },
        {
          href: `/admin?vista=metricas&period=${selectedPeriod}`,
          label: "Métricas del período",
          active: view === "metrics",
        },
      ]}
    />
  ) : null;

  return (
    <div className={styles.container}>
      <DashboardHeader selectedPeriod={selectedPeriod} showPeriodSelector={false} aside={viewNav} />

      {hasAnyMetricAccess && view === "operations" ? (
        <Stagger className={styles.dashboardBody}>
          <AttentionSection payload={payload} links={links} />
          <div className={styles.workspaceGrid} data-has-catalog={hasCatalogContext}>
            {hasCatalogContext && (
              <div className={styles.primaryColumn}>
                <CatalogHealthSection
                  catalogHealth={payload.catalogHealth}
                  productsHref={links.products?.({ pending: "issues" }) ?? null}
                />
                {(payload.catalogOverview.status === "READY" ||
                  payload.inventoryOverview.status === "READY") && (
                  <details className={styles.overviewDetails}>
                    <summary>Resumen del catálogo y existencias</summary>
                    <div className={styles.overviewContent}>
                      <CatalogOverviewSection
                        catalogOverview={payload.catalogOverview}
                        productsHref={links.products}
                      />
                      <InventoryOverviewSection
                        inventoryOverview={payload.inventoryOverview}
                        outOfStockHref={links.products?.({ pending: "stock" })}
                      />
                    </div>
                  </details>
                )}
              </div>
            )}
            <div className={styles.secondaryColumn}>
              <QuickActions links={links} />
              <HomeStatusSection homeStatus={payload.homeStatus} href={links.home} />
            </div>
          </div>
        </Stagger>
      ) : hasAnyMetricAccess ? (
        <Stagger className={styles.dashboardBody}>
          <div className={styles.metricsDivider}>
            <h2 className={styles.metricsTitle}>Métricas del período</h2>
            <PeriodSelector selectedPeriod={selectedPeriod} />
          </div>
          <FinancialCohortSection
            financialCohort={payload.financialCohort}
            paidOrdersHref={links.periodOrders?.({ paymentStatus: "PAID" })}
          />
          <OrderPipelineSection
            orderPipeline={payload.orderPipeline}
            periodOrdersHref={links.periodOrders}
          />
          <PaymentVerificationSection
            paymentVerification={payload.paymentVerification}
            queueHref={links.payments ?? undefined}
          />
        </Stagger>
      ) : (
        <div className={styles.dashboardBody}>
          <NoMetricsAssigned />
        </div>
      )}
    </div>
  );
}

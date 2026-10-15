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
import { Stagger } from "@/components/admin/ui";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface AdminDashboardPageProps {
  searchParams?: Promise<{ period?: string }>;
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

  return (
    <div className={styles.container}>
      <DashboardHeader
        selectedPeriod={selectedPeriod}
        actorEmail={payload.actor.email}
        actorRoles={payload.actor.roles}
        showPeriodSelector={!hasAnyMetricAccess}
      />

      {hasAnyMetricAccess ? (
        <Stagger className={styles.dashboardBody}>
          <AttentionSection payload={payload} links={links} />
          <QuickActions links={links} />
          <div className={styles.lowerGrid}>
            <HomeStatusSection homeStatus={payload.homeStatus} href={links.home} />
            <CatalogHealthSection
              catalogHealth={payload.catalogHealth}
              productsHref={links.products?.({ pending: "issues" }) ?? null}
            />
          </div>
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
          <div className={styles.lowerGrid}>
            <CatalogOverviewSection
              catalogOverview={payload.catalogOverview}
              productsHref={links.products}
            />
            <InventoryOverviewSection
              inventoryOverview={payload.inventoryOverview}
              outOfStockHref={links.products?.({ pending: "stock" })}
            />
          </div>
        </Stagger>
      ) : (
        <div className={styles.dashboardBody}>
          <NoMetricsAssigned />
        </div>
      )}
    </div>
  );
}

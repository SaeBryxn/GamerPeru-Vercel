import React from "react";
import {
  CANONICAL_PERIOD_SELECTORS,
  type DashboardPeriodSelector,
} from "@/lib/admin/dashboard-period";
import { getAdminDashboardData } from "@/lib/admin/dashboard-reader";
import { DashboardHeader } from "@/components/admin/dashboard/dashboard-header";
import { FinancialCohortSection } from "@/components/admin/dashboard/financial-cohort-section";
import { OrderPipelineSection } from "@/components/admin/dashboard/order-pipeline-section";
import { PaymentVerificationSection } from "@/components/admin/dashboard/payment-verification-section";
import { CatalogOverviewSection } from "@/components/admin/dashboard/catalog-overview-section";
import { InventoryOverviewSection } from "@/components/admin/dashboard/inventory-overview-section";
import { NoMetricsAssigned } from "@/components/admin/dashboard/no-metrics-assigned";
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

  return (
    <div className={styles.container}>
      <DashboardHeader
        selectedPeriod={selectedPeriod}
        actorEmail={payload.actor.email}
        actorRoles={payload.actor.roles}
      />

      {hasAnyMetricAccess ? (
        <Stagger className={styles.dashboardBody}>
          <FinancialCohortSection financialCohort={payload.financialCohort} />
          <OrderPipelineSection orderPipeline={payload.orderPipeline} />
          <PaymentVerificationSection paymentVerification={payload.paymentVerification} />
          <div className={styles.lowerGrid}>
            <CatalogOverviewSection catalogOverview={payload.catalogOverview} />
            <InventoryOverviewSection inventoryOverview={payload.inventoryOverview} />
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

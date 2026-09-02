import "server-only";

import type { PermissionName, RoleName } from "@/lib/auth/rbac";
import type { ResolvedDashboardPeriod } from "./dashboard-period";

export type TrendSemanticState = "POSITIVE" | "NEGATIVE" | "FLAT" | "NEW" | "ZERO_BASELINE";

export interface CountTrend {
  currentValue: number;
  previousValue: number;
  absoluteDelta: number;
  percentageDelta: number | null; // null when previousValue == 0 and currentValue > 0 (semantic state NEW)
  semanticState: TrendSemanticState;
}

export interface MonetaryTrend {
  currentValue: bigint;
  previousValue: bigint;
  absoluteDelta: bigint;
  percentageNumerator: bigint | null; // null when previousValue == 0 and currentValue > 0 (semantic state NEW)
  percentageDenominator: bigint | null; // null when previousValue == 0 and currentValue > 0 (semantic state NEW)
  semanticState: TrendSemanticState;
}

export interface CohortFinancialSummary {
  cohortGrossCents: bigint;
  cohortNetCents: bigint;
  cohortPendingCents: bigint;
  cohortPaidOrders: number;
  cohortActivePaidOrders: number;
  aovCents: bigint;
}

export interface CohortFinancialTrends {
  gross: MonetaryTrend;
  net: MonetaryTrend;
  aov: MonetaryTrend;
  paidOrders: CountTrend;
}

export type CohortFinancialsResult =
  | {
      status: "READY";
      data: {
        current: CohortFinancialSummary;
        previous: CohortFinancialSummary;
        trends: CohortFinancialTrends;
      };
    }
  | {
      status: "UNAVAILABLE";
      error: "CURRENCY_INTEGRITY_ERROR";
      message: string;
    }
  | {
      status: "UNAUTHORIZED";
    };

export interface OrderPipelineSummary {
  totalCreatedOrders: number;
  pendingOrders: number;
  confirmedOrders: number;
  processingOrders: number;
  fulfilledOrders: number;
  cancelledOrders: number;
  expiredOrders: number;
  refundedOrders: number;
}

export type OrderPipelineResult =
  | {
      status: "READY";
      data: {
        current: OrderPipelineSummary;
        previous: OrderPipelineSummary;
        trends: {
          totalCreatedOrders: CountTrend;
        };
      };
    }
  | {
      status: "UNAUTHORIZED";
    };

export type MonetaryQueueAmountResult =
  | {
      status: "READY";
      amountCents: bigint;
    }
  | {
      status: "UNAVAILABLE";
      error: "CURRENCY_INTEGRITY_ERROR";
      message: string;
    };

export type MonetaryRefundOutflowResult =
  | {
      status: "READY";
      outflowCents: bigint;
    }
  | {
      status: "UNAVAILABLE";
      error: "CURRENCY_INTEGRITY_ERROR";
      message: string;
    };

export interface PaymentVerificationData {
  snapshotQueue: {
    queueCount: number;
    queueAmount: MonetaryQueueAmountResult;
  };
  periodActivity: {
    submissionAttemptsCount: number;
    distinctPaymentsSubmittedCount: number;
  };
  periodRefunds: {
    refundCount: number;
    refundOutflow: MonetaryRefundOutflowResult;
  };
}

export type PaymentVerificationResult =
  | {
      status: "READY";
      data: PaymentVerificationData;
    }
  | {
      status: "UNAUTHORIZED";
    };

export interface CatalogOverviewData {
  publishedProducts: number;
  draftProducts: number;
  archivedProducts: number;
  activeSellableSkus: number;
  totalActiveVariants: number;
  totalVariants: number;
  publishedProductsWithoutSkus: number;
}

export type CatalogOverviewResult =
  | {
      status: "READY";
      data: CatalogOverviewData;
    }
  | {
      status: "UNAUTHORIZED";
    };

export interface GlobalPhysicalBalances {
  totalPositions: number;
  onHandUnits: number;
  reservedUnits: number;
  allocatedUnits: number;
  availableToSellUnits: number;
}

export interface InventoryOverviewData {
  globalPhysicalBalances: GlobalPhysicalBalances;
  outOfStockActiveSkus: number;
  lowStockActivePositions: number;
}

export type InventoryOverviewResult =
  | {
      status: "READY";
      data: InventoryOverviewData;
    }
  | {
      status: "UNAUTHORIZED";
    };

export interface AdminDashboardPayload {
  period: ResolvedDashboardPeriod;
  actor: {
    authUserId: string;
    email: string | null;
    roles: RoleName[];
    permissions: PermissionName[];
  };
  financialCohort: CohortFinancialsResult;
  orderPipeline: OrderPipelineResult;
  paymentVerification: PaymentVerificationResult;
  catalogOverview: CatalogOverviewResult;
  inventoryOverview: InventoryOverviewResult;
}

import "server-only";

import type { PermissionName, RoleName } from "@/lib/auth/rbac";
import type { CatalogStatus } from "./catalog/types";
import type { ProductEditorSection } from "./catalog/readiness-guidance";
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
    oldestPendingAt?: string | null;
    queueAmount: MonetaryQueueAmountResult;
  };
  periodActivity: {
    submissionAttemptsCount: number;
    distinctPaymentsSubmittedCount: number;
    /** Staff decisions in the period that did not approve the submission. */
    rejectedDecisionsCount: number;
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

/** An active variant at or below its reorder point, summed over every location. */
export interface RestockItem {
  variantId: string;
  productName: string;
  variantTitle: string;
  sku: string;
  availableUnits: number;
  reorderPoint: number;
}

export interface InventoryOverviewData {
  globalPhysicalBalances: GlobalPhysicalBalances;
  outOfStockActiveSkus: number;
  lowStockActivePositions: number;
  /** Lowest availability first, at most five. */
  restockItems: RestockItem[];
}

export type InventoryOverviewResult =
  | {
      status: "READY";
      data: InventoryOverviewData;
    }
  | {
      status: "UNAUTHORIZED";
    };

export interface OrderQueueSnapshot {
  /** Created and not paid yet. */
  awaitingPayment: number;
  oldestAwaitingPaymentAt?: string | null;
  oldestToPrepareAt?: string | null;
  /** Paid and waiting to be prepared. */
  toPrepare: number;
  inProgress: number;
}

export type OrderQueueResult =
  { status: "READY"; data: OrderQueueSnapshot } | { status: "UNAUTHORIZED" };

export interface HomeStatusData {
  total: number;
  visible: number;
  hidden: number;
  /** Sections still exactly as seeded (version 1). */
  neverEdited: number;
  /** Image slots in visible sections still waiting for an upload. */
  emptyImageSlots: number;
  /** Sections the storefront skips because their content no longer validates. */
  invalid: number;
}

export type HomeStatusResult =
  | { status: "READY"; data: HomeStatusData }
  | { status: "UNAVAILABLE" }
  | { status: "UNAUTHORIZED" };

export interface CatalogHealthIssue {
  code: string;
  severity: "blocker" | "warning" | "suggestion";
  section: ProductEditorSection;
  action: string;
}

export interface CatalogHealthItem {
  productId: string;
  name: string;
  status: CatalogStatus;
  blockers: number;
  warnings: number;
  storyPublished: boolean;
  /** Most severe first, at most three. */
  issues: CatalogHealthIssue[];
  /** Product editor, on the tab that resolves the first issue. */
  href: string;
}

export type CatalogHealthResult =
  | {
      status: "READY";
      data: {
        unreferencedAssetCount?: number;
        evaluatedProducts: number;
        productsWithIssues: number;
        productsWithBlockers: number;
        items: CatalogHealthItem[];
      };
    }
  | { status: "UNAUTHORIZED" };

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
  orderQueue: OrderQueueResult;
  homeStatus: HomeStatusResult;
  catalogHealth: CatalogHealthResult;
}

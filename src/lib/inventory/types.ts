/**
 * Gamer Perú — Inventory Engine Domain Types (GP-021)
 */

export interface InventoryBalances {
  quantityOnHand: number;
  quantityReserved: number;
  quantityAllocated: number;
  availableToSell: number;
  reorderPoint: number;
}

// ---------------------------------------------------------------------------
// 1. Receiving
// ---------------------------------------------------------------------------

export interface ReceiveInventoryInput {
  attemptId: string;
  variantId: string;
  locationCode?: string; // Defaults to configured primary location
  quantity: number; // Positive integer
  referenceId: string; // Purchase Order / delivery note reference
  actorId: string;
  notes?: string;
}

export interface ReceiveInventoryResult {
  success: boolean;
  code?: string;
  error?: string;
  replayed?: boolean;
  inventoryItemId?: string;
  variantId?: string;
  locationId?: string;
  locationCode?: string;
  quantityReceived?: number;
  resultingBalances?: InventoryBalances;
  ledgerEntryId?: string;
}

// ---------------------------------------------------------------------------
// 2. Manual Adjustment
// ---------------------------------------------------------------------------

export type ManualAdjustmentCommandKind = "DELTA" | "PHYSICAL_COUNT";

export interface AdjustInventoryInput {
  attemptId: string;
  inventoryItemId?: string;
  variantId?: string;
  locationCode?: string;
  commandKind: ManualAdjustmentCommandKind;
  deltaQuantity?: number; // Used when commandKind === 'DELTA' (positive or negative, non-zero)
  countedQuantity?: number; // Used when commandKind === 'PHYSICAL_COUNT' (>= 0)
  reason: string; // Mandatory non-empty reason
  referenceId: string; // Reference (e.g. AUDIT-2026-001)
  actorId: string;
  notes?: string;
}

export interface AdjustInventoryResult {
  success: boolean;
  code?: string;
  error?: string;
  replayed?: boolean;
  inventoryItemId?: string;
  appliedDelta?: number;
  resultingBalances?: InventoryBalances;
  ledgerEntryId?: string;
}

// ---------------------------------------------------------------------------
// 3. Quarantine / Damaged Transfer
// ---------------------------------------------------------------------------

export interface TransferInventoryQuarantineInput {
  attemptId: string;
  variantId: string;
  sourceLocationCode?: string; // Defaults to primary location (e.g. LOC-LIM-01)
  destinationLocationCode: string; // Non-primary quarantine location (e.g. LOC-LIM-QUARANTINE)
  quantity: number; // Positive integer
  reason: string; // Mandatory non-empty reason (e.g. "Defective box / damaged switch")
  referenceId: string; // Logical transfer correlation identifier
  actorId: string;
  notes?: string;
}

export interface TransferInventoryQuarantineResult {
  success: boolean;
  code?: string;
  error?: string;
  replayed?: boolean;
  variantId?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  sourceInventoryItemId?: string;
  destinationInventoryItemId?: string;
  quantityTransferred?: number;
  sourceBalancesAfter?: InventoryBalances;
  destinationBalancesAfter?: InventoryBalances;
  sourceLedgerEntryId?: string;
  destinationLedgerEntryId?: string;
}

// ---------------------------------------------------------------------------
// 4. Normal Allocation Consequence Seam
// ---------------------------------------------------------------------------

export interface AllocateOrderInventoryInput {
  orderId: string;
  actorId: string;
  referenceId: string; // E.g. Payment ID or Order Number
  notes?: string;
}

export interface AllocateOrderInventoryResult {
  success: boolean;
  code?: string;
  error?: string;
  alreadyAllocated?: boolean;
  orderId?: string;
  allocatedLinesCount?: number;
  totalQuantityAllocated?: number;
  ledgerEntryIds?: string[];
}

// ---------------------------------------------------------------------------
// 5. Late-Payment Reacquisition
// ---------------------------------------------------------------------------

export interface ReacquireOrderInventoryInput {
  orderId: string;
  actorId: string;
  referenceId: string;
  notes?: string;
}

export interface ReacquireOrderInventoryResult {
  success: boolean;
  code?: string;
  error?: string;
  alreadyAllocated?: boolean;
  orderId?: string;
  reacquiredLinesCount?: number;
  totalQuantityAllocated?: number;
  ledgerEntryIds?: string[];
}

// ---------------------------------------------------------------------------
// 6. Reservation Expiration
// ---------------------------------------------------------------------------

export interface ExpireUnpaidOrderReservationsInput {
  orderId: string;
  actorId?: string; // Defaults to 'SYSTEM'
  referenceId?: string;
  notes?: string;
}

export interface ExpireUnpaidOrderReservationsResult {
  success: boolean;
  code?: string;
  error?: string;
  orderId?: string;
  orderStatusTransitioned?: boolean;
  releasedLinesCount?: number;
  totalQuantityReleased?: number;
  ledgerEntryIds?: string[];
}

export interface ProcessExpirationBatchInput {
  batchSize?: number; // Defaults to 50
  actorId?: string; // Defaults to 'SYSTEM'
}

export interface ProcessExpirationBatchResult {
  success: boolean;
  ordersProcessed: number;
  ordersExpired: number;
  ordersSkipped: number;
  errors: Array<{ orderId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// 7. Low-Stock & Availability Queries
// ---------------------------------------------------------------------------

export interface GetVariantAvailabilityInput {
  variantId: string;
  locationCode?: string;
}

export interface VariantAvailabilityResult {
  variantId: string;
  locationId: string;
  locationCode: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAllocated: number;
  availableToSell: number;
  reorderPoint: number;
  inStock: boolean;
  isLowStock: boolean;
}

// ---------------------------------------------------------------------------
// 8. Reconciliation & Repair
// ---------------------------------------------------------------------------

export interface InventoryItemDiscrepancy {
  inventoryItemId: string;
  variantId: string;
  locationId: string;
  locationCode: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAllocated: number;
  expectedReserved: number;
  expectedAllocated: number;
  reservedDrift: number;
  allocatedDrift: number;
  hasCapacityViolation: boolean; // onHand < reserved + allocated
  latestLedgerMatches: boolean;
  discrepancyType:
    | "RESERVED_DRIFT"
    | "ALLOCATED_DRIFT"
    | "CAPACITY_VIOLATION"
    | "LEDGER_MISMATCH"
    | "MULTIPLE_DISCREPANCIES";
}

export interface ReconcileInventoryResult {
  success: boolean;
  totalItemsAudited: number;
  discrepanciesCount: number;
  discrepancies: InventoryItemDiscrepancy[];
}

export interface RepairInventoryDiscrepancyInput {
  attemptId: string;
  inventoryItemId: string;
  reason: string;
  actorId: string;
  referenceId: string;
  notes?: string;
}

export interface RepairInventoryDiscrepancyResult {
  success: boolean;
  code?: string;
  error?: string;
  replayed?: boolean;
  inventoryItemId?: string;
  resultingBalances?: InventoryBalances;
  ledgerEntryId?: string;
}

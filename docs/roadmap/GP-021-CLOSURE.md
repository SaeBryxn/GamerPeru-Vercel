# GP-021 — Canonical Closure Report Candidate

## Status

**GP-021 FINAL CLOSURE CANDIDATE — PENDING EXTERNAL APPROVAL**

---

## Checkpoints & Milestone Lineage

- **Prerequisite GP-020 Canonical Closure Checkpoint**: `5676d532d1e2c109913d814a07164be979f2aadf` (`docs(roadmap): reconcile GP-020 migration provenance`)
- **Starting Checkpoint for GP-021 Work**: `5676d532d1e2c109913d814a07164be979f2aadf`
- **Key GP-021 Gate Lineage**:
  - `CHK1`: Inventory Engine Domain Contract, Operational Policy, Boundary Reconciliation & Implementation Plan Freeze `[APPROVED WITH BINDING AMENDMENTS]`
  - `CHK2`: Inventory Engine Implementation, Concurrency Validation, Migration Safety Hardening & Final Closure Candidate `[COMPLETED]`
- **Target Branch**: `main`

---

## Binding External Amendments Reconciliation

The implementation strictly honors all 8 authoritative external amendments from CHK1 review:

1. **A. RBAC & Staff Exposure**: Zero reuse or broadening of `orders:manage`, `catalog:manage`, or `orders:verify` for inventory administration. Human inventory mutations (receiving, adjustments, quarantine transfers, reconciliation repairs) are implemented strictly as HEADLESS internal domain services with zero browser/staff Server Actions, zero public API endpoints, and zero unauthenticated UI exposure in GP-021. Protected Admin exposure and the canonical `inventory:manage` permission are deferred to GP-022. Background reservation expiration authenticates under `'SYSTEM'` actor.
2. **B. Normal Allocation Precondition**: Normal payment-approval allocation strictly enforces that all order reservations must be in `VERIFICATION_HOLD` status. Any attempt to normal-allocate from `ACTIVE` fails closed with a typed domain error (`ACTIVE_RESERVATION_CANNOT_BE_ALLOCATED`). Replaying an all-`ALLOCATED` order returns idempotent success without duplicate ledger records. Mixed reservation states fail closed.
3. **C. Late-Payment Reacquisition**: For late payment confirmations on orders whose reservations were already `RELEASED`, the historical `RELEASED` rows remain immutable. The reacquisition seam acquires deterministic `InventoryItem` locks, rechecks $\text{available\_to\_sell} = \text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated}$ for all lines atomically, increments `quantity_allocated` (with `quantity_on_hand` and `quantity_reserved` unchanged), and creates new `ALLOCATED` reservations. If any line has insufficient stock, the entire reacquisition rolls back with typed `INSUFFICIENT_STOCK_FOR_REACQUISITION`.
4. **D. Quarantine / Damaged Location Policy**: Implemented as dedicated operational location transfers outside the primary fulfillment location (`CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE`). Zero hardcoded or seeded production warehouse rows. Moves are atomic transfers locking source and destination `InventoryItems` deterministically (`id ASC`), decrementing source on-hand and incrementing destination on-hand with two correlated `MANUAL_ADJUSTMENT` ledger entries sharing the same `reference_id` (correlation ID) and audit log.
5. **E. Outbox Events**: Zero unauthorized inventory event names (`InventoryLowStock`, `InventoryReservationExpired`, `InventoryAllocated`) added to the canonical catalog. Low-stock signaling is implemented as a server-authoritative derived query ($\text{available\_to\_sell} \le \text{reorder\_point}$ where $\text{reorder\_point} > 0$).
6. **F. Idempotency & Cryptography**: Reuses existing `idempotency_keys` table with `operation_type = 'INVENTORY_MUTATION'`. Request fingerprint is SHA-256 of normalized mutation intent; authority binding digest is separate HMAC of actor identity. Concurrent same-key races serialize using PostgreSQL transaction advisory locks before key insertion.
7. **G. Reconciliation & Discrepancy Representation**: Zero invented `InventoryDiscrepancy` physical table. Discrepancy analysis is a read-only structured audit comparing reserved/allocated balances against active reservation sums and ledger snapshots. Repair is an append-only compensating ledger adjustment executed under staff invocation with `AuditEvent`.
8. **H. Schema & Migration Decision**: `GP021_IMPLEMENTATION_REQUIRES_NO_SCHEMA_MIGRATION`. Zero migration files generated (no 0012). Migration count remains frozen at 0000 through 0011. Hosted Supabase was completely untouched.

---

## Executive Summary & Delivered Scope

1. **Migration-Target Safety Guard (`src/db/migration-guard.ts` & `drizzle.config.ts`)**:
   - Implemented fail-closed environment validation to prevent accidental execution of local development/test migrations against hosted Supabase (directly resolving the GP-020 incident).
   - In default `local` mode: asserts that target database host is strictly `127.0.0.1` or `localhost`. Throws `MIGRATION_GUARD_VIOLATION` before opening any connection if pointing to a remote host.
   - In `hosted` mode: strictly requires both `GAMERPERU_MIGRATION_ENV=hosted` AND `AUTHORIZED_HOSTED_DEPLOYMENT=true` with project ref verification (`jpjffalmvlxpufvtvskx`).
   - Covered by 9 deterministic unit tests proving all boundary cases, pooler port rejection, and secret redaction.
2. **Headless Warehouse Receiving Service (`src/lib/inventory/service.ts`)**:
   - Atomically increments `quantity_on_hand` and appends immutable `RECEIVING` ledger entry.
   - Supports conflict-safe initial `InventoryItem` creation on first receiving of a `(variant_id, location_id)` pair using PostgreSQL `ON CONFLICT DO NOTHING` and locked select.
   - Full idempotency support with replay and conflict detection.
3. **Headless Manual Adjustment Service**:
   - Supports unambiguous `DELTA` (positive/negative non-zero delta) and `PHYSICAL_COUNT` (authoritative counted quantity) commands.
   - Strictly enforces balance invariants ($\text{new\_on\_hand} \ge 0$ and $\text{new\_on\_hand} \ge \text{quantity\_reserved} + \text{quantity\_allocated}$).
   - Appends immutable `MANUAL_ADJUSTMENT` ledger entry and `AuditEvent`.
4. **Quarantine / Damaged Stock Transfer Service**:
   - Atomic logical transfer between source and destination operational locations.
   - Deterministic row locking (`id ASC`) prevents deadlocks during bidirectional transfers.
   - Creates two correlated ledger entries sharing a single correlation ID.
5. **Composable Payment Allocation & Late Reacquisition Seams**:
   - `allocateOrderInventoryAfterPaymentApproval`: Transaction-composable seam for future GP-028 payment confirmation. Transitions `VERIFICATION_HOLD` $\to$ `ALLOCATED`, decrements `quantity_reserved`, increments `quantity_allocated`, appends `ALLOCATION_CONFIRMED`. Rejects `ACTIVE` and mixed states.
   - `reacquireOrderInventoryAfterLatePayment`: Transaction-composable seam for legitimate late payments on `RELEASED` orders. Re-evaluates ATS under lock, increments `quantity_allocated`, creates new `ALLOCATED` reservations, rolls back atomically on insufficient stock.
6. **Reservation Expiration Engine & Background Inngest Worker**:
   - `expireUnpaidOrderReservations`: Releases expired `ACTIVE` reservations, decrements `quantity_reserved`, appends `RESERVATION_EXPIRED` / `RESERVATION_RELEASED`, transitions `Order` from `PENDING` $\to$ `EXPIRED` (when `Payment` is `UNPAID`). `VERIFICATION_HOLD` is strictly immune.
   - `processReservationExpirationBatch`: Bounded batch scanner executing under PostgreSQL advisory and row locks.
   - `src/lib/inngest/functions/inventory-expiration.ts`: Inngest background job scheduled every 2 minutes.
7. **Read-Only Reconciliation & Staff Repair Service**:
   - `reconcileInventory`: Read-only audit detecting reserved drift, allocated drift, capacity violations, and ledger mismatch across all inventory items with zero state mutation.
   - `repairInventoryDiscrepancy`: Appends compensating ledger adjustment and records `AuditEvent` under authorized supervisor invocation.
8. **Low-Stock & Availability Queries**:
   - `getVariantAvailability`: Computes real-time $\text{available\_to\_sell} = \text{on\_hand} - \text{reserved} - \text{allocated}$ and derived `isLowStock` ($\text{ATS} \le \text{reorder\_point}$ where $\text{reorder\_point} > 0$). Zero internal quantities exposed to public callers.

---

## Local Verification & Quality Gates Summary

- `pnpm format:check` $\to$ **PASS** (100% Prettier compliant)
- `pnpm typecheck` $\to$ **PASS** (Zero TypeScript compilation errors)
- `pnpm lint` $\to$ **PASS** (Zero ESLint errors and warnings across all files)
- `pnpm test` $\to$ **PASS** (73 unit test files, 940 passed, 0 failed, 100% clean)
- `pnpm build` $\to$ **PASS** (Next.js production build compiled and optimized successfully)

---

## Real PostgreSQL Integration & Concurrency Test Suite

Dedicated suite `tests/inventory-integration/inventory-live-scenarios.test.ts` executed via `pnpm test:inventory:live` with Vitest config `vitest.inventory.integration.config.ts`:

- **Scenario 1 & 2**: Receiving increments on-hand and appends `RECEIVING` ledger entry with exact deltas and resulting balances.
- **Scenario 3 & 4**: Idempotent receiving replay returns identical payload without duplicate increments.
- **Scenario 5**: Idempotency conflict on altered receiving parameters returns `IDEMPOTENCY_CONFLICT`.
- **Scenario 6 & 7**: Positive and negative `DELTA` manual adjustments update balances correctly.
- **Scenario 8**: `PHYSICAL_COUNT` adjustment calculates exact delta from current balance.
- **Scenario 9 & 10**: Adjustments resulting in negative stock or violating committed holds fail closed (`NEGATIVE_ON_HAND_DISALLOWED`, `INSUFFICIENT_UNCOMMITTED_STOCK`).
- **Scenario 12 & 13**: Quarantine transfer decrements source and increments destination with correlated ledger entries.
- **Scenario 15**: Normal allocation transitions `VERIFICATION_HOLD` $\to$ `ALLOCATED` atomically.
- **Scenario 16**: Normal allocation rejects `ACTIVE` reservations with fail-closed error.
- **Scenario 18**: All-`ALLOCATED` replay returns idempotent success with zero duplicate ledger rows.
- **Scenario 19 & 20**: Late reacquisition creates `ALLOCATED` reservations when stock exists and rejects when insufficient.
- **Scenario 22 & 23**: Expiration worker releases expired `ACTIVE` reservations and transitions Order to `EXPIRED`.
- **Scenario 24**: `VERIFICATION_HOLD` reservations are immune from expiration.
- **Scenario 25**: Batch processor runs across qualifying expired orders safely.
- **Scenario 26 & 30**: Reconciliation detects reserved drift and repair service restores balance with compensating ledger and `AuditEvent`.
- **Scenario 31**: `getVariantAvailability` returns derived ATS and low-stock signal.
- **Race A**: Two concurrent receiving operations serialize cleanly; both increments commit.
- **Race C**: Manual decrement vs concurrent reservation on final available stock prevents oversell.
- **Race F**: Two simultaneous expiration workers targeting the same order serialize safely without double-release.
- **Race G**: Two simultaneous payment-approval allocation attempts execute idempotently.

---

## Canonical CI Workflow Integration & Execution Evidence

- **Pushed Commits**:
  - `2cbe67f`: `feat(inventory): implement inventory engine, concurrency validation and migration safety hardening`
  - `e9446e5`: `fix(inventory): align variant and payment fixture schema in live integration test`
- **Workflow Run**: [Run 33489856547](https://github.com/latamcreativa/GamerPeru/actions/runs/33489856547)
- **Workflow Matrix Jobs**:
  1. `Format, Typecheck, Lint, Test, Build & E2E` (Prettier, TypeScript, ESLint 0 warnings, 73 test files / 940 unit tests, Next.js build, 142 Playwright E2E & WCAG tests)
  2. `Real Local PostgreSQL / Supabase Checkout Runtime` (`pnpm test:cart:concurrency`, `pnpm test:checkout:live`, `pnpm test:payment:live`, `pnpm test:order:live`, `pnpm test:inventory:live`)
  3. `Real Local PostgreSQL / Supabase Customer Account Runtime`
  4. `Production Secret & Environment Hygiene Check`
- Added `pnpm test:inventory:live` to `.github/workflows/ci.yml` in the `Real Local PostgreSQL / Supabase Checkout Runtime` job.

---

## Migration & Forensic Verification

- **Latest Migration SQL**: `0011_mushy_viper.sql` (unchanged)
- **Latest Snapshot**: `0011_snapshot.json` (unchanged)
- **Journal Index**: `11` (latest tag: `0011_mushy_viper`)
- **No Migration 0012 Generated**: Confirmed.
- **Hosted Supabase Status**: Untouched (0 schema mutations, 0 data mutations).
- **R2 Storage Status**: Untouched.

---

## Roadmap & Milestone Status

- **GP-018**: `COMPLETE_AND_CLOSED` (Frozen)
- **GP-019**: `COMPLETE_AND_CLOSED` (Frozen)
- **GP-020**: `COMPLETE_AND_CLOSED` (Frozen)
- **GP-021**: `COMPLETED` (Closure Candidate Ready for External Review)
- **GP-022**: `NOT_STARTED`
- **GP-027**: `NOT_STARTED`
- **GP-028**: `NOT_STARTED`

---

## Final Recommendation

**`PASS`** — GP-021 Inventory Engine implementation, concurrency verification, migration target safety hardening, and documentation are complete and verified with zero warnings.

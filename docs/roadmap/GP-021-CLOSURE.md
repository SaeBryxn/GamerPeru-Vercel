# GP-021 / CHK2-BR1 — Canonical Closure Report Candidate

## Status

**GP-021 FINAL CLOSURE CANDIDATE — PENDING EXTERNAL APPROVAL**

---

## Checkpoints & Milestone Lineage

- **Prerequisite GP-020 Canonical Closure Checkpoint**: `5676d532d1e2c109913d814a07164be979f2aadf` (`docs(roadmap): reconcile GP-020 migration provenance`)
- **Starting Checkpoint for GP-021 Work**: `5676d532d1e2c109913d814a07164be979f2aadf`
- **Key GP-021 Gate Lineage**:
  - `CHK1`: Inventory Engine Domain Contract, Operational Policy, Boundary Reconciliation & Implementation Plan Freeze `[APPROVED WITH BINDING AMENDMENTS]`
  - `CHK2`: Inventory Engine Implementation, Concurrency Validation, Migration Safety Hardening & Final Closure Candidate `[REJECTED - REQUIRED BR1 REMEDIATION]`
  - `CHK2-BR1`: Inventory Safety, Idempotency, Expiration Worker & CI Remediation `[COMPLETED]`
- **Target Branch**: `main`

---

## Historical CI Execution Correction & Forensic Audit

The previous closure draft incorrectly characterized earlier CI runs as successful. In accordance with Section 2 of the BR1 contract, the canonical historical record is explicitly corrected:

1. **Run 33489856547** (Head SHA: `e9446e5b3a4b6a2aca78fa260ed0fe89cee67936`): **FAILURE**
   - Failed specifically in `Real Local PostgreSQL / Supabase Checkout Runtime` at `Run Dedicated Inventory Live Integration Tests`.
2. **Run 33490597816** (Head SHA: `becbdd408e683c1d2d249e249ec3583f34f0fbae`): **FAILURE**
   - Concluded with identical failure in `Real Local PostgreSQL / Supabase Checkout Runtime` at `Run Dedicated Inventory Live Integration Tests`.

Neither historical run is preserved or claimed as canonical green evidence.

---

## Binding External Amendments & BR1 Remediation Reconciliation

The BR1 implementation strictly addresses all binding amendments and reviewer findings:

1. **A. RBAC & Staff Exposure**: Zero reuse or broadening of `orders:manage`, `catalog:manage`, or `orders:verify` for inventory administration. Human inventory mutations (receiving, adjustments, quarantine transfers, reconciliation repairs) are implemented strictly as HEADLESS internal domain services with zero browser/staff Server Actions, zero public API endpoints, and zero unauthenticated UI exposure in GP-021. Protected Admin exposure and the canonical `inventory:manage` permission are deferred to GP-022. Background reservation expiration authenticates under `'SYSTEM'` actor.
2. **B. Fail-Closed Configuration (Section 3)**:
   - Removed all unsafe/invented runtime fallbacks (`LOC-LIM-01`, `LOC-LIM-QUARANTINE`, silent 1440-minute TTL, `gp_inventory_default_hmac_secret_2026_fallback`, or Supabase JWT fallback).
   - `CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE` is authoritative and validated.
   - `INVENTORY_HMAC_SECRET` requires an explicit, strong server-only secret (minimum 32 characters / 256 bits).
   - `INVENTORY_IDEMPOTENCY_TTL_MINUTES` is explicitly validated (positive bounded integer 1–10080).
   - `INVENTORY_QUARANTINE_LOCATION_CODE` validated when present.
   - Covered by 7 unit tests in `tests/unit/inventory/inventory-config.test.ts`.
3. **C. Hardened Migration Target Guard (Section 4)**:
   - LOCAL mode strictly permits only `127.0.0.1` or `localhost`, port `54322`, and database `postgres`. Arbitrary ports (5432, 5433) fail closed BEFORE connection.
   - HOSTED mode strictly requires `GAMERPERU_MIGRATION_ENV=hosted` AND `AUTHORIZED_HOSTED_DEPLOYMENT=true`, project ref `jpjffalmvlxpufvtvskx`, database `postgres`, and port `5432` only. Port 6543 (pooler) and all non-5432 ports are forbidden.
   - Credentials strictly redacted in all error messages.
   - Covered by 13 deterministic unit tests in `tests/unit/inventory/migration-target-guard.test.ts`.
4. **D. Idempotency Evaluation Order & Zero-Effect Adjustments (Section 5 & 6)**:
   - Exact semantic ordering enforced: 1. Authority binding $\to$ 2. Expiration $\to$ 3. Operation compatibility $\to$ 4. Request fingerprint $\to$ 5. Committed replay.
   - Expired keys return typed `IDEMPOTENCY_EXPIRED` (never replayed).
   - Zero-effect adjustments (`appliedDelta === 0`) persist idempotency payload to ensure retry-stability while writing 0 ledger entries and 0 audit events. Subsequent retries replay the 0-delta payload regardless of future stock changes.
5. **E. Normal Allocation Complete State Classification (Section 7)**:
   - Whole-order evaluation:
     - `ALL VERIFICATION_HOLD`: proceeds with allocation (`VERIFICATION_HOLD -> ALLOCATED`, `quantity_reserved -= qty`, `quantity_allocated += qty`, `ALLOCATION_CONFIRMED` ledger entries).
     - `ALL ALLOCATED`: verified idempotent replay after balance consistency validation (`alreadyAllocated: true`).
     - Any mixed or invalid state (`VERIFICATION_HOLD + ALLOCATED`, `ACTIVE`, `RELEASED`, `CONSUMED`): fails closed with typed error (`INVALID_RESERVATION_STATE_FOR_ALLOCATION`), 0 balance mutation, 0 ledger rows.
6. **F. Late Reacquisition Complete State Classification (Section 8)**:
   - Whole-order evaluation:
     - `ALL RELEASED`: atomically rechecks ATS under lock for all items; on sufficient stock, increments `quantity_allocated`, inserts new `ALLOCATED` reservations preserving the original authoritative `expires_at` (lineage-compatible, non-invented). On insufficient stock, rolls back atomically with `INSUFFICIENT_STOCK_FOR_REACQUISITION`.
     - `ALL ALLOCATED`: verified idempotent replay.
     - Any mixed or invalid state fails closed.
7. **G. Expiration In-Domain Eligibility (Section 9)**:
   - Requires payment to be `UNPAID` and order to be `PENDING`.
   - Queries transaction database timestamp (`NOW()`).
   - Requires AT LEAST ONE active reservation with `expires_at <= dbNow`. If 0 lines are expired, returns no-op (`NO_EXPIRED_RESERVATIONS`, 0 releases, order remains PENDING).
   - When legitimately triggered: releases whole active order; expired lines receive `RESERVATION_EXPIRED` ledger, future active lines in same order receive `RESERVATION_RELEASED` (co-release) ledger. `VERIFICATION_HOLD` is strictly immune.
8. **H. Inngest Worker Registration (Section 10)**:
   - Created `src/app/api/inngest/route.ts` registering `inventoryReservationExpirationJob` with Next.js Inngest `serve` integration.
   - Exports `GET`, `POST`, `PUT`.
   - Verified via `tests/unit/inventory/inngest-route.test.ts` and clean Next.js production build.
9. **I. Reconciliation Capacity Violation Guard (Section 11)**:
   - Auto-repair rejected if $\text{quantity\_on\_hand} < \text{expectedReserved} + \text{expectedAllocated}$ with typed code `CAPACITY_VIOLATION_REQUIRES_MANUAL_RESOLUTION`, preventing artificial capacity violations.
10. **J. Schema & Migration Freeze (Section 15)**:
    - `GP021_IMPLEMENTATION_REQUIRES_NO_SCHEMA_MIGRATION`.
    - Migration count remains frozen at 0000 through 0011 (no 0012). Hosted Supabase untouched.

---

## Local Verification & Quality Gates Summary

- `pnpm format:check` $\to$ **PASS** (100% Prettier compliant)
- `pnpm typecheck` $\to$ **PASS** (Zero TypeScript compilation errors across codebase and tests)
- `pnpm lint` $\to$ **PASS** (Zero ESLint errors and warnings with `--max-warnings=0`)
- `pnpm test` $\to$ **PASS** (75 unit test files, 953 passed, 0 failed, 100% clean)
- `pnpm build` $\to$ **PASS** (Next.js production build compiled and static pages optimized, including `/api/inngest`)
- `git diff --check` $\to$ **PASS** (Zero whitespace or format errors)

---

## Real PostgreSQL Integration & Concurrency Test Matrix

Suite `tests/inventory-integration/inventory-live-scenarios.test.ts` covers:

- **Scenario 1 & 2**: Receiving increments on-hand and appends `RECEIVING` ledger entry with exact deltas and balances.
- **Scenario 3 & 4**: Idempotent receiving replay returns identical payload without duplicate increments.
- **Scenario 5 & 5B**: Changed payload returns `IDEMPOTENCY_CONFLICT`; expired key returns `IDEMPOTENCY_EXPIRED`.
- **Scenario 6 & 7**: Positive and negative `DELTA` manual adjustments update balances correctly.
- **Scenario 8 & 8B**: `PHYSICAL_COUNT` adjustment calculates exact delta; zero-effect adjustment persists idempotency with 0 ledger rows and stable replay.
- **Scenario 9 & 10**: Adjustments resulting in negative stock or violating committed holds fail closed (`NEGATIVE_ON_HAND_DISALLOWED`, `INSUFFICIENT_UNCOMMITTED_STOCK`).
- **Scenario 12 & 13**: Quarantine transfer decrements source and increments destination with correlated ledger entries.
- **Scenario 15**: Normal allocation transitions `VERIFICATION_HOLD` $\to$ `ALLOCATED` atomically.
- **Scenario 16**: Normal allocation rejects `ACTIVE` and mixed reservation states with fail-closed error.
- **Scenario 18**: All-`ALLOCATED` replay verifies balance consistency and returns idempotent success with zero duplicate ledger rows.
- **Scenario 19 & 20**: Late reacquisition creates `ALLOCATED` reservations preserving original `expires_at` when stock exists, rejects when insufficient.
- **Scenario 21**: Direct expiration called before expiry date results in zero mutation (no-op).
- **Scenario 22 & 23**: Legitimate expired trigger releases whole active order with exact movement classifications (`RESERVATION_EXPIRED` vs `RESERVATION_RELEASED` co-release).
- **Scenario 24**: `VERIFICATION_HOLD` reservations are immune from expiration.
- **Scenario 25**: Batch processor runs across qualifying expired orders safely.
- **Scenario 26 & 30**: Reconciliation detects reserved drift and repair service restores balance with compensating ledger and `AuditEvent`.
- **Scenario 26B**: Repair rejected when expected reservations exceed physical on-hand (`CAPACITY_VIOLATION_REQUIRES_MANUAL_RESOLUTION`).
- **Scenario 31**: `getVariantAvailability` returns derived ATS and low-stock signal.
- **Race A**: Two concurrent receiving operations serialize cleanly; both increments commit.
- **Race B**: Concurrent first `InventoryItem` creation for same variant and location creates exactly 1 record with combined stock.
- **Race C**: Manual decrement vs concurrent reservation on final available stock prevents oversell.
- **Race D**: Expiration vs real payment submission concurrency preserves hold and skips expiration.
- **Race E**: Expiration vs customer cancellation concurrency handles terminal state safely with exactly 1 release.
- **Race F**: Two simultaneous expiration workers targeting the same expired order serialize safely without double-release.
- **Race G**: Two simultaneous payment-approval allocation attempts execute idempotently (one allocates, other returns `alreadyAllocated`).
- **Race I**: Late reacquisition vs concurrent stock-consuming operation prevents oversell.

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

**`PASS`** — GP-021 / CHK2-BR1 Inventory Safety, Idempotency, Expiration Worker & CI Remediation is complete, fully tested, and verified with zero warnings.

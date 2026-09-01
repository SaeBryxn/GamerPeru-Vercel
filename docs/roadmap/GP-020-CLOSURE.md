# GP-020 — Canonical Closure Report Candidate

## Status

**CANONICAL CLOSURE CANDIDATE (GP-020 / CHK2-BR1 REMEDIATED — READY FOR EXTERNAL REVIEW)**

---

## Checkpoints & Milestone Lineage

- **Prerequisite GP-019 Implementation Checkpoint**: `99afdd3cca26f18f41b665087963fa6392abdb12`
- **Prerequisite GP-019 Canonical Closure Checkpoint**: `fa0a524f63b44f8d548c7413ee89bf02ddae3484` (`docs(roadmap): close GP-019 manual payment submission`)
- **Starting Checkpoint for GP-020 Work**: `fa0a524f63b44f8d548c7413ee89bf02ddae3484`
- **Key GP-020 Gate Lineage**:
  - `CHK1`: Architecture, State Machine & Scope Alignment `[REJECTED REQUIRES R1]`
  - `CHK1-R1`: Refund Persistence, Cross-Domain Locking & Authority Reconciliation `[APPROVED / CLOSED]`
  - `CHK2`: Order Management, Refund Persistence, Audit & Concurrency Implementation `[REJECTED REQUIRES BR1]`
  - `CHK2-BR1`: Terminal Refund Inventory Integrity, Financial Idempotency & Real Cancel-vs-Submit Concurrency `[COMPLETED / READY FOR REVIEW]`
  - `CHK3`: Controlled Hosted Supabase Migration 0011 Deployment & Physical Verification `[PENDING AUTHORIZATION]`
- **Candidate Head Branch**: `main`
- **BR1 Remediation Commits**:
  - `777d0af`: `fix(orders): preserve stock and refund idempotency`
  - `bca5f9b`: `test(orders): isolate integration suite state and fix assertions`

---

## Executive Summary & Delivered Scope

GP-020 delivers the complete order lifecycle management, refund tracking, audit event logging, and concurrency control foundation for Gamer Perú. The implementation enforces strict ACID guarantees, exact integer-cent refund arithmetic, race-safe inventory allocation and reservation release, Peruvian payment lifecycle UX, and immutable post-purchase snapshot preservation:

1. **Relational Database Migration 0011**: Generated `0011_mushy_viper.sql` canonically via Drizzle Kit:
   - Creates `audit_actor_type` enum (`'CUSTOMER'`, `'ADMIN'`, `'SYSTEM'`).
   - Creates `refunds` table with `id` (UUIDv7), `order_id` (FK `orders.id` ON DELETE RESTRICT), `payment_id` (FK `payments.id` ON DELETE RESTRICT), `amount_cents` (>0), `reason` (non-empty), `external_reference`, `actor_auth_user_id` (FK `auth.users(id)` ON DELETE SET NULL), and `created_at`.
   - Creates `audit_events` table with `id` (UUIDv7), `timestamp`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `metadata` (JSONB), `ip_address`, and `request_id`.
   - Includes compound indexes on `refunds(payment_id, created_at)`, `refunds(order_id)`, `audit_events(target_type, target_id, timestamp)`, and `audit_events(action, timestamp)`. Zero modifications to legacy migrations 0000–0010. Migration 0011 remains FROZEN.
2. **Deterministic Order Authority Resolution**: Single authoritative resolver `resolveAuthorizedOrder` handles authenticated customers, guest sessions via `guest_payment_access_grants` and `idempotency_keys`, and authorized staff (`orders:manage`). Unauthenticated or unauthorized callers receive unified, anti-oracle `NOT_AVAILABLE`.
3. **Shared Global Lock Ordering**: Both payment submission and order management mutations follow a strictly unified hierarchical row lock order:
   $$\text{pg\_advisory\_xact\_lock} \longrightarrow \text{payments} \longrightarrow \text{orders} \longrightarrow \text{shipments} \longrightarrow \text{inventory\_reservations} \longrightarrow \text{inventory\_items}$$
   Derived via a 32-bit signed integer hash of namespaced attempt keys (`ORDER_CANCELLATION:*`, `REFUND_RECORDING:*`), eliminating deadlocks under concurrent execution.
4. **Customer Unpaid Cancellation**: Unpaid `PENDING` orders with `UNPAID` payments can be cancelled by their owner before payment submission. Atomically sets `Order.status = 'CANCELLED'`, leaves `Payment.status = 'UNPAID'`, releases `ACTIVE` inventory reservations, appends `RESERVATION_RELEASED` ledger entries, emits `OrderCancelled` outbox events, and logs an `AuditEvent`. Customer cancellation is strictly blocked if payment is in `SUBMITTED` or `VERIFYING` state (`PAYMENT_REVIEW_IN_PROGRESS`).
5. **Staff Paid Pre-Shipment Cancellation & Full Refund**: Allows staff (`orders:manage`) to cancel confirmed orders prior to fulfillment. Accurately calculates remaining refundable balance ($\text{refundableRemainingCents} = \text{Payment.amount\_cents} - \text{Payment.refunded\_amount\_cents}$), inserts a `Refund` entity, updates `Payment.refunded_amount_cents`, sets both `Payment` and `Order` to `REFUNDED`, releases `ALLOCATED` stock with `ALLOCATION_RELEASED` ledger entries, emits `OrderCancelled` and `RefundIssued` outbox events, and logs an `AuditEvent`.
6. **Partial & Full Refund Tracking (Fulfillment-Aware Inventory Reconciliation)**: Staff can record individual refund transactions against confirmed payments. Strictly bounds cumulative refunds ($0 < \text{amount\_cents} \le \text{Payment.amount\_cents} - \text{Payment.refunded\_amount\_cents}$), maintaining the invariant $\text{Payment.refunded\_amount\_cents} = \sum \text{Refund.amount\_cents}$.
   - Partial refunds: Zero inventory mutation.
   - Pre-shipment full refunds (`Shipment = UNFULFILLED` or absent, `Order = CONFIRMED`, `Reservations = ALLOCATED`): Transitions `Order` and `Payment` to `REFUNDED`, releases `ALLOCATED` stock to `RELEASED`, decrements `inventory_items.quantity_allocated` (guarded by pre-validation underflow check), appends `ALLOCATION_RELEASED` ledger entry. `quantity_on_hand` remains unchanged.
   - Post-shipment full refunds (`Shipment = SHIPPED | DELIVERED` or reservations `CONSUMED`): Transitions `Order` and `Payment` to `REFUNDED` financially without releasing or restocking physical inventory.
   - Inconsistent fulfillment states fail closed with domain error code `FULFILLMENT_INCONSISTENCY`.
   - Inventory underflow aborts transaction with `INVENTORY_INVARIANT_VIOLATION` and rolls back all financial mutations.
7. **Dedicated Paid Cancellation Fingerprint & Strict Idempotency**:
   - `computePaidOrderCancellationFingerprint`: Dedicated namespace `paid_order_cancellation_intent` binding `orderId`, normalized `reason`, normalized `externalReference` (or `NO_EXTERNAL_REF`), and `authorityBindingDigest`.
   - Preserves leading zeros in `externalReference` without numeric casting.
   - Reusing idempotency key with modified `externalReference` returns `IDEMPOTENCY_CONFLICT` while preserving exactly one persistent financial mutation. Exact duplicates return cached response with `replayed: true`.
   - Authority binding check evaluated strictly before expiration and fingerprint validation in both fast-check and locked paths.
8. **Real Cancel-vs-Submit Concurrency Synchronization**:
   - Converted Scenarios E and F to genuine concurrent race executions via `Promise.all` coordinated by test synchronization hooks (`__setTestOrderTransactionHook`, `__setTestPaymentTransactionHook`), which remain strictly disabled and inert in production (`process.env.NODE_ENV === 'production'`).
   - Race A (cancellation wins): submission enters transaction, waits on row lock, observes `CANCELLED` order on unblock, returns `INVALID_PAYMENT_STATE` with zero submission records and zero outbox events.
   - Race B (submission wins): cancellation enters transaction, waits on row lock, observes `SUBMITTED` payment on unblock, returns `PAYMENT_REVIEW_IN_PROGRESS` with zero cancellation mutations and zero reservation release.
9. **GP-028 Terminal Rejection Consequence Helper**: Implemented `applyTerminalPaymentRejectionConsequences` for upcoming GP-028 payment review workflow. Preconditions that `Payment.status` is already `'REJECTED'`, transitions `Order.status` to `'CANCELLED'`, releases `VERIFICATION_HOLD` inventory reservations, appends `RESERVATION_RELEASED` ledger entries, emits `OrderCancelled` outbox event, and appends an `AuditEvent`. Helper strictly avoids emitting a redundant second `PaymentRejected` outbox event (owned by GP-028).
10. **Customer Cancellation UI**: Accessible, responsive cancellation trigger and confirmation dialog integrated into `/checkout/confirmacion/[orderNumber]`. Includes keyboard trap, ARIA dialog labeling, in-flight state handling, and Peruvian Spanish UX messaging.
11. **Snapshot Immutability**: All original post-purchase audit snapshots (`order_items`, `order_address_snapshots`, `order_pricing_snapshots`) remain strictly immutable throughout cancellations and refunds.

---

## Local Verification & Quality Gates Summary

- `pnpm format:check` $\to$ **PASS** (Zero code style issues across all files)
- `pnpm typecheck` $\to$ **PASS** (Zero TypeScript compilation errors)
- `pnpm lint` $\to$ **PASS** (Zero ESLint errors and warnings across full codebase)
- `pnpm test` $\to$ **PASS** (68 unit test files, 901 unit tests passing cleanly, 0 failures)
- `pnpm build` $\to$ **PASS** (Next.js production build compiled and optimized successfully)
- `pnpm test:e2e` $\to$ **PASS** (142 Playwright E2E and WCAG 2.1 AA accessibility tests passing cleanly)

---

## Canonical CI Execution Evidence (Run 33476446869)

- **Head Commit**: `bca5f9b` (`test(orders): isolate integration suite state and fix assertions`)
- **Workflow Run**: [Run 33476446869](https://github.com/latamcreativa/GamerPeru/actions/runs/33476446869)
- **Status**: `completed`
- **Conclusion**: `success` (100% Green across all 4 matrix jobs)
- **Detailed Job Breakdown**:
  1. `Format, Typecheck, Lint, Test, Build & E2E` (Job `99745163456`): **SUCCESS**
     - Formatting: Prettier check clean
     - TypeScript: 0 errors
     - ESLint: 0 errors, 0 warnings
     - Vitest Unit: 68 test files, 901 unit tests passing cleanly
     - Next.js Production Build: Compiled and static page generation complete
     - Playwright E2E & WCAG 2.1 AA: 142 scenarios passing
  2. `Real Local PostgreSQL / Supabase Checkout Runtime` (Job `99745163478`): **SUCCESS**
     - Executes `pnpm test:checkout:live` (12 live checkout scenarios)
     - Executes `pnpm test:payment:live` (14 live payment scenarios)
     - Executes `pnpm test:order:live` (33 live order management scenarios, including Scenarios A–Z, Timeline, E/F genuine races, J1/J2 paid idempotency, and K1–K4 fulfillment-aware full refunds and underflow rollbacks)
  3. `Real Local Supabase Checkout E2E` (Job `99745163490`): **SUCCESS**
     - Guest checkout, dynamic shipping, double-click idempotency, unauthorized view protection, and customer cancellation E2E scenarios passing with 0 WCAG AA accessibility violations.
  4. `Real Local Supabase Cart E2E` (Job `99745163512`): **SUCCESS**
     - Anonymous, authenticated, merge, inventory reservation, and drawer UI scenarios passing.

# GP-020 — Canonical Closure Report Candidate

## Status

**CANONICAL CLOSURE CANDIDATE (PENDING CHK3 HOSTED MIGRATION 0011 DEPLOYMENT & FINAL EXTERNAL APPROVAL)**

---

## Checkpoints & Milestone Lineage

- **Prerequisite GP-019 Implementation Checkpoint**: `99afdd3cca26f18f41b665087963fa6392abdb12`
- **Prerequisite GP-019 Canonical Closure Checkpoint**: `fa0a524f63b44f8d548c7413ee89bf02ddae3484` (`docs(roadmap): close GP-019 manual payment submission`)
- **Starting Checkpoint for GP-020 Work**: `fa0a524f63b44f8d548c7413ee89bf02ddae3484`
- **Key GP-020 Gate Lineage**:
  - `CHK1`: Architecture, State Machine & Scope Alignment `[REJECTED REQUIRES R1]`
  - `CHK1-R1`: Refund Persistence, Cross-Domain Locking & Authority Reconciliation `[APPROVED / CLOSED]`
  - `CHK2`: Order Management, Refund Persistence, Audit & Concurrency Implementation `[COMPLETED]`
  - `CHK3`: Controlled Hosted Supabase Migration 0011 Deployment & Physical Verification `[PENDING AUTHORIZATION]`
- **Candidate Head Branch**: `main`

---

## Executive Summary & Delivered Scope

GP-020 delivers the complete order lifecycle management, refund tracking, audit event logging, and concurrency control foundation for Gamer Perú. The implementation enforces strict ACID guarantees, exact integer-cent refund arithmetic, race-safe inventory allocation and reservation release, Peruvian payment lifecycle UX, and immutable post-purchase snapshot preservation:

1. **Relational Database Migration 0011**: Generated `0011_mushy_viper.sql` canonically via Drizzle Kit:
   - Creates `audit_actor_type` enum (`'CUSTOMER'`, `'ADMIN'`, `'SYSTEM'`).
   - Creates `refunds` table with `id` (UUIDv7), `order_id` (FK `orders.id` ON DELETE RESTRICT), `payment_id` (FK `payments.id` ON DELETE RESTRICT), `amount_cents` (>0), `reason` (non-empty), `external_reference`, `actor_auth_user_id` (FK `auth.users(id)` ON DELETE SET NULL), and `created_at`.
   - Creates `audit_events` table with `id` (UUIDv7), `timestamp`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `metadata` (JSONB), `ip_address`, and `request_id`.
   - Includes compound indexes on `refunds(payment_id, created_at)`, `refunds(order_id)`, `audit_events(target_type, target_id, timestamp)`, and `audit_events(action, timestamp)`. Zero modifications to legacy migrations 0000–0010.
2. **Deterministic Order Authority Resolution**: Single authoritative resolver `resolveAuthorizedOrder` handles authenticated customers, guest sessions via `guest_payment_access_grants` and `idempotency_keys`, and authorized staff (`orders:manage`). Unauthenticated or unauthorized callers receive unified, anti-oracle `NOT_AVAILABLE`.
3. **Shared Global Lock Ordering**: Both payment submission and order management mutations follow a strictly unified hierarchical row lock order:
   $$\text{pg\_advisory\_xact\_lock} \longrightarrow \text{payments} \longrightarrow \text{orders} \longrightarrow \text{shipments} \longrightarrow \text{inventory\_reservations} \longrightarrow \text{inventory\_items}$$
   Derived via a 32-bit signed integer hash of namespaced attempt keys (`ORDER_CANCELLATION:*`, `ORDER_REFUND:*`), eliminating deadlocks under concurrent execution.
4. **Customer Unpaid Cancellation**: Unpaid `PENDING` orders with `UNPAID` payments can be cancelled by their owner before payment submission. Atomically sets `Order.status = 'CANCELLED'`, leaves `Payment.status = 'UNPAID'`, releases `ACTIVE` inventory reservations, appends `RESERVATION_RELEASED` ledger entries, emits `OrderCancelled` outbox events, and logs an `AuditEvent`. Customer cancellation is strictly blocked if payment is in `SUBMITTED` or `VERIFYING` state (`PAYMENT_REVIEW_IN_PROGRESS`).
5. **Staff Paid Pre-Shipment Cancellation & Full Refund**: Allows staff (`orders:manage`) to cancel confirmed orders prior to fulfillment. Accurately calculates remaining refundable balance ($\text{refundableRemainingCents} = \text{Payment.amount\_cents} - \text{Payment.refunded\_amount\_cents}$), inserts a `Refund` entity, updates `Payment.refunded_amount_cents`, sets both `Payment` and `Order` to `REFUNDED`, releases `ALLOCATED` stock with `ALLOCATION_RELEASED` ledger entries, emits `OrderCancelled` and `RefundIssued` outbox events, and logs an `AuditEvent`.
6. **Partial & Full Refund Tracking**: Staff can record individual refund transactions against confirmed payments. Strictly bounds cumulative refunds ($0 < \text{amount\_cents} \le \text{Payment.amount\_cents} - \text{Payment.refunded\_amount\_cents}$), maintaining the invariant $\text{Payment.refunded\_amount\_cents} = \sum \text{Refund.amount\_cents}$. Partial refunds do not release inventory; full refunds reaching 100% of order total transition `Payment` and `Order` to `REFUNDED`.
7. **GP-028 Terminal Rejection Consequence Helper**: Implemented `applyTerminalPaymentRejectionConsequences` for upcoming GP-028 payment review workflow. Preconditions that `Payment.status` is already `'REJECTED'`, transitions `Order.status` to `'CANCELLED'`, releases `VERIFICATION_HOLD` inventory reservations, appends `RESERVATION_RELEASED` ledger entries, emits `OrderCancelled` outbox event, and appends an `AuditEvent`. Helper strictly avoids emitting a redundant second `PaymentRejected` outbox event (owned by GP-028).
8. **Customer Cancellation UI**: Accessible, responsive cancellation trigger and confirmation dialog integrated into `/checkout/confirmacion/[orderNumber]`. Includes keyboard trap, ARIA dialog labeling, in-flight state handling, and Peruvian Spanish UX messaging.
9. **Snapshot Immutability**: All original post-purchase audit snapshots (`order_items`, `order_address_snapshots`, `order_pricing_snapshots`) remain strictly immutable throughout cancellations and refunds.

---

## Local Verification & Quality Gates Summary

- `pnpm format:check` $\to$ **PASS** (Zero code style issues)
- `pnpm typecheck` $\to$ **PASS** (Zero TypeScript compilation errors)
- `pnpm lint` $\to$ **PASS** (Zero ESLint errors and warnings across full codebase)
- `pnpm test` $\to$ **PASS** (68 unit test files, 900 tests passing cleanly, 0 failures)
- `pnpm build` $\to$ **PASS** (Next.js production build compiled and optimized successfully)
- `pnpm test:e2e` $\to$ **PASS** (142 Playwright E2E and WCAG 2.1 AA accessibility tests passing cleanly)
- `pnpm db:migrate` $\to$ **PASS** (Migration 0011 applied to local database, verified idempotent on rerun)

---

## CI / Automated Pipeline Inclusions

- Updated `.github/workflows/ci.yml` to supply `ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES=60` to `checkout-e2e` and `checkout-live` jobs.
- Added `test:order:live` to CI `checkout-live` runner to execute the full 27-scenario live database integration suite against local Supabase container.

# GP-018 — Canonical Closure Report Candidate

## Status

**CANONICAL CLOSURE CANDIDATE (PENDING FINAL EXTERNAL APPROVAL)**

---

## Checkpoints & Milestone Lineage

- **Prerequisite GP-017 Implementation Checkpoint**: `4fa13c52d1005a8c235e9ace6078cdaaee186f8e`
- **Prerequisite GP-017 Canonical Closure Checkpoint**: `b1d1bade5f27e5ed8e0e2167b8be0ba0a6a71541` (`docs(roadmap): correct GP-017 closure semantics`)
- **Starting Checkpoint for GP-018 Architecture Work**: `b1d1bade5f27e5ed8e0e2167b8be0ba0a6a71541`
- **Key GP-018 Gate Lineage**:
  - `CHK1`: Checkout Architecture & Gate Boundaries Reconciliation `[APPROVED / CLOSED]` (ADR-009)
  - `CHK2`: Database Schema & Migration 0009 Initial Draft `[APPROVED / CLOSED]` (`55502c3`)
  - `CHK3`: Schema Hardening & Check Constraint Integrity `[APPROVED / CLOSED]` (`3057fd4`)
  - `CHK4`: Hosted Supabase 0009 Deployment & Physical Verification `[APPROVED / CLOSED]` (Deployment gate, 46 indexes verified, zero hosted delta)
  - `CHK5`: Server-Side Atomic Checkout Runtime `[REVIEWED / REJECTED REQUIRES BR1]` (`703eba4`)
  - `CHK5-BR1`: Runtime Concurrency & Transaction Safety Remediation `[APPROVED / CLOSED]` (`3ea2a34`)
  - `CHK6`: Checkout UI, Confirmation & End-to-End Acceptance `[REVIEWED / REJECTED REQUIRES BR1]` (`95fa787`)
  - `CHK6-BR1`: Checkout Confirmation Privacy & Review-Recovery Remediation `[REVIEWED / REJECTED REQUIRES BR2]` (`7bf4aa5`)
  - `CHK6-BR2`: Fail-Closed Checkout Recovery & Evidence Truthfulness `[REVIEWED / REJECTED REQUIRES BR3]` (`7e05fc9`)
  - `CHK6-BR3`: Explicit Method Reselection & Authoritative Pricing Reconciliation `[APPROVED / CLOSED]` (Implementation SHA: `1666cfdd7bafe9e99c13e9190a7e357114212047`)
  - `CHK6-BR3-R1`: CI Evidence Truthfulness Correction `[APPROVED / CLOSED]` (Evidence-only, zero code delta, zero commit delta)
- **Canonical Implementation SHA**: `1666cfdd7bafe9e99c13e9190a7e357114212047`
- **Candidate Head Branch**: `main`

---

## Canonical Implementation CI Verification (Run 33371325572)

- **Workflow Run ID**: `33371325572` (Event: `push` on `main`, Head: `1666cfdd7bafe9e99c13e9190a7e357114212047`)
- **Overall Workflow Conclusion**: **SUCCESS** (All 4 jobs concluded SUCCESS)
- **General Unit / Vitest** (`Format, Typecheck, Lint, Test, Build & E2E` / `99422895219`):
  - 59 test files passed (59 total)
  - 834 tests passed, 1 skipped, 0 failed (835 total tests)
- **Standard Playwright E2E** (`Format, Typecheck, Lint, Test, Build & E2E` / `99422895219`):
  - 142 logical scenarios total
  - 141 clean passed, 1 flaky (`tests/e2e/homepage.spec.ts` Scenario K: MegaMenu geometry / preview-zone width at 1920px; retry #1 passed), 1 retry, 0 terminal failed, 0 skipped
- **Real Local Supabase Cart E2E** (`Real Local Supabase Cart E2E` / `99422895392`):
  - 11 logical scenarios total
  - 9 clean passed, 2 flaky (`Scenario E: Cookie Security & Persistence` and `Scenario H: Full-Page /carrito Mutation Synchronization`; each passed on retry #1), 2 retries, 0 terminal failed, 0 skipped
- **Real Local Supabase Checkout E2E** (`Real Local Supabase Checkout E2E` / `99422895420`):
  - 5 logical scenarios total
  - 5 clean passed, 0 flaky, 0 retries, 0 failed, 0 skipped
- **Real Local PostgreSQL / Supabase Checkout Live** (`Real Local PostgreSQL / Supabase Checkout Runtime` / `99422895357`):
  - 24 tests total
  - 24 passed, 0 failed, 0 skipped

---

## Executive Summary & Final Delivered Scope

GP-018 delivers the complete, authoritative customer checkout domain, payment-neutral confirmation handoff, and storefront application surfaces for Gamer Perú. The implementation satisfies strict multi-table relational persistence, race-free concurrency semantics with transaction-scoped PostgreSQL advisory locks, server-authoritative pricing and inventory reservations, accessible responsive UI forms, cryptographically secure attempt IDs with fail-closed UI boundaries, authoritative context refresh upon unavailable methods requiring explicit user reselection, terminal state handling for converted carts and unavailable configuration, and real local Supabase browser E2E acceptance:

1. **Relational Commerce Database Architecture**: Physical migration `0009_majestic_madame_web.sql` defines 15 normalized tables across orders, payments, shipments, shipping methods, payment methods, payment instructions, inventory locations, inventory items, inventory reservations, inventory ledger entries, order address snapshots, order pricing snapshots, and database-backed idempotency keys.
2. **Orders & Immutable Snapshots**: Complete `orders`, `order_items`, `order_address_snapshots`, and `order_pricing_snapshots` persistence capturing frozen customer, address, catalog, and pricing data at time of purchase.
3. **Shipping Method & Initial Shipment State**: Normalized `shipping_methods` configuration and `shipments` initial association linked directly to created orders.
4. **Payment Method Configuration**: Normalized `payment_methods` configuration supporting multi-brand Peru payment channels.
5. **Payment Instruction Version Structure**: Database structural support for versioned payment instructions (`payment_instruction_versions`).
6. **Initial UNPAID Payment Creation**: Exactly one `payments` record created atomically with `payment_status = 'UNPAID'` upon order submission.
7. **Checkout Inventory Reservation Kernel**: Atomically creates `inventory_reservations` records linked to items with status `ACTIVE` and reservation TTL timestamps.
8. **Inventory Reservation Ledger Entry**: Transaction-scoped `inventory_ledger_entries` audit logging with entry type `RESERVATION_CREATED`.
9. **Atomic Outbox Event Persistence**: Inserts `outbox_events` with topic `OrderPlaced` in the same physical database transaction.
10. **Database-Backed Idempotency Support**: `checkout_idempotency_keys` storing SHA-256 request fingerprints, authoritative HMAC-SHA256 digests, and cached order responses.
11. **Deterministic Cryptographic Authority & Idempotency**: Concurrency races serialize via `pg_advisory_xact_lock` on attempt ID hash, guaranteeing idempotent replay convergence (`replayed: true`).
12. **Server-Side Atomic Checkout Runtime Engine**: All mutations (cart `ACTIVE -> CONVERTED`, price snapshotting, address snapshotting, inventory reservations, ledger logging, initial payment, outbox event) execute in a single PostgreSQL transaction with conflict-safe order number generation (`ON CONFLICT DO NOTHING`).
13. **Same-Cart & Same-Attempt Concurrency Serialization**: Concurrent double-clicks or parallel submissions for the same cart or attempt ID safely serialize without duplicate orders or phantom stock allocation.
14. **Guest & Authenticated Authority Resolution**: Guest authority verified via HMAC cookie binding; authenticated customer authority verified via Supabase auth session binding.
15. **Server-Authoritative Price & Stock Validation**: Price hydration reads active catalog prices from PostgreSQL, rejecting stale client amounts via `CHECKOUT_REVIEW_CHANGED`. Stock availability checked atomically with row-level locks.
16. **Customer-Facing Checkout Application Surfaces**: Accessible, responsive `/checkout` form with Peruvian contact and address entry (inline or saved address selection).
17. **Peruvian Delivery Address Flow**: Capture of recipient name, phone, street address, department, province, district, postal code, and delivery references.
18. **Shipping Method Selection & Calculation**: Radio selection with real-time dynamic shipping fee calculation.
19. **Payment Method Selection without Secret Disclosure**: Neutral payment method selection with zero customer-facing leakage of account identifiers, phone numbers, recipient names, or QR media IDs.
20. **Real-Time Order Review**: Visible breakdown of cart items, subtotal, shipping fee, and total amount.
21. **Explicit Confirmation on Review Changes**: Dynamic totals synchronization with mandatory explicit second user click under a fresh cryptographically secure attempt ID.
22. **Explicit Reselection on Unavailable Methods**: Invalidation of stale shipping or payment methods with authoritative context refresh requiring explicit user reselection (zero auto-selection).
23. **Zero Replacement Auto-Selection**: Replacement shipping and payment options are never automatically selected upon error recovery.
24. **Customer Order Confirmation Surface**: `/checkout/confirmacion/[orderNumber]` showing order status `PENDING`, payment status `UNPAID` ("Pendiente de pago"), delivery summary, and itemized breakdown.
25. **Confirmation Authority Protection**: Strict ownership validation requiring matching authenticated customer ID or valid guest HMAC digest.
26. **Order-Existence Non-Disclosure Contract**: Nonexistent orders and unauthorized/foreign requests return identical unified failure `{ success: false, code: "NOT_AVAILABLE", error: "Pedido no disponible." }`, eliminating oracle disclosure.
27. **Read-Only Confirmation Behavior**: Order confirmation readers perform zero database mutations (asserted across orders, payments, reservations, outbox, and carts tables).
28. **Cryptographically Secure Attempt IDs**: Client attempt ID generation (`src/lib/checkout/attempt-id.ts`) strictly requires secure browser entropy (`crypto.randomUUID()` or RFC4122 v4 `crypto.getRandomValues()`) with zero `Math.random()` fallbacks.
29. **Controlled Fail-Closed Crypto Boundary**: Safe error presentation without uncaught exceptions, submit button disabled, and zero submit actions when secure browser entropy is unavailable.
30. **Comprehensive Acceptance Coverage**: Validated through local PostgreSQL integration suites, Vitest component unit suites, and full Playwright browser E2E suites.

---

## Roadmap & Milestone Ownership Boundaries

### GP-019 — Payment Proof Capture & Manual Customer Payment Workflow (Not Begun)

The following remain explicitly outside GP-018 and are owned exclusively by **GP-019**:

- Production Yape/Plin phone numbers, recipient holder names, and bank account identifiers.
- Customer-visible payment instructions rendering.
- Official Yape/Plin QR code presentation.
- Operation-code (`operation_code`) capture form.
- Payment voucher (`voucher_file`) image upload and validation.
- Customer `PaymentSubmission` entity and submission runtime.
- Customer payment workflow transition (`UNPAID -> SUBMITTED / VERIFYING`).
- Customer payment rejection recovery and re-submission workflows.

### GP-028 — Admin Payment Verification Operations

Privileged admin review, payment voucher audit, and manual payment verification/approval operations belong exclusively to **GP-028** (Admin Payment & Verification Operations).

### Post-GP-018 Roadmap Milestones

- **GP-020**: Post-checkout order state transitions, cancellations, and customer refund workflows.
- **GP-021**: Broader Inventory Engine lifecycle, background reservation expiration/release worker, manual stock adjustments, and multi-location fulfillment movements.
- **GP-042**: EC OS background synchronization and outbox event dispatch workers.

---

## Remaining Business Configuration TBDs (Operational Dependencies)

1. **Production Shipping Rates & Coverage**: Official base shipping rates and delivery SLAs for Lima Metropolitana, Lima Provincias, and Departamentos to be configured operationally.
2. **Production Manual Payment Accounts**: Official Yape/Plin phone numbers, recipient holder names, and QR image assets to be configured operationally.
3. **Production Primary Inventory Location**: Fulfillment center location codes to be configured operationally.
4. **Reservation TTL Policy**: Production reservation duration (`CHECKOUT_RESERVATION_TTL_MINUTES`) remains `[TBD BUSINESS DECISION]` (numeric test values are local fixture values only).
5. **Idempotency TTL Policy**: Production idempotency key expiry duration (`CHECKOUT_IDEMPOTENCY_TTL_MINUTES`) remains `[TBD BUSINESS DECISION]`.

---

## Hosted Database Status & Evidence Basis

- **Schema Delta**: 0 (`src/db/schema/**` unchanged since CHK4).
- **Migration Delta**: 0 (`src/db/migrations/**` unchanged since CHK4; migration `0009_majestic_madame_web.sql` frozen).
- **No Migration 0010**: Confirmed, zero new migrations created.
- **Evidence Basis**: Git repository audit proves zero schema or migration additions since approved deployment gate CHK4; execution audit verifies zero `drizzle-kit push` or hosted mutation commands were executed during CHK5 through CHK6-BR3-R1.

---

## Dependency Next Step

Upon final external approval of this canonical closure documentation, GP-018 is formally closed, authorizing the commencement of:
**GP-019 — Payment Proof Capture & Manual Customer Payment Workflow**

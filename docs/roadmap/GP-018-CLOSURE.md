# GP-018 — Closure Report Candidate

## Status

**CLOSURE CANDIDATE (PENDING EXTERNAL REVIEW)**

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
  - `CHK6-BR2`: Fail-Closed Checkout Recovery & Evidence Truthfulness `[CANDIDATE PENDING EXTERNAL REVIEW]`
- **Candidate Head Branch**: `main`

---

## Executive Summary

GP-018 delivers the complete, authoritative customer checkout domain, payment-neutral confirmation handoff, and storefront application surfaces for Gamer Perú. The implementation satisfies strict multi-table relational persistence, race-free concurrency semantics with transaction-scoped PostgreSQL advisory locks, server-authoritative pricing and inventory reservations, accessible responsive UI forms, cryptographically secure attempt IDs with fail-closed UI boundaries, authoritative context refresh upon unavailable methods, terminal state handling for converted carts and unavailable configuration, and real local Supabase browser E2E acceptance:

1. **Relational Commerce Database Architecture**: Physical migration `0009_majestic_madame_web.sql` defines 15 normalized tables across orders, payments, shipments, shipping methods, payment methods, payment instructions, inventory locations, inventory items, inventory reservations, inventory ledger entries, order address snapshots, order pricing snapshots, and database-backed idempotency keys.
2. **Deterministic Cryptographic Authority & Idempotency**: Checkout requests bind to authoritative server-computed HMAC-SHA256 digests and SHA-256 request fingerprints. Concurrency races with identical attempt IDs serialize via `pg_advisory_xact_lock` on the attempt ID hash, guaranteeing that parallel submissions converge to exactly one physical order with idempotent replays (`replayed: true`).
3. **Cryptographically Secure Attempt Identifiers & Safe UI Boundary**: Client attempt ID generation (`src/lib/checkout/attempt-id.ts`) strictly uses cryptographically secure browser entropy (`crypto.randomUUID()` or RFC4122 v4 compliant `crypto.getRandomValues()`), fails closed if secure entropy is unavailable, and contains zero `Math.random()` or pseudo-entropy fallbacks. The UI catches crypto unavailability safely, renders technical explanation, disables submit, and never crashes.
4. **Fail-Closed Atomic Transaction Safety**: All checkout mutations (cart transition `ACTIVE -> CONVERTED`, catalog price snapshotting, address snapshotting, inventory reservations, inventory ledger logging, initial payment `UNPAID` creation, and `OrderPlaced` outbox event creation) execute within a single PostgreSQL transaction. Order number generation recovers conflict-safely from collisions without transaction block aborts (`ON CONFLICT DO NOTHING`).
5. **Customer-Facing Checkout Application Surfaces**:
   - `/checkout`: Responsive 2-column desktop and linear mobile form with contact capture, Peruvian delivery address entry (or saved address selection for authenticated customers), shipping method radio selection with dynamic fee calculation, payment method selection, and real-time order review.
   - `/checkout/confirmacion/[orderNumber]`: Dynamic order confirmation surface showing order status `PENDING`, payment status `UNPAID` ("Pendiente de pago"), delivery details, items breakdown, and totals.
6. **Strict GP-019 Privacy & Data Boundary**: Neither `/checkout` nor `/checkout/confirmacion/[orderNumber]` receives or renders sensitive payment instruction fields (`instruction_text`, `account_identifier`, `recipient_name`, `qr_media_id`), operation-code forms, or voucher upload inputs.
7. **Confirmation Privacy & Order-Existence Non-Disclosure**: Confirmation lookup enforces strict ownership verification (authenticated `customer_id` match or guest HMAC authority binding match). Nonexistent orders and unauthorized/foreign requests return the exact same unified failure contract (`{ success: false, code: "NOT_AVAILABLE", error: "Pedido no disponible." }`), completely eliminating order-existence oracles with zero information disclosure. Confirmation reads are strictly read-only and cause zero database mutations (asserted across orders, payments, reservations, outbox, and carts).
8. **Server-Authoritative Review Change Synchronization & Line-Item Consistency**: When prices or shipping fees change concurrently during checkout submission (`CHECKOUT_REVIEW_CHANGED`), the checkout client consumes authoritative server totals (`authoritativeSubtotalCents`, `authoritativeShippingCents`, `authoritativeTotalCents`), reconciles cart line items from the authoritative context reader, dynamically updates visible UI review cards, presents an accessible warning, and requires an explicit, intentional second user click sending newly reviewed amounts under a fresh secure attempt ID (with zero automatic resubmissions).
9. **Comprehensive Authoritative Typed Recovery**: Explicit typed error handlers with server-authoritative context reconciliation for `IDEMPOTENCY_EXPIRED`, `IDEMPOTENCY_CONFLICT`, `ADDRESS_UNAVAILABLE`, `SHIPPING_METHOD_UNAVAILABLE` (authoritative context refresh), `PAYMENT_METHOD_UNAVAILABLE` (authoritative context refresh), `CHECKOUT_CONFIGURATION_UNAVAILABLE` (terminal fail-closed with retry recovery), `CART_ALREADY_CONVERTED` (terminal state with navigation recovery), `UNAUTHORIZED`, `INSUFFICIENT_STOCK`, `PRODUCT_UNAVAILABLE`, and `SYSTEM_ERROR`.

---

## Scope Delivered vs Explicitly Out of Scope

### Scope Delivered

- **Database Schema (Migration 0009)**: 15 tables supporting orders, payments, inventory reservations, inventory ledger, idempotency keys, and snapshots.
- **Server Runtime Engine (`src/lib/checkout/`)**:
  - `loadCheckoutContext`: Authority resolution, price hydration, fail-closed configuration verification, safe DTO projection.
  - `submitCheckout`: Advisory locking, conflict-safe idempotency verification, stock reservation, ledger logging, outbox event generation.
  - `loadCheckoutConfirmation`: Authority-guarded read-only order confirmation reader with unified `NOT_AVAILABLE` non-disclosure.
  - `attempt-id`: Cryptographically secure attempt-id generation with fail-closed crypto requirements.
- **Storefront Checkout UI (`src/components/checkout/`, `src/app/(storefront)/checkout/`)**:
  - `/checkout` and `/checkout/confirmacion/[orderNumber]` pages (`force-dynamic`, `noindex, nofollow`).
  - Interactive progressive checkout form with contact, delivery address, shipping method, and payment method selection.
  - Authoritative order review totals, review-changed dynamic synchronization, and in-flight submit protection.
  - Neutral confirmation presentation with pending payment status.
  - Cart CTA integration ("Finalizar compra" button in `/carrito` and Drawer).
- **Security & Privacy Enforcement**: Opaque cryptographic attempt IDs, server-derived authority digests, zero leak of payment instruction secrets, and non-disclosure confirmation contract.
- **Automated Testing Suite**: Local PostgreSQL live integration suite (`tests/checkout-integration/checkout-live-scenarios.test.ts`), unit/component suite (`tests/unit/checkout-ui.test.tsx`, `tests/unit/checkout-attempt-id.test.ts`), and Playwright E2E suite (`tests/e2e/checkout-storefront.spec.ts`).

### Explicitly Out of Scope (Deferred to GP-019 / Later Gates)

- **Manual Payment Workflow & Customer Proof Capture**: Deferred exclusively to **GP-019** (`docs/roadmap/GP-019.md`), which receives the created Order + exactly one Payment UNPAID from GP-018 and owns payment instructions, QR presentation, operation-code capture, voucher upload, payment submission, and customer `SUBMITTED` / `VERIFYING` progression.
- **Privileged Admin Payment Verification**: Deferred to **GP-028** (Admin Payment & Verification Operations) according to canonical roadmap and ADR specifications.
- **Reservation Expiry Worker & Background Reconciliation**: Deferred to **GP-021** (Inventory Engine).
- **Courier Logistics & Geocoding API Integrations**: Country is Peru-first; external courier APIs deferred to future shipping integrations.
- **Order Cancellation & Refund Lifecycles**: Deferred to post-checkout order management milestones.

---

## Remaining Business Configuration TBDs (Operational Dependencies)

1. **Production Shipping Rates & SLAs**: Exact base rates for Lima Metropolitana, Lima Provincias, and Departamentos to be configured operationally.
2. **Production Manual Payment Accounts**: Official Yape/Plin phone numbers, recipient holder names, and QR assets to be configured operationally.
3. **Production Inventory Locations**: Fulfillment center location codes to be configured operationally.
4. **Reservation TTL Policy**: Production reservation expiry duration (`CHECKOUT_RESERVATION_TTL_MINUTES`) remains `[TBD BUSINESS DECISION]` (numeric values such as 30 in tests are local/CI fixture values only).

---

## Dependency Next Step

Upon external audit and approval of this closure candidate, the next authorized milestone is:
**GP-019 — Payment Proof Capture & Manual Customer Payment Workflow**

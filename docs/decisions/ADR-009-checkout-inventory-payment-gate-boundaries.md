# ADR-009 — Checkout, Inventory, and Payment Gate Ownership Reconciliation

## Status

ACCEPTED

## Context

Gamer Perú requires an authoritative, duplicate-safe Checkout workflow (**GP-018**) that creates an `Order`, captures delivery address snapshots, computes authoritative integer Soles pricing, reserves stock to prevent oversell, initializes an `UNPAID` payment shell, and records transactional events.

The canonical Commerce Domain Model ([`COMMERCE_DOMAIN_MODEL.md`](../architecture/COMMERCE_DOMAIN_MODEL.md) §22, §25, §26, §60.1) specifies that the atomic Order placement transaction MUST verify `available_to_sell`, lock inventory rows (`SELECT ... FOR UPDATE`), create an `InventoryReservation` (`ACTIVE`), increment `quantity_reserved`, insert an `InventoryLedgerEntry` (`RESERVATION_CREATED`), create a `Payment` shell (`UNPAID`), and insert an `OrderPlaced` outbox event within a single PostgreSQL transaction.

However, the original high-level roadmap sequence created several cross-gate ambiguities and contradictions:

1. **Inventory Contradiction**: The roadmap assigned the entire Inventory domain to **GP-021** (after Checkout), leaving GP-018 without physical inventory tables in schema. Creating orders without inventory reservations would violate canonical oversell prevention, while postponing checkout until after GP-021 would disrupt the roadmap sequence.
2. **Payment Boundary Ambiguity**: **GP-019** explicitly owns manual Yape/Plin payment workflows (QR rendering, operation-code capture, voucher upload, verification workbench). The boundary between GP-018 creating an `UNPAID` payment shell versus GP-019 hosting interactive customer submission required strict definition without inventing sensitive bank account details.
3. **Transactional Outbox Split**: **GP-042** owns EC OS integration. The boundary between GP-018 persisting the `OrderPlaced` outbox record inside the order transaction versus GP-042 dispatching it asynchronously required clear separation to maintain downstream isolation.

## Decision Drivers

- **Stock-Safe Atomic Checkout**: Orders must never be created without verifying physical stock availability and locking inventory rows, guaranteeing final-unit concurrency and zero oversell.
- **Strict Downstream Isolation**: External systems (EC OS, email, analytics) must never be synchronous dependencies of checkout.
- **Separation of Architectural Schema vs. Business Configuration**: Production migrations must define structural schema only. Commercial shipping rates, bank account numbers, QR media, and reservation hold durations must remain server-side domain parameters and never be fabricated in production database migrations.
- **Cohesive Domain Ownership**: Foundation schemas must be introduced cleanly without creating duplicate models across subsequent gates.

## Options Considered

1. **Option 1: Order Creation Without Inventory Reservations in GP-018**: Defer all inventory tables and reservation logic to GP-021; GP-018 creates orders solely on catalog variant active status.
   - _Rejected_: Knowingly violates canonical oversell protection and concurrent final-unit race safety (§60.2).
2. **Option 2: No-Op Inventory Seam in GP-018**: Define an empty interface that simulates stock checks without database enforcement.
   - _Rejected_: Fails to provide real duplicate-safe reservation guarantees and merely masks the contradiction.
3. **Option 3: Phased Kernel Ownership Across Gates (Selected)**: GP-018 introduces the checkout-critical physical schema and reservation kernel; subsequent gates (GP-019, GP-021, GP-042) extend and operate their respective domains.

## Decision

1. **Inventory Domain Split (GP-018 vs. GP-021)**:
   - **GP-018 Ownership**: Owns the checkout-critical physical schema (`inventory_locations`, `inventory_items`, `inventory_reservations`, `inventory_ledger_entries`) and the atomic reservation kernel:
     1. Resolves authoritative `ProductVariant` quantities from the active `Cart`.
     2. Locks relevant `InventoryItem` rows in deterministic order using `SELECT ... FOR UPDATE`.
     3. Computes $\text{available\_to\_sell} = \text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated}$.
     4. Asserts $\text{available\_to\_sell} \ge \text{requested\_quantity}$, failing closed with `INSUFFICIENT_STOCK` if unavailable.
     5. Creates `InventoryReservation` rows (`status = 'ACTIVE'`).
     6. Increments `InventoryItem.quantity_reserved = quantity_reserved + qty`.
     7. Inserts `InventoryLedgerEntry` (`entry_type = 'RESERVATION_CREATED'`).
     8. Sets `expires_at` using the server-configured `RESERVATION_TTL_MINUTES` parameter.
     9. Executes all of the above within the **SAME PostgreSQL ACID transaction** as Order creation and Cart conversion.
   - **GP-021 Ownership**: Owns the broader **Inventory Engine**:
     - Operational stock administration and warehouse receiving.
     - Manual adjustments and reconciliation tooling.
     - Damaged stock and quarantine workflows.
     - Stock allocation upon payment confirmation (`ALLOCATED`).
     - Automated background expiration and release workflows (`RELEASED`).
     - Multi-location routing and low-stock signaling.
     - Admin inventory management interfaces.

2. **Payment Domain Split (GP-018 vs. GP-019)**:
   - **GP-018 Ownership**:
     - Owns the physical schema for `payment_method_configurations`, `payment_instruction_versions`, and `payments`.
     - Provides payment-method selection during checkout (`YAPE_MANUAL`, `PLIN_MANUAL`).
     - Validates that the chosen method is active and references an active `PaymentInstructionVersion`.
     - Atomically inserts exactly one `Payment` row (`status = 'UNPAID'`, `amount_cents = order.total_cents`, `UNIQUE(order_id)`).
     - Renders an order confirmation / handoff surface displaying the created order reference and pending payment status.
   - **GP-019 Ownership**:
     - Owns interactive customer payment instructions and QR code rendering.
     - Owns operation code capture (`PaymentSubmission.operation_code`).
     - Owns optional voucher proof upload to private Cloudflare R2 storage.
     - Owns payment submission and resubmission workflows.
     - Owns Admin payment verification workbench and state transitions (`UNPAID` $\to$ `SUBMITTED` $\to$ `VERIFYING` $\to$ `PAID` / `REJECTED`).

3. **Transactional Outbox Split (GP-018 vs. GP-042)**:
   - **GP-018 Ownership**: Owns the physical `outbox_events` table and atomically inserts the `'OrderPlaced'` event within the order creation transaction prior to commit.
   - **GP-042 Ownership**: Owns background Inngest dispatch workers, retry/delivery infrastructure, and EC OS webhook contracts.

4. **Production Configuration vs. Test Fixture Governance**:
   - Production migrations introduce **structure only**. They must never seed invented production commercial data (shipping rates, delivery SLAs, bank account numbers, Yape/Plin phone numbers, QR media, or warehouse stock quantities).
   - In production, Checkout fails closed if required active configuration (shipping methods, payment instruction versions) is absent.
   - Test suites seed deterministic `TEST-ONLY` fixtures and clean them up safely.
   - `RESERVATION_TTL_MINUTES` remains a server-side configurable domain parameter (`[TBD BUSINESS DECISION]`).

## Consequences

- **Positive**:
  - Eliminates oversell race conditions on concurrent checkouts.
  - Eliminates duplicate order creation through strict idempotency and row-level cart locking.
  - Preserves 100% downstream isolation for core commerce checkout.
  - Establishes clean, non-overlapping boundaries for GP-019, GP-020, GP-021, and GP-042.
- **Operational / Lifecycle Requirements**:
  - The GP-018 database migration is broader than originally scoped, introducing order, payment foundation, outbox, and inventory reservation tables together.
  - Production checkout readiness requires subsequent completion of GP-019 (for customer manual payment submission) and provisioning of real business configuration before public store launch.

## Security / SEO / Performance Impact

- **Security**: Strict transactional locking prevents concurrent final-unit exploitation. Request fingerprinting prevents parameter tampering in idempotent replays.
- **SEO**: Checkout routes (`/checkout`, `/checkout/confirmacion/*`) enforce `force-dynamic`, `robots: { index: false, follow: false }`, and zero sitemap exposure.
- **Performance**: All order, line, address, pricing, inventory, payment, and outbox rows are committed in a single atomic database transaction.

## Migration / Reversal

Physical schema will be codified in migration candidate `0009_order_checkout.sql` during GP-018 CHK2, introducing `orders`, `order_items`, `order_address_snapshots`, `order_pricing_snapshots`, `shipping_methods`, `shipments`, `payment_method_configurations`, `payment_instruction_versions`, `payments`, `idempotency_keys`, `inventory_locations`, `inventory_items`, `inventory_reservations`, `inventory_ledger_entries`, and `outbox_events`.

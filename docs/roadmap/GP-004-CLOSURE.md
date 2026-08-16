# GP-004 — Closure Report

## Checkpoint History

- Original GP-004 Base Checkpoint:
  `b7463a646bef6c1c1d5fe5cdb1e9937919207ebe`

- Initial GP-004 Content:
  `57a6215ecae0a54712b235751a2a893f1c35f1af`

- Initial GP-004 Closure:
  `30dcd2eba3f5ab2851936e290f642b714849baf1`

- Remediation Content Checkpoint:
  `60f86ad1fdaced1fd92cf9108a313da09453d524`

- Remediation Closure Checkpoint:
  `d4a8619010f5465a1d62282ab38bbc01bf722485`

- Final Consistency Content Checkpoint:
  `0f9f9511b62f721dffb6fcb0a67da0438ae3d19e`

---

## Final External Consistency Review

A final domain consistency audit resolved all remaining duplicate state ownership, inventory release paths, and lifecycle transition invariants:

1. **Single Authoritative State Ownership**:
   - Removed duplicate state columns (`payment_status`, `fulfillment_status`) from the `Order` entity definition.
   - Authoritative state is strictly partitioned:
     * **Order Lifecycle**: `Order.status` (`PENDING`, `EXPIRED`, `CONFIRMED`, `PROCESSING`, `FULFILLED`, `CANCELLED`, `REFUNDED`).
     * **Payment Lifecycle**: `Payment.status` (`UNPAID`, `SUBMITTED`, `VERIFYING`, `PAID`, `REJECTED`, `REFUNDED`).
     * **Fulfillment Lifecycle**: `Shipment.status` (`UNFULFILLED`, `READY_TO_PACK`, `PACKED`, `SHIPPED`, `DELIVERED`, `RETURNED`).
     * **Reservation Lifecycle**: `InventoryReservation.status` (`ACTIVE`, `VERIFICATION_HOLD`, `ALLOCATED`, `CONSUMED`, `RELEASED`).
2. **Allocated Inventory Release**:
   - Added canonical `ALLOCATED -> RELEASED` transition in `InventoryReservation` and `ALLOCATION_RELEASED` movement type in `InventoryLedgerEntry` (`allocated_delta = -qty`, `on_hand_delta = 0`, `reserved_delta = 0`) for pre-shipment order cancellations/refunds.
3. **Late-Payment & Unpaid Expiry Reconciled**:
   - Unpaid reservation timeout transitions `Order.status = 'EXPIRED'`, `Reservation.status = 'RELEASED'`, while `Payment.status` remains `'UNPAID'`.
   - Late payment submission records `is_late = true` without modifying the historical `RELEASED` reservation.
   - Admin verification under row lock creates a replacement `InventoryReservation` directly to `ALLOCATED` if stock is available; if stock is sold out, funds are recorded (`PAID`) and immediately refunded (`REFUNDED`), with zero fake stock allocation.
4. **Non-Terminal Rejection & Resubmission Grace**:
   - Added non-terminal payment rejection flow where `Payment.status` returns to `UNPAID` and `InventoryReservation` is held in `VERIFICATION_HOLD` during a configurable grace window (`PAYMENT_RESUBMISSION_GRACE_DURATION`, `[TBD BUSINESS DECISION]`).
5. **Deterministic Version Selection**:
   - `PaymentMethodConfiguration.current_instruction_version_id` and `Category.current_spec_schema_id` establish deterministic current version references for checkout and product validation.
6. **Promotion & Coupon Completeness**:
   - Added explicit `Promotion.priority` for deterministic evaluation order. Parameterized max coupon count per order.
7. **Commission Qualification & Signed Money Corrections**:
   - Replaced hardcoded qualification window with configurable `COMMISSION_QUALIFICATION_WINDOW_DAYS` starting upon delivery. Reconciled monetary constraints to permit signed values for `CommissionAdjustment.amount_cents`.
8. **Truthful Entity Count & GP-005 Handoff**:
   - Accurately categorized 58 domain & system entities + 2 Better Auth tables = 60 total physical table candidates.
   - Clarified that GP-004 provides domain blueprints and schema inputs without mandating full immediate table creation in GP-005.

---

## Domain Model Summary
The canonical **Commerce Domain Model** is established authoritatively in [`docs/architecture/COMMERCE_DOMAIN_MODEL.md`](../architecture/COMMERCE_DOMAIN_MODEL.md). It models all core business entities across 11 bounded contexts: Catalog, Customer & Identity, Cart & Checkout, Inventory & Warehousing, Orders & Snapshots, Manual Payments & Verification, Shipping & Fulfillment, Promotions & Coupons, Referrals & Affiliates, Content & Editorial Story, and Audit & Integration.

---

## Entity Model
Defined 58 domain & system entities plus 2 Better Auth technical tables (60 total physical candidates) organized cleanly into domain modules:
- **Catalog (11)**: `Brand`, `Category`, `Collection`, `ProductCollection`, `Product`, `ProductVariant`, `CategorySpecificationSchema`, `ProductSpecifications`, `ProductStory`, `ProductStoryRevision`, `MediaAsset`.
- **Identity & Customer (4)**: `CustomerProfile`, `CustomerAddress`, `WishlistItem`, `Review`.
- **RBAC (4)**: `Role`, `Permission`, `RolePermission`, `UserRole`.
- **Cart & Checkout (2)**: `Cart`, `CartItem`.
- **Inventory (4)**: `InventoryLocation`, `InventoryItem`, `InventoryLedgerEntry`, `InventoryReservation`.
- **Orders & Snapshots (5)**: `Order`, `OrderItem`, `OrderAddressSnapshot`, `OrderPricingSnapshot`, `OrderPromotionSnapshot`.
- **Payments (6)**: `PaymentMethodConfiguration`, `PaymentInstructionVersion`, `Payment`, `PaymentSubmission`, `PaymentVerification`, `Refund`.
- **Fulfillment (3)**: `ShippingMethod`, `Shipment`, `ShipmentItem`.
- **Promotions (4)**: `Promotion`, `PromotionTarget`, `Coupon`, `CouponRedemption`.
- **Growth (10)**: `ReferralProgram`, `ReferralCode`, `ReferralAttribution`, `Affiliate`, `AffiliateCode`, `AffiliateClick`, `AffiliateAttribution`, `Commission`, `CommissionAdjustment`, `CommissionPayoutBatch`.
- **System & Operations (5)**: `ContentSlot`, `AuditEvent`, `DomainEvent`, `OutboxEvent`, `IdempotencyKey`.
- **Auth Infrastructure (2)**: `AuthUser`, `Session`.

---

## Catalog
- **Product vs. ProductVariant**: `Product` represents conceptual hardware family; `ProductVariant` / SKU is the canonical sellable and inventory unit. Zero "simple product" shortcuts exist.
- **Dynamic Category Specifications**: Modeled using PostgreSQL `JSONB` validated against category-specific Zod schema definitions with versioning (`UNIQUE(category_id, schema_version)`).
- **Product Story Layout**: Structured into 13 modular visual block types stored as validated JSONB with immutable revision history (`ProductStoryRevision`).
- **Collections**: Curated merchandising groupings with `ProductCollection` join relationships.

---

## Money
- Represented strictly as integer minor units in Peruvian Soles (`PEN`, cents), e.g., S/ 129.90 = `12990`.
- Floating-point calculations are strictly forbidden. Subtotals, discounts, shipping, taxes, refunds, and commissions calculate in integer arithmetic.

---

## Inventory
- **Deterministic Availability Formula**:
  $$\text{available\_to\_sell} = \text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated}$$
- **Concurrency & Locking**: `SELECT ... FOR UPDATE` row-level locks on `InventoryItem` during checkout prevent overselling under concurrent purchase attempts.
- **Reservation Lifecycle**:
  1. `ACTIVE`: Reserved at order placement for configurable TTL (`[TBD BUSINESS DECISION]`).
  2. `VERIFICATION_HOLD`: Held upon payment submission; expiration suspended during review.
  3. `ALLOCATED`: Converted upon payment approval.
  4. `CONSUMED`: Deducted on physical parcel shipment dispatch.
  5. `RELEASED`: Returned to sellable stock upon expiration, cancellation, rejection, or pre-shipment refund.
- **Multi-Balance Ledger**: Append-only `InventoryLedgerEntry` records `on_hand_delta`, `reserved_delta`, and `allocated_delta` with resulting balances (`ALLOCATION_RELEASED` movement supported).

---

## Orders
- **Historical Snapshots**: Purchase-time line items (`OrderItem`), address facts (`OrderAddressSnapshot`), pricing breakdowns (`OrderPricingSnapshot`), and applied discounts (`OrderPromotionSnapshot`) are permanently frozen. Future catalog edits or address modifications never alter historical orders.
- **Human Reference**: Non-sequential unguessable identifiers (e.g., `GP-7K9M-2026`) avoid leaking business volume.

---

## State Machines
- **Orthogonal Sub-State Machines**:
  - `Order.status`: `PENDING` $\to$ `EXPIRED` / `CONFIRMED` $\to$ `PROCESSING` $\to$ `FULFILLED` (or `CANCELLED` / `REFUNDED`).
  - `Payment.status`: `UNPAID` $\to$ `SUBMITTED` $\to$ `VERIFYING` $\to$ `PAID` (or `REJECTED` / `REFUNDED`).
  - `Shipment.status`: `UNFULFILLED` $\to$ `READY_TO_PACK` $\to$ `PACKED` $\to$ `SHIPPED` $\to$ `DELIVERED` (or `RETURNED`).
  - `InventoryReservation.status`: `ACTIVE` $\to$ `VERIFICATION_HOLD` $\to$ `ALLOCATED` $\to$ `CONSUMED` (or `RELEASED`).
  - `Commission.status`: `PENDING` $\to$ `QUALIFIED` $\to$ `APPROVED` $\to$ `PAID` (or `VOIDED`).
- **Candidate State Mapping**: Full 1-to-1 derived mapping matrix established for all 10 candidate states from `COMMERCE_SPEC.md`.

---

## Manual Payments
- Canonical v1 methods: `YAPE_MANUAL`, `PLIN_MANUAL` configured via `PaymentMethodConfiguration`.
- Customer submission of operation code and optional voucher image never automatically confirms payment.
- Private voucher uploads reside in isolated Cloudflare R2 bucket (`gamerperu-private-proofs`) accessible exclusively via short-lived (5m) pre-signed URLs after server-side RBAC verification.
- Explicit `PaymentVerification` audit trail captures verifier ID, timestamp, decision, and notes.

---

## Shipping
- Provider-agnostic model: `ShippingMethod` + `Shipment` + `ShipmentItem` with tracking numbers and URLs.
- Courier integrations (Shalom, Olva, domestic services) remain deferred as `[TBD BUSINESS DECISION]`.

---

## Promotions
- Configurable rules: percentage / fixed-amount discounts, minimum spend, max discount caps, date windows, total and per-customer usage limits, scope targets (`PromotionTarget`), and stackability controls with explicit `priority`.
- Applied discounts permanently snapshotted in `OrderPromotionSnapshot`; redemptions tracked concurrency-safe via `CouponRedemption`.

---

## Growth
- **Referrals**: Customer invitations with distinct codes, abuse prevention (self-referral blocking), and conversion rewards.
- **Affiliates**: Commercial promoters with custom codes/links, sliding attribution windows (e.g. 30 days), and distinct commission lifecycle (`PENDING` $\to$ `QUALIFIED` $\to$ `APPROVED` $\to$ `PAID` / `VOIDED`).
- Post-payout refunds record `CommissionAdjustment` without mutating historical paid records.

---

## Audit & Events
- **AuditEvent**: Append-only operational logging capturing actor, action, target entity, sanitized metadata diffs, and IP addresses.
- **DomainEvent**: Internal business event stream (`OrderPlaced`, `PaymentSubmitted`, `PaymentApproved`, etc.).
- **Transactional Outbox**: `OutboxEvent` table inserted in the same transaction as commerce mutations, ensuring at-least-once delivery to Inngest and downstream EC OS without distributed locking. Payloads follow data-minimization principles.

---

## Security Validation
- [x] Authoritative server-side RBAC checks (`requirePermission`) required for all administrative mutations.
- [x] Customer data isolation derived exclusively from verified server session (`session.customerId`).
- [x] Payment vouchers isolated from public CDN; accessed via 5-minute pre-signed URLs with audit logging.
- [x] AI Assistant restricted to allowlisted tool calls and session-verified customer order lookups.
- [x] Master secrets and encryption keys excluded from commerce tables and restricted to server environment variables.

---

## Constraint / Index Strategy
- Strict database constraints: unique SKUs, unique slugs, unique order numbers, unique cart/variant pairs, unique wishlist pairs, positive quantities and monetary values, schema version uniqueness.
- High-performance indexing: B-tree indexes for lookups, GIN full-text search indexes (`to_tsvector('spanish', name)`), and `pg_trgm` indexes for typo tolerance.

---

## Edge Cases
25 critical edge-case scenarios documented with deterministic domain behaviors in Section 63 of `COMMERCE_DOMAIN_MODEL.md` (concurrent stock races, cart price changes, variant delisting, late payment submissions, concurrent admin verifications, downstream EC OS downtime, self-referral attempts, etc.).

---

## Deferred Business Decisions
The following commercial policies remain parameterized `[TBD BUSINESS DECISION]` and will not require architectural schema rewrites:
- Courier selection and rate tables.
- Return/warranty policy durations.
- Numeric reservation hold TTL (`RESERVATION_TTL_MINUTES`, e.g. 15, 30, or 60 minutes).
- Payment resubmission grace duration (`PAYMENT_RESUBMISSION_GRACE_DURATION`).
- Cart expiry duration and max line quantities.
- Affiliate commission percentage tiers and qualification window (`COMMISSION_QUALIFICATION_WINDOW_DAYS`).
- Customer support channels.

---

## GP-005 Handoff
GP-005 (Repository Bootstrap) will consume:
1. Exact entity names and aggregate structures for Drizzle schema modules across all 11 files (`catalog.ts`, `auth.ts`, `customers.ts`, `cart.ts`, `inventory.ts`, `orders.ts`, `payments.ts`, `shipping.ts`, `promotions.ts`, `growth.ts`, `system.ts`).
2. UUIDv7 generation in application layer with PostgreSQL `uuid` columns.
3. Required PostgreSQL extension: `pg_trgm` for typo-tolerant trigram search.
4. Integer Soles currency rules (`PEN` cents).
5. Outbox table and Better Auth session integration interfaces.

---

## Files Changed
- `docs/architecture/COMMERCE_DOMAIN_MODEL.md`: Finalized all 67 sections with single state ownership, allocated inventory release, late-payment reacquisition, non-terminal rejection grace hold, 9-column transition tables, and 25 edge cases.
- `docs/specs/COMMERCE_SPEC.md`: Maintained concise canonical domain reference.
- `docs/specs/PAYMENTS_SPEC.md`: Maintained payment method abstraction and instruction versioning alignment.
- `docs/roadmap/GP-004.md`: Maintained `COMPLETE` status.
- `docs/roadmap/GP-004-CLOSURE.md`: Updated closure report with final consistency review findings.

---

## Scope Validation
- [x] Zero application source code created.
- [x] Zero `package.json` created.
- [x] Zero Drizzle schema files created.
- [x] Zero database migrations created.
- [x] Zero Supabase tables provisioned.
- [x] GP-005 remains `PLANNED`.

---

## Repository Status
- **Branch**: `main`
- **Upstream**: `origin/main`
- **Base Checkpoint**: `b7463a646bef6c1c1d5fe5cdb1e9937919207ebe`
- **Closure Content Checkpoint**: `0f9f9511b62f721dffb6fcb0a67da0438ae3d19e`
- **Working Tree**: Clean (Closure report staged for final closure commit).

---

## Final Status
PASS

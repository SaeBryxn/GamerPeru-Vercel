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

---

## External Domain Review & Remediation

Following external domain-model review, a comprehensive remediation pass resolved all validation artifact gaps, entity relationship inconsistencies, and state machine boundary ambiguities:

1. **Validation Artifact Completion**:
   - **Edge-Case Matrix**: Fully expanded Section 63 to include all 25 originally required scenarios with starting state, command, resulting state, inventory consequence, payment consequence, audit/domain events, and concurrency protection.
   - **Sequence Diagrams**: Fully authored all 7 required Mermaid sequence diagrams in Section 60 (Checkout, Concurrent Stock Race, Yape/Plin Verification, Reservation Expiry, Cancellation/Refund, Affiliate Qualification, Outbox Dispatch).
   - **State Diagrams**: Completed all 6 explicit Mermaid state diagrams in Section 59 (Product Publication, Reservation, Order, Payment, Fulfillment, Commission).
   - **State Transition Tables**: Authored complete transition tables with preconditions, side effects, idempotency rules, audit events, domain events, and forbidden transitions across all 6 lifecycles in Section 61.
   - **Critical Invariants Table**: Rebuilt complete 17-rule critical invariant table in Section 62.
2. **Undeclared Late-Payment Pseudo-States Removed**:
   - Eliminated all references to orphan pseudo-states (`PAYMENT_SUBMITTED_LATE`, `LATE_SUBMISSION`).
   - Standardized late submission handling using canonical `Payment.status = 'SUBMITTED'` + `PaymentSubmission.is_late = true`, with reservation remaining `RELEASED`. Admin evaluates stock availability under lock during verification to either allocate stock (`ALLOCATED`) or issue an external refund (`REFUNDED`).
3. **Refund & Return Model Reconciled**:
   - **Full & Partial Refunds Supported**: Explicitly supported in data model with cumulative cap invariant: $\sum \text{Refund.amount\_cents} \le \text{Order.total\_cents}$. Partial refunds maintain `Payment.status = 'PAID'` and `Order.order_status = 'CONFIRMED'` / `'FULFILLED'` with `refunded_amount_cents > 0`.
   - **Fulfilled Orders & Returns**: Fulfilled delivery history remains permanently recorded (`Shipment.status = 'DELIVERED'`); accepted returns transition `Shipment.status = 'RETURNED'`, and full reimbursement transitions `Order.order_status = 'REFUNDED'`.
   - **Inventory Restock vs. Financial Refund Separation**: Pre-shipment cancellations release reserved/allocated stock without modifying `on_hand`; post-delivery returns increment physical `on_hand` (`on_hand_delta = +qty`) ONLY when physical merchandise is accepted via `movement_type = 'RETURN_RESTOCKED'`.
4. **Order to Reservation Cardinality & Traceability**:
   - Corrected relationship to `Order 1 -> * InventoryReservation` with direct `order_item_id` foreign key linkage for multi-item orders.
5. **Inventory Ledger Multi-Balance Deltas**:
   - Standardized explicit delta fields: `on_hand_delta`, `reserved_delta`, `allocated_delta`, alongside resulting balance snapshots.
6. **Multi-Location Inventory Policy**:
   - Maintained multi-location schema capability (`InventoryLocation` + `InventoryItem`) with deterministic v1 single primary fulfillment warehouse policy (`LOC-LIM-01`).
7. **Collection Domain Added**:
   - Added canonical `Collection` and `ProductCollection` join entities for curated merchandising groupings.
8. **Category Specification Schema Versioning Fixed**:
   - Replaced flawed single-category constraint with `UNIQUE(category_id, schema_version)` to preserve historical specification versions.
9. **Payment Method Abstraction & Instruction Versioning**:
   - Introduced `PaymentMethodConfiguration` (supporting `YAPE_MANUAL` and `PLIN_MANUAL` in v1) and `PaymentInstructionVersion` (freezing exact QR/phone/text instructions shown at checkout).
10. **Promotion Scope, Stacking & Concurrency-Safe Usage**:
    - Added `PromotionTarget` (supporting `ALL`, `PRODUCT`, `PRODUCT_VARIANT`, `CATEGORY`, `COLLECTION` scopes), deterministic evaluation ordering, and `CouponRedemption` with atomic usage limit locks.
11. **Arbitrary Cart Policies Parameterized**:
    - Replaced hardcoded expiry and quantity ceilings with configurable parameters (`CART_EXPIRY_DURATION`, `MAX_CART_LINE_QUANTITY`, `[TBD BUSINESS DECISION]`).
12. **Affiliate Self-Referral Identity Correction**:
    - Corrected self-referral identity check to `affiliate.user_id != customer_profile.user_id`. Treated IP/device fingerprints as operational risk signals.
13. **Post-Payout Commission Adjustments**:
    - Preserved immutability of paid `Commission` records; post-payout refunds append `CommissionAdjustment` records to offset future payout batches.
14. **Customer Privacy Anonymization Reconciled**:
    - Account deletion anonymizes `CustomerProfile`/`CustomerAddress` immediately, while Order PII snapshots are retained for an approved legal retention window (`[TBD LEGAL/RETENTION POLICY]`) before automated text scrubbing.
15. **UUIDv7 Strategy & PostgreSQL Extensions**:
    - Canonicalized PostgreSQL `uuid` column type with application-level UUIDv7 generation in Node.js (RFC 9562 library). Only `pg_trgm` is declared required for search.
16. **GP-005 Handoff Completeness**:
    - All 42 domain entities across all 11 modules indexed for physical Drizzle schema scaffolding in GP-005.

---

## Domain Model Summary
The canonical **Commerce Domain Model** is established authoritatively in [`docs/architecture/COMMERCE_DOMAIN_MODEL.md`](../architecture/COMMERCE_DOMAIN_MODEL.md). It models all core business entities across 11 bounded contexts: Catalog, Customer & Identity, Cart & Checkout, Inventory & Warehousing, Orders & Snapshots, Manual Payments & Verification, Shipping & Fulfillment, Promotions & Coupons, Referrals & Affiliates, Content & Editorial Story, and Audit & Integration.

---

## Entity Model
Defined 42 primary domain entities organized cleanly into domain modules:
- **Catalog**: `Brand`, `Category`, `Collection`, `ProductCollection`, `Product`, `ProductVariant`, `CategorySpecificationSchema`, `ProductSpecifications`, `ProductStory`, `ProductStoryRevision`, `MediaAsset`.
- **Identity & Customer**: `AuthUser` (Better Auth identity boundary), `CustomerProfile`, `CustomerAddress`, `WishlistItem`, `Review`.
- **RBAC**: `Role`, `Permission`, `RolePermission`, `UserRole`.
- **Cart & Checkout**: `Cart`, `CartItem`.
- **Inventory**: `InventoryLocation`, `InventoryItem`, `InventoryLedgerEntry`, `InventoryReservation`.
- **Orders & Snapshots**: `Order`, `OrderItem`, `OrderAddressSnapshot`, `OrderPricingSnapshot`, `OrderPromotionSnapshot`.
- **Payments**: `PaymentMethodConfiguration`, `PaymentInstructionVersion`, `Payment`, `PaymentSubmission`, `PaymentVerification`, `Refund`.
- **Fulfillment**: `ShippingMethod`, `Shipment`, `ShipmentItem`.
- **Promotions**: `Promotion`, `PromotionTarget`, `Coupon`, `CouponRedemption`.
- **Growth**: `ReferralProgram`, `ReferralCode`, `ReferralAttribution`, `Affiliate`, `AffiliateCode`, `AffiliateClick`, `AffiliateAttribution`, `Commission`, `CommissionAdjustment`, `CommissionPayoutBatch`.
- **System & Operations**: `ContentSlot`, `AuditEvent`, `DomainEvent`, `OutboxEvent`, `IdempotencyKey`.

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
  5. `RELEASED`: Returned to sellable stock upon expiration, cancellation, or rejection.
- **Multi-Balance Ledger**: Append-only `InventoryLedgerEntry` records `on_hand_delta`, `reserved_delta`, and `allocated_delta` with resulting balances.

---

## Orders
- **Historical Snapshots**: Purchase-time line items (`OrderItem`), address facts (`OrderAddressSnapshot`), pricing breakdowns (`OrderPricingSnapshot`), and applied discounts (`OrderPromotionSnapshot`) are permanently frozen. Future catalog edits or address modifications never alter historical orders.
- **Human Reference**: Non-sequential unguessable identifiers (e.g., `GP-7K9M-2026`) avoid leaking business volume.

---

## State Machines
- **Orthogonal Sub-State Machines**:
  - `Order.order_status`: `PENDING` $\to$ `CONFIRMED` $\to$ `PROCESSING` $\to$ `FULFILLED` (or `CANCELLED` / `REFUNDED`).
  - `Payment.status`: `UNPAID` $\to$ `SUBMITTED` $\to$ `VERIFYING` $\to$ `PAID` (or `REJECTED` / `REFUNDED`).
  - `Shipment.status`: `UNFULFILLED` $\to$ `READY_TO_PACK` $\to$ `PACKED` $\to$ `SHIPPED` $\to$ `DELIVERED` (or `RETURNED`).
  - `InventoryReservation.status`: `ACTIVE` $\to$ `VERIFICATION_HOLD` $\to$ `ALLOCATED` $\to$ `CONSUMED` (or `RELEASED`).
  - `Commission.status`: `PENDING` $\to$ `QUALIFIED` $\to$ `APPROVED` $\to$ `PAID` (or `VOIDED`).
- **Candidate State Mapping**: Full 1-to-1 mapping matrix established for all 10 candidate states from `COMMERCE_SPEC.md`.

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
- Configurable rules: percentage / fixed-amount discounts, minimum spend, max discount caps, date windows, total and per-customer usage limits, scope targets (`PromotionTarget`), and stackability controls.
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
- **Transactional Outbox**: `OutboxEvent` table inserted in the same transaction as commerce mutations, ensuring at-least-once delivery to Inngest and downstream EC OS without distributed locking.

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
- Cart expiry duration and max line quantities.
- Affiliate commission percentage tiers.
- Customer support channels.

---

## GP-005 Handoff
GP-005 (Repository Bootstrap) will consume:
1. Exact entity names and aggregate structures for Drizzle schema modules across all 11 files (`catalog.ts`, `auth.ts`, `customers.ts`, `cart.ts`, `inventory.ts`, `orders.ts`, `payments.ts`, `shipping.ts`, `promotions.ts`, `growth.ts`, `system.ts`).
2. UUIDv7 generation in application layer with PostgreSQL `uuid` columns.
3. Required PostgreSQL extension: `pg_trgm`.
4. Integer Soles currency rules (`PEN` cents).
5. Outbox table and Better Auth session integration interfaces.

---

## Files Changed
- `docs/architecture/COMMERCE_DOMAIN_MODEL.md`: Reconciled all 67 sections with 25 edge cases, 7 sequence diagrams, 6 state diagrams, 6 transition tables, critical invariants, Collection domain, payment method abstraction, instruction versioning, multi-balance inventory ledger, and UUIDv7 application generation.
- `docs/specs/COMMERCE_SPEC.md`: Updated to establish `COMMERCE_DOMAIN_MODEL.md` as the authoritative domain reference.
- `docs/specs/PAYMENTS_SPEC.md`: Updated for consistency with payment method configuration, instruction versioning, and late payment workflows.
- `docs/roadmap/GP-004.md`: Maintained `COMPLETE` status.
- `docs/roadmap/GP-004-CLOSURE.md`: Created and updated closure report with external review remediation details.

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
- **Closure Content Checkpoint**: `60f86ad1fdaced1fd92cf9108a313da09453d524`
- **Working Tree**: Clean (Closure report staged for final closure commit).

---

## Final Status
PASS

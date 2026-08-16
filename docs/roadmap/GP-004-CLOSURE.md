# GP-004 — Closure Report

## Base Checkpoint
`b7463a646bef6c1c1d5fe5cdb1e9937919207ebe`

## Closure Content Checkpoint
`57a6215ecae0a54712b235751a2a893f1c35f1af`

---

## Domain Model Summary
The canonical **Commerce Domain Model** is established authoritatively in [`docs/architecture/COMMERCE_DOMAIN_MODEL.md`](../architecture/COMMERCE_DOMAIN_MODEL.md). It models all core business entities across 11 bounded contexts: Catalog, Customer & Identity, Cart & Checkout, Inventory & Warehousing, Orders & Snapshots, Manual Payments & Verification, Shipping & Fulfillment, Promotions & Coupons, Referrals & Affiliates, Content & Editorial Story, and Audit & Integration.

---

## Entity Model
Defined 42 primary domain entities organized cleanly into domain modules:
- **Catalog**: `Brand`, `Category`, `Product`, `ProductVariant`, `CategorySpecificationSchema`, `ProductSpecifications`, `ProductStory`, `ProductStoryRevision`, `MediaAsset`.
- **Identity & Customer**: `AuthUser` (Better Auth identity boundary), `CustomerProfile`, `CustomerAddress`, `WishlistItem`, `Review`.
- **RBAC**: `Role`, `Permission`, `RolePermission`, `UserRole`.
- **Cart & Checkout**: `Cart`, `CartItem`.
- **Inventory**: `InventoryLocation`, `InventoryItem`, `InventoryLedgerEntry`, `InventoryReservation`.
- **Orders & Snapshots**: `Order`, `OrderItem`, `OrderAddressSnapshot`, `OrderPricingSnapshot`, `OrderPromotionSnapshot`.
- **Payments**: `Payment`, `PaymentSubmission`, `PaymentVerification`, `Refund`.
- **Fulfillment**: `ShippingMethod`, `Shipment`, `ShipmentItem`.
- **Promotions**: `Promotion`, `Coupon`.
- **Growth**: `ReferralProgram`, `ReferralCode`, `ReferralAttribution`, `Affiliate`, `AffiliateCode`, `AffiliateClick`, `AffiliateAttribution`, `Commission`, `CommissionPayoutBatch`.
- **System & Operations**: `ContentSlot`, `AuditEvent`, `DomainEvent`, `OutboxEvent`, `IdempotencyKey`.

---

## Catalog
- **Product vs. ProductVariant**: `Product` represents conceptual hardware family; `ProductVariant` / SKU is the canonical sellable and inventory unit. Zero "simple product" shortcuts exist.
- **Dynamic Category Specifications**: Modeled using PostgreSQL `JSONB` validated against category-specific Zod schema definitions with versioning (`CategorySpecificationSchema`).
- **Product Story Layout**: Structured into 13 modular visual block types stored as validated JSONB with immutable revision history (`ProductStoryRevision`).

---

## Money
- Represented strictly as integer minor units in Peruvian Soles (`PEN`, cents), e.g., S/ 129.90 = `12990`.
- Floating-point calculations are strictly forbidden. Subtotals, discounts, shipping, taxes, and commissions calculate in integer arithmetic.

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
- **Immutable Ledger**: Append-only `InventoryLedgerEntry` records every movement with before/after balances.

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
- **Candidate State Mapping**: Full 1-to-1 mapping matrix established for all 10 candidate states from `COMMERCE_SPEC.md`.

---

## Manual Payments
- Canonical v1 methods: `YAPE_MANUAL`, `PLIN_MANUAL`.
- Customer submission of operation code and optional voucher image never automatically confirms payment.
- Private voucher uploads reside in isolated Cloudflare R2 bucket (`gamerperu-private-proofs`) accessible exclusively via short-lived (5m) pre-signed URLs after server-side RBAC verification.
- Explicit `PaymentVerification` audit trail captures verifier ID, timestamp, decision, and notes.

---

## Shipping
- Provider-agnostic model: `ShippingMethod` + `Shipment` + `ShipmentItem` with tracking numbers and URLs.
- Courier integrations (Shalom, Olva, domestic services) remain deferred as `[TBD BUSINESS DECISION]`.

---

## Promotions
- Configurable rules: percentage / fixed-amount discounts, minimum spend, max discount caps, date windows, total and per-customer usage limits, and stackability controls.
- Applied discounts permanently snapshotted in `OrderPromotionSnapshot`.

---

## Growth
- **Referrals**: Customer invitations with distinct codes, abuse prevention (self-referral blocking), and conversion rewards.
- **Affiliates**: Commercial promoters with custom codes/links, sliding attribution windows (e.g. 30 days), and distinct commission lifecycle (`PENDING` $\to$ `QUALIFIED` $\to$ `APPROVED` $\to$ `PAID` / `VOIDED`).
- Returns and cancellations deterministically invalidate or void pending commissions.

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
- Strict database constraints: unique SKUs, unique slugs, unique order numbers, unique cart/variant pairs, unique wishlist pairs, positive quantities and monetary values.
- High-performance indexing: B-tree indexes for lookups, GIN full-text search indexes (`to_tsvector('spanish', name)`), and `pg_trgm` indexes for typo tolerance.

---

## Edge Cases
25 critical edge-case scenarios documented with deterministic domain behaviors in Section 63 of `COMMERCE_DOMAIN_MODEL.md` (concurrent stock races, cart price changes, variant delisting, late payment submissions, concurrent admin verifications, downstream EC OS downtime, self-referral attempts, etc.).

---

## Deferred Business Decisions
The following commercial policies remain parameterized `[TBD BUSINESS DECISION]` and will not require architectural schema rewrites:
- Courier selection and rate tables.
- Return/warranty policy durations.
- Numeric reservation hold TTL (e.g. 15, 30, or 60 minutes).
- Affiliate commission percentage tiers.
- Customer support channels.

---

## GP-005 Handoff
GP-005 (Repository Bootstrap) will consume:
1. Exact entity names and aggregate structures for Drizzle schema modules (`catalog.ts`, `auth.ts`, `customers.ts`, `cart.ts`, `inventory.ts`, `orders.ts`, `payments.ts`, `shipping.ts`, `promotions.ts`, `growth.ts`, `system.ts`).
2. Required PostgreSQL extensions: `uuid-ossp`, `pgcrypto`, `pg_trgm`.
3. Integer Soles currency rules (`PEN` cents).
4. Outbox table and Better Auth session integration interfaces.

---

## Files Changed
- `docs/architecture/COMMERCE_DOMAIN_MODEL.md`: Created 67-section canonical domain specification.
- `docs/specs/COMMERCE_SPEC.md`: Updated to establish `COMMERCE_DOMAIN_MODEL.md` as the authoritative domain reference and resolved state mapping ambiguities.
- `docs/roadmap/GP-004.md`: Updated status to `COMPLETE`.
- `docs/roadmap/GP-004-CLOSURE.md`: Created closure report.

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
- **Closure Content Checkpoint**: `57a6215ecae0a54712b235751a2a893f1c35f1af`
- **Working Tree**: Clean (Closure report staged for final closure commit).

---

## Final Status
PASS

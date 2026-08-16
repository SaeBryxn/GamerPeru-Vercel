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

- Consistency Content Checkpoint:
  `0f9f9511b62f721dffb6fcb0a67da0438ae3d19e`

- Consistency Closure Checkpoint:
  `3ee0e67d2718a73ce0998dcc164bbc50889e75d5`

- Schema Readiness Content Checkpoint:
  `89791016ff3b1207d10376e2f4db260d068a6c8c`

- Schema Readiness Closure Checkpoint:
  `9fcee874e433e0597253db30b4ef3ed60a07e1e6`

- Supabase Auth Amendment Checkpoint:
  `b7c785680c66bff77352625b196cc88a1cc0d000`

- Supabase Auth Semantics Checkpoint:
  `322e522c5111815c33d1e299d17713b668e69b5a`

---

## Supabase Auth Identity Lifecycle Verification

Following external architecture review, identity lifecycle semantics and relational foreign key boundaries were reconciled:

1. **Identity Detachment & Account Deletion**:
   - `CustomerProfile.auth_user_id`: Enforces `UNIQUE WHERE auth_user_id IS NOT NULL`. Required for active linked accounts, but set to `NULL` upon customer account deletion/anonymization without deleting historical orders or addresses.
   - Account deletion anonymizes customer PII, detaches `CustomerProfile.auth_user_id = NULL`, removes `UserRole` records, and deletes/disables the Supabase Auth user while permanently preserving historical commerce facts (Orders, Payments, Refunds, Inventory ledger, Audit events).
2. **Historical Staff & Actor Foreign Keys**:
   - Historical staff references (`created_by_auth_user_id`, `verifier_auth_user_id`, `actor_auth_user_id`, `moderated_by_auth_user_id`, `processed_by_auth_user_id`) use nullable FKs with `ON DELETE SET NULL`, ensuring staff identity deletion never blocks record deletion or cascade-deletes historical commerce data.
   - Permanent `AuditEvent` records preserve historical actor identity strings independently of foreign key relationships.
3. **Ephemeral Authorization**:
   - `UserRole.auth_user_id` is an ephemeral assignment and is cleanly removed when an Auth user is deleted.
4. **Affiliate Account Detachment**:
   - `Affiliate.auth_user_id`: Enforces `UNIQUE WHERE auth_user_id IS NOT NULL`. An affiliate can be detached or suspended (`auth_user_id = NULL`) without deleting historical attribution clicks, commissions, or payout records.
5. **Idempotent Profile Provisioning Concurrency**:
   - Application-level `ensureCustomerProfile(auth_user_id)` is concurrency-safe under the unique constraint on non-null `auth_user_id`, ensuring simultaneous first requests after OAuth callback produce exactly one `CustomerProfile`.
6. **Final Physical Entity Count**:
   - Exactly **58 Gamer Perú domain & system physical table candidates** across 11 schema modules (unchanged).

---

## Owner Authentication Domain Amendment

Following the owner architecture decision adopting **Supabase Auth** as the canonical identity provider, the commerce domain model and schema blueprints were reconciled:

1. **Provider-Owned Auth Schema Separation**:
   - Supabase Auth manages its internal `auth` schema (`auth.users`, credentials, OAuth identities, refresh tokens).
   - Removed Better Auth application tables (`user`, `session`, `account`, `verification`) from the Gamer Perú Drizzle schema blueprint.
   - Gamer Perú domain tables reference `auth.users.id` (`UUID`) via `auth_user_id`.
2. **Canonical Identity References**:
   - `CustomerProfile.auth_user_id`: `UUID` (FK $\to$ `auth.users(id)`, Nullable on detachment, `UNIQUE WHERE auth_user_id IS NOT NULL`).
   - `UserRole.auth_user_id`: `UUID` (FK $\to$ `auth.users(id)`).
   - Staff/Actor references (`created_by_auth_user_id`, `verifier_auth_user_id`, `actor_auth_user_id`, `moderated_by_auth_user_id`, `processed_by_auth_user_id`, `Affiliate.auth_user_id`) standardly reference `auth.users.id` (`UUID`).
3. **CustomerProfile Provisioning & Account Linking**:
   - Idempotent `ensureCustomerProfile(auth_user_id)` creates `CustomerProfile` on first login (supporting both Email/Password and Google OAuth).
   - Linked Google and password credentials belonging to the same Supabase user resolve to the same `CustomerProfile`.
4. **Final Gamer Perú Physical Entity Count**:
   - Exactly **58 Gamer Perú domain & system physical table candidates** across 11 modules.
   - Provider-owned internal `auth` tables are excluded from Gamer Perú Drizzle migrations.
5. **Zero Data Migration Cost**:
   - Executed prior to repository bootstrap (GP-005), requiring zero code refactoring or database data migration.

---

## Final Schema-Readiness External Audit & Remediation

A final schema-readiness external audit resolved all remaining authentication model classifications, payment state semantics, and relational constraints:

1. **Payment `REJECTED` Semantics Reconciled**:
   - Customer/Admin cancellation of an unpaid order transitions `Order.status` $\to$ `CANCELLED`, leaves `Payment.status` as `UNPAID` (no REJECTED transition), and releases `InventoryReservation` $\to$ `RELEASED`.
   - `Payment.status = 'REJECTED'` represents an actual terminal payment evidence/verification rejection.
2. **Auditable Verification Decisions**:
   - `PaymentVerification.decision` standardized as `ENUM('APPROVED', 'REJECTED_RETRYABLE', 'REJECTED_TERMINAL')`.
   - Retryable rejections transition `Payment.status` $\to$ `UNPAID`, maintain `InventoryReservation` in `VERIFICATION_HOLD`, and set `Payment.resubmission_grace_expires_at`.
   - Post-deadline expiration without resubmission enters an operational Admin-resolution queue condition without automatically releasing stock.
3. **Late Payment Reacquisition & Sold-Out Path**:
   - Reacquisition of late stock requires all-or-nothing locking across all required `InventoryItem` records. If all are available, replacement reservations are created in `ACTIVE` and transitioned in the same transaction `ACTIVE` $\to$ `ALLOCATED`. Historical `RELEASED` reservations remain immutable.
   - If stock is sold out but bank funds were confirmed: `Payment.status` transitions `SUBMITTED`/`VERIFYING` $\to$ `PAID` (Order remains `EXPIRED`, zero stock allocated), immediately followed by full external refund recording: `Payment.status` $\to$ `REFUNDED`, `Order.status` $\to$ `REFUNDED`.
4. **Shipment v1 Cardinality**:
   - Standardized one active outbound `Shipment` per `Order` operationally in v1 while maintaining `Order 1 -> * Shipment` schema extensibility for future split fulfillment.
5. **Coupon & Promotion Controls**:
   - Parameterized `MAX_COUPONS_PER_ORDER` (`[TBD BUSINESS DECISION]`) and added `UNIQUE(coupon_id, order_id)`.
   - `CouponRedemption` supports `APPLIED` and `VOIDED` lifecycle states, allowing future restoration without deleting historical audit records.
   - Coupons with `per_customer_limit` require authenticated customer identity.
6. **Customer & Cart Integrity**:
   - `CustomerProfile.default_shipping_address_id` is the sole authoritative default-address pointer (removed duplicate `is_default` from `CustomerAddress`).
   - Added strict cart ownership invariants (at most one active cart per customer/session).
7. **Refund Concurrency**:
   - Enforced row-level locking on `Payment` during refund processing to recompute `refundable_remaining_cents` and guarantee $\sum \text{Refund} \le \text{Total}$.
8. **Event Versioning & Outbox Idempotency**:
   - Added `event_version: INTEGER` to `DomainEvent` and `OutboxEvent`.
   - `OutboxEvent.id` established as the canonical stable `event_id` and downstream idempotency key.
9. **Growth Attribution Precedence & Commission Payout Traceability**:
   - Added configurable `GROWTH_ATTRIBUTION_PRECEDENCE` and `AFFILIATE_ATTRIBUTION_WINDOW_DAYS`.
   - `Commission` enforces 1-to-1 linkage with `AffiliateAttribution`.
   - `CommissionPayoutBatch` links commissions and applied adjustments for full financial traceability without selecting a payout provider.

---

## Domain Model Summary

The canonical **Commerce Domain Model** is established authoritatively in [`docs/architecture/COMMERCE_DOMAIN_MODEL.md`](../architecture/COMMERCE_DOMAIN_MODEL.md). It models all core business entities across 11 bounded contexts: Catalog, Customer & Identity, Cart & Checkout, Inventory & Warehousing, Orders & Snapshots, Manual Payments & Verification, Shipping & Fulfillment, Promotions & Coupons, Referrals & Affiliates, Content & Editorial Story, and Audit & Integration.

---

## Entity Model

Defined 58 Gamer Perú domain & system entities organized cleanly into domain modules:

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

---

## Catalog

- **Product vs. ProductVariant**: `Product` represents conceptual hardware family; `ProductVariant` / SKU is the canonical sellable and inventory unit. Zero "simple product" shortcuts exist.
- **Dynamic Category Specifications**: Modeled using PostgreSQL `JSONB` validated against category-specific Zod schema definitions with versioning (`UNIQUE(category_id, schema_version)`).
- **Product Story Layout**: Structured into 13 modular visual block types stored as validated JSONB with immutable revision history (`ProductStoryRevision`).
- **Collections**: Curated merchandising groupings with `ProductCollection` join relationships.

---

## Money

- Represented strictly as integer minor units in Peruvian Soles (`PEN`, cents), e.g., S/ 129.90 = `12990`.
- Standard monetary values must be $\ge 0$; signed adjustment values (`CommissionAdjustment.amount_cents`) may be negative for clawbacks.
- Floating-point calculations are strictly forbidden.

---

## Inventory

- **Deterministic Availability Formula**:
  $$\text{available\_to\_sell} = \text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated}$$
- **Concurrency & Locking**: `SELECT ... FOR UPDATE` row-level locks on `InventoryItem` during checkout prevent overselling under concurrent purchase attempts.
- **Reservation Lifecycle**:
  1. `ACTIVE`: Reserved at order placement for configurable TTL (`[TBD BUSINESS DECISION]`).
  2. `VERIFICATION_HOLD`: Held upon payment submission; expiration suspended during review.
  3. `ALLOCATED`: Converted upon payment approval (`ACTIVE -> ALLOCATED` supported for late-payment reacquisition under lock).
  4. `CONSUMED`: Deducted on physical parcel shipment dispatch.
  5. `RELEASED`: Returned to sellable stock upon expiration, cancellation, rejection, or pre-shipment refund (`ALLOCATION_RELEASED`).
- **Multi-Balance Ledger**: Append-only `InventoryLedgerEntry` records `on_hand_delta`, `reserved_delta`, and `allocated_delta` with resulting balances.

---

## Orders

- **Historical Snapshots**: Purchase-time line items (`OrderItem`), address facts (`OrderAddressSnapshot`), pricing breakdowns (`OrderPricingSnapshot`), and applied discounts (`OrderPromotionSnapshot`) are permanently frozen.
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
- Explicit `PaymentVerification` audit trail captures verifier ID, timestamp, decision (`APPROVED`, `REJECTED_RETRYABLE`, `REJECTED_TERMINAL`), and notes.

---

## Shipping

- Provider-agnostic model: `ShippingMethod` + `Shipment` + `ShipmentItem` with tracking numbers and URLs.
- Operational v1 single active shipment per order with extensible multi-shipment schema.
- Courier integrations (Shalom, Olva, domestic services) remain deferred as `[TBD BUSINESS DECISION]`.

---

## Promotions

- Configurable rules: percentage / fixed-amount discounts, minimum spend, max discount caps, date windows, total and per-customer usage limits, scope targets (`PromotionTarget`), and stackability controls with explicit `priority`.
- Applied discounts permanently snapshotted in `OrderPromotionSnapshot`; redemptions tracked concurrency-safe via `CouponRedemption` (`APPLIED` / `VOIDED`).

---

## Growth

- **Referrals**: Customer invitations with distinct codes, abuse prevention (self-referral blocking), and conversion rewards.
- **Affiliates**: Commercial promoters with custom codes/links, sliding attribution windows, and distinct commission lifecycle (`PENDING` $\to$ `QUALIFIED` $\to$ `APPROVED` $\to$ `PAID` / `VOIDED`).
- Post-payout refunds record `CommissionAdjustment` without mutating historical paid records.

---

## Audit & Events

- **AuditEvent**: Append-only operational logging capturing actor, action, target entity, sanitized metadata diffs, and IP addresses.
- **DomainEvent**: Internal business event stream with explicit `event_version`.
- **Transactional Outbox**: `OutboxEvent` table with `id` as stable idempotency key, ensuring at-least-once delivery to Inngest and downstream EC OS without distributed locking. Payloads follow data-minimization principles.

---

## Security Validation

- [x] Authoritative server-side RBAC checks (`requirePermission`) required for all administrative mutations.
- [x] Customer data isolation derived exclusively from verified server session (`getClaims()` $\to$ `auth_user_id` $\to$ `CustomerProfile.id`).
- [x] Payment vouchers isolated from public CDN; accessed via 5-minute pre-signed URLs with audit logging.
- [x] AI Assistant restricted to allowlisted tool calls and session-verified customer order lookups.
- [x] Master secrets and encryption keys excluded from commerce tables and restricted to server environment variables.

---

## Constraint / Index Strategy

- Strict database constraints: unique SKUs, unique slugs, unique order numbers, unique cart/variant pairs, unique wishlist pairs, positive quantities and monetary values, schema version uniqueness, parent version consistency, coupon uniqueness per order.
- High-performance indexing: B-tree indexes for lookups, GIN full-text search indexes (`to_tsvector('spanish', name)`), and `pg_trgm` indexes for typo tolerance.

---

## Edge Cases

25 critical edge-case scenarios documented with deterministic domain behaviors in Section 63 of `COMMERCE_DOMAIN_MODEL.md`.

---

## Deferred Business Decisions

The following commercial policies remain parameterized `[TBD BUSINESS DECISION]` and will not require architectural schema rewrites:

- Courier selection and rate tables.
- Return/warranty policy durations.
- Numeric reservation hold TTL (`RESERVATION_TTL_MINUTES`, e.g. 15, 30, or 60 minutes).
- Payment resubmission grace duration (`PAYMENT_RESUBMISSION_GRACE_DURATION`).
- Cart expiry duration and max line quantities.
- Max coupons per order (`MAX_COUPONS_PER_ORDER`).
- Growth attribution precedence (`GROWTH_ATTRIBUTION_PRECEDENCE`).
- Affiliate attribution window (`AFFILIATE_ATTRIBUTION_WINDOW_DAYS`).
- Affiliate commission percentage tiers and qualification window (`COMMISSION_QUALIFICATION_WINDOW_DAYS`).
- Customer support channels.

---

## GP-005 Handoff

GP-005 (Repository Bootstrap) will consume:

1. Exact entity names and aggregate structures for Drizzle schema modules across all 11 files (`catalog.ts`, `rbac.ts`, `customers.ts`, `cart.ts`, `inventory.ts`, `orders.ts`, `payments.ts`, `shipping.ts`, `promotions.ts`, `growth.ts`, `system.ts`).
2. UUIDv7 generation in application layer with PostgreSQL `uuid` columns.
3. Supabase Auth client/server utility contracts (`@supabase/supabase-js`, pinned `@supabase/ssr` version) with request-scoped client factories.
4. Primary server identity verification via `getClaims()` against cached JWKS.
5. Required PostgreSQL extension: `pg_trgm` for typo-tolerant trigram search.
6. Integer Soles currency rules (`PEN` cents).
7. Outbox table and verified server-side identity interfaces.

---

## Files Changed

- `docs/architecture/COMMERCE_DOMAIN_MODEL.md`: Reconciled all 67 sections with Supabase Auth identity boundary (`auth.users.id UUID`), `auth_user_id` detachment model, `getClaims()` server verification, and 58 physical entity candidate blueprint.
- `docs/architecture/TECHNOLOGY_ARCHITECTURE.md`: Amended architecture specification adopting Supabase Auth with Email/Password + Google OAuth, `getClaims()` verification, and separated email pipelines.
- `docs/decisions/ADR-003-authentication-authorization-rbac.md`: Amended ADR-003 with official `@supabase/ssr` shared cookie model, `getClaims()` primary verification, and identity detachment lifecycle.
- `docs/decisions/ADR-006-communications-analytics-observability.md`: Updated email pipeline architecture separating Auth SMTP and Inngest API.
- `docs/roadmap/GP-015.md`: Updated future authentication task scope for Supabase Auth, `getClaims()`, and regression test suites.
- `docs/roadmap/GP-003-CLOSURE.md`: Appended `## Supabase Auth External Semantics Verification`.
- `docs/roadmap/GP-004-CLOSURE.md`: Appended `## Supabase Auth Identity Lifecycle Verification`.

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
- **Closure Content Checkpoint**: `322e522c5111815c33d1e299d17713b668e69b5a`
- **Working Tree**: Clean (Closure report staged for final closure commit).

---

## Final Status

PASS

# Gamer Perú — Canonical Commerce Domain Model Specification

---

## 1. Executive Summary

This document defines the canonical **Commerce Domain Model** for **Gamer Perú** (`gamerperu.com`). It establishes the authoritative entities, aggregates, state machines, business invariants, data relationships, transactional boundaries, concurrency controls, and lifecycle rules required for multi-brand gaming peripherals e-commerce in Peru.

Following the technology architecture established in **GP-003** (Modular Monolith, Next.js 16 Active LTS, Supabase PostgreSQL 16+, Drizzle ORM, Supabase Auth, Cloudflare R2, and Inngest), this domain model provides the single source of truth for all domain entities and business workflows implemented in **GP-005** and subsequent roadmap gates.

---

## 2. Domain Principles

1. **PostgreSQL as Authoritative Source of Truth**: Commerce state, inventory levels, order facts, and financial transactions are governed exclusively by deterministic PostgreSQL transactions. Browser/client state is treated as untrusted presentation.
2. **ProductVariant as Sellable Unit**: Inventory, pricing, SKUs, and cart line items attach exclusively to `ProductVariant`. No "simple product" bypass exists.
3. **Integer Money Representation**: All monetary values are represented as integer minor units in Peruvian Soles (`PEN`, cents) to prevent floating-point inaccuracies. Standard monetary fields must be $\ge 0$; explicit adjustment fields may be signed.
4. **Immutable Order Snapshots**: Order line items, applied discounts, customer delivery addresses, and payment instruction versions are frozen at purchase time and never mutate when catalog or customer data changes.
5. **Human-Verified Manual Payments**: For canonical v1 methods (`YAPE_MANUAL`, `PLIN_MANUAL`), customer submission of an operation code or voucher enters a verification workflow; funds are confirmed only upon explicit server-side Admin approval.
6. **Auditable Multi-Balance Inventory Ledger**: Every stock transition records explicit deltas for on-hand, reserved, and allocated balances with an immutable ledger movement.
7. **Downstream Isolation**: External provider failures (EC OS, AI providers, email, analytics) never invalidate or roll back core storefront transactions.
8. **AI as Advisory Layer**: Artificial intelligence models never hold authority over prices, stock, order transitions, or sensitive credentials.

---

## 3. Bounded Context & Module Map

```mermaid
graph TD
    subgraph "Catalog Context"
        Brand --> Product
        Category --> Product
        Category --> CategorySpecSchema[CategorySpecificationSchema]
        Collection --> ProductCollection
        Product --> ProductCollection
        Product --> ProductVariant
        Product --> ProductStory
        Product --> ProductSpecs[ProductSpecifications]
        ProductVariant --> MediaAsset
    end

    subgraph "Customer & Identity Context (Supabase Auth & Domain)"
        SupabaseAuth[Supabase Auth auth.users UUID] --> CustomerProfile
        CustomerProfile --> CustomerAddress
        CustomerProfile --> WishlistItem
        CustomerProfile --> Review
        SupabaseAuth --> UserRole
        Role --> UserRole
        Role --> RolePermission
        Permission --> RolePermission
    end

    subgraph "Cart & Checkout Context"
        Cart --> CartItem
        CartItem --> ProductVariant
        Cart --> Promotion
        Cart --> Coupon
    end

    subgraph "Inventory Context"
        InventoryLocation --> InventoryItem
        ProductVariant --> InventoryItem
        InventoryItem --> InventoryLedgerEntry
        InventoryItem --> InventoryReservation
    end

    subgraph "Order & Payment Context"
        Order --> OrderItem
        OrderItem --> ProductVariant
        Order --> OrderAddressSnapshot
        Order --> OrderPricingSnapshot
        Order --> OrderPromotionSnapshot
        Order --> InventoryReservation
        Order --> Payment
        PaymentMethodConfig[PaymentMethodConfiguration] --> Payment
        PaymentInstructionVersion --> Payment
        Payment --> PaymentSubmission
        Payment --> PaymentVerification
        Order --> Shipment
        Shipment --> ShipmentItem
        Payment --> Refund
    end

    subgraph "Growth Context"
        ReferralProgram --> ReferralCode
        ReferralCode --> ReferralAttribution
        Affiliate --> AffiliateCode
        AffiliateCode --> AffiliateClick
        AffiliateClick --> AffiliateAttribution
        AffiliateAttribution --> Commission
        Commission --> CommissionAdjustment
        CommissionPayoutBatch --> Commission
        CommissionPayoutBatch --> CommissionAdjustment
        Order --> AffiliateAttribution
        Order --> ReferralAttribution
    end

    subgraph "Audit & Integration Context"
        AuditEvent
        DomainEvent
        OutboxEvent
        IdempotencyKey
    end
```

---

## 4. Identifier Strategy

To prevent business volume leakage while maintaining index locality and clean operational references, identifiers are categorized into distinct types:

| Identifier Type | Format | Example | Generation & Use |
|---|---|---|---|
| **Internal Entity ID** | `UUIDv7` (36 chars) | `019156a2-9b2f-7c1a-8e2b-4e1b2c3d4e5f` | Primary key across all PostgreSQL tables; time-ordered for optimal B-tree indexing. Generated at application layer. |
| **Auth User ID** | `UUID` (36 chars) | `a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11` | Primary key of `auth.users` managed by Supabase Auth; referenced via `auth_user_id`. |
| **Human Order Number** | `GP-` + Random Alphanumeric (8 chars) | `GP-7K9M-2026` | Public customer-facing reference; unguessable and non-sequential. |
| **SKU (Stock Keeping Unit)** | Structured Alphanumeric | `WLM-BX-MAG-BLK-8K` | Machine and warehouse identifier per `ProductVariant`. |
| **Public Slug** | Kebab-case string | `wlmouse-beast-x-magnesium` | URL-safe identifier for Brands, Categories, Collections, and Products. |
| **Coupon Code** | Uppercase Alphanumeric | `LANZAMIENTO10` | Public or private promo code entered at checkout. |
| **Referral Code** | `REF-` + Uppercase Alphanumeric | `REF-LIMA99` | Customer invitation identifier. |
| **Affiliate Code** | `PRO-` + Uppercase Alphanumeric | `PRO-SHOOTER` | Registered commercial partner tracking code. |

---

## 5. Money & Currency

- **Canonical Currency**: `PEN` (Peruvian Soles, ISO 4217).
- **Storage Type**: Integer minor units (`INTEGER` / `BIGINT` in cents).
- **Calculation Rules**:
  - `S/ 129.90` is stored as `12990`.
  - `S/ 1.00` is stored as `100`.
  - All arithmetic (subtotals, discounts, shipping, taxes, refunds, commissions) is performed in integer cents. Floating-point types (`FLOAT`, `DOUBLE`) are strictly forbidden for financial calculations.
- **Financial Field Invariants**:
  - Standard monetary values must be $\ge 0$ (`unit_price_cents`, `compare_at_price_cents`, `discount_cents`, `shipping_cents`, `subtotal_cents`, `total_cents`, `amount_cents`).
  - Signed monetary adjustment values (`CommissionAdjustment.amount_cents`) are negative for clawbacks/refunds ($< 0$) or positive for manual additions.
  - `subtotal_cents = sum(quantity * unit_price_cents)`
  - `total_cents = subtotal_cents - discount_cents + shipping_cents` (must be $\ge 0$)
  - `Payment.refunded_amount_cents = sum(Refund.amount_cents) <= Payment.amount_cents`

---

## 6. Time Model

- **Storage Standard**: Canonical UTC timestamps stored as `TIMESTAMPTZ` (timestamp with time zone) in PostgreSQL.
- **Display Standard**: Application presentation layers format timestamps in Peru local time (`America/Lima`, UTC-5) without altering stored UTC values.
- **Canonical Lifecycle Timestamps**:
  - `created_at`: Instant record was inserted.
  - `updated_at`: Instant record was last modified.
  - `published_at`: Instant product/story/content became publicly visible.
  - `expires_at`: Instant reservation, coupon, or session becomes invalid.
  - `submitted_at`: Instant customer submitted payment operation code/proof.
  - `verified_at`: Instant admin verified and approved/rejected payment.
  - `cancelled_at`: Instant order or reservation was terminated.
  - `shipped_at`: Instant courier received parcel.
  - `delivered_at`: Instant customer received order.

---

## 7. Data Classification

| Classification | Description | Examples | Access Policy |
|---|---|---|---|
| **PUBLIC** | Published marketing and catalog data. | Product names, public specs, published story blocks, prices, brand logos. | Crawlable, cached on CDN, open access. |
| **CUSTOMER_PRIVATE** | Personal customer details and order history. | Saved addresses, customer names, personal orders, wishlist. | Restricted strictly to authenticated owning customer and authorized staff. |
| **SENSITIVE_OPERATIONAL** | Financial evidence and operational vouchers. | Yape/Plin operation codes, payment proof images, staff verification notes. | Admin RBAC only; private R2 signed URLs with 5m TTL; excluded from public logs. |
| **INTERNAL** | Business metrics, margins, supplier data. | Variant unit cost (`cost_cents`), staff audit logs, unapproved AI research drafts. | Admin RBAC only; never exposed to customer APIs or public AI Customer Assistant. |
| **SECRET** | System credentials and master keys. | AI provider master encryption keys, auth secrets, database credentials. | Server runtime environment variables only; never stored in commerce tables. |

---

## 8. Catalog Aggregate

The Catalog Aggregate models gaming hardware products, multi-brand taxonomy, curated collections, structured category-specific technical attributes, and editorial storytelling.

```text
+-----------------------------------------------------------------------------------+
|                                CATALOG AGGREGATE                                  |
|                                                                                   |
|  [Brand] 1 --- * [Product] 1 --- * [ProductVariant] 1 --- * [InventoryItem]       |
|                     |                   |                                         |
|                     | 1                 + --- * [MediaAsset]                      |
|                     + --- 1 [ProductSpecifications] (JSONB validated by Schema)   |
|                     |                                                             |
|                     + --- 1 [ProductStory] 1 --- * [ProductStoryRevision] (Blocks)|
|                                                                                   |
|  [Category] 1 --- * [Product]                                                     |
|      |                                                                            |
|      + --- * [CategorySpecificationSchema] (Versioned JSONB Schema Definitions)   |
|                                                                                   |
|  [Collection] 1 --- * [ProductCollection] * --- 1 [Product]                       |
+-----------------------------------------------------------------------------------+
```

---

## 9. Brand

Represents hardware manufacturers (e.g., WLMouse, Wooting, Lamzu, Pulsar, Endgame Gear, Artisan).

- **Entity Attributes**:
  - `id`: `UUIDv7` (PK)
  - `name`: `VARCHAR(100)` (Unique)
  - `slug`: `VARCHAR(100)` (Unique, URL-safe)
  - `description`: `TEXT` (Nullable)
  - `website_url`: `VARCHAR(255)` (Nullable)
  - `logo_media_id`: `UUIDv7` (FK $\to$ `MediaAsset`, Nullable)
  - `status`: `ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED')`
  - `created_at`, `updated_at`: `TIMESTAMPTZ`

---

## 10. Category

Represents the multi-tier gaming peripherals taxonomy (e.g., Mice, Keyboards, Audio, Mousepads, Accessories).

- **Entity Attributes**:
  - `id`: `UUIDv7` (PK)
  - `name`: `VARCHAR(100)`
  - `slug`: `VARCHAR(100)` (Unique)
  - `parent_id`: `UUIDv7` (FK $\to$ `Category.id`, Nullable for root categories)
  - `current_spec_schema_id`: `UUIDv7` (FK $\to$ `CategorySpecificationSchema.id`, Nullable)
  - `description`: `TEXT` (Nullable)
  - `display_order`: `INTEGER` (Default `0`)
  - `status`: `ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED')`
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **Parent Consistency Invariant**: `Category.current_spec_schema_id` must reference a `CategorySpecificationSchema` whose `category_id` equals `Category.id`.

---

## 11. Collection

Represents curated merchandising groupings (e.g., "Wireless Ultralight Mice", "Hall Effect Keyboards", "Artisan FX Series", "Torneo Lima 2026 Specials").

- **Entity Attributes**:
  - `id`: `UUIDv7` (PK)
  - `name`: `VARCHAR(150)`
  - `slug`: `VARCHAR(150)` (Unique, URL-safe)
  - `description`: `TEXT` (Nullable)
  - `hero_media_id`: `UUIDv7` (FK $\to$ `MediaAsset.id`, Nullable)
  - `status`: `ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED')` (Default `DRAFT`)
  - `display_order`: `INTEGER` (Default `0`)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **ProductCollection (Membership) Entity**:
  - `id`: `UUIDv7` (PK)
  - `collection_id`: `UUIDv7` (FK $\to$ `Collection.id`, Required)
  - `product_id`: `UUIDv7` (FK $\to$ `Product.id`, Required)
  - `display_order`: `INTEGER` (Default `0`)
  - `created_at`: `TIMESTAMPTZ`
  - *Unique Constraint*: `(collection_id, product_id)`

---

## 12. Product

Represents the conceptual hardware model or product family (e.g., "WLMouse Beast X", "Wooting 80HE").

- **Entity Attributes**:
  - `id`: `UUIDv7` (PK)
  - `brand_id`: `UUIDv7` (FK $\to$ `Brand.id`, Required)
  - `category_id`: `UUIDv7` (FK $\to$ `Category.id`, Required)
  - `name`: `VARCHAR(200)` (e.g., "Beast X Magnesium Wireless Gaming Mouse")
  - `slug`: `VARCHAR(200)` (Unique)
  - `subtitle`: `VARCHAR(255)` (Nullable)
  - `description`: `TEXT` (Rich markdown / editorial description)
  - `status`: `ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED')` (Default `DRAFT`)
  - `is_featured`: `BOOLEAN` (Default `false`)
  - `primary_media_id`: `UUIDv7` (FK $\to$ `MediaAsset`, Nullable)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`

---

## 13. ProductVariant

Represents the concrete sellable SKU (e.g., "Beast X - Black / Omron Optical Switches").

- **Entity Attributes**:
  - `id`: `UUIDv7` (PK)
  - `product_id`: `UUIDv7` (FK $\to$ `Product.id`, Required)
  - `sku`: `VARCHAR(50)` (Unique, Required)
  - `title`: `VARCHAR(150)` (e.g., "Black / Omron Optical")
  - `price_cents`: `INTEGER` (Selling price in Soles, Required, $> 0$)
  - `compare_at_price_cents`: `INTEGER` (Original / strikethrough price, Nullable)
  - `cost_cents`: `INTEGER` (Internal wholesale cost in Soles, Nullable, Admin only)
  - `weight_grams`: `INTEGER` (Physical product weight, Nullable)
  - `attributes`: `JSONB` (Structured variant swatches: `{"color": "Black", "switch": "Omron Optical", "layout": "ANSI"}`)
  - `status`: `ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED')` (Default `ACTIVE`)
  - `display_order`: `INTEGER` (Default `0`)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **Invariants**:
  - Every Product must have at least one ProductVariant to be sellable.
  - Cart line items and Order items reference `ProductVariant.id`.

---

## 14. Technical Specifications & Versioning

Hardware attributes are structured dynamically per category using JSONB validated against versioned category-specific schemas.

- **CategorySpecificationSchema Entity**:
  - `id`: `UUIDv7` (PK)
  - `category_id`: `UUIDv7` (FK $\to$ `Category.id`, Required)
  - `schema_version`: `INTEGER` (e.g., `1`, `2`)
  - `field_definitions`: `JSONB` (Array of attribute definitions: name, key, data type, unit, filterable, required)
  - `is_active`: `BOOLEAN` (Default `true`)
  - `created_at`: `TIMESTAMPTZ`
  - *Unique Constraint*: `(category_id, schema_version)`
- **ProductSpecifications Entity**:
  - `product_id`: `UUIDv7` (PK, FK $\to$ `Product.id`)
  - `schema_id`: `UUIDv7` (FK $\to$ `CategorySpecificationSchema.id`, Required)
  - `schema_version`: `INTEGER`
  - `spec_values`: `JSONB` (Key-value map validated against category schema, e.g., `{"sensor": "PAW3950", "weight": "39g", "polling_rate": "8000Hz"}`)
  - `updated_at`: `TIMESTAMPTZ`
- **Evolution Invariant**: Creating a new schema version does not overwrite prior versions. `Category.current_spec_schema_id` identifies the canonical schema for new validation, while existing products remain linked to their recorded `schema_id`.

---

## 15. Product Story

Editorial rich media storytelling layouts for flagship PDPs, structured into 13 modular visual block types.

- **ProductStory Entity**:
  - `product_id`: `UUIDv7` (PK, FK $\to$ `Product.id`)
  - `published_revision_id`: `UUIDv7` (FK $\to$ `ProductStoryRevision.id`, Nullable)
  - `updated_at`: `TIMESTAMPTZ`
- **ProductStoryRevision Entity**:
  - `id`: `UUIDv7` (PK)
  - `product_id`: `UUIDv7` (FK $\to$ `Product.id`)
  - `revision_number`: `INTEGER` (Sequential per product)
  - `status`: `ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED')`
  - `blocks`: `JSONB` (Array of structured block definitions: `block_id`, `type`, `order`, `payload`)
  - `published_at`: `TIMESTAMPTZ` (Nullable)
  - `created_by_auth_user_id`: `UUID` (Nullable FK $\to$ `auth.users(id)`, `ON DELETE SET NULL`)
  - `created_at`: `TIMESTAMPTZ`
- **Canonical 13 Block Types**: `HeroMedia`, `FullBleedImage`, `ImageText`, `StatHighlight`, `SpecFeature`, `Video`, `Gallery`, `Comparison`, `Dimensions`, `BoxContents`, `TechnicalSpecs`, `FAQ`, `RelatedProducts`.

---

## 16. Media Assets

Encapsulates metadata for binary objects stored in Cloudflare R2.

- **Entity Attributes**:
  - `id`: `UUIDv7` (PK)
  - `object_key`: `VARCHAR(500)` (Unique, e.g., `products/wlmouse/beastx/hero-black.webp`)
  - `security_class`: `ENUM('PUBLIC_MEDIA', 'PRIVATE_PAYMENT_PROOF', 'PRIVATE_BACKUP')`
  - `media_type`: `ENUM('IMAGE', 'VIDEO', 'DOCUMENT')`
  - `mime_type`: `VARCHAR(100)` (e.g., `image/webp`, `image/jpeg`, `video/mp4`)
  - `file_size_bytes`: `INTEGER`
  - `width`: `INTEGER` (Nullable)
  - `height`: `INTEGER` (Nullable)
  - `alt_text`: `VARCHAR(255)` (Nullable)
  - `checksum_sha256`: `VARCHAR(64)` (Nullable)
  - `created_at`: `TIMESTAMPTZ`

---

## 17. User & Authentication Boundary — Supabase Auth

Separates Supabase-managed identity mechanics from the Gamer Perú commerce domain.

- **Provider-Owned Identity Architecture**:
  - Supabase Auth manages its internal `auth` schema (`auth.users`, credentials, OAuth identities, refresh tokens).
  - Gamer Perú / Drizzle does NOT own, migrate, or alter internal Supabase `auth` tables.
  - Stable Integration Boundary: `auth.users.id` (`UUID`).
- **Canonical v1 Authentication Methods**:
  1. `EMAIL_PASSWORD`: Standard customer registration, email confirmation, login, and password recovery.
  2. `GOOGLE`: Google OAuth 2.0 with PKCE authorization flow for streamlined "Continuar con Google".
- **Cookie & SSR Session Architecture (`@supabase/ssr`)**:
  - `@supabase/ssr` manages session cookies shared between browser and server (`SameSite=Lax`, `Secure` in production, `Path=/`).
  - Standard Supabase SSR session cookies are NOT HttpOnly because the browser-side Supabase client (`createBrowserClient`) needs access to session tokens to maintain and refresh client state.
  - The access token is a short-lived JWT; the refresh token maintains and rotates the active session.
  - Token validity, revocation, and expiration are controlled by Supabase Auth.
  - Possession of a cookie alone is NEVER proof of identity; server-side execution must independently verify JWT authenticity.
- **Server Identity Verification Strategy**:
  - **Primary (`getClaims()`)**: Server actions, route handlers, and Server Components primarily verify identity using `getClaims()` (validating JWT signature against cached project JWKS), avoiding an unnecessary network roundtrip to the Auth server.
  - **Fresh User Record (`getUser()`)**: Used when Gamer Perú specifically requires the authoritative user record directly from Supabase Auth servers (e.g. verifying updated email confirmation status or administrative user checks).
  - **Non-Authoritative (`getSession()`)**: Used only when raw token metadata is required; `getSession()` user data alone is explicitly NOT trusted as authorization proof in server code.
  - **Conceptual Helper (`getVerifiedAuthContext()`)**: GP-015 will implement a request-scoped helper that creates the Supabase server client, validates claims with `getClaims()`, extracts `auth_user_id` from the verified `sub` claim, and resolves `CustomerProfile` or RBAC roles.
- **Request-Scoped Server Client Lifetime on Vercel**:
  - Supabase server clients containing request-specific session state must be created within the current request scope.
  - Shared module-level authenticated Supabase clients are strictly forbidden to prevent session state leakage across serverless requests or reused compute instances.
- **Authenticated-Route Caching Policy**:
  - Authenticated customer and admin routes must not use ISR if session refresh can occur and must not publicly cache responses containing `Set-Cookie`.
  - User-specific authenticated pages render dynamically (`no-store` / `force-dynamic`).
  - Public catalog routes remain independently cacheable via ISR and CDN edge caching.
- **Package Maturity Note**:
  - `@supabase/ssr` is the official recommended package but continues to evolve its API surface; GP-005 / GP-015 will pin a tested version and version upgrades require auth regression tests.
- **Google OAuth Scope & Identity Linking**:
  - Scopes are strictly limited to minimum login/profile permissions: `openid`, `email`, `profile`.
  - No Google provider access tokens (`provider_token`) or refresh tokens (`provider_refresh_token`) are stored in Gamer Perú domain tables.
  - Supabase Auth automatically links OAuth identities sharing the same verified email to a single Supabase user record.
  - If a customer first authenticated via Google and later sets a password, Supabase Auth links both identities under the same `auth_user_id`, mapping to the existing `CustomerProfile`.
- **Identity Detachment & Account Deletion Lifecycle**:
  - `CustomerProfile.auth_user_id` is required for active linked accounts (`UNIQUE WHERE auth_user_id IS NOT NULL`), but becomes `NULL` upon customer account deletion/anonymization.
  - Account deletion flow:
    1. Authenticate and authorize deletion request;
    2. Apply approved legal retention policy (`[TBD LEGAL/RETENTION POLICY]`);
    3. Anonymize `CustomerProfile` and saved `CustomerAddress` records;
    4. Remove `UserRole` assignments;
    5. Detach `CustomerProfile.auth_user_id = NULL`;
    6. Delete/disable the Supabase Auth user record;
    7. Permanently preserve Orders, Payments, Refunds, Inventory ledger entries, and Audit events.
  - Historical staff references (`created_by_auth_user_id`, `verifier_auth_user_id`, `actor_auth_user_id`, `moderated_by_auth_user_id`, `processed_by_auth_user_id`) use nullable FK (`ON DELETE SET NULL`) while immutable `AuditEvent` logs preserve actor audit strings.
  - `Affiliate.auth_user_id` is nullable on detachment (`UNIQUE WHERE auth_user_id IS NOT NULL`) without deleting historical clicks, commissions, or payouts.
- **Idempotent Profile Provisioning Concurrency**:
  - Application-level `ensureCustomerProfile(auth_user_id)` provisions the profile idempotently on first authenticated login.
  - Concurrency protection: unique non-null constraint on `CustomerProfile.auth_user_id` guarantees that simultaneous first requests after OAuth callback produce exactly one `CustomerProfile`.
- **Authentication Emails**:
  - Production signup confirmations and password recovery emails are routed through **Resend custom SMTP** configured in Supabase Auth project settings.

---

## 18. Customer Profile

Stores customer-facing commerce profile data linked 1-to-1 with Supabase Auth's `auth.users`.

- **Entity Attributes**:
  - `id`: `UUIDv7` (PK)
  - `auth_user_id`: `UUID` (FK $\to$ `auth.users(id)`, Nullable on detachment, `UNIQUE WHERE auth_user_id IS NOT NULL`)
  - `first_name`: `VARCHAR(100)`
  - `last_name`: `VARCHAR(100)`
  - `phone`: `VARCHAR(20)` (Nullable)
  - `document_type`: `ENUM('DNI', 'CE', 'RUC', 'PASSPORT')` (Nullable)
  - `document_number`: `VARCHAR(20)` (Nullable)
  - `default_shipping_address_id`: `UUIDv7` (FK $\to$ `CustomerAddress.id`, Nullable)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **Default Address Authority**: `CustomerProfile.default_shipping_address_id` is the sole authoritative default-address pointer.

---

## 19. RBAC Domain

Enforces authoritative server-side role-based access control.

- **Role Entity**: `id` (`UUIDv7`), `name` (`VARCHAR(50)`, Unique, e.g., `SUPER_ADMIN`, `ADMIN_CATALOG`, `ADMIN_ORDERS`, `ADMIN_SUPPORT`, `CUSTOMER`), `description` (`TEXT`).
- **Permission Entity**: `id` (`UUIDv7`), `name` (`VARCHAR(100)`, Unique, e.g., `orders:verify`, `catalog:publish`, `ai:manage_credentials`).
- **RolePermission Entity**: `role_id` (`UUIDv7`), `permission_id` (`UUIDv7`) (Composite PK).
- **UserRole Entity**: `auth_user_id` (`UUID`, FK $\to$ `auth.users(id)`), `role_id` (`UUIDv7`, FK $\to$ `Role.id`) (Composite PK `(auth_user_id, role_id)`).

---

## 20. Address & Address Snapshot

- **CustomerAddress Entity**: Reusable customer address book entries.
  - `id`: `UUIDv7` (PK)
  - `customer_id`: `UUIDv7` (FK $\to$ `CustomerProfile.id`)
  - `recipient_name`: `VARCHAR(150)`
  - `phone`: `VARCHAR(20)`
  - `street_address`: `VARCHAR(255)`
  - `apartment_suite`: `VARCHAR(100)` (Nullable)
  - `department`: `VARCHAR(100)` (e.g., "Lima")
  - `province`: `VARCHAR(100)` (e.g., "Lima")
  - `district`: `VARCHAR(100)` (e.g., "Miraflores")
  - `postal_code`: `VARCHAR(20)` (Nullable)
  - `reference_notes`: `TEXT` (Nullable)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **OrderAddressSnapshot Entity**: Immutable snapshot of the delivery address frozen at checkout time.
  - `id`: `UUIDv7` (PK)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`, Unique)
  - `recipient_name`, `phone`, `street_address`, `apartment_suite`, `department`, `province`, `district`, `postal_code`, `reference_notes` (Copied as immutable values).
  - `created_at`: `TIMESTAMPTZ`

---

## 21. Cart Domain

Models transient shopping intent for both guest sessions and authenticated customers.

- **Cart Entity**:
  - `id`: `UUIDv7` (PK)
  - `customer_id`: `UUIDv7` (FK $\to$ `CustomerProfile.id`, Nullable for anonymous guests)
  - `session_token`: `VARCHAR(255)` (Unique for anonymous guest carts, Nullable when authenticated)
  - `status`: `ENUM('ACTIVE', 'CONVERTED', 'ABANDONED')` (Default `ACTIVE`)
  - `currency`: `VARCHAR(3)` (Default `'PEN'`)
  - `expires_at`: `TIMESTAMPTZ` (Configured by `CART_EXPIRY_DURATION`, `[TBD BUSINESS DECISION]`)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **Cart Ownership Invariants**:
  - An active anonymous Cart is owned exclusively by `session_token` (`customer_id IS NULL`).
  - An active authenticated Cart is owned exclusively by `customer_id` (`session_token IS NULL`).
  - At most one `ACTIVE` Cart per authenticated customer (`customer_id`).
  - At most one `ACTIVE` anonymous Cart per session token (`session_token`).
  - Merge on login resolves to one authoritative `ACTIVE` customer Cart.
- **CartItem Entity**:
  - `id`: `UUIDv7` (PK)
  - `cart_id`: `UUIDv7` (FK $\to$ `Cart.id`)
  - `variant_id`: `UUIDv7` (FK $\to$ `ProductVariant.id`)
  - `quantity`: `INTEGER` ($> 0$, bounded by configurable `MAX_CART_LINE_QUANTITY`, `[TBD BUSINESS DECISION]`)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
  - *Unique Constraint*: `(cart_id, variant_id)`

---

## 22. Checkout Boundary

Checkout is an atomic server-side mutation that validates preconditions and creates an `Order`.

- **Precondition Validations**:
  1. All referenced `ProductVariant` items exist, are `ACTIVE`, and their parent `Product` is `PUBLISHED`.
  2. Authoritative prices in Soles are recomputed from the database; client-supplied line prices are discarded.
  3. Applied Coupon/Promotion is validated for date eligibility, minimum spend, category/product scope, and usage limits.
  4. Real-time inventory availability ($\text{available\_to\_sell} \ge \text{requested\_quantity}$) is verified with row-level locks on the primary fulfillment location.
  5. Delivery address and active payment method selection are validated.
- **Atomic Creation Transaction**: Executes order creation, line snapshotting, discount recording, and inventory reservation within a single PostgreSQL ACID transaction.

---

## 23. Inventory Model

The inventory model tracks physical stock, allocations, and temporary reservations across warehouse locations.

- **InventoryLocation Entity**:
  - `id`: `UUIDv7` (PK)
  - `name`: `VARCHAR(100)` (e.g., "Almacén Central Lima")
  - `code`: `VARCHAR(50)` (Unique, e.g., "LOC-LIM-01")
  - `is_active`: `BOOLEAN` (Default `true`)
  - `created_at`: `TIMESTAMPTZ`
- **InventoryItem Entity**:
  - `id`: `UUIDv7` (PK)
  - `variant_id`: `UUIDv7` (FK $\to$ `ProductVariant.id`)
  - `location_id`: `UUIDv7` (FK $\to$ `InventoryLocation.id`)
  - `quantity_on_hand`: `INTEGER` (Physical units in warehouse, $\ge 0$)
  - `quantity_reserved`: `INTEGER` (Units temporarily held during checkout/verification, $\ge 0$)
  - `quantity_allocated`: `INTEGER` (Units confirmed for paid orders awaiting dispatch, $\ge 0$)
  - `reorder_point`: `INTEGER` (Default `0`)
  - `updated_at`: `TIMESTAMPTZ`
  - *Unique Constraint*: `(variant_id, location_id)`
- **Multi-Location Policy**: The schema fully supports multiple locations. Initial launch operates with one primary fulfillment warehouse (`LOC-LIM-01`). All checkout reservations lock `(variant_id, default_location_id)` row.

---

## 24. Inventory Ledger

An immutable append-only ledger recording every stock transition with explicit multi-balance deltas.

- **InventoryLedgerEntry Entity**:
  - `id`: `UUIDv7` (PK)
  - `inventory_item_id`: `UUIDv7` (FK $\to$ `InventoryItem.id`)
  - `movement_type`: `ENUM('RECEIVING', 'MANUAL_ADJUSTMENT', 'RESERVATION_CREATED', 'RESERVATION_EXPIRED', 'RESERVATION_RELEASED', 'ALLOCATION_CONFIRMED', 'ALLOCATION_RELEASED', 'FULFILLMENT_DISPATCHED', 'RETURN_RESTOCKED')`
  - `on_hand_delta`: `INTEGER` (Change in physical warehouse stock)
  - `reserved_delta`: `INTEGER` (Change in reserved hold balance)
  - `allocated_delta`: `INTEGER` (Change in confirmed allocation balance)
  - `quantity_on_hand_after`: `INTEGER`
  - `quantity_reserved_after`: `INTEGER`
  - `quantity_allocated_after`: `INTEGER`
  - `reference_type`: `ENUM('ORDER', 'PURCHASE_ORDER', 'RMA', 'MANUAL_AUDIT')`
  - `reference_id`: `VARCHAR(255)`
  - `actor_id`: `VARCHAR(255)` (Staff ID or `'SYSTEM'`)
  - `notes`: `TEXT` (Nullable)
  - `created_at`: `TIMESTAMPTZ`

---

## 25. Inventory Reservation & Allocation Model

- **InventoryReservation Entity**:
  - `id`: `UUIDv7` (PK)
  - `inventory_item_id`: `UUIDv7` (FK $\to$ `InventoryItem.id`, Required)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`, Required)
  - `order_item_id`: `UUIDv7` (FK $\to$ `OrderItem.id`, Required)
  - `quantity`: `INTEGER` ($> 0$)
  - `status`: `ENUM('ACTIVE', 'VERIFICATION_HOLD', 'ALLOCATED', 'CONSUMED', 'RELEASED')`
  - `expires_at`: `TIMESTAMPTZ` (Initial unpaid checkout window)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
  - *Non-Terminal Uniqueness Invariant*: At most one non-terminal reservation (`ACTIVE`, `VERIFICATION_HOLD`, `ALLOCATED`) may exist per `order_item_id` at any time. Historical terminal reservations (`RELEASED`, `CONSUMED`) may coexist for audit history.
- **Reservation Lifecycle**:
  1. `ACTIVE`: Created at order placement. `reserved_delta = +qty`. `expires_at = NOW() + RESERVATION_TTL_MINUTES` (`[TBD BUSINESS DECISION]`).
  2. `VERIFICATION_HOLD`: When customer submits operation code/voucher, reservation transitions to `VERIFICATION_HOLD`. Expiry timer is suspended during review.
  3. `ALLOCATED`: Upon Admin payment approval (`PAID`), reservation transitions to `ALLOCATED` (`reserved_delta = -qty`, `allocated_delta = +qty`).
  4. `CONSUMED`: On parcel dispatch, reservation becomes `CONSUMED` (`allocated_delta = -qty`, `on_hand_delta = -qty`).
  5. `RELEASED`: If order is cancelled, rejected, unpaid reservation expires, or allocated pre-shipment order is refunded, reservation transitions to `RELEASED`:
     - From `ACTIVE` / `VERIFICATION_HOLD`: `reserved_delta = -qty`.
     - From `ALLOCATED`: `allocated_delta = -qty` (logged as `ALLOCATION_RELEASED`).

---

## 26. Inventory Concurrency & Stock Allocation

To guarantee zero overselling under high concurrency:
1. All checkout mutations lock the relevant `InventoryItem` row using `SELECT ... FOR UPDATE WHERE variant_id = $1 AND location_id = $2`.
2. Availability is strictly evaluated inside the transaction:
   $$\text{available\_to\_sell} = \text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated}$$
3. If $\text{available\_to\_sell} < \text{requested\_quantity}$, the transaction aborts with an `INSUFFICIENT_STOCK` domain exception.
4. If available, `quantity_reserved` is incremented and an `InventoryReservation` record is inserted.

---

## 27. Order Aggregate & Authoritative State Ownership

The central operational entity representing a committed purchase.

- **Authoritative Orthogonal State Separation**:
  - **Order Lifecycle**: Stored strictly in `Order.status`.
  - **Payment Lifecycle**: Stored strictly in `Payment.status`.
  - **Fulfillment Lifecycle**: Stored strictly in `Shipment.status`.
  - **Reservation Lifecycle**: Stored strictly in `InventoryReservation.status`.
- **Order Entity**:
  - `id`: `UUIDv7` (PK)
  - `order_number`: `VARCHAR(30)` (Unique human reference, e.g., `GP-7K9M-2026`)
  - `customer_id`: `UUIDv7` (FK $\to$ `CustomerProfile.id`, Nullable for guest purchases)
  - `customer_email`: `VARCHAR(255)` (Snapshot at purchase)
  - `customer_phone`: `VARCHAR(20)` (Snapshot at purchase)
  - `status`: `ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'FULFILLED', 'CANCELLED', 'EXPIRED', 'REFUNDED')` (Default `PENDING`)
  - `subtotal_cents`: `INTEGER` (Sum of line items)
  - `discount_cents`: `INTEGER` (Total discount applied, Default `0`)
  - `shipping_cents`: `INTEGER` (Delivery fee, Default `0`)
  - `total_cents`: `INTEGER` (Final amount payable in Soles)
  - `currency`: `VARCHAR(3)` (Default `'PEN'`)
  - `customer_notes`: `TEXT` (Nullable)
  - `cancelled_at`: `TIMESTAMPTZ` (Nullable)
  - `cancel_reason`: `VARCHAR(255)` (Nullable)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`

---

## 28. Order Snapshots & Candidate State Mapping

- **OrderItem Entity**: Immutable record of purchased variants.
  - `id`: `UUIDv7` (PK)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`)
  - `variant_id`: `UUIDv7` (FK $\to$ `ProductVariant.id`)
  - `sku_snapshot`: `VARCHAR(50)`
  - `product_name_snapshot`: `VARCHAR(200)`
  - `variant_title_snapshot`: `VARCHAR(150)`
  - `unit_price_cents_snapshot`: `INTEGER`
  - `quantity`: `INTEGER` ($> 0$)
  - `line_total_cents`: `INTEGER` ($= \text{quantity} \times \text{unit\_price\_cents\_snapshot}$)
  - `created_at`: `TIMESTAMPTZ`
- **OrderPricingSnapshot Entity**: Records tax metadata, discount allocations, and shipping fees applied.
- **OrderPromotionSnapshot Entity**: Records coupon codes and promotion rule summaries applied to the order.

### Derived Candidate State Mapping Matrix

| COMMERCE_SPEC Candidate State | Order Status (`Order.status`) | Payment Status (`Payment.status`) | Fulfillment Status (`Shipment.status`) | Reservation Status (`Reservation.status`) |
|---|---|---|---|---|
| `pending_payment` | `PENDING` | `UNPAID` | `UNFULFILLED` | `ACTIVE` |
| `payment_submitted` | `PENDING` | `SUBMITTED` | `UNFULFILLED` | `VERIFICATION_HOLD` |
| `payment_verification` | `PENDING` | `VERIFYING` | `UNFULFILLED` | `VERIFICATION_HOLD` |
| `paid` | `CONFIRMED` | `PAID` | `UNFULFILLED` | `ALLOCATED` |
| `processing` | `CONFIRMED` | `PAID` | `READY_TO_PACK` / `PACKED` | `ALLOCATED` |
| `ready_to_ship` | `CONFIRMED` | `PAID` | `PACKED` | `ALLOCATED` |
| `shipped` | `CONFIRMED` | `PAID` | `SHIPPED` | `CONSUMED` |
| `delivered` | `FULFILLED` | `PAID` | `DELIVERED` | `CONSUMED` |
| `cancelled` (unpaid) | `CANCELLED` / `EXPIRED` | `UNPAID` | `UNFULFILLED` | `RELEASED` |
| `cancelled` (terminal reject) | `CANCELLED` | `REJECTED` | `UNFULFILLED` | `RELEASED` |
| `refunded` (pre-shipment) | `REFUNDED` | `REFUNDED` | `UNFULFILLED` | `RELEASED` |
| `refunded` (post-delivery) | `REFUNDED` | `REFUNDED` | `DELIVERED` / `RETURNED` | `CONSUMED` |

---

## 29. Payment Method Abstraction & Instruction Versioning

- **PaymentMethodConfiguration Entity**:
  - `id`: `UUIDv7` (PK)
  - `code`: `VARCHAR(50)` (Unique, e.g., `'YAPE_MANUAL'`, `'PLIN_MANUAL'`)
  - `name`: `VARCHAR(100)` (e.g., "Yape (Transferencia Móvil)")
  - `method_type`: `ENUM('MANUAL', 'GATEWAY')`
  - `current_instruction_version_id`: `UUIDv7` (FK $\to$ `PaymentInstructionVersion.id`, Nullable)
  - `is_active`: `BOOLEAN` (Default `true`)
  - `display_order`: `INTEGER` (Default `0`)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **Parent Consistency Invariant**: `PaymentMethodConfiguration.current_instruction_version_id` must point to a `PaymentInstructionVersion` whose `payment_method_code` matches `PaymentMethodConfiguration.code`.
- **PaymentInstructionVersion Entity**:
  - `id`: `UUIDv7` (PK)
  - `payment_method_code`: `VARCHAR(50)` (FK $\to$ `PaymentMethodConfiguration.code`)
  - `version_number`: `INTEGER`
  - `recipient_name`: `VARCHAR(150)` (e.g., "Gamer Perú S.A.C.")
  - `account_identifier`: `VARCHAR(50)` (e.g., "999-888-777")
  - `qr_media_id`: `UUIDv7` (FK $\to$ `MediaAsset.id`, Nullable)
  - `instruction_text`: `TEXT`
  - `is_active`: `BOOLEAN` (Default `true`)
  - `created_at`: `TIMESTAMPTZ`
  - *Unique Constraint*: `(payment_method_code, version_number)`

---

## 30. Payment Domain & Manual Yape / Plin Workflow

- **Payment Entity**:
  - `id`: `UUIDv7` (PK)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`, Unique)
  - `payment_method_code`: `VARCHAR(50)` (FK $\to$ `PaymentMethodConfiguration.code`)
  - `instruction_version_id`: `UUIDv7` (FK $\to$ `PaymentInstructionVersion.id`)
  - `amount_cents`: `INTEGER`
  - `refunded_amount_cents`: `INTEGER` (Default `0`)
  - `currency`: `VARCHAR(3)` (Default `'PEN'`)
  - `status`: `ENUM('UNPAID', 'SUBMITTED', 'VERIFYING', 'PAID', 'REJECTED', 'REFUNDED')` (Default `UNPAID`)
  - `resubmission_grace_expires_at`: `TIMESTAMPTZ` (Nullable; set during retryable rejection)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **PaymentSubmission Entity**:
  - `id`: `UUIDv7` (PK)
  - `payment_id`: `UUIDv7` (FK $\to$ `Payment.id`)
  - `attempt_number`: `INTEGER` (Default `1`)
  - `operation_code`: `VARCHAR(50)` (Required)
  - `proof_media_id`: `UUIDv7` (FK $\to$ `MediaAsset.id`, Nullable)
  - `customer_notes`: `TEXT` (Nullable)
  - `is_late`: `BOOLEAN` (Default `false`; set true if submitted after reservation expired)
  - `submitted_at`: `TIMESTAMPTZ`
  - `ip_address`: `VARCHAR(45)`
  - *Unique Constraint*: `(payment_id, attempt_number)`
- **PaymentVerification Entity**:
  - `id`: `UUIDv7` (PK)
  - `payment_id`: `UUIDv7` (FK $\to$ `Payment.id`)
  - `submission_id`: `UUIDv7` (FK $\to$ `PaymentSubmission.id`)
  - `verifier_auth_user_id`: `UUID` (Nullable FK $\to$ `auth.users(id)`, `ON DELETE SET NULL`)
  - `decision`: `ENUM('APPROVED', 'REJECTED_RETRYABLE', 'REJECTED_TERMINAL')`
  - `rejection_reason`: `VARCHAR(255)` (Nullable)
  - `verification_notes`: `TEXT` (Nullable)
  - `verified_at`: `TIMESTAMPTZ`

---

## 31. Payment Lifecycle, Late Payments & Resubmission

- **Payment Lifecycle States**: `UNPAID` $\to$ `SUBMITTED` $\to$ `VERIFYING` $\to$ `PAID` (or `REJECTED` / `REFUNDED`).
- **Unpaid Order Cancellation vs Payment Rejection**:
  - Unpaid Order Cancellation (Customer or Admin before payment submission): `Order.status` $\to$ `CANCELLED`, `Payment.status` remains `UNPAID` (no REJECTED transition), and `Reservation.status` $\to$ `RELEASED`. No Payment `REJECTED` state transition occurs.
  - Terminal Payment Rejection (Admin review of submission): `Payment.status` $\to$ `REJECTED`, `Order.status` $\to$ `CANCELLED`, `Reservation.status` $\to$ `RELEASED`.
- **Late Payment Handling**:
  - When payment is submitted on an expired order (`Order.status = 'EXPIRED'`, `Reservation.status = 'RELEASED'`), `PaymentSubmission` is recorded with `is_late = true` and `Payment.status = 'SUBMITTED'`.
  - Historical `RELEASED` reservations are NOT mutated.
  - **Admin Late Verification (All-or-Nothing)**:
    * *All Stock Available*: Acquires locks on all required `InventoryItem` records in deterministic order. If all required quantities are available, inserts replacement `InventoryReservation` records in `ACTIVE` and transitions them in the same transaction `ACTIVE` $\to$ `ALLOCATED` (`allocated_delta = +qty`). `Payment.status` $\to$ `PAID`, `Order.status` $\to$ `CONFIRMED`.
    * *Stock Unavailable, Bank Funds Received*: If any required item is sold out but bank funds were received: `Payment.status` transitions to `PAID` (Order remains `EXPIRED`, zero stock allocated), immediately followed by an external refund recording: `Payment.status` $\to$ `REFUNDED`, `Order.status` $\to$ `REFUNDED`. Zero fake inventory allocation occurs.
    * *Funds Not Received*: `Payment.status` $\to$ `REJECTED`, `Order.status` $\to$ `CANCELLED`.
- **Non-Terminal Rejection & Resubmission Grace Policy**:
  - When an Admin selects `REJECTED_RETRYABLE` (e.g. illegible voucher), `Payment.status` transitions to `UNPAID`.
  - `Payment.resubmission_grace_expires_at` is set (`NOW() + PAYMENT_RESUBMISSION_GRACE_DURATION`, `[TBD BUSINESS DECISION]`). Existing `InventoryReservation` remains `VERIFICATION_HOLD`.
  - If the grace deadline expires without customer resubmission, stock is NOT auto-released; the record enters an operational "requires Admin resolution" queue condition where an Admin explicitly verifies bank funds before resolving.

---

## 32. Shipping & Fulfillment

- **ShippingMethod Entity**:
  - `id`: `UUIDv7` (PK)
  - `name`: `VARCHAR(100)` (e.g., "Envío Express Lima Metropolitana")
  - `code`: `VARCHAR(50)` (Unique)
  - `base_price_cents`: `INTEGER`
  - `estimated_days_min`: `INTEGER`
  - `estimated_days_max`: `INTEGER`
  - `is_active`: `BOOLEAN` (Default `true`)
  - `created_at`: `TIMESTAMPTZ`
- **Shipment Entity**:
  - `id`: `UUIDv7` (PK)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`)
  - `shipping_method_id`: `UUIDv7` (FK $\to$ `ShippingMethod.id`)
  - `status`: `ENUM('UNFULFILLED', 'READY_TO_PACK', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED')` (Default `UNFULFILLED`)
  - `courier_name`: `VARCHAR(100)` (`[TBD BUSINESS DECISION]`)
  - `tracking_number`: `VARCHAR(100)` (Nullable)
  - `tracking_url`: `VARCHAR(500)` (Nullable)
  - `shipped_at`: `TIMESTAMPTZ` (Nullable)
  - `delivered_at`: `TIMESTAMPTZ` (Nullable)
  - `notes`: `TEXT` (Nullable)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **Shipment Cardinality Policy**: The schema maintains `Order 1 -> * Shipment` for future split fulfillment extensibility. Operationally in v1, exactly one active outbound `Shipment` exists per `Order`; customer-visible fulfillment state derives from this single active shipment.
- **ShipmentItem Entity**: `id` (`UUIDv7`), `shipment_id` (`UUIDv7`), `order_item_id` (`UUIDv7`), `quantity` (`INTEGER`).

---

## 33. Fulfillment Lifecycle

The fulfillment machine tracks parcel handling from pick/pack to courier delivery:
- `UNFULFILLED`: Order confirmed and paid, waiting for warehouse action.
- `READY_TO_PACK`: Staff claims order line items for packing.
- `PACKED`: Parcel is boxed, weighed, and shipping label affixed.
- `SHIPPED`: Handed over to courier with tracking reference.
- `DELIVERED`: Courier confirms delivery to recipient.
- `RETURNED`: Undeliverable parcel returned to warehouse or RMA processed.

---

## 34. Cancellation Model

- `PENDING / UNPAID`: Customer or Admin can cancel immediately; all associated `InventoryReservation` records transition to `RELEASED`. `Payment.status` remains `UNPAID`.
- `PENDING / SUBMITTED`: Admin review required; terminal rejection transitions `Payment.status` $\to$ `REJECTED`, `Order.status` $\to$ `CANCELLED`, reservations to `RELEASED`.
- `CONFIRMED / PAID`: Admin cancellation releases allocated stock via `InventoryLedgerEntry` (`allocated_delta = -qty`, movement `ALLOCATION_RELEASED`). Commission is `VOIDED`.
- `SHIPPED / DELIVERED`: Direct cancellation is forbidden; customer must proceed through return/RMA workflow.

---

## 35. Refund Model (Full & Partial Support)

- **Refund Entity**:
  - `id`: `UUIDv7` (PK)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`)
  - `payment_id`: `UUIDv7` (FK $\to$ `Payment.id`)
  - `amount_cents`: `INTEGER` ($> 0$)
  - `reason`: `VARCHAR(255)`
  - `external_reference`: `VARCHAR(100)` (Bank operation code)
  - `actor_auth_user_id`: `UUID` (Nullable FK $\to$ `auth.users(id)`, `ON DELETE SET NULL`)
  - `created_at`: `TIMESTAMPTZ`
- **Refund Concurrency Protection**:
  1. Transaction locks `Payment` row via `SELECT ... FOR UPDATE`.
  2. Calculates `refundable_remaining_cents = Payment.amount_cents - Payment.refunded_amount_cents`.
  3. Asserts `requested_refund_cents <= refundable_remaining_cents`.
  4. Inserts `Refund` and increments `Payment.refunded_amount_cents`.
  5. Transitions `Payment.status = 'REFUNDED'` and `Order.status = 'REFUNDED'` strictly when cumulative refunded equals total amount.

---

## 36. Return / Restock Separation

- **Separation of Concerns**: A financial `Refund` record reflects monetary reimbursement; an `InventoryLedgerEntry` reflects physical merchandise restock.
- **Pre-Shipment Refund**: Stock allocation is released (`allocated_delta = -qty`, movement `ALLOCATION_RELEASED`). Physical `on_hand` is not modified because items never left the warehouse.
- **Post-Delivery Return**: Physical `on_hand` increments (`on_hand_delta = +qty`) ONLY when warehouse staff receives, inspects, and accepts the physical return (`movement_type = 'RETURN_RESTOCKED'`).

---

## 37. Promotion Domain, Priorities & Target Scopes

- **Promotion Entity**:
  - `id`: `UUIDv7` (PK)
  - `name`: `VARCHAR(100)`
  - `discount_type`: `ENUM('PERCENTAGE', 'FIXED_AMOUNT')`
  - `discount_value`: `INTEGER` (Basis points or fixed cents)
  - `min_spend_cents`: `INTEGER` (Default `0`)
  - `max_discount_cents`: `INTEGER` (Nullable)
  - `priority`: `INTEGER` (Default `0`, higher priority evaluated first)
  - `start_date`, `end_date`: `TIMESTAMPTZ`
  - `total_usage_limit`: `INTEGER` (Nullable)
  - `current_usage_count`: `INTEGER` (Default `0`)
  - `is_stackable`: `BOOLEAN` (Default `false`)
  - `is_active`: `BOOLEAN` (Default `true`)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **PromotionTarget (Scope) Entity**:
  - `id`: `UUIDv7` (PK)
  - `promotion_id`: `UUIDv7` (FK $\to$ `Promotion.id`, Required)
  - `scope_type`: `ENUM('ALL', 'PRODUCT', 'PRODUCT_VARIANT', 'CATEGORY', 'COLLECTION')`
  - `target_id`: `UUIDv7` (Nullable; references specific target entity based on `scope_type`)
  - `created_at`: `TIMESTAMPTZ`
- **Deterministic Stacking & Evaluation**:
  1. Evaluate eligible automatic promotions sorted by `priority DESC, created_at ASC`.
  2. Evaluate applied coupon codes sorted by `priority DESC`.
  3. Non-stackable promotions override or suppress lower-priority discounts.
  4. Enforce `max_discount_cents` cap.
  5. Freeze applied discount allocations in `OrderPromotionSnapshot`.

---

## 38. Coupon Domain & Redemption Integrity

- **Coupon Entity**:
  - `id`: `UUIDv7` (PK)
  - `promotion_id`: `UUIDv7` (FK $\to$ `Promotion.id`)
  - `code`: `VARCHAR(50)` (Unique, Uppercase)
  - `per_customer_limit`: `INTEGER` (Default `1`)
  - `is_active`: `BOOLEAN` (Default `true`)
  - `created_at`: `TIMESTAMPTZ`
- **CouponRedemption Entity**:
  - `id`: `UUIDv7` (PK)
  - `coupon_id`: `UUIDv7` (FK $\to$ `Coupon.id`)
  - `customer_id`: `UUIDv7` (FK $\to$ `CustomerProfile.id`, Nullable)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`)
  - `status`: `ENUM('APPLIED', 'VOIDED')` (Default `APPLIED`)
  - `redeemed_at`: `TIMESTAMPTZ`
  - *Unique Constraint*: `(coupon_id, order_id)`
- **Coupon Rules & Limits**:
  - Max coupons per order is governed by `MAX_COUPONS_PER_ORDER` (`[TBD BUSINESS DECISION]`).
  - The same coupon code cannot be applied twice to the same order (`UNIQUE(coupon_id, order_id)`).
  - Coupons with `per_customer_limit` require an authenticated customer identity (`customer_id IS NOT NULL`).
  - Cancelled/refunded orders may restore coupon capacity if configured (`[TBD BUSINESS DECISION]`), transitioning redemption to `VOIDED` rather than deleting historical records.

---

## 39. Wishlist Domain

- **WishlistItem Entity**:
  - `id`: `UUIDv7` (PK)
  - `customer_id`: `UUIDv7` (FK $\to$ `CustomerProfile.id`)
  - `product_id`: `UUIDv7` (FK $\to$ `Product.id`)
  - `created_at`: `TIMESTAMPTZ`
  - *Unique Constraint*: `(customer_id, product_id)`
  - *Archival Rule*: Archiving a Product does not delete customer wishlist items; presentation layer handles delisted products gracefully.

---

## 40. Reviews Foundation

- **Review Entity**:
  - `id`: `UUIDv7` (PK)
  - `product_id`: `UUIDv7` (FK $\to$ `Product.id`)
  - `customer_id`: `UUIDv7` (FK $\to$ `CustomerProfile.id`)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`, Nullable verified purchase link)
  - `rating`: `SMALLINT` (1 to 5)
  - `title`: `VARCHAR(150)` (Nullable)
  - `comment`: `TEXT`
  - `moderation_status`: `ENUM('PENDING', 'APPROVED', 'REJECTED')` (Default `PENDING`)
  - `moderated_by_auth_user_id`: `UUID` (Nullable FK $\to$ `auth.users(id)`, `ON DELETE SET NULL`)
  - `moderated_at`: `TIMESTAMPTZ` (Nullable)
  - `created_at`: `TIMESTAMPTZ`

---

## 41. Referral Domain

- **ReferralProgram Entity**: Configuration of customer referral rewards (`[TBD BUSINESS DECISION]`).
- **ReferralCode Entity**:
  - `id`: `UUIDv7` (PK)
  - `customer_id`: `UUIDv7` (FK $\to$ `CustomerProfile.id`, Unique)
  - `code`: `VARCHAR(50)` (Unique, Uppercase)
  - `times_used`: `INTEGER` (Default `0`)
  - `is_active`: `BOOLEAN` (Default `true`)
  - `created_at`: `TIMESTAMPTZ`
- **ReferralAttribution Entity**:
  - `id`: `UUIDv7` (PK)
  - `referral_code_id`: `UUIDv7` (FK $\to$ `ReferralCode.id`)
  - `referred_customer_id`: `UUIDv7` (FK $\to$ `CustomerProfile.id`)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`, Unique)
  - `status`: `ENUM('PENDING', 'QUALIFIED', 'REWARDED', 'VOIDED')`
  - `created_at`: `TIMESTAMPTZ`
- **Self-Referral Invariant**: Attribution query verifies `referral_code.customer_id != order.customer_id`. Shared IP/device fingerprints trigger an operational review flag rather than immediate silent failure.

---

## 42. Affiliate Domain

- **Affiliate Entity**:
  - `id`: `UUIDv7` (PK)
  - `auth_user_id`: `UUID` (FK $\to$ `auth.users(id)`, Nullable on detachment, `UNIQUE WHERE auth_user_id IS NOT NULL`)
  - `company_name`: `VARCHAR(150)` (Nullable)
  - `contact_email`: `VARCHAR(255)`
  - `status`: `ENUM('PENDING', 'ACTIVE', 'SUSPENDED')` (Default `PENDING`)
  - `commission_rate_bps`: `INTEGER` (Basis points: e.g. `500` = 5.0%, `[TBD BUSINESS DECISION]`)
  - `payout_info`: `JSONB` (Masked banking details for manual payout)
  - `created_at`, `updated_at`: `TIMESTAMPTZ`
- **AffiliateCode Entity**: `id` (`UUIDv7`), `affiliate_id` (`UUIDv7`), `code` (`VARCHAR(50)`, Unique), `is_active` (`BOOLEAN`).

---

## 43. Attribution Model & Cross-Attribution Precedence

- **AffiliateClick Entity**:
  - `id`: `UUIDv7` (PK)
  - `affiliate_code_id`: `UUIDv7` (FK $\to$ `AffiliateCode.id`)
  - `visitor_session_id`: `VARCHAR(255)`
  - `ip_hash`: `VARCHAR(64)`
  - `referrer_url`: `VARCHAR(500)` (Nullable)
  - `expires_at`: `TIMESTAMPTZ` (Configured by `AFFILIATE_ATTRIBUTION_WINDOW_DAYS`, `[TBD BUSINESS DECISION]`)
  - `created_at`: `TIMESTAMPTZ`
- **AffiliateAttribution Entity**:
  - `id`: `UUIDv7` (PK)
  - `affiliate_id`: `UUIDv7` (FK $\to$ `Affiliate.id`)
  - `affiliate_code_id`: `UUIDv7` (FK $\to$ `AffiliateCode.id`)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`, Unique)
  - `attribution_rule`: `ENUM('LAST_TOUCH_ELIGIBLE')`
  - `attributed_at`: `TIMESTAMPTZ`
- **Cross-Attribution Precedence**: When both referral and affiliate tracking exist on an order, exactly one reward-bearing attribution qualifies according to `GROWTH_ATTRIBUTION_PRECEDENCE` (`[TBD BUSINESS DECISION]`).
- **Authoritative Identity Traversal**: Self-referral check asserts `affiliate.auth_user_id != customer_profile.auth_user_id` (via `Order.customer_id` $\to$ `CustomerProfile.auth_user_id`).

---

## 44. Commission Lifecycle & Post-Payout Adjustments

- **Commission Entity**:
  - `id`: `UUIDv7` (PK)
  - `affiliate_attribution_id`: `UUIDv7` (FK $\to$ `AffiliateAttribution.id`, Unique)
  - `affiliate_id`: `UUIDv7` (FK $\to$ `Affiliate.id`)
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`)
  - `payout_batch_id`: `UUIDv7` (FK $\to$ `CommissionPayoutBatch.id`, Nullable)
  - `amount_cents`: `INTEGER` ($> 0$, Base earned amount)
  - `status`: `ENUM('PENDING', 'QUALIFIED', 'APPROVED', 'PAID', 'VOIDED')` (Default `PENDING`)
  - `qualification_due_at`: `TIMESTAMPTZ` (Set to `Shipment.delivered_at + COMMISSION_QUALIFICATION_WINDOW_DAYS`, `[TBD BUSINESS DECISION]`; NULL prior to delivery)
  - `approved_at`, `paid_at`, `voided_at`: `TIMESTAMPTZ` (Nullable)
  - `void_reason`: `VARCHAR(255)` (Nullable)
  - `created_at`: `TIMESTAMPTZ`
- **CommissionAdjustment Entity**:
  - `id`: `UUIDv7` (PK)
  - `commission_id`: `UUIDv7` (FK $\to$ `Commission.id`)
  - `applied_payout_batch_id`: `UUIDv7` (FK $\to$ `CommissionPayoutBatch.id`, Nullable)
  - `adjustment_type`: `ENUM('CLAWBACK_REFUND', 'MANUAL_CORRECTION')`
  - `amount_cents`: `INTEGER` (Signed integer; negative for clawbacks)
  - `reason`: `VARCHAR(255)`
  - `order_id`: `UUIDv7` (FK $\to$ `Order.id`)
  - `refund_id`: `UUIDv7` (FK $\to$ `Refund.id`, Nullable)
  - `created_at`: `TIMESTAMPTZ`
- **Net Commission Formula & Immutability**:
  $$\text{net\_commission\_cents} = \text{Commission.amount\_cents} + \sum \text{CommissionAdjustment.amount\_cents}$$
  - For partial refunds before payout: A negative `CommissionAdjustment` is recorded. If net becomes 0, status transitions to `VOIDED`.
  - For refunds after payout (`status = 'PAID'`): The historical `Commission` remains immutable and a negative `CommissionAdjustment` is recorded to carry over into future payout accounting.

---

## 45. Payout Boundary & Traceability

- **CommissionPayoutBatch Entity**:
  - `id`: `UUIDv7` (PK)
  - `affiliate_id`: `UUIDv7` (FK $\to$ `Affiliate.id`, Required; one batch per affiliate in v1)
  - `total_payout_cents`: `INTEGER`
  - `status`: `ENUM('DRAFT', 'PROCESSING', 'COMPLETED')`
  - `external_reference`: `VARCHAR(100)` (Nullable bank transfer reference)
  - `processed_by_auth_user_id`: `UUID` (Nullable FK $\to$ `auth.users(id)`, `ON DELETE SET NULL`)
  - `created_at`, `completed_at`: `TIMESTAMPTZ`
- **Traceability Linkage**: Linked commissions reference `Commission.payout_batch_id`; applied clawbacks reference `CommissionAdjustment.applied_payout_batch_id`. The batch total is fully explainable from linked items.

---

## 46. Content Domain

- **ContentSlot Entity**: Manages dynamic homepage banners and promotional placements.
  - `id`: `UUIDv7` (PK)
  - `slot_key`: `VARCHAR(50)` (Unique, e.g., `HOME_HERO_BANNER`, `CATALOG_TOP_BANNER`)
  - `title`: `VARCHAR(150)`
  - `payload`: `JSONB` (Structured banner copy, target URL, media asset ID)
  - `is_active`: `BOOLEAN` (Default `true`)
  - `updated_at`: `TIMESTAMPTZ`

---

## 47. SEO Domain Fields

Embedded into Brand, Category, Collection, Product, and Editorial entities:
- `seo_title`: `VARCHAR(70)` (Nullable fallback to entity name)
- `seo_description`: `VARCHAR(160)` (Nullable fallback to entity subtitle)
- `canonical_url_override`: `VARCHAR(255)` (Nullable)
- `og_media_id`: `UUIDv7` (FK $\to$ `MediaAsset.id`, Nullable)
- `no_index`: `BOOLEAN` (Default `false`)

---

## 48. Audit Model

Appends an immutable audit record for every privileged or state-changing action.

- **AuditEvent Entity**:
  - `id`: `UUIDv7` (PK)
  - `timestamp`: `TIMESTAMPTZ` (Default `NOW()`)
  - `actor_type`: `ENUM('CUSTOMER', 'ADMIN', 'SYSTEM')`
  - `actor_id`: `VARCHAR(255)` (Staff UUID, customer UUID, or `'SYSTEM'`)
  - `action`: `VARCHAR(100)` (e.g., `orders:verify_payment`, `catalog:update_price`)
  - `target_type`: `VARCHAR(50)` (e.g., `Order`, `Payment`, `ProductVariant`)
  - `target_id`: `VARCHAR(255)`
  - `metadata`: `JSONB` (Sanitized before/after state diff; secrets and private tokens redacted)
  - `ip_address`: `VARCHAR(45)`
  - `request_id`: `VARCHAR(255)` (Correlation trace)

---

## 49. Domain Event Model

Represents factual business occurrences within Gamer Perú.

- **DomainEvent Entity**:
  - `id`: `UUIDv7` (PK)
  - `event_name`: `VARCHAR(100)` (`OrderPlaced`, `PaymentSubmitted`, `PaymentApproved`, `PaymentRejected`, `OrderCancelled`, `ShipmentDispatched`, `OrderDelivered`, `RefundIssued`, `CommissionQualified`)
  - `event_version`: `INTEGER` (Default `1`)
  - `aggregate_type`: `VARCHAR(50)` (`Order`, `Payment`, `Inventory`, `Affiliate`)
  - `aggregate_id`: `VARCHAR(255)`
  - `payload`: `JSONB` (Sanitized minimum-necessary domain event payload)
  - `occurred_at`: `TIMESTAMPTZ`

---

## 50. Transactional Outbox

Guarantees at-least-once delivery of outbound events to Inngest and downstream EC OS without distributed transactions.

- **OutboxEvent Entity**:
  - `id`: `UUIDv7` (PK; acts as the canonical outbound `event_id` and downstream idempotency key across all retries)
  - `event_name`: `VARCHAR(100)`
  - `event_version`: `INTEGER` (Default `1`)
  - `aggregate_type`: `VARCHAR(50)`
  - `aggregate_id`: `VARCHAR(255)`
  - `payload`: `JSONB` (Versioned minimum-necessary integration payload; excluded from private credentials, internal margins, and raw proof URLs)
  - `status`: `ENUM('PENDING', 'DELIVERED', 'FAILED')` (Default `PENDING`)
  - `retry_count`: `INTEGER` (Default `0`)
  - `next_attempt_at`: `TIMESTAMPTZ` (Default `NOW()`)
  - `created_at`: `TIMESTAMPTZ`
  - `delivered_at`: `TIMESTAMPTZ` (Nullable)
  - `last_error`: `TEXT` (Nullable)
- **Outbox Invariant**: Inserted inside the same PostgreSQL transaction as the commerce mutation. Inngest polls/receives outbox events and dispatches webhooks using `OutboxEvent.id` as the stable idempotency key.

---

## 51. Analytics Relationship

- **Authoritative Fact vs. Behavioral Telemetry**:
  - *PostgreSQL Commerce Tables*: Source of truth for `purchase`, revenue, order counts, and affiliate commissions.
  - *PostHog Telemetry*: Receives client/server behavioral signals (`view_item`, `add_to_cart`, `begin_checkout`, `search`).
  - *Server-Side Purchase Event*: `purchase` analytics events are dispatched exclusively after server-side payment confirmation (`Payment.status = 'PAID'`), never from browser client execution alone.

---

## 52. Idempotency Model

- **IdempotencyKey Entity**:
  - `id`: `UUIDv7` (PK)
  - `idempotency_key`: `VARCHAR(255)` (Unique)
  - `operation_type`: `ENUM('ORDER_CREATION', 'PAYMENT_SUBMISSION', 'PAYMENT_VERIFICATION_APPROVE', 'PAYMENT_VERIFICATION_REJECT', 'ORDER_CANCELLATION', 'REFUND_RECORDING', 'INVENTORY_MUTATION', 'AFFILIATE_CONVERSION_QUALIFY', 'COMMISSION_PAYOUT_BATCH', 'OUTBOX_DISPATCH')`
  - `target_aggregate_id`: `VARCHAR(255)` (Nullable)
  - `response_payload`: `JSONB`
  - `created_at`: `TIMESTAMPTZ`
  - `expires_at`: `TIMESTAMPTZ` (Configured per operation class)

---

## 53. Concurrency Controls

| Race Condition Scenario | Target Record | Protection Mechanism |
|---|---|---|
| **Final Unit Concurrent Checkout** | `InventoryItem` | `SELECT ... FOR UPDATE` row-level lock on `(variant_id, location_id)`; checks $\text{available\_to\_sell} \ge \text{qty}$. |
| **Concurrent Admin Payment Verification** | `Payment` | `SELECT ... FOR UPDATE` on payment record; checks `status IN ('SUBMITTED', 'VERIFYING')`. |
| **Simultaneous Cancellation & Approval** | `Order` / `Payment` | Transactional lock on `Payment` and `Order`; checks state before status transition. |
| **Duplicate Webhook Delivery** | `OutboxEvent` | Idempotency check on `event_id` (`OutboxEvent.id`) and unique transaction key. |
| **Concurrent Coupon Redemption** | `Promotion` / `Coupon` | Row-level lock on `Promotion`; rechecks `current_usage_count < total_usage_limit` and customer limit. |
| **Concurrent Refund Recording** | `Payment` | Row lock on `Payment`; recomputes `refundable_remaining_cents` ensuring cumulative refund $\le$ total. |
| **Late-Payment Multi-Item Reacquisition**| `InventoryItem` | Deterministic row-level locks on all items; all-or-nothing allocation. |

---

## 54. Logical Database Constraints

1. `ProductVariant.sku`: `UNIQUE NOT NULL`
2. `Brand.slug`, `Category.slug`, `Collection.slug`, `Product.slug`: `UNIQUE NOT NULL`
3. `CategorySpecificationSchema`: `UNIQUE(category_id, schema_version)`
4. `ProductCollection`: `UNIQUE(collection_id, product_id)`
5. `Order.order_number`: `UNIQUE NOT NULL`
6. `CartItem`: `UNIQUE(cart_id, variant_id)`
7. `Cart Ownership`: At most one `ACTIVE` cart per `customer_id`; at most one `ACTIVE` cart per `session_token`.
8. `WishlistItem`: `UNIQUE(customer_id, product_id)`
9. `InventoryItem`: `UNIQUE(variant_id, location_id)`
10. `InventoryReservation`: `quantity > 0`; at most one non-terminal reservation (`ACTIVE`, `VERIFICATION_HOLD`, `ALLOCATED`) per `order_item_id`.
11. `Payment.order_id`: `UNIQUE NOT NULL`
12. `PaymentSubmission`: `UNIQUE(payment_id, attempt_number)`
13. `PaymentMethodConfiguration.code`: `UNIQUE NOT NULL`
14. `PaymentInstructionVersion`: `UNIQUE(payment_method_code, version_number)`
15. `Parent Consistency`: `PaymentMethodConfiguration.current_instruction_version_id` must match `payment_method_code`; `Category.current_spec_schema_id` must match `category_id`.
16. `CouponRedemption`: `UNIQUE(coupon_id, order_id)`
17. `ReferralAttribution`: `UNIQUE(order_id)`
18. `AffiliateAttribution`: `UNIQUE(order_id)`
19. `Commission`: `UNIQUE(affiliate_attribution_id)`
20. `CustomerProfile.auth_user_id`: Active linked CustomerProfile has exactly one `auth_user_id`; `auth_user_id` is unique when present (`UNIQUE WHERE auth_user_id IS NOT NULL`); detached/anonymized historical profile has `auth_user_id = NULL`.
21. `Affiliate.auth_user_id`: Active affiliate has exactly one `auth_user_id` (`UNIQUE WHERE auth_user_id IS NOT NULL`); detached/suspended affiliate has `auth_user_id = NULL`.
22. `Quantity Constraints`: `CartItem.quantity > 0`, `InventoryItem.quantity_on_hand >= 0`, `InventoryItem.quantity_reserved >= 0`, `InventoryItem.quantity_allocated >= 0`
23. `Money Constraints`: Standard monetary amounts $\ge 0$; signed adjustments may be negative; `Payment.refunded_amount_cents <= Payment.amount_cents` enforced transactionally.
24. `RolePermission`: `PRIMARY KEY(role_id, permission_id)`
25. `UserRole`: `PRIMARY KEY(auth_user_id, role_id)` (Ephemeral; removed on Auth user deletion)
26. **Non-Cascading Deletion Invariant & FK Lifecycle**:
    - Deletion of an `auth.users` identity record does NOT cascade delete historical Orders, OrderItems, Payments, Refunds, Verifications, Inventory Ledger entries, or Commissions.
    - Ephemeral authorization (`UserRole`) is deleted when the Auth user is deleted.
    - Historical staff/actor FKs (`created_by_auth_user_id`, `verifier_auth_user_id`, `actor_auth_user_id`, `moderated_by_auth_user_id`, `processed_by_auth_user_id`) use `ON DELETE SET NULL`, while permanent `AuditEvent` logs preserve actor audit strings.
    - Customer profiles detach `auth_user_id` to NULL upon account deletion.

---

## 55. Index Strategy

| Table | Index Name | Columns | Purpose |
|---|---|---|---|
| `Product` | `idx_product_slug` | `slug` (Unique B-tree) | Storefront PDP lookup. |
| `Product` | `idx_product_brand_cat` | `brand_id, category_id, status` | Category/brand catalog filtering. |
| `Product` | `idx_product_search_gin` | `to_tsvector('spanish', name)` | Full-text search engine (PostgreSQL FTS). |
| `Product` | `idx_product_name_trgm` | `name gin_trgm_ops` | Typo-tolerant trigram search (`pg_trgm`). |
| `ProductVariant` | `idx_variant_sku` | `sku` (Unique B-tree) | SKU lookup and inventory indexing. |
| `ProductCollection` | `idx_prod_collection` | `collection_id, display_order` | Collection grid rendering. |
| `InventoryItem` | `idx_inv_variant_loc` | `variant_id, location_id` | Stock reservation and checkout locking. |
| `InventoryReservation` | `idx_inv_res_expiry` | `status, expires_at` | Reservation expiration worker. |
| `Order` | `idx_order_number` | `order_number` (Unique B-tree) | Human reference search. |
| `Order` | `idx_order_customer` | `customer_id, created_at DESC` | Customer order history list. |
| `Payment` | `idx_payment_verification_queue`| `status, resubmission_grace_expires_at, created_at` | Admin pending verification and resubmission queue. |
| `PaymentSubmission` | `idx_pay_sub_attempt` | `payment_id, attempt_number` | Attempt validation and fraud checks. |
| `PaymentSubmission` | `idx_pay_sub_opcode` | `operation_code, submitted_at` | Duplicate submission detection. |
| `Refund` | `idx_refund_payment` | `payment_id, created_at` | Payment refund calculation. |
| `CouponRedemption` | `idx_coupon_redemption_cust` | `coupon_id, customer_id, status` | Per-customer usage limit verification. |
| `AffiliateClick` | `idx_aff_click_expiry` | `affiliate_code_id, expires_at`| Attribution window lookup. |
| `Commission` | `idx_comm_qual_due` | `status, qualification_due_at`| Commission maturation worker. |
| `Commission` | `idx_comm_payout_batch` | `payout_batch_id` | Payout batch reconciliation. |
| `CustomerProfile` | `idx_cust_auth_user` | `auth_user_id WHERE auth_user_id IS NOT NULL` (Unique B-tree)| Customer profile lookup by verified Auth session. |
| `Affiliate` | `idx_affiliate_auth_user` | `auth_user_id WHERE auth_user_id IS NOT NULL` (Unique B-tree)| Affiliate profile lookup by verified Auth session. |
| `UserRole` | `idx_user_role_auth_user` | `auth_user_id` | Staff RBAC permission resolution. |
| `OutboxEvent` | `idx_outbox_pending` | `status, next_attempt_at` | Inngest background poller/worker. |

---

## 56. Archival, Deletion & Privacy Reconciliation

- **Hard Deletion**: Restricted exclusively to transient anonymous Carts past expiration (`expires_at < NOW()`).
- **Soft Deletion / Archival (`status = 'ARCHIVED'`)**: Brands, Categories, Collections, Products, ProductVariants, Promotions, Coupons.
- **Immutable Permanent Financial Records**: Orders, OrderItems, OrderPricingSnapshots, OrderPromotionSnapshots, Payments, PaymentSubmissions, PaymentVerifications, InventoryLedgerEntries, AuditEvents.
- **Privacy & Anonymization Model**:
  - Customer account deletion immediately anonymizes `CustomerProfile` and `CustomerAddress`.
  - Order PII snapshots (`customer_email`, `customer_phone`, `OrderAddressSnapshot`) are retained for an approved legal and tax compliance period (`[TBD LEGAL/RETENTION POLICY]`), after which an automated scrubbing job anonymizes personal identifying values while preserving financial line items and totals.

---

## 57. Security Analysis

- **Authoritative Server RBAC**: Every privileged action checks `requirePermission('permission:name')` against database records. Client route hiding or token claims are never relied upon for security.
- **IDOR Protection**: Customer queries verify identity via `getClaims()`, resolve `auth_user_id` to `CustomerProfile.id`, and enforce customer data isolation; client-provided user IDs are discarded.
- **Key Boundary**:
  - *Browser-Safe*: `NEXT_PUBLIC_SUPABASE_ANON_KEY` / publishable key is safe for client-side bundle exposure.
  - *Server-Only*: Supabase service role key, direct database connection strings, Google OAuth Client Secret, and Resend SMTP credentials remain strictly in server environment variables.
- **Row Level Security (RLS) Boundary**:
  - Server-side Next.js / Drizzle logic performs authoritative authorization.
  - For any Gamer Perú tables exposed through Supabase Data API endpoints, RLS policies enforce default-deny and `auth.uid()` checks as defense-in-depth.
- **Payment Voucher Security**: Voucher images reside in a private Cloudflare R2 bucket with no public read access; staff view vouchers exclusively via 5-minute pre-signed URLs.
- **Mass Assignment Prevention**: All server action and API payloads are strictly validated through Zod schemas.

---

## 58. Comprehensive Entity-Relationship Diagram

```mermaid
erDiagram
    Brand ||--o{ Product : owns
    Category ||--o{ Product : categorizes
    Category ||--o{ CategorySpecificationSchema : versions
    Category ||--o| CategorySpecificationSchema : current_schema
    Collection ||--o{ ProductCollection : groups
    Product ||--o{ ProductCollection : includes
    Product ||--o{ ProductVariant : contains
    Product ||--o| ProductSpecifications : has
    CategorySpecificationSchema ||--o{ ProductSpecifications : validates
    Product ||--o| ProductStory : has
    ProductStory ||--o{ ProductStoryRevision : versions
    ProductVariant ||--o{ MediaAsset : displays
    
    auth_users ||--o| CustomerProfile : profiles
    auth_users ||--o{ UserRole : assigned
    Role ||--o{ UserRole : has
    Role ||--o{ RolePermission : grants
    Permission ||--o{ RolePermission : defines
    
    CustomerProfile ||--o{ CustomerAddress : saves
    CustomerProfile ||--o| CustomerAddress : default_address
    CustomerProfile ||--o{ WishlistItem : saves
    Product ||--o{ WishlistItem : targeted
    CustomerProfile ||--o{ Review : writes
    Product ||--o{ Review : reviewed
    
    CustomerProfile ||--o{ Cart : owns
    Cart ||--o{ CartItem : contains
    ProductVariant ||--o{ CartItem : selected
    
    InventoryLocation ||--o{ InventoryItem : stores
    ProductVariant ||--o{ InventoryItem : tracks
    InventoryItem ||--o{ InventoryLedgerEntry : logs
    InventoryItem ||--o{ InventoryReservation : reserves
    
    CustomerProfile ||--o{ Order : places
    Order ||--o{ OrderItem : contains
    ProductVariant ||--o{ OrderItem : snapshots
    Order ||--o| OrderAddressSnapshot : ships_to
    Order ||--o| OrderPricingSnapshot : priced_as
    Order ||--o{ OrderPromotionSnapshot : discounts
    Order ||--o{ InventoryReservation : holds
    OrderItem ||--o{ InventoryReservation : reserves_for
    
    Order ||--o| Payment : pays
    PaymentMethodConfiguration ||--o{ Payment : configures
    PaymentMethodConfiguration ||--o| PaymentInstructionVersion : current_version
    PaymentInstructionVersion ||--o{ Payment : presents
    Payment ||--o{ PaymentSubmission : submits
    Payment ||--o{ PaymentVerification : verifies
    Payment ||--o{ Refund : refunds
    
    Order ||--o{ Shipment : fulfills
    ShippingMethod ||--o{ Shipment : routes
    Shipment ||--o{ ShipmentItem : parcels
    OrderItem ||--o{ ShipmentItem : packed
    
    Promotion ||--o{ Coupon : codes
    Promotion ||--o{ PromotionTarget : scopes
    Coupon ||--o{ CouponRedemption : redeems
    Order ||--o{ CouponRedemption : tracks
    
    ReferralCode ||--o{ ReferralAttribution : attributes
    Order ||--o| ReferralAttribution : rewards
    
    Affiliate ||--o{ AffiliateCode : issues
    AffiliateCode ||--o{ AffiliateClick : tracks
    AffiliateClick ||--o{ AffiliateAttribution : qualifies
    Order ||--o| AffiliateAttribution : attributes
    AffiliateAttribution ||--o| Commission : earns
    Commission ||--o{ CommissionAdjustment : adjusts
    CommissionPayoutBatch ||--o{ Commission : pays
    CommissionPayoutBatch ||--o{ CommissionAdjustment : applies
    
    ContentSlot
    AuditEvent
    DomainEvent
    OutboxEvent
    IdempotencyKey
```

---

## 59. Complete Lifecycle State Diagrams

### 1. Product Publication Lifecycle
```mermaid
stateDiagram-v2
    [*] --> DRAFT: Product Created / AI Draft Imported
    DRAFT --> PUBLISHED: Staff Approves & Publishes
    PUBLISHED --> ARCHIVED: Delisted from Storefront
    DRAFT --> ARCHIVED: Discarded Draft
    ARCHIVED --> PUBLISHED: Restored to Storefront
```

### 2. Inventory Reservation Lifecycle
```mermaid
stateDiagram-v2
    [*] --> ACTIVE: Order Placed (reserved_delta +)
    ACTIVE --> VERIFICATION_HOLD: Payment Submitted (Timer suspended)
    ACTIVE --> ALLOCATED: Verified Late-Payment Reacquisition under Lock
    VERIFICATION_HOLD --> ALLOCATED: Payment Approved (reserved -, allocated +)
    ALLOCATED --> CONSUMED: Parcel Shipped (allocated -, on_hand -)
    ACTIVE --> RELEASED: Timeout / Order Cancelled (reserved -)
    VERIFICATION_HOLD --> RELEASED: Payment Terminal Rejection / Cancelled (reserved -)
    ALLOCATED --> RELEASED: Pre-Shipment Order Refund / Cancelled (allocated -)
    CONSUMED --> [*]
    RELEASED --> [*]
```

### 3. Order Lifecycle
```mermaid
stateDiagram-v2
    [*] --> PENDING: Checkout Completed
    PENDING --> EXPIRED: Unpaid Reservation Timeout
    PENDING --> CONFIRMED: Payment Approved
    PENDING --> CANCELLED: Order Cancelled by Customer/Admin (Unpaid or Terminal Reject)
    EXPIRED --> CONFIRMED: Late Payment Verified & Stock Allocated
    EXPIRED --> REFUNDED: Late Payment Verified & Stock Sold Out (Full Refund)
    EXPIRED --> CANCELLED: Late Payment Rejected / Abandoned
    CONFIRMED --> PROCESSING: Staff Pick & Pack
    PROCESSING --> FULFILLED: Delivered to Customer
    CONFIRMED --> REFUNDED: Full Refund Issued Pre-Shipment
    PROCESSING --> REFUNDED: Full Refund Issued Pre-Shipment
    FULFILLED --> REFUNDED: Full Refund Issued on Accepted Return / Settlement
    FULFILLED --> [*]
    CANCELLED --> [*]
    REFUNDED --> [*]
```

### 4. Payment Lifecycle
```mermaid
stateDiagram-v2
    [*] --> UNPAID: Order Placed
    UNPAID --> SUBMITTED: Customer submits OpCode/Voucher
    SUBMITTED --> VERIFYING: Admin opens review workbench
    VERIFYING --> PAID: Admin confirms bank receipt (Stock Available or Sold-out Fact)
    VERIFYING --> REJECTED: Admin executes terminal rejection
    VERIFYING --> UNPAID: Admin executes retryable rejection (Resubmission grace)
    SUBMITTED --> REJECTED: Admin executes terminal rejection
    PAID --> REFUNDED: Full external refund recorded
    PAID --> [*]
    REJECTED --> [*]
    REFUNDED --> [*]
```

### 5. Fulfillment / Shipment Lifecycle
```mermaid
stateDiagram-v2
    [*] --> UNFULFILLED: Order Confirmed (Paid)
    UNFULFILLED --> READY_TO_PACK: Staff claims for packing
    READY_TO_PACK --> PACKED: Parcel boxed & labeled
    PACKED --> SHIPPED: Handed to courier (Tracking added)
    SHIPPED --> DELIVERED: Courier confirms delivery
    SHIPPED --> RETURNED: Courier delivery failed / RMA returned
    DELIVERED --> RETURNED: RMA Accepted & Merchandise Received
    DELIVERED --> [*]
    RETURNED --> [*]
```

### 6. Commission Lifecycle
```mermaid
stateDiagram-v2
    [*] --> PENDING: Order Paid
    PENDING --> QUALIFIED: Delivery Confirmed + Qualification Window Passes
    PENDING --> VOIDED: Order Cancelled / Full Refund Before Payout
    QUALIFIED --> APPROVED: Admin Approves Payout Batch
    QUALIFIED --> VOIDED: Refund Before Payout Batch Approval
    APPROVED --> PAID: Payout Batch Executed
    PAID --> [*]: Historical Fact Preserved (Refunds create CommissionAdjustment)
    VOIDED --> [*]
```

---

## 60. Complete Sequence Diagrams

### 1. Cart $\to$ Checkout $\to$ Order Creation
```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Storefront as Next.js Storefront
    participant DB as PostgreSQL

    Customer->>Storefront: Submits Checkout Form (Address, Method)
    Storefront->>DB: BEGIN TRANSACTION
    Storefront->>DB: Lock InventoryItem (SELECT ... FOR UPDATE)
    Storefront->>DB: Recompute Subtotal, Coupon Discount, Shipping
    Storefront->>DB: Check available_to_sell >= requested_qty
    Storefront->>DB: INSERT INTO orders (status: 'PENDING')
    Storefront->>DB: INSERT INTO order_items, order_address_snapshots, order_pricing_snapshots
    Storefront->>DB: INSERT INTO inventory_reservations (status: 'ACTIVE')
    Storefront->>DB: UPDATE inventory_items SET quantity_reserved = quantity_reserved + qty
    Storefront->>DB: INSERT INTO inventory_ledger_entries (RESERVATION_CREATED)
    Storefront->>DB: INSERT INTO payments (status: 'UNPAID', payment_method_code, instruction_version_id)
    Storefront->>DB: INSERT INTO outbox_events (event_name: 'OrderPlaced', event_version: 1)
    Storefront->>DB: COMMIT TRANSACTION
    Storefront-->>Customer: Display Order Confirmation & Payment Instructions
```

### 2. Concurrent Final-Unit Stock Allocation
```mermaid
sequenceDiagram
    autonumber
    actor CustomerA as Customer A
    actor CustomerB as Customer B
    participant API as Next.js Server Action
    participant DB as PostgreSQL

    CustomerA->>API: Checkout (1 unit)
    CustomerB->>API: Checkout (1 unit)
    
    API->>DB: BEGIN TX A
    API->>DB: SELECT * FROM inventory_items WHERE variant_id = X AND location_id = Y FOR UPDATE
    Note over DB: Locked by TX A
    
    API->>DB: BEGIN TX B
    API->>DB: SELECT * FROM inventory_items WHERE variant_id = X AND location_id = Y FOR UPDATE
    Note over DB: TX B Waits
    
    API->>DB: TX A: available = 1 - 0 - 0 = 1 (OK)
    API->>DB: UPDATE inventory_items SET quantity_reserved = 1
    API->>DB: INSERT INTO inventory_reservations (ACTIVE)
    API->>DB: COMMIT TX A
    Note over DB: Lock Released to TX B
    
    API->>DB: TX B: available = 1 - 1 - 0 = 0 (INSUFFICIENT)
    API->>DB: ROLLBACK TX B
    API-->>CustomerB: Error: "Stock agotado para este producto"
    API-->>CustomerA: Success: Order Created
```

### 3. Yape / Plin Payment Submission $\to$ Admin Verification
```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant App as Next.js App
    participant R2 as Cloudflare R2 Private
    participant DB as PostgreSQL
    actor Admin as Staff (Admin Backoffice)

    Customer->>App: Submits OpCode + Optional Voucher
    App->>R2: Upload voucher to gamerperu-private-proofs
    App->>DB: BEGIN TRANSACTION
    App->>DB: INSERT INTO payment_submissions (operation_code, proof_media_id, attempt_number: 1)
    App->>DB: UPDATE payments SET status = 'SUBMITTED'
    App->>DB: UPDATE inventory_reservations SET status = 'VERIFICATION_HOLD'
    App->>DB: INSERT INTO outbox_events (event_name: 'PaymentSubmitted', event_version: 1)
    App->>DB: COMMIT TRANSACTION
    App-->>Customer: Acknowledges submission (Review pending)
    
    Admin->>App: Opens Verification Workbench (/admin/orders)
    App->>DB: Fetch Order, Payment & PaymentSubmission
    App->>R2: Generate 5m Pre-signed URL
    Admin->>Admin: Confirms funds in mobile banking app
    Admin->>App: Clicks "Confirmar Pago" (decision: APPROVED)
    App->>DB: BEGIN TRANSACTION
    App->>DB: INSERT INTO payment_verifications (verifier_auth_user_id: Admin.id, decision: 'APPROVED')
    App->>DB: UPDATE payments SET status = 'PAID'
    App->>DB: UPDATE orders SET status = 'CONFIRMED'
    App->>DB: UPDATE inventory_reservations SET status = 'ALLOCATED'
    App->>DB: UPDATE inventory_items SET quantity_reserved = reserved - qty, quantity_allocated = allocated + qty
    App->>DB: INSERT INTO inventory_ledger_entries (ALLOCATION_CONFIRMED)
    App->>DB: INSERT INTO outbox_events (event_name: 'PaymentApproved', event_version: 1)
    App->>DB: COMMIT TRANSACTION
    App-->>Customer: Dispatches Payment Confirmed Email (Resend)
```

### 4. Reservation Expiry $\to$ Stock Release
```mermaid
sequenceDiagram
    autonumber
    participant Inngest as Inngest Cron Worker
    participant DB as PostgreSQL

    Inngest->>DB: SELECT * FROM inventory_reservations WHERE status = 'ACTIVE' AND expires_at < NOW() FOR UPDATE SKIP LOCKED
    loop For each expired reservation
        Inngest->>DB: UPDATE inventory_reservations SET status = 'RELEASED'
        Inngest->>DB: UPDATE inventory_items SET quantity_reserved = quantity_reserved - qty
        Inngest->>DB: UPDATE orders SET status = 'EXPIRED' WHERE id = res.order_id AND status = 'PENDING'
        Inngest->>DB: INSERT INTO inventory_ledger_entries (RESERVATION_EXPIRED)
        Inngest->>DB: INSERT INTO outbox_events (event_name: 'OrderExpired', event_version: 1)
    end
```

### 5. Cancellation / Refund $\to$ Financial & Inventory Effects
```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant App as Next.js Server Action
    participant DB as PostgreSQL

    Admin->>App: Issues Full Refund on Order
    App->>DB: BEGIN TRANSACTION
    App->>DB: Lock Payment (SELECT ... FOR UPDATE)
    App->>DB: Check requested_amount <= (amount_cents - refunded_amount_cents)
    App->>DB: INSERT INTO refunds (actor_auth_user_id: Admin.id, amount_cents, reason, external_reference)
    App->>DB: UPDATE payments SET status = 'REFUNDED', refunded_amount_cents = amount_cents
    App->>DB: UPDATE orders SET status = 'REFUNDED'
    alt Pre-Shipment Refund
        App->>DB: UPDATE inventory_items SET quantity_allocated = quantity_allocated - qty
        App->>DB: UPDATE inventory_reservations SET status = 'RELEASED'
        App->>DB: INSERT INTO inventory_ledger_entries (ALLOCATION_RELEASED)
    else Post-Delivery Return Accepted
        App->>DB: UPDATE shipments SET status = 'RETURNED'
        App->>DB: UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + qty
        App->>DB: INSERT INTO inventory_ledger_entries (RETURN_RESTOCKED)
    end
    App->>DB: INSERT INTO outbox_events (event_name: 'RefundIssued', event_version: 1)
    App->>DB: COMMIT TRANSACTION
    App-->>Admin: Success: Refund recorded and balances reconciled
```

### 6. Affiliate Conversion $\to$ Commission Qualification
```mermaid
sequenceDiagram
    autonumber
    participant Inngest as Inngest Worker
    participant DB as PostgreSQL

    Note over Inngest: Triggered on Shipment Delivered
    Inngest->>DB: UPDATE commissions SET status = 'PENDING', qualification_due_at = NOW() + ConfiguredWindow WHERE order_id = X
    
    Note over Inngest: Cron Polls Matured Commissions
    Inngest->>DB: SELECT * FROM commissions WHERE status = 'PENDING' AND qualification_due_at <= NOW() FOR UPDATE SKIP LOCKED
    loop For each matured commission
        Inngest->>DB: Check Order.status NOT IN ('CANCELLED', 'EXPIRED', 'REFUNDED')
        alt Order Healthy
            Inngest->>DB: UPDATE commissions SET status = 'QUALIFIED'
            Inngest->>DB: INSERT INTO outbox_events (event_name: 'CommissionQualified', event_version: 1)
        else Order Refunded
            Inngest->>DB: UPDATE commissions SET status = 'VOIDED', void_reason = 'ORDER_REFUNDED'
        end
    end
```

### 7. Commerce Mutation $\to$ Outbox $\to$ Inngest $\to$ EC OS
```mermaid
sequenceDiagram
    autonumber
    participant App as Next.js Server Action
    participant DB as PostgreSQL
    participant Inngest as Inngest Worker
    participant ECOS as Downstream EC OS

    App->>DB: BEGIN TRANSACTION
    App->>DB: Mutate Commerce Records (e.g. Order Placed)
    App->>DB: INSERT INTO outbox_events (id: UUIDv7, event_name: 'OrderPlaced', event_version: 1, payload: {...})
    App->>DB: COMMIT TRANSACTION
    
    Note over Inngest: Poller / Event Trigger
    Inngest->>DB: SELECT * FROM outbox_events WHERE status = 'PENDING' FOR UPDATE SKIP LOCKED
    Inngest->>ECOS: POST /webhooks/gamerperu (HMAC-SHA256 Signed, event_id: outbox.id)
    alt EC OS Responds 200 OK
        Inngest->>DB: UPDATE outbox_events SET status = 'DELIVERED', delivered_at = NOW()
    else EC OS Offline (5xx / Timeout)
        Inngest->>DB: UPDATE outbox_events SET retry_count = retry_count + 1, next_attempt_at = NOW() + Backoff
        Note over App,DB: Gamer Perú storefront remains 100% operational
    end
```

---

## 61. Complete State Transition Tables

### 1. Product Publication Lifecycle Table
| FROM | EVENT / COMMAND | TO | ALLOWED ACTOR | PRECONDITIONS | SIDE EFFECTS | IDEMPOTENCY BEHAVIOR | AUDIT EVENT | DOMAIN EVENT |
|---|---|---|---|---|---|---|---|---|
| `DRAFT` | `publish_product` | `PUBLISHED` | `ADMIN` | $\ge 1$ active variant; specs validated | Becomes crawlable on Storefront | No-op if already `PUBLISHED` | `catalog:publish` | `ProductPublished` |
| `PUBLISHED` | `archive_product` | `ARCHIVED` | `ADMIN` | None | Delisted from Storefront | No-op if already `ARCHIVED` | `catalog:archive` | `ProductArchived` |
| `DRAFT` | `archive_product` | `ARCHIVED` | `ADMIN` | None | Draft delisted | No-op if already `ARCHIVED` | `catalog:archive` | `ProductArchived` |
| `ARCHIVED` | `restore_product` | `PUBLISHED` | `ADMIN` | Specs valid | Re-indexed on Storefront | No-op if already `PUBLISHED` | `catalog:restore` | `ProductPublished` |

*Forbidden Transitions*: `PUBLISHED` $\to$ `DRAFT`.

---

### 2. Order Lifecycle Table
| FROM | EVENT / COMMAND | TO | ALLOWED ACTOR | PRECONDITIONS | SIDE EFFECTS | IDEMPOTENCY BEHAVIOR | AUDIT EVENT | DOMAIN EVENT |
|---|---|---|---|---|---|---|---|---|
| `PENDING` | `expire_order` | `EXPIRED` | `SYSTEM` | Unpaid reservation timer expired | Reservations $\to$ `RELEASED` | No-op if already `EXPIRED` | `orders:expire` | `OrderExpired` |
| `PENDING` | `approve_payment` | `CONFIRMED` | `ADMIN` | Payment is `PAID` | Reservations $\to$ `ALLOCATED` | Returns current order if `CONFIRMED` | `orders:approve_payment` | `OrderConfirmed` |
| `EXPIRED` | `reallocate_late_payment` | `CONFIRMED` | `ADMIN` | Payment `PAID` & all stock available | Replacement reservations created in `ACTIVE` $\to$ `ALLOCATED` | Idempotent on locked payment | `orders:late_allocate` | `OrderConfirmed` |
| `EXPIRED` | `refund_late_sold_out` | `REFUNDED` | `ADMIN` | Payment `PAID` & stock sold out | Full external refund recorded | Idempotent on refund record | `orders:late_refund` | `RefundIssued` |
| `PENDING`/`EXPIRED` | `cancel_order` | `CANCELLED` | `CUSTOMER`/`ADMIN`/`SYS` | Order unconfirmed | Reservations $\to$ `RELEASED` | No-op if already `CANCELLED` | `orders:cancel` | `OrderCancelled` |
| `CONFIRMED` | `start_processing`| `PROCESSING` | `ADMIN` | Order confirmed | Shipment $\to$ `READY_TO_PACK` | No-op if already `PROCESSING` | `orders:process` | N/A |
| `PROCESSING` | `confirm_delivery`| `FULFILLED` | `ADMIN`/`SYSTEM`| Shipment `DELIVERED` | Commission timer starts | No-op if already `FULFILLED` | `orders:fulfill` | `OrderDelivered` |
| `CONFIRMED`/`PROCESSING`/`FULFILLED` | `issue_full_refund`| `REFUNDED` | `ADMIN` | Full refund recorded | Stock adjusted; Commission adjusted | Idempotent on refund record | `orders:refund` | `RefundIssued` |

*Forbidden Transitions*: `CANCELLED` $\to$ `CONFIRMED`; `REFUNDED` $\to$ `PROCESSING`.

---

### 3. Payment Lifecycle Table
| FROM | EVENT / COMMAND | TO | ALLOWED ACTOR | PRECONDITIONS | SIDE EFFECTS | IDEMPOTENCY BEHAVIOR | AUDIT EVENT | DOMAIN EVENT |
|---|---|---|---|---|---|---|---|---|
| `UNPAID` | `submit_evidence` | `SUBMITTED` | `CUSTOMER` | OpCode provided | Reservation $\to$ `VERIFICATION_HOLD` | Replays cached submission on duplicate | `payments:submit` | `PaymentSubmitted` |
| `SUBMITTED` | `start_review` | `VERIFYING` | `ADMIN` | None | Locked for admin review | No-op if already `VERIFYING` | `payments:review` | N/A |
| `SUBMITTED`/`VERIFYING` | `approve_payment`| `PAID` | `ADMIN` | Bank funds confirmed (Stock available) | Order $\to$ `CONFIRMED`; Res $\to$ `ALLOCATED` | Returns success if already `PAID` | `payments:approve` | `PaymentApproved` |
| `SUBMITTED`/`VERIFYING` | `record_late_funds_sold_out`| `PAID` | `ADMIN` | Bank funds confirmed (Stock sold out) | Order remains `EXPIRED`; zero stock allocated | Returns success if already `PAID` | `payments:late_funds_received`| `PaymentApproved` |
| `SUBMITTED`/`VERIFYING` | `reject_terminal`| `REJECTED` | `ADMIN` | Fraud / No funds confirmed | Order $\to$ `CANCELLED`; Res $\to$ `RELEASED` | Returns success if already `REJECTED` | `payments:reject_terminal` | `PaymentRejected` |
| `SUBMITTED`/`VERIFYING` | `reject_retryable`| `UNPAID` | `ADMIN` | Illegible voucher | Res held in `VERIFICATION_HOLD`; grace set | Returns `UNPAID` status | `payments:reject_retryable`| `PaymentRejected` |
| `PAID` | `record_full_refund`| `REFUNDED` | `ADMIN` | Cumulative refund = total | Order $\to$ `REFUNDED` | Idempotent on refund record | `payments:refund` | `RefundIssued` |

*Forbidden Transitions*: `UNPAID` $\to$ `PAID` (customer bypass); `UNPAID` $\to$ `REJECTED` (unpaid cancellation leaves Payment as `UNPAID`).

---

### 4. Inventory Reservation Lifecycle Table
| FROM | EVENT / COMMAND | TO | ALLOWED ACTOR | PRECONDITIONS | SIDE EFFECTS | IDEMPOTENCY BEHAVIOR | AUDIT EVENT | DOMAIN EVENT |
|---|---|---|---|---|---|---|---|---|
| `ACTIVE` | `submit_payment` | `VERIFICATION_HOLD` | `SYSTEM` | Payment submitted | Expiry timer suspended | No-op if already `VERIFICATION_HOLD` | `inventory:hold` | N/A |
| `ACTIVE` | `expire_reservation`| `RELEASED` | `SYSTEM` | `expires_at < NOW()` | `reserved_delta = -qty`. Stock restored. | No-op if already `RELEASED` | `inventory:expire` | N/A |
| `ACTIVE`/`VERIFICATION_HOLD` | `cancel_reservation`| `RELEASED` | `ADMIN`/`SYS` | Order cancelled / terminal reject | `reserved_delta = -qty`. Stock restored. | No-op if already `RELEASED` | `inventory:release` | N/A |
| `ACTIVE` | `reacquire_late_stock`| `ALLOCATED` | `ADMIN` | Late payment verified & all stock locked | `reserved_delta = -qty`, `allocated_delta = +qty` | No-op if already `ALLOCATED` | `inventory:reacquire_allocate`| N/A |
| `VERIFICATION_HOLD` | `approve_allocation`| `ALLOCATED` | `ADMIN` | Payment approved | `reserved_delta = -qty`, `allocated_delta = +qty` | No-op if already `ALLOCATED` | `inventory:allocate` | N/A |
| `ALLOCATED` | `dispatch_shipment` | `CONSUMED` | `SYSTEM` | Courier dispatched | `allocated_delta = -qty`, `on_hand_delta = -qty` | No-op if already `CONSUMED` | `inventory:consume` | N/A |
| `ALLOCATED` | `release_allocation`| `RELEASED` | `ADMIN`/`SYS` | Pre-shipment refund | `allocated_delta = -qty` (ALLOCATION_RELEASED) | No-op if already `RELEASED` | `inventory:release_allocation` | N/A |

*Forbidden Transitions*: `RELEASED` $\to$ `ALLOCATED` (must create replacement reservation in `ACTIVE` under lock); `CONSUMED` $\to$ `ACTIVE`.

---

### 5. Fulfillment Lifecycle Table
| FROM | EVENT / COMMAND | TO | ALLOWED ACTOR | PRECONDITIONS | SIDE EFFECTS | IDEMPOTENCY BEHAVIOR | AUDIT EVENT | DOMAIN EVENT |
|---|---|---|---|---|---|---|---|---|
| `UNFULFILLED` | `start_packing` | `READY_TO_PACK` | `ADMIN` | Order `CONFIRMED` | Items claimed by staff | No-op if already `READY_TO_PACK` | `fulfillment:pack_start` | N/A |
| `READY_TO_PACK`| `complete_packing`| `PACKED` | `ADMIN` | Boxed & labeled | Ready for courier | No-op if already `PACKED` | `fulfillment:packed` | N/A |
| `PACKED` | `dispatch_courier`| `SHIPPED` | `ADMIN` | Tracking number | Res $\to$ `CONSUMED`. Outbox: `OrderShipped`. | No-op if already `SHIPPED` | `fulfillment:dispatch` | `ShipmentDispatched` |
| `SHIPPED` | `confirm_delivery`| `DELIVERED` | `ADMIN`/`SYS` | Courier confirmation | Order $\to$ `FULFILLED`. Outbox: `OrderDelivered`. | No-op if already `DELIVERED` | `fulfillment:deliver` | `OrderDelivered` |
| `SHIPPED`/`DELIVERED` | `accept_return` | `RETURNED` | `ADMIN` | RMA accepted & items received | Stock restocked (`RETURN_RESTOCKED`). | Idempotent on return RMA record | `fulfillment:return` | `ReturnAccepted` |

*Forbidden Transitions*: `UNFULFILLED` $\to$ `SHIPPED` (must pack first).

---

### 6. Commission Lifecycle Table
| FROM | EVENT / COMMAND | TO | ALLOWED ACTOR | PRECONDITIONS | SIDE EFFECTS | IDEMPOTENCY BEHAVIOR | AUDIT EVENT | DOMAIN EVENT |
|---|---|---|---|---|---|---|---|---|
| `PENDING` | `mature_qualification`| `QUALIFIED` | `SYSTEM` | Qualification window passed & order healthy | Eligible for payout batch | No-op if already `QUALIFIED` | `growth:commission_qualify` | `CommissionQualified` |
| `PENDING`/`QUALIFIED` | `void_commission` | `VOIDED` | `SYSTEM`/`ADMIN`| Order cancelled or net commission = 0 | Commission invalidated | No-op if already `VOIDED` | `growth:commission_void` | N/A |
| `QUALIFIED` | `approve_payout` | `APPROVED` | `ADMIN` | Payout batch created | Ready for banking payout | No-op if already `APPROVED` | `growth:commission_approve` | N/A |
| `APPROVED` | `execute_payout` | `PAID` | `ADMIN` | Bank transfer completed | Historical record immutable | No-op if already `PAID` | `growth:commission_paid` | `CommissionPaid` |

*Forbidden Transitions*: `PAID` $\to$ `VOIDED` (post-payout refunds insert `CommissionAdjustment`).

---

## 62. Critical Invariants

| # | Invariant Rule | Enforcement Mechanism |
|---|---|---|
| 1 | **Customer Submission $\ne$ Confirmed Payment** | Payment status `PAID` is set strictly by server-side Admin mutation after verifying actual bank receipt. |
| 2 | **Server-Authoritative Pricing** | Checkout calculates line totals from database `ProductVariant.price_cents`; client prices are discarded. |
| 3 | **Zero Negative Available Stock** | $\text{available\_to\_sell} = \text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated} \ge 0$. |
| 4 | **ProductVariant as Sellable Unit** | Stock, SKU, and cart lines attach exclusively to `ProductVariant`. |
| 5 | **Immutable OrderItem Snapshot** | Line item price, SKU, product name, and variant title are permanently frozen at purchase time. |
| 6 | **Immutable Address Snapshot** | Delivery address facts are frozen in `OrderAddressSnapshot`; customer address updates never alter historical orders. |
| 7 | **Immutable Promotion Snapshot** | Applied discount amounts and rules are frozen in `OrderPromotionSnapshot`. |
| 8 | **Payment Instructions Frozen** | Order records exact `payment_instruction_version_id` presented at checkout. |
| 9 | **Server-Enforced RBAC** | Privileged actions check `requirePermission('permission:name')` against database role mappings. |
| 10 | **At-Most-Once State Execution** | State transitions are idempotent; replaying a command returns identical state without duplicate side effects. |
| 11 | **Cancelled Orders Cannot Ship** | Fulfillment transitions reject orders with `Order.status = 'CANCELLED'`. |
| 12 | **Delivered History Is Preserved** | Returns and refunds mark status orthogonal without erasing historical delivery timestamps in `Shipment`. |
| 13 | **Refund $\ne$ Automatic Restock** | Financial refunds never increment physical `on_hand`; restock requires explicit warehouse return acceptance. |
| 14 | **Cumulative Refund Cap** | $\sum \text{Refund.amount\_cents} \le \text{Payment.amount\_cents}$ enforced under transaction row lock. |
| 15 | **Paid Commission Immutability** | Paid commissions are never deleted or set to `VOIDED`; post-payout refunds insert `CommissionAdjustment`. |
| 16 | **Downstream Non-Blocking** | EC OS, PostHog, or Resend downtime never rolls back a PostgreSQL commerce transaction. |
| 17 | **AI Advisory Only** | Artificial intelligence never holds authority over prices, stock, order transitions, or sensitive credentials. |

---

## 63. Edge-Case Matrix (25 Complete Scenarios)

| # | Scenario | Starting State | Command / Event | Resulting State | Inventory Consequence | Payment Consequence | Audit & Domain Events | Protection / Concurrency | Configurable Policy |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Concurrent Final Unit Purchase** | `avail = 1` | Customer A & B checkout | A: Order `PENDING`, B: Aborts | A: `reserved + 1`, B: None | A: Payment `UNPAID`, B: None | `OrderPlaced` (A) | `SELECT ... FOR UPDATE` row lock | N/A |
| 2 | **Price Changes While in Cart** | Cart has old price | Customer starts checkout | Price updated to current | None | None | `cart:price_recalculated` | Server-side pricing revalidation | N/A |
| 3 | **Variant Archived While in Cart** | Variant in Cart | Customer starts checkout | Checkout rejects item | None | None | None | Variant `status == 'ACTIVE'` check | N/A |
| 4 | **Coupon Expires in Cart** | Coupon in Cart | Customer clicks pay | Coupon rejected with alert | None | None | None | Real-time coupon validity check | N/A |
| 5 | **Duplicate Order Submit** | Cart active | Double-click Submit | Exactly 1 Order created | Reserved exactly once | Exactly 1 Payment | `OrderPlaced` | `IdempotencyKey` on checkout token | N/A |
| 6 | **Duplicate Payment Submission** | Payment `UNPAID` | Double-click Submit OpCode| Exactly 1 Submission added | None | Payment `SUBMITTED` | `PaymentSubmitted` | `IdempotencyKey` on submission attempt | N/A |
| 7 | **Payment Proof Omitted** | Payment `UNPAID` | Submit OpCode without image| Payment `SUBMITTED` | `VERIFICATION_HOLD` | OpCode captured | `PaymentSubmitted` | Validates proof is optional in v1 | N/A |
| 8 | **Proof Storage Unavailable** | Uploading voucher | Cloudflare R2 5xx | OpCode saved; voucher alerts| `VERIFICATION_HOLD` | OpCode captured | `payments:voucher_upload_failed`| Graceful storage degradation | `[TBD BUSINESS DECISION]` |
| 9 | **Payment Submitted at Expiry Edge**| `expires_at` in 5s | Customer submits OpCode | Payment `SUBMITTED` | `VERIFICATION_HOLD` (timer stops)| OpCode captured | `PaymentSubmitted` | Transaction acquires row lock | N/A |
| 10 | **Payment Submitted After Expiry** | Order `EXPIRED`, Res `RELEASED`| Customer submits OpCode | Payment `SUBMITTED` (`is_late`)| Stock not held; manual review | OpCode captured | `payments:late_submission` | Admin manual stock allocation / refund | `[TBD BUSINESS DECISION]` |
| 11 | **Two Admins Approve Concurrently** | Payment `SUBMITTED` | Admin 1 & 2 click Approve | Admin 1 succeeds; 2 no-ops | Converted to `ALLOCATED` once| Payment `PAID` once | `PaymentApproved` (single) | Row lock on `Payment` | N/A |
| 12 | **Admin Rejects Already-Paid** | Payment `PAID` | Admin clicks Reject | Mutation rejected | Allocated stock remains | Payment remains `PAID` | `payments:invalid_transition` | State transition guard | N/A |
| 13 | **Access Other Customer Order** | Customer B logged in| GET `/orders/GP-CUST-A` | 404 / 403 Forbidden | None | None | `security:unauthorized_access` | Server-verified `getClaims()` query filter | N/A |
| 14 | **Cancel Order Before Payment** | Order `PENDING` | Customer clicks Cancel | Order `CANCELLED` | Reservation $\to$ `RELEASED` | Payment remains `UNPAID` | `OrderCancelled` | State machine transition | N/A |
| 15 | **Cancel During Verification** | Payment `SUBMITTED` | Customer requests cancel | Admin alerted; review needed| Held until admin resolves | Resolves before cancel | `orders:cancel_requested` | Prevents releasing stock if paid | `[TBD BUSINESS DECISION]` |
| 16 | **Refund After Commission Exists** | Commission `PENDING` | Admin issues Full Refund | Commission `VOIDED` | Pre-ship: released; Post: RMA | Refund recorded | `RefundIssued`, `CommissionVoided`| Commission qualification check | N/A |
| 17 | **Product Renamed After Order** | Product name changed | Admin views past order | Order displays snapshot | None | None | None | `OrderItem.product_name_snapshot` | N/A |
| 18 | **Address Edited After Order** | Address edited in book | Customer views past order | Order displays snapshot | None | None | None | `OrderAddressSnapshot` immutability | N/A |
| 19 | **Inventory Manual Correction** | Warehouse count off | Admin inputs physical audit | `on_hand` updated | `on_hand_delta` logged | None | `inventory:manual_adjustment` | Ledger entry with actor & reason | N/A |
| 20 | **EC OS Offline During Purchase** | EC OS unreachable | Order completed on web | Order `CONFIRMED` locally | Stock allocated locally | Payment `PAID` locally | `OutboxEvent` queued | Outbox retry with backoff | N/A |
| 21 | **PostHog Offline During Purchase** | PostHog unreachable | Order completed on web | Order unaffected | Stock unaffected | Payment unaffected | Sentry logs warning | Non-blocking telemetry | N/A |
| 22 | **AI Provider Offline** | OpenAI/Anthropic 5xx | AI product research job | Job queued in Inngest | None | None | `ai:provider_error` | Inngest step retries | N/A |
| 23 | **Resend Offline During Payment** | Resend 5xx | Payment approved | Order `CONFIRMED` | Stock allocated | Payment `PAID` | Email job queued in Inngest | Async worker retries | N/A |
| 24 | **Outbox Delivery Duplicated** | Network glitch | EC OS receives duplicate | EC OS drops duplicate | None | None | `outbox:duplicate_delivered` | HMAC + `event_id` (`outbox.id`) | N/A |
| 25 | **Affiliate Self-Referral Attempt**| Affiliate clicks own link| Places order | Attribution rejected | Normal stock allocation | Normal payment | `growth:self_referral_blocked`| `affiliate.auth_user_id != cust.auth_user_id`| N/A |

---

## 64. Business Policy TBD Boundary

The following commercial decisions remain explicitly **`[TBD BUSINESS DECISION]`** and are configured via parameters without hardcoded domain logic:
1. **Courier Provider & API Integrations**: Shalom, Olva, domestic couriers.
2. **Delivery SLA & Shipping Rates**: Fixed/dynamic rates per Peruvian department.
3. **Warranty Duration & Return Window**: Return eligibility periods (e.g. 7, 15, or 30 days).
4. **Reservation Hold TTL**: Numeric unpaid checkout duration (`RESERVATION_TTL_MINUTES`, e.g. 15, 30, or 60 minutes).
5. **Resubmission Grace Duration**: Time window to resubmit voucher upon non-terminal rejection (`PAYMENT_RESUBMISSION_GRACE_DURATION`).
6. **Cart Expiry Duration**: Transient cart lifetime (`CART_EXPIRY_DURATION`).
7. **Max Cart Line Quantity**: Per-item ceiling (`MAX_CART_LINE_QUANTITY`).
8. **Max Coupons Per Order**: Maximum coupon count per checkout (`MAX_COUPONS_PER_ORDER`).
9. **Growth Attribution Precedence**: Priority between referral and affiliate tracking (`GROWTH_ATTRIBUTION_PRECEDENCE`).
10. **Affiliate Attribution Window**: Maturation period for referral cookies (`AFFILIATE_ATTRIBUTION_WINDOW_DAYS`).
11. **Affiliate Commission Rates**: Default basis points per partner tier.
12. **Commission Qualification Window**: Maturation period following delivery (`COMMISSION_QUALIFICATION_WINDOW_DAYS`).
13. **Customer Support Communication Channel**: Configuration slot for helpdesk/messaging.

---

## 65. Later-GP Ownership Map

| Domain Area | Governing GP Gate | Implementation Responsibility |
|---|---|---|
| **Authentication & Sessions** | **GP-015** | Supabase Auth (Email/Password + Google OAuth), Next.js SSR session cookies (`@supabase/ssr`), `getClaims()` verification, Resend custom SMTP. |
| **Customer Account Portal** | **GP-016** | Customer profile, address book, personal order views. |
| **Cart Domain & Drawer** | **GP-017** | Cart state management, anonymous merge, local storage sync. |
| **Checkout Flow** | **GP-018** | Multi-step checkout, address capture, atomic order transaction. |
| **Yape / Plin Payments** | **GP-019 / GP-020** | QR code display, operation code submission, voucher upload. |
| **Orders & Inventory Engine** | **GP-021** | Inventory reservations, multi-balance ledger movements, stock tracking. |
| **Admin Catalog & Story** | **GP-024 / GP-026** | Product CRUD, 13 visual story blocks, specification schema builder. |
| **Admin Order & Verification** | **GP-027 / GP-028** | Orders workbench, payment verification review, 5m signed URLs. |
| **Referrals & Affiliates** | **GP-031 / GP-032 / GP-034** | Referral rewards, affiliate tracking, commission qualification & adjustments. |
| **AI Customer Assistant** | **GP-035** | Tool gateway, session-filtered customer order queries. |
| **Analytics Engine** | **GP-040** | PostHog event dispatch, server-side purchase tracking. |
| **EC OS Downstream Integration** | **GP-042** | Versioned event payload contracts, outbox webhook delivery. |

---

## 66. Inputs for GP-005 (Repository Bootstrap)

This specification establishes the canonical domain inputs and schema blueprints available to **GP-005** and subsequent implementation GPs:

### 1. Drizzle Schema Module Organization Blueprint
Grouped into modular schema files under `src/db/schema/`:
- `catalog.ts`: `brands`, `categories`, `collections`, `product_collections`, `products`, `product_variants`, `category_spec_schemas`, `product_specs`, `product_stories`, `product_story_revisions`, `media_assets`. (11 entities)
- `rbac.ts` (or `auth.ts`): `roles`, `permissions`, `role_permissions`, `user_roles`. (4 Gamer Perú RBAC entities; external FK $\to$ `auth.users(id)`)
- `customers.ts`: `customer_profiles`, `customer_addresses`, `wishlist_items`, `reviews`. (4 entities)
- `cart.ts`: `carts`, `cart_items`. (2 entities)
- `inventory.ts`: `inventory_locations`, `inventory_items`, `inventory_ledger_entries`, `inventory_reservations`. (4 entities)
- `orders.ts`: `orders`, `order_items`, `order_address_snapshots`, `order_pricing_snapshots`, `order_promotion_snapshots`. (5 entities)
- `payments.ts`: `payment_method_configurations`, `payment_instruction_versions`, `payments`, `payment_submissions`, `payment_verifications`, `refunds`. (6 entities)
- `shipping.ts`: `shipping_methods`, `shipments`, `shipment_items`. (3 entities)
- `promotions.ts`: `promotions`, `promotion_targets`, `coupons`, `coupon_redemptions`. (4 entities)
- `growth.ts`: `referral_programs`, `referral_codes`, `referral_attributions`, `affiliates`, `affiliate_codes`, `affiliate_clicks`, `affiliate_attributions`, `commissions`, `commission_adjustments`, `commission_payout_batches`. (10 entities)
- `system.ts`: `content_slots`, `audit_events`, `domain_events`, `outbox_events`, `idempotency_keys`. (5 entities)

### 2. Entity Count Classification
- **Gamer Perú Domain & System Entities**: Exactly 58 physical table candidates.
- **Supabase Auth Provider Schema (`auth.users`, etc.)**: Managed internally by Supabase and excluded from Gamer Perú Drizzle tables.

### 3. UUIDv7 & Extension Guidelines
- **UUIDv7 Strategy**: PostgreSQL `uuid` column type. UUIDv7 values generated at application layer using TypeScript RFC 9562 library.
- **PostgreSQL Built-In Capabilities & Extensions**: PostgreSQL built-in FTS (`to_tsvector`); `pg_trgm` extension for typo-tolerant trigram similarity search.

---

## 67. GP-004 Definition of Done

* [x] Canonical `COMMERCE_DOMAIN_MODEL.md` created covering all 67 required sections.
* [x] Exactly one authoritative owner established for each orthogonal lifecycle (Order, Payment, Fulfillment, Reservation).
* [x] Supabase Auth identity boundary specified (`auth.users.id UUID`), separating managed auth from Gamer Perú customer profiles and RBAC.
* [x] Canonical 58 Gamer Perú physical entity count verified.
* [x] Payment `REJECTED` semantics reconciled (unpaid cancellation leaves `Payment.status = 'UNPAID'`; terminal rejection moves to `REJECTED`).
* [x] Payment verification decisions structured as `APPROVED`, `REJECTED_RETRYABLE`, `REJECTED_TERMINAL`.
* [x] Resubmission grace deadline and post-deadline Admin resolution defined without auto-releasing stock.
* [x] Late payment reacquisition modeled as multi-item all-or-nothing with replacement reservations transitioning `ACTIVE -> ALLOCATED` under lock.
* [x] Late funds received on sold-out orders modeled explicitly with immediate full refund recording.
* [x] All 9 columns present across all 6 lifecycle transition tables.
* [x] All 7 Mermaid sequence diagrams and 6 Mermaid state diagrams fully reconciled.
* [x] Complete 25-scenario edge-case matrix present and fully articulated.
* [x] Event versioning (`event_version`) and Outbox idempotency identifier (`OutboxEvent.id`) specified.
* [x] Zero application source code, Drizzle schemas, migrations, or `package.json` created.
* [x] GP-005 remains PLANNED and unexecuted.

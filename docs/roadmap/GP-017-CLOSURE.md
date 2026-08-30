# GP-017 — Closure Report

## Status

COMPLETE

---

## Checkpoints

- **Prerequisite GP-016 Accepted Checkpoint**: `108833663a8a329ba26a978f8cb08ea7f25e40e6`
- **Canonical GP-017 Starting Repository Checkpoint**: `108833663a8a329ba26a978f8cb08ea7f25e40e6`
- **First GP-017 Schema Checkpoint**: `69a3bf10fbb1ad1e0b5711202e84457e5e09f4b5`
- **Key GP-017 Milestones & Gate Lineage**:
  - `CART1`: Cart Schema & Migration Candidate `[APPROVED / CLOSED]` (`69a3bf10fbb1ad1e0b5711202e84457e5e09f4b5`)
  - `CART2`: Pristine Local PostgreSQL Schema Verification `[APPROVED / CLOSED]` (Evidence gate)
  - `CART2-BR1`: Evidence & Diff Reconciliation `[APPROVED / CLOSED]` (`f80aac469d4bcbfcefa2d057a6e1cefa26955a8f`)
  - `CART3`: Hosted Migration 0008 Deployment & Verification `[APPROVED / CLOSED]` (Deployment gate)
  - `CART4`: Server-Side Cart Runtime Initial Implementation `[APPROVED / CLOSED]` (`d43e5c147779fbf9bc1d51c09eb627694119d677`)
  - `CART4-R1`: Runtime Lifecycle & Live Verification Hardening `[APPROVED / CLOSED]` (`682f73e970b8c6411fef80ef0a320bb2ceea167c`)
  - `CART4-R2`: Expired-Session Concurrency Verification `[APPROVED / CLOSED]` (`455d5924d5718dfd7d54c038379469e3ee3165b5`)
  - `CART4-R3`: Anonymous Authority Lifecycle Hardening `[APPROVED / CLOSED]` (`87746399ba7b4d45543c7cb529cb66195fbcf6fe`)
  - `CART4-R4`: Expired-Session Advisory-Lock Serialization `[APPROVED / CLOSED]` (`4d7ace8c44a062e21f4c049a4fc11c4448ccdaae`)
  - `CART5-PLAN`: Storefront Cart UI Architecture & Plan Iterations (R1–R3) `[APPROVED WITH BINDING AMENDMENTS / CLOSED]` (Planning gates)
  - `CART5`: Storefront Cart UI Initial Implementation `[REVIEWED / REMEDIATED]` (`7920a47ee8d9f200005e75977ca04ba0bfd19d1a`)
  - `CART5-R1`: Storefront Cart UI Verification Remediation `[BLOCKED BY REMOTE CI AUTH / REMEDIATED]` (`859c9c148b12152a14f855bda527b7b86576e070`)
  - `CART5-R2`: Real Cart E2E / PostgreSQL Conflict-Inference Remediation `[REMEDIAL COMMITS AUDITED / CLOSED]`:
    - `d643112456dc83faace50c025541503124879bc4` (`fix(cart): stabilize real storefront cart e2e`)
    - `7ad98c3868d43e570a7707d5b0156971fe681345` (`fix(cart): align onconflict predicate with active unique index`)
    - `73948fdcda30de498b5e0e83c2ec76ff8e04dd03` (`fix(cart): scope storefront e2e locators and contrast`)
    - `d412752df3142b14b02f0cd0f5b3716d5bde172a` (`test(cart): fix variant selector role in storefront e2e`)
  - `CART5-R3`: Fixed-Event Logging Reconciliation & Final Verification `[CODE AND CI APPROVED / PENDING LIVE EVIDENCE]` (`b2310f066073a34854666d69234b50ba37060eea`)
  - `CART5-R4`: Live PostgreSQL Fixture Repair & Final Evidence `[APPROVED / CLOSED]` (`4fa13c52d1005a8c235e9ace6078cdaaee186f8e`)
- **Accepted Implementation Checkpoint**: `4fa13c52d1005a8c235e9ace6078cdaaee186f8e`

---

## Executive Summary

GP-017 delivers the complete, authoritative persistent Cart domain and storefront experience for Gamer Perú. The implementation enforces strict server-side cryptographic authority, real PostgreSQL relational persistence with race-free concurrency semantics, zero-personalization public Server Component boundaries, accessible Drawer and full-page `/carrito` UI surfaces, and complete real Supabase E2E verification:

1. **Relational Database Schema & Partial Unique Indexes**: Deployed migration `0008_small_logan.sql` creating tables `carts` and `cart_items` with strict XOR ownership (`customer_id` XOR `session_token`), PostgreSQL partial unique indexes enforcing at most one `ACTIVE` cart per owner, cascading line item deletions, and integer quantity bounds (1..10).
2. **Cryptographic Authority & Session Lifecycle**: Anonymous cart state is secured by a server-generated 256-bit entropy token (43-character base64url) stored in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie (`gp_cart_session` in development, `__Secure-gp_cart_session` in production). Authenticated cart access derives identity strictly from verified Supabase JWT claims (`authUserId` -> `CustomerProfile`), failing closed (`PROFILE_REQUIRED`) without anonymous fallback when a profile is missing.
3. **Robust Concurrency & Advisory Lock Serialization**: Implemented transactional row-level locking (`SELECT ... FOR UPDATE`), atomic quantity updates (`LEAST(quantity + delta, 10)`), and PostgreSQL transaction-scoped advisory locks (`pg_advisory_xact_lock`) keyed on token hashes to serialize same-token authority transitions and eliminate split-cart replacement races during concurrent expired-session requests.
4. **Lazy Guest-to-Authenticated Merge**: On first authenticated Cart access, any active guest cart with items is atomically merged into the customer's active Cart (summing duplicate variant quantities up to 10), retiring the source guest cart to `ABANDONED` (never `CONVERTED`).
5. **Catalog Hydration & Price Integrity**: Real-time pricing and line availability are hydrated directly from the PostgreSQL catalog at query time. The client never submits authoritative prices, totals, or availability flags. Items with unrepresented status (`DRAFT`/`ARCHIVED` product or `INACTIVE` variant) are marked `available: false` with disabled quantity steppers while preserving user visibility and removal controls.
6. **Storefront Cart UI & Client State (`CartProvider`)**: Delivered a responsive, accessible Cart experience featuring desktop and mobile Header launchers with authoritative item count badges, a native `<dialog>` slide-out Cart Drawer with focus trapping/restoration, seamless PDP Add-to-Cart island integration, and a dedicated `/carrito` page. All client UI state synchronizes through a single global `CartProvider` using an isolated post-hydration Server Function (`loadCurrentCartAction`), preserving static caching across public storefront routes (`/`, `/carrito` shell).
7. **Comprehensive Local & CI Validation**: Verified against canonical local Supabase PostgreSQL (`127.0.0.1:54322/postgres`) with 14/14 passing live concurrency integration tests (`pnpm test:cart:live`), 11/11 passing browser Playwright scenarios (`pnpm test:cart:e2e`), 54 test files passed; 763 tests passed and 1 skipped (764 total), clean production Next.js builds, and 0 serious and 0 critical violations in the open Cart Drawer Axe accessibility audit.

---

## Scope Delivered vs Explicitly Out of Scope

### Scope Delivered

- **Relational Cart Persistence**: Complete PostgreSQL data model (`carts`, `cart_items`) with partial unique indexes, foreign key constraints, and 9 canonical migration files total.
- **Server-Side Cart Runtime**: Server-only read module (`getCurrentCart`), mutation actions (`addCartItemAction`, `updateCartItemQuantityAction`, `removeCartItemAction`), and zero-input UI bridge (`loadCurrentCartAction`).
- **Cryptographic Anonymous Session Authority**: 256-bit entropy base64url tokens, secure cookie lifecycle, 30-day sliding TTL on successful mutations.
- **Authenticated Authority & Claim Verification**: Supabase SSR JWT verification, profile resolution, fail-closed `PROFILE_REQUIRED` handling when profile is missing.
- **Guest-to-Authenticated Merge**: Lazy transactional merge on authenticated read/mutation, duplicate summing up to 10, guest retirement to `ABANDONED`.
- **Concurrency & Advisory Lock Hardening**: Row locks, advisory locks for expired-session replacement serialization, conflict-safe inserts.
- **Storefront Cart UI Components**: Header launchers (desktop/mobile), badge counters, global native `<dialog>` Cart Drawer, PDP Add-to-Cart island, `/carrito` page, empty states, error states, and `PROFILE_REQUIRED` callouts.
- **Accessibility & Motion Compliance**: Focus containment, focus return to exact opener, `Escape` handling, 44x44px touch targets, live region status updates, `prefers-reduced-motion` adherence.
- **Automated Test Infrastructure**: Real local Supabase integration suite (`tests/integration/cart-live-concurrency.test.ts`) and Playwright E2E suite (`tests/e2e/cart-storefront.spec.ts`).

### Explicitly Out of Scope (Deferred to Future GPs)

- **Checkout & Order Creation**: Managed exclusively under **GP-018** (`docs/roadmap/GP-018.md`).
- **Payment Processing & Payment Proof**: Manual Yape/Plin verification and automated payment gateways remain deferred to checkout/payment GPs.
- **Inventory Ledger & Stock Reservations**: Managed exclusively under **GP-021** (Inventory). Cart availability reflects catalog eligibility only (`PUBLISHED` product + `ACTIVE` variant).
- **Coupons, Discounts & Promotions**: Deferred to promotion/discount roadmap milestones.
- **Customer Referral Logic**: Deferred to referral program milestones.

---

## Cart Persistence & Database Architecture

Cart data is stored in PostgreSQL and managed via Drizzle ORM through migration `0008_small_logan.sql`:

```
                           +---------------------------------------------------+
                           |                      carts                        |
                           +---------------------------------------------------+
                           | id (UUIDv7, PK)                                   |
                           | customer_id (UUID, FK -> customer_profiles.id)    |
                           | session_token (VARCHAR(64))                       |
                           | status (cart_status: ACTIVE, CONVERTED, ABANDONED)|
                           | currency (VARCHAR(3), default 'PEN')              |
                           | expires_at (TIMESTAMPTZ, NOT NULL)                |
                           | created_at / updated_at (TIMESTAMPTZ, NOT NULL)   |
                           +---------------------------------------------------+
                                            |
                         1 : N (CASCADE)    |
                                            v
                           +---------------------------------------------------+
                           |                    cart_items                     |
                           +---------------------------------------------------+
                           | id (UUIDv7, PK)                                   |
                           | cart_id (UUID, FK -> carts.id, ON DELETE CASCADE) |
                           | variant_id (UUID, FK -> product_variants.id)      |
                           | quantity (INTEGER, CHECK 1..10)                   |
                           | created_at / updated_at (TIMESTAMPTZ, NOT NULL)   |
                           | UNIQUE (cart_id, variant_id)                      |
                           +---------------------------------------------------+
```

### Key Database Invariants:

1. **Ownership XOR**: `CHECK ((customer_id IS NOT NULL AND session_token IS NULL) OR (customer_id IS NULL AND session_token IS NOT NULL))`.
2. **Partial Unique Indexes**:
   - `cart_active_customer_idx`: `UNIQUE (customer_id) WHERE status = 'ACTIVE' AND customer_id IS NOT NULL`
   - `cart_active_session_idx`: `UNIQUE (session_token) WHERE status = 'ACTIVE' AND session_token IS NOT NULL`
3. **Cart Item Uniqueness**: `UNIQUE (cart_id, variant_id)` prevents duplicate variant rows in the same cart.
4. **Canonical Migration Files**: Exactly 9 migration files (`0000` through `0008_small_logan.sql`). Zero `0009` migrations created.
5. **Hosted Deployment (CART3)**: Applied to hosted Supabase with PostgREST Data API exposure set to `OFF`. Zero hosted test mutations were introduced.

---

## Authority, Session Model & Request Flow

The Cart system distinguishes between **passive read operations** and **stateful mutation operations**:

```
                              +------------------------------------------+
                              |          Incoming HTTP Request           |
                              +------------------------------------------+
                                                   |
                                 [Evaluate Authenticated Identity]
                                                   |
                  +--------------------------------+--------------------------------+
                  | Verified JWT                                                    | No Session / Invalid JWT
                  v                                                                 v
     [Get CustomerProfile by authUserId]                               [Read Anonymous Session Cookie]
                  |                                                                 |
         +--------+--------+                                               +--------+--------+
         | Found           | Missing Profile                               | Valid Active    | No Active Cart /
         v                 v                                               | Cart Token      | Missing / Stale
  [Authenticated]   [PROFILE_REQUIRED]                                     v                 v
   (60-Day TTL)      (Fail-Closed, 0 Downgrade)                    [Active Anon Cart]  [PASSIVE READ] -> Empty Zero-State
                                                                           |           (0 DB writes, 0 Cookies set)
                                                                           |
                                                                           +---------> [MUTATION] -> Generate Token,
                                                                                       Create Cart, Set Cookie on commit
```

### Operational Rules:

1. **Passive Anonymous Read (`getCurrentCart`)**:
   - When no valid authoritative active anonymous Cart exists, `getCurrentCart()` returns the empty Cart zero-state (`createEmptyCartSnapshot()`).
   - It performs **zero database writes**, creates **no session token**, sets **no cookies**, and does **not slide TTL**.
2. **Anonymous Mutation Resolution**:
   - When an anonymous user performs an Add-to-Cart mutation without an existing active Cart, the server generates a fresh 256-bit cryptographically secure token (`randomBytes(32).toString("base64url")`), creates the canonical `ACTIVE` Cart in PostgreSQL, and sets the `HttpOnly` cookie upon transaction commit.
3. **Cookie Security Attributes**:
   - Name: `gp_cart_session` (development) / `__Secure-gp_cart_session` (production).
   - Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `maxAge=2592000` (30 days), `Secure` in production.
4. **Authenticated Identity**:
   - Resolves `auth_user_id` from Supabase SSR verified JWT claims to `customer_profiles.id`. Client-supplied owner IDs (`customerId`, `profileId`, `authUserId`, `cartId`) are strictly rejected.
5. **Profile Requirement (`PROFILE_REQUIRED`)**:
   - Applies strictly when a valid authenticated identity exists but its `CustomerProfile` cannot be resolved. In this state, Cart operations fail closed (`{ success: false, code: "PROFILE_REQUIRED" }`) rather than downgrading to anonymous authority.
   - Anonymous shoppers without an authenticated session are legitimate Cart users and operate normally under the anonymous authority contract.

---

## TTL, Expiry & Token Lifecycle Semantics

| Cart Authority State                              | Lifespan             | Sliding Trigger                                 | Expiry & Token Lifecycle Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| :------------------------------------------------ | :------------------- | :---------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Case A: Known Expired `ACTIVE` Anonymous Cart** | 30 days (`2592000s`) | Successful mutation (`add`, `update`, `remove`) | When a valid 43-character token belongs to an existing `ACTIVE` Cart that has expired: (1) acquire transaction-scoped advisory lock on token hash, (2) lock expired row, (3) mark old Cart `ABANDONED`, (4) do not revive old lines, (5) for mutations requiring replacement, create a fresh empty `ACTIVE` Cart using the **SAME already-server-issued token**, (6) continue mutation, (7) refresh cookie `maxAge` on commit. **This is intentionally not token rotation.** |
| **Case B: Historical Inactive Token Replay**      | Static               | Never slides                                    | If a valid-format token maps only to historical `ABANDONED` or `CONVERTED` Cart state, it is not authoritative for a new Cart. A subsequent anonymous mutation **rotates to a fresh cryptographically random token**.                                                                                                                                                                                                                                                        |
| **Case C: Unknown / Malformed / Missing Token**   | N/A                  | N/A                                             | Unknown or malformed tokens are never reused. A fresh anonymous mutation generates a new 256-bit cryptographic token.                                                                                                                                                                                                                                                                                                                                                        |
| **Authenticated `ACTIVE` Cart**                   | 60 days (`5184000s`) | Successful mutation                             | Retired to `ABANDONED`. Subsequent mutation creates fresh active Cart for that customer.                                                                                                                                                                                                                                                                                                                                                                                     |

### Concurrency Primitives:

- **Row-Level Locking**: Mutations lock target cart rows (`SELECT id, status, expires_at FROM carts WHERE ... FOR UPDATE`) within database transactions.
- **Advisory Locks for Expired Replacement**:
  ```ts
  const lockKey = hashTokenToInt64(sessionToken);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);
  ```
  Serializes simultaneous requests using the same expired token, preventing split-brain replacement carts.
- **PostgreSQL Partial Unique ON CONFLICT Inference**:
  Aligned runtime conflict inference predicates with canonical partial unique indexes (`WHERE status = 'ACTIVE' AND session_token IS NOT NULL` / `WHERE status = 'ACTIVE' AND customer_id IS NOT NULL`) to allow PostgreSQL to infer the intended compatible index.

---

## Lazy Guest-to-Authenticated Merge Semantics

```
[Authenticated User Interacts with Cart] -> [Inspect Guest Cookie: gp_cart_session]
                                                         |
                      +----------------------------------+----------------------------------+
                      | Valid ACTIVE Guest with Lines                                       | No Guest / Empty / Expired / Stale
                      v                                                                     v
     [Lock Auth Cart & Guest Cart (FOR UPDATE)]                             [Evaluate Authenticated Cart State]
                      |                                                                     |
     [Transfer Distinct Lines -> Auth Cart]                                 - Empty/Expired Guest: Mark ABANDONED, Clear Cookie
     [Sum Duplicate Lines: LEAST(auth.qty + guest.qty, 10)]                 - Stale/Malformed Guest: Clear Cookie
                      |                                                     - Passive Read: Return Auth State (0 Empty Cart writes)
     [Update Guest Cart: status = 'ABANDONED'] (Never CONVERTED)            - Mutation: Resolve/Create Auth Cart Destination
     [Clear Guest Cookie]
```

- **Trigger**: First authenticated cart interaction (read or mutation), not auth callback.
- **Valid ACTIVE Guest with Lines**: Merged transactionally into the authenticated Cart; duplicate variants summed up to 10 units; guest cart retired to `ABANDONED`.
- **Valid ACTIVE but EMPTY Guest**: Guest authority is retired/cleared. Does **not** manufacture an empty authenticated Cart solely because an empty guest existed.
- **Expired Guest**: Marked `ABANDONED` and cleared. Does **not** merge and does **not** manufacture an authenticated Cart.
- **Stale / Malformed Guest Token**: Cleared safely; authenticated flow continues without manufacturing destination cart state solely due to stale guest presence.
- **Destination Creation**: An authenticated Cart is created during a _mutation_ (because the mutation requires a destination), not as an automatic side-effect of observing an empty/expired guest during passive read.

---

## Public Cart DTO (`CartSnapshot`) & Server Boundary

Public cart data exposed to the client is strictly scrubbed of internal database IDs, tokens, and metadata:

```ts
export interface CartSnapshot {
  currency: "PEN";
  lineCount: number;
  itemCount: number;
  subtotalCents: number;
  hasUnavailableItems: boolean;
  lines: CartSnapshotLine[];
}

export interface CartSnapshotLine {
  variantId: string;
  sku: string;
  productSlug: string;
  productName: string;
  variantTitle: string;
  selectedAttributes: Record<string, string>;
  featuredImageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineSubtotalCents: number;
  available: boolean;
}
```

- **Excluded Fields**: `carts.id`, `cart_items.id`, `session_token`, `customer_id`, `auth_user_id`, `expires_at`, `status`.
- **Server Module Entrypoints**:
  - `src/lib/cart/read.ts` -> `getCurrentCart()` (server-only read)
  - `src/lib/cart/actions.ts` -> `addCartItemAction`, `updateCartItemQuantityAction`, `removeCartItemAction` (server mutations)
  - `src/lib/cart/bootstrap-action.ts` -> `loadCurrentCartAction()` (zero-argument client-to-server bootstrap bridge)

---

## Storefront UI & Client Architecture

```
                                +---------------------------+
                                |     <CartProvider>        |
                                |  Single Source of Truth   |
                                +---------------------------+
                                              |
                   +--------------------------+--------------------------+
                   |                          |                          |
                   v                          v                          v
         [Header Cart Launchers]       [Global Cart Drawer]       [Full /carrito Page]
         - Desktop (Header Actions)   - Native <dialog> Modal    - Server Component Shell
         - Mobile (390px Viewport)    - Focus Trap & Restore     - Shared Provider Sync
         - Authoritative Badge        - In-Drawer Steppers       - robots: noindex, follow
```

### Key UI Features:

1. **Header Launchers**: Desktop and mobile icons displaying real-time `itemCount` badge (hidden when 0).
2. **Global Cart Drawer**: Native `<dialog>` modal with sliding CSS animation, accessible close button, backdrop click dismissal, `Escape` key capture, and precise focus restoration to the opening element.
3. **PDP Add-to-Cart Island**: Client component on Product Detail Pages integrated with variant selection; disables when variant is unselected or inactive; displays inline feedback and opens the Cart Drawer upon successful addition.
4. **Full-Page `/carrito`**: Responsive layout with item breakdown, thumbnail media, quantity steppers, item deletion, subtotal summary, and informative Yape/Plin payment guidance.
5. **Static Shell Preservation**: Public routes (`/`, `/carrito` shell) avoid personalized cart server-reads during SSR, fetching authoritative cart state post-hydration via `loadCurrentCartAction()`.

---

## Security & Observability

- **Zero Token Leakage**: Anonymous tokens exist solely in `HttpOnly` cookies and are never serialized into HTML, JSON-LD, React props, or client state.
- **Session Fixation Defense**: Replay of historical `ABANDONED` or `CONVERTED` tokens rotates authority to a fresh cryptographic token. Known-expired `ACTIVE` tokens are serialized via advisory lock to replace the cart using the same proven token.
- **Fail-Closed Authorization**: When an authenticated identity is missing its `CustomerProfile`, operations fail closed (`PROFILE_REQUIRED`) rather than downgrading to anonymous authority. Legitimate anonymous shoppers continue using anonymous authority.
- **Fixed-Event Logging**: Strict structured logging emitting only fixed event names with zero exception stacks, message strings, SQL queries, or PII:
  - `{ event: "cart_add_item_failed" }`
  - `{ event: "cart_update_quantity_failed" }`
  - `{ event: "cart_remove_item_failed" }`
  - `{ event: "cart_guest_merge_failed" }`

---

## Automated Test & Verification Evidence

### 1. Remote GitHub Actions CI Execution

- **Commit**: `4fa13c52d1005a8c235e9ace6078cdaaee186f8e`
- **Workflow Run ID**: [`33289660933`](https://github.com/latamcreativa/GamerPeru/actions/runs/33289660933)
- **Overall Status**: `completed` / `success`

| Job Name                                       | Job ID        | Result    | Key Metrics                                                                                                                                                                                                   |
| :--------------------------------------------- | :------------ | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Format, Typecheck, Lint, Test, Build & E2E** | `99198945228` | `success` | Prettier clean, `tsc` clean, ESLint clean (0 warnings), Vitest: **54 test files passed; 763 tests passed and 1 skipped (764 total)**, Next.js build clean, Storefront E2E: **142 passed (0 failed, 0 flaky)** |
| **Real Local Supabase Cart E2E**               | `99198945107` | `success` | Local Supabase migrated & seeded, Playwright Cart E2E: **11 passed (0 failed, 0 skipped, 0 flaky)**                                                                                                           |

### 2. Local Live PostgreSQL Concurrency Suite (`pnpm test:cart:live`)

- **Command**: `pnpm test:cart:live` (`vitest run --config vitest.integration.config.ts`)
- **Target**: Canonical Local Supabase PostgreSQL (`postgres://postgres:postgres@127.0.0.1:54322/postgres`)
- **File**: `tests/integration/cart-live-concurrency.test.ts`
- **Results**: **1 test file passed, 14 logical tests passed, 0 failed, 0 skipped (2.01s)**
  - `✓ strictly asserts local PostgreSQL target 127.0.0.1:54322/postgres and rejects remote/proxy targets`
  - `✓ A. Concurrent anonymous canonical Cart creation yields exactly one ACTIVE Cart`
  - `✓ B. Concurrent authenticated canonical Cart creation yields exactly one ACTIVE Cart`
  - `✓ C. Concurrent production line increment results in exactly 3 without lost updates`
  - `✓ D. Concurrent production cap crossing (initial 8, +3 and +4) caps cleanly at 10 without errors`
  - `✓ E. Concurrent production guest merge incorporates items exactly once and final guest is ABANDONED`
  - `✓ F. Concurrent production expired anonymous add race retires old cart and converges to exactly one replacement ACTIVE cart with both additions and zero line revival`
  - `✓ G. Expired update lifecycle using shared production resolver retires old cart to ABANDONED without modifying line or extending TTL`
  - `✓ H. Expired remove lifecycle using shared production resolver retires old cart to ABANDONED without deleting line or extending TTL`
  - `✓ I. Remove missing line does not refresh Cart TTL`
  - `✓ J. Successful anonymous mutation refreshes database sliding TTL to ~30 days`
  - `✓ K. ABANDONED token replay rotates strictly to fresh token`
  - `✓ L. CONVERTED token replay rotates strictly to fresh token`
  - `✓ M. repeated/stress expired ACTIVE replacement race across 20 iterations`

### 3. Dedicated Real Cart E2E Suite Scenarios (`tests/e2e/cart-storefront.spec.ts`)

1. `Scenario A`: Anonymous Cart Bootstrap (0 items, launcher badge absent, empty drawer)
2. `Scenario B`: PDP Add to Cart (slide-out drawer, badge update, subtotal)
3. `Scenario C`: In-Drawer Quantity Stepper and Removal
4. `Scenario D`: Multi-Variant Addition & Full `/carrito` Page Navigation
5. `Scenario E`: Cookie Security & Persistence across Page Reloads
6. `Scenario F`: Desktop Launcher Keyboard, Mouse & Focus Restoration
7. `Scenario G`: Mobile Viewport (390px) & Mobile Cart Launcher
8. `Scenario H`: Full-Page `/carrito` Mutation Synchronization with Header & Drawer
9. `Scenario I`: Axe Accessibility Audit on Open Cart Drawer (0 serious, 0 critical violations)
10. `Scenario J`: Reduced Motion Emulation
11. `Scenario K`: External Network Isolation

---

## Intermediate Failure & Remediation History

1. **Anonymous Expired-Cart Concurrency Race**: Identified during CART4-R2 that multiple simultaneous requests on an expired session could manufacture duplicate replacement carts under `READ COMMITTED` isolation. Remediated in `4d7ace8` by introducing PostgreSQL transaction-scoped advisory locks keyed on session tokens.
2. **PostgreSQL Partial Unique `ON CONFLICT` Inference Defect**: Discovered during CART5-R2 live testing that `INSERT ... ON CONFLICT (session_token) WHERE status = 'ACTIVE'` failed because PostgreSQL required the predicate to match the partial unique index definition (`WHERE status = 'ACTIVE' AND session_token IS NOT NULL`). Remediated in `7ad98c3` with zero schema changes.
3. **Accidental Raw Exception Logging Regression**: During CART5-R2 debugging, raw error objects were temporarily logged. Rejected during external review and remediated in `b2310f0` by restoring fixed-event logging (`logger.error({ event: "..." })`) and adding 3 regression unit tests.
4. **Live Integration Fixture Enum Mismatch**: During CART5-R3 live validation, `seedSyntheticFixtures()` failed due to inserting `'ACTIVE'` into `brands.status` and `categories.status` (which require `catalog_status` enum `'PUBLISHED'`). Remediated in `4fa13c5` alongside date serialization fixes.

---

## Acceptance Criteria Matrix

| Criterion                       | Requirement                                                     | Result   | Evidence / Checkpoint                                                      |
| :------------------------------ | :-------------------------------------------------------------- | :------- | :------------------------------------------------------------------------- |
| **Persistent Cart**             | Multi-session Cart persistence across browser reloads           | **PASS** | Migration `0008`, E2E Scenario E                                           |
| **Anonymous Authority**         | Cryptographic 256-bit token in HttpOnly cookie                  | **PASS** | `src/lib/cart/session.ts`, E2E Scenario E                                  |
| **Authenticated Authority**     | Verified Supabase JWT claims to CustomerProfile                 | **PASS** | `src/lib/auth/claims.ts`, Unit suite 7                                     |
| **Guest/Auth Merge**            | Lazy merge on authenticated access, max cap 10                  | **PASS** | Integration test E, Unit suite 9                                           |
| **Line Add / Update / Remove**  | Atomic database line mutations with 1..10 bounds                | **PASS** | `src/lib/cart/persistence.ts`, E2E Scenarios B, C, D                       |
| **Expired Replacement**         | Serialized replacement under advisory lock                      | **PASS** | Integration tests F, M (`4d7ace8`)                                         |
| **PROFILE_REQUIRED**            | Fail-closed handling when profile missing                       | **PASS** | `src/lib/cart/service.ts`, Unit suite 7                                    |
| **Catalog Price Authority**     | Real-time pricing hydrated from catalog                         | **PASS** | `src/lib/cart/read.ts`, E2E Scenario D                                     |
| **Unavailable Lines**           | Retained with `available: false`, stepper disabled              | **PASS** | `src/components/cart/cart-item.tsx`, Unit suite 6                          |
| **Cart Drawer**                 | Native `<dialog>` modal with focus trapping/return              | **PASS** | `src/components/cart/cart-drawer.tsx`, E2E Scenarios A, F                  |
| **Full `/carrito` Page**        | Responsive full cart page with shared state sync                | **PASS** | `src/app/carrito/page.tsx`, E2E Scenario H                                 |
| **PDP Add-to-Cart**             | Client island integrated with variant selector                  | **PASS** | `src/components/product-detail/product-commerce-panel.tsx`, E2E Scenario B |
| **Accessibility (WCAG AA)**     | Open Cart Drawer Axe audit: 0 serious and 0 critical violations | **PASS** | E2E Scenario I, Unit tests                                                 |
| **Responsive Design**           | Clean rendering 360px..1920px, 0 overflow                       | **PASS** | E2E Scenario G, Visual QA                                                  |
| **SEO Integrity**               | `/carrito` robots noindex, follow; 0 sitemap leak               | **PASS** | `src/app/carrito/page.tsx`                                                 |
| **Zero Public Personalization** | Public SSR routes avoid cart cookies                            | **PASS** | Static shell build verification                                            |
| **Live PostgreSQL Suite**       | Real concurrency tests against port 54322                       | **PASS** | `pnpm test:cart:live` (14/14 passed)                                       |
| **Real Supabase Cart E2E**      | Live Playwright suite on local Supabase                         | **PASS** | `pnpm test:cart:e2e` (11/11 passed)                                        |
| **Checkout Exclusion**          | Zero checkout / order creation logic                            | **PASS** | Verified; reserved for GP-018                                              |
| **Inventory Exclusion**         | Zero stock ledger / reservation logic                           | **PASS** | Verified; reserved for GP-021                                              |
| **Closure Documentation**       | Truthful and complete record                                    | **PASS** | `GP-017-CLOSURE.md`                                                        |

---

## Deviations & Reconciliations

### 1. CART5-R2 Conflict-Inference Runtime Correction

During real PostgreSQL E2E execution in CART5-R2, the PostgreSQL query planner failed to infer the target partial unique index during `ON CONFLICT` inserts because the runtime predicate omitted `AND session_token IS NOT NULL` / `AND customer_id IS NOT NULL`. Commit `7ad98c3` corrected the runtime predicates without requiring database migration changes. External review audited and approved this necessary correction.

### 2. Logging Observability Remediation (CART5-R3)

In CART5-R2, raw error objects were temporarily passed to `logger.error`. External review flagged this violation of the zero-raw-exception logging standard. Commit `b2310f0` restored fixed-event logging (`{ event: "cart_add_item_failed" }`, etc.) and introduced automated regression assertions in `tests/unit/cart-runtime.test.ts`.

### 3. Integration Test Fixture Status Correction (CART5-R4)

The live integration test suite failed initially because synthetic `brands` and `categories` fixture rows used `'ACTIVE'` instead of the canonical `catalog_status` enum `'PUBLISHED'`. Commit `4fa13c5` updated only the test fixture literals and normalized timestamp handling, resulting in 14/14 passing live tests with zero production code changes.

---

## Risks & Follow-Ups

- **Checkout Domain Handover**: Checkout, shipping calculation, address selection for checkout, and order placement remain deferred to **GP-018**.
- **Payment Verification**: Manual Yape/Plin capture remains informational in the UI; payment ledger and payment proof processing remain deferred to payment milestones.
- **Inventory Integration (GP-021)**: Cart availability currently validates product publication and variant activation. Full physical stock reservations and backorder policies will integrate in GP-021.
- **Local Supabase Registry Rate-Limits**: Occasional Docker pull latency during CI startup is mitigated by automatic workflow retries.

---

## Final Status & Closure Assessment

- **Final Status**: `COMPLETE`
- **Closure Assessment**: `PASS WITH NOTES`
- **Justification**: All functional, visual, accessibility, security, and persistence deliverables are complete, verified by 54 test files passed; 763 tests passed and 1 skipped (764 total), 142 storefront E2E tests, 11 real PostgreSQL Cart E2E scenarios, and 14 live concurrency tests with 0 unresolved blockers. Notes document the successfully remediated PostgreSQL conflict predicate, structured logging, and test fixture corrections.
- **Prerequisite for GP-018**: **GP-018 remains BLOCKED** until external review approves this GP-017 closure report.

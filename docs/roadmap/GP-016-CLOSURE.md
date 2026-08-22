# GP-016 — Closure Report

## Status

COMPLETE

---

## Checkpoints

- **Prerequisite GP-015 Accepted Checkpoint**: `ca658f334ce42553b4ace6ba1c11448b95e702c0`
- **Canonical GP-016 Starting Repository Checkpoint**: `ca658f334ce42553b4ace6ba1c11448b95e702c0`
- **First GP-016 Schema Checkpoint**: `40c5d0e31605bb7b8440797634d849a68a11c5a4`
- **Key GP-016 Milestones**:
  - `ACCT0`: Architecture & Scope Reconciliation `[APPROVED WITH BINDING AMENDMENTS / CLOSED]`
  - `ACCT1`: Customer-Address Schema Candidate `[APPROVED / CLOSED]` (`40c5d0e31605bb7b8440797634d849a68a11c5a4`)
  - `ACCT2`: Pristine Local PostgreSQL Schema Verification `[APPROVED / CLOSED]`
  - `ACCT3`: Hosted Migration 0007 Deployment & Security Verification `[APPROVED / CLOSED]`
  - `ACCT4`: Account Hub + Profile Initial Runtime `[APPROVED / CLOSED]` (`ef2d7c7433c39c1679ca514d76f07cadad8791f7`)
  - `ACCT4-BR1`: Profile Privacy + Accessibility Remediation `[APPROVED / CLOSED]` (`4051e42f451c2041fb88f2601b5c833e6641b576`)
  - `ACCT5`: Customer Address-Book Runtime `[APPROVED / CLOSED]` (`c6f49bb94930f895e1da738a8f10b62a0c222565`)
  - `ACCT5-BR1`: Address Error Truthfulness + Modal Focus `[APPROVED / CLOSED]` (`9a3531af98f9fdce72bd5cab791ddbd128155028`)
  - `ACCT5-BR2`: Default-Address Edit Contract Remediation `[APPROVED / CLOSED]` (`fdc1afab858e1846f35f7de56df21aea055ff3ef`)
  - `ACCT6-A`: Remaining Account Scope Reconciliation `[APPROVED WITH BINDING AMENDMENTS / CLOSED]`
  - `ACCT6-B`: Future-Domain Account Entry Surfaces `[APPROVED / CLOSED]` (`897f7a36ee1541bb7b5f9d7e4cb31dabc2a01c2d`)
  - `ACCT6-BE1`: Remote CI Evidence Recovery `[APPROVED / CLOSED]`
  - `ACCT7`: Final Acceptance & Closure Documentation `[CURRENT]`
- **Accepted Implementation Checkpoint**: `897f7a36ee1541bb7b5f9d7e4cb31dabc2a01c2d`

---

## Executive Summary

GP-016 (Customer Account) establishes the core customer account hub, profile management, shipping address book, and future-domain account entry surfaces for Gamer Perú. Building upon the authentication and RBAC foundation established in GP-015, the implementation adheres strictly to Peru-first commerce requirements, server-side authorization authority, owner-scoped data isolation, and accessibility standards:

1. **Customer Account Hub (`/cuenta`)**: Implemented a responsive, authenticated account hub with 5 accessible domain cards, integrated account navigation across desktop and mobile, and server-side profile resolution.
2. **Profile Runtime (`/cuenta/perfil`)**: Delivered full profile editing with server-side validation for Peruvian identification documents (`DNI`, `CE`), phone formatting, name validation, and single-error summary UX with strict owner isolation and read-only email binding.
3. **Address Book Runtime (`/cuenta/direcciones`)**: Developed a complete customer shipping address book supporting read, create, edit, delete, and default selection with atomic transaction semantics, modal focus containment, accessible error feedback, and a 10-address per customer capacity limit.
4. **Composite Foreign Key Same-Owner Invariant**: Deployed migration `0007_customer_account_addresses.sql` establishing table `customer_addresses` and column `customer_profiles.default_shipping_address_id` with a database-level composite foreign key (`customer_id, id`) guaranteeing that default address pointers can never reference an address belonging to a different customer.
5. **Future-Domain Entry Surfaces**: Implemented authentic, zero-fake-data future-domain entry pages for Orders (`/cuenta/pedidos`), Wishlist (`/cuenta/favoritos`), and Referral/Growth (`/cuenta/referidos`), each featuring truthful "Próximamente" badges and accurate explanatory copy without fabricating domain queries or records.
6. **Global Wishlist Link Canonicalization**: Updated global navigation data and header utilities to resolve to `/cuenta/favoritos`, canonicalizing customer wishlist access within the authenticated account area.
7. **Security, Privacy & Caching Isolation**: Enforced `force-dynamic` and `robots: { index: false, follow: false }` across all account routes, sanitized application error logs to prevent raw SQL or PII leaks, and maintained PostgREST Data API exposure in disabled state (`OFF`).

---

## Scope Delivered

### 1. Customer Account Hub & Navigation

- **Account Hub Route (`/cuenta`)**: Server-rendered account overview presenting structured navigation cards for personal data, shipping addresses, orders, favorites, and referral program, alongside session logout controls.
- **Account Navigation (`account-navigation.tsx`)**: Responsive navigation component providing direct access to all 6 account destinations (`Resumen`, `Perfil`, `Direcciones`, `Pedidos`, `Favoritos`, `Referidos`) with active state tracking (`aria-current="page"`), focus-visible styling, and min-height 44px tap targets.
- **Root Layout Boundary (`/cuenta/layout.tsx`)**: Enforces authentication verification via `getCurrentCustomerProfile()`, redirecting unauthenticated requests to `/auth/login` and incomplete profiles to `/auth/completar-perfil`.

### 2. Profile Management Runtime (`/cuenta/perfil`)

- **Data Resolution**: Server-side profile data loading via `getCurrentCustomerProfile()` returning verified identity claims and database profile state.
- **Profile Form (`profile-form.tsx`)**: Client component providing accessible input controls with client and server Zod schema validation:
  - First name (`first_name`) and Last name (`last_name`)
  - Peruvian document type (`dni` 8 digits, `ce` 9-12 alphanumeric characters) and document number (`document_number`)
  - Phone number (`phone`) with Peruvian formatting and digit validation
  - Read-only email address bound to authenticated Supabase identity
- **Profile Mutation (`updateCustomerProfileAction`)**: Owner-scoped Server Action executing safe updates against `customer_profiles` table, preventing privilege escalation, arbitrary customer updates, or cross-account data leakage.

### 3. Customer Address Book Runtime (`/cuenta/direcciones`)

- **Address List View (`address-list.tsx`)**: Renders shipping address cards displaying recipient name, phone, structured street address, reference, department, province, district, postal code, and default shipping address badge.
- **Address Modal & Form (`address-modal.tsx`, `address-form.tsx`)**: Accessible modal dialog with focus trapping, `Escape` dismissal, focus restoration, and accessible form controls for creating and editing shipping addresses.
- **Server Actions (`address-actions.ts`)**:
  - `createCustomerAddressAction`: Creates a new shipping address within the 10-address limit; atomically assigns as default if selected.
  - `updateCustomerAddressAction`: Updates address content exclusively with strict owner isolation, leaving default pointer untouched.
  - `deleteCustomerAddressAction`: Deletes an address; atomically clears `default_shipping_address_id` if the deleted address was default.
  - `setDefaultShippingAddressAction`: Dedicated owner-scoped action updating `default_shipping_address_id` via composite foreign key validation.

### 4. Future-Domain Entry Surfaces

- **Orders Entry (`/cuenta/pedidos`)**: `ENTRY_ONLY` surface with `<h1>Mis pedidos</h1>`, `<span class="badgeComingSoon">Próximamente</span>`, and truthful copy explaining future availability when the commerce purchase flow is enabled. Zero fake order queries or tables.
- **Wishlist Entry (`/cuenta/favoritos`)**: `ENTRY_ONLY` surface with `<h1>Lista de favoritos</h1>`, `<span class="badgeComingSoon">Próximamente</span>`, and truthful copy explaining future availability for saving favorite products. Zero fake product cards or counters.
- **Referral Entry (`/cuenta/referidos`)**: `ENTRY_ONLY` surface with `<h1>Programa de referidos</h1>`, `<span class="badgeComingSoon">Próximamente</span>`, and truthful copy for the future referral program. Zero fake referral codes or commission balances.
- **Global Wishlist Canonicalization**: Audited all navigation files and canonicalized global header utility link (`utilityLinks.wishlist.href`) to `/cuenta/favoritos`.

---

## Customer Account Architecture

Customer account operations derive authority strictly from verified session claims:

```
[Browser Session] -> [cookies()] -> [Supabase SSR createServerSupabaseClient()]
                                          |
                                    [getClaims()] -> verified claims.sub (auth_user_id)
                                          |
                        [customer_profiles WHERE auth_user_id = sub]
                                          |
                           [CustomerProfile.id (UUID)]
                                          |
               +--------------------------+--------------------------+
               |                                                     |
    [customer_profiles update]                             [customer_addresses CRUD]
    (WHERE id = profile.id)                                (WHERE customer_id = profile.id)
```

Key Architectural Tenets:

1. **No CUSTOMER Role Dependency**: Customer account features operate on verified JWT ownership (`claims.sub` $\to$ `CustomerProfile.id`), requiring zero staff role assignments.
2. **Fail-Closed Isolation**: All address and profile queries strictly filter by `customer_id = customerProfile.id`. Address IDs serve solely as resource locators, never as authorization tokens.
3. **Staff Access Boundary**: `SUPER_ADMIN` and staff roles provide zero bypass into customer account pages or mutations; staff operations remain strictly isolated in `/admin/*`.

---

## Profile Runtime

- **Validation Schema (`src/lib/account/validation.ts`)**:
  - `first_name`: 2–100 characters, trimmed, required
  - `last_name`: 2–100 characters, trimmed, required
  - `document_type`: enum (`dni`, `ce`), optional / required when document number present
  - `document_number`: exact 8 digits for DNI, 9–12 alphanumeric for CE
  - `phone`: 9 digits (starting with 9) or valid international format with country code
- **Privacy Hardening (ACCT4-BR1)**: Minimized client profile DTO prevents leaking internal infrastructure IDs. Logger sanitization redacts PII and suppresses raw PostgreSQL/Drizzle error messages.

---

## Address Book Runtime

- **Validation Schema (`src/lib/account/address-validation.ts`)**:
  - `full_name`: 2–150 characters, required
  - `phone`: 9 digits or valid Peru format, required
  - `address_line1`: Street and number, 5–255 characters, required
  - `address_line2`: Interior / suite / apartment, optional
  - `reference`: Landmark or delivery instructions, optional
  - `department`, `province`, `district`: Peruvian UBIGEO territory fields, required
  - `postal_code`: Optional postal code
- **Capacity Constraint**: Enforces maximum of 10 shipping addresses per customer profile.
- **Default Address Mechanics**:
  - `customer_profiles.default_shipping_address_id` is the single source of truth for the default address.
  - `customer_addresses` contains no `is_default` boolean column, preventing multi-default desynchronization.
  - Deleting the current default address atomically clears the pointer (`NULL`) in `customer_profiles` within the same database transaction.

---

## Account Future-Domain Entry Surfaces

| Route               | Heading                 | Badge          | Classification | Truthful Copy                                                                                               |
| :------------------ | :---------------------- | :------------- | :------------- | :---------------------------------------------------------------------------------------------------------- |
| `/cuenta/pedidos`   | `Mis pedidos`           | `Próximamente` | `ENTRY_ONLY`   | _"Aquí podrás consultar el estado y seguimiento de tus pedidos cuando el flujo de compra esté habilitado."_ |
| `/cuenta/favoritos` | `Lista de favoritos`    | `Próximamente` | `ENTRY_ONLY`   | _"Aquí podrás guardar y consultar tus productos favoritos cuando esta funcionalidad esté habilitada."_      |
| `/cuenta/referidos` | `Programa de referidos` | `Próximamente` | `ENTRY_ONLY`   | _"Muy pronto podrás acceder desde aquí al programa de referidos de Gamer Perú."_                            |

All entry pages declare `export const dynamic = "force-dynamic"` and `robots: { index: false, follow: false }`, inherit authentication from `/cuenta/layout.tsx`, and execute zero database queries.

---

## Hosted Database State

Canonical hosted PostgreSQL state following migration `0007_customer_account_addresses.sql`:

```json
{
  "applied_migrations": 8,
  "latest_migration": "0007_customer_account_addresses",
  "application_tables": 16,
  "physical_application_indexes": 47,
  "roles": 5,
  "permissions": 10,
  "role_permissions": 17,
  "user_roles": 1,
  "super_admin_assignments": 1,
  "customer_assignments": 0,
  "customer_profiles": 2,
  "customer_addresses": 0,
  "data_api_state": "OFF"
}
```

Zero real customer PII, tokens, or private credentials are included in repository documentation.

---

## Security & Privacy Acceptance

1. **Owner-Scoped Mutation Authorization**: Every Server Action validates verified JWT claims, resolves the internal `CustomerProfile.id`, and scopes queries by `customer_id`. Cross-owner updates, deletions, or default assignments fail closed with unauthorized errors.
2. **Composite Foreign Key Database Invariant**:
   ```sql
   CONSTRAINT customer_profiles_default_shipping_address_fk
     FOREIGN KEY (id, default_shipping_address_id)
     REFERENCES customer_addresses (customer_id, id)
     ON DELETE SET NULL;
   ```
   Ensures that PostgreSQL itself rejects any attempt to link a default address owned by another customer.
3. **Data API Lockdown**: PostgREST Data API remains disabled (`OFF`), guaranteeing that direct client-side table access is completely revoked.
4. **Log Sanitization**: Error logging functions redact sensitive PII (document numbers, phone numbers, addresses) and suppress raw database SQL messages from operational logs.

---

## Accessibility & Responsive Acceptance

1. **Axe WCAG 2.1 AA Compliance**: All account routes (`/cuenta`, `/cuenta/perfil`, `/cuenta/direcciones`, `/cuenta/pedidos`, `/cuenta/favoritos`, `/cuenta/referidos`) pass automated Axe accessibility audits with 0 violations.
2. **Keyboard Navigation & Focus Management**:
   - Address modal implements focus trapping, `Escape` key close handling, and focus restoration to the triggering button.
   - All interactive controls provide visible focus rings compliant with design tokens (`--color-border-focus`).
   - Tap targets exceed the minimum 44x44px bounding box.
3. **Responsive Matrix**: Verified across mobile (360px, 390px), tablet (768px), and desktop (1440px) viewports with zero horizontal overflow.

---

## GP-016 Acceptance Criteria Matrix

| Item  | Criterion                                     | Status   | Evidence Source                                                            |
| :---- | :-------------------------------------------- | :------- | :------------------------------------------------------------------------- |
| **A** | Account Hub (`/cuenta`)                       | **PASS** | `tests/unit/customer-account-profile.test.ts`, Playwright suite            |
| **B** | Profile Read / Edit (`/cuenta/perfil`)        | **PASS** | `tests/unit/customer-account-profile.test.ts`, unit & E2E tests            |
| **C** | Profile Ownership Isolation                   | **PASS** | `tests/unit/customer-account-profile.test.ts` (test 14/15)                 |
| **D** | Address Book Read (`/cuenta/direcciones`)     | **PASS** | `tests/unit/customer-account-address.test.ts` (tests 1–6)                  |
| **E** | Address Create                                | **PASS** | `tests/unit/customer-account-address.test.ts` (tests 7–10)                 |
| **F** | Address Edit                                  | **PASS** | `tests/unit/customer-account-address.test.ts` (tests 11–13)                |
| **G** | Address Delete                                | **PASS** | `tests/unit/customer-account-address.test.ts` (tests 14–16)                |
| **H** | Default Address Selection                     | **PASS** | `tests/unit/customer-account-address.test.ts` (tests 17–19)                |
| **I** | Cross-Owner Address Rejection                 | **PASS** | `tests/unit/customer-account-address.test.ts` (tests 20–22)                |
| **J** | Atomic Create + Default                       | **PASS** | `tests/unit/customer-account-address.test.ts` (test 23)                    |
| **K** | Atomic Default Delete                         | **PASS** | `tests/unit/customer-account-address.test.ts` (test 24)                    |
| **L** | Authenticated / Private Caching Boundary      | **PASS** | `src/app/cuenta/layout.tsx`, `tests/unit/customer-account-entries.test.ts` |
| **M** | Responsive Account UX                         | **PASS** | Browser subagent validation, zero overflow across 360px–1440px             |
| **N** | Accessibility / Keyboard Focus                | **PASS** | Axe audit 0 violations, modal trap/restore focus tests                     |
| **O** | PII-Safe Logging                              | **PASS** | `tests/unit/customer-account-profile.test.ts`, sanitized logger            |
| **P** | Orders Entry (`/cuenta/pedidos`)              | **PASS** | `tests/unit/customer-account-entries.test.ts` (tests 4–5)                  |
| **Q** | Wishlist Entry (`/cuenta/favoritos`)          | **PASS** | `tests/unit/customer-account-entries.test.ts` (tests 6–7)                  |
| **R** | Growth / Referral Entry (`/cuenta/referidos`) | **PASS** | `tests/unit/customer-account-entries.test.ts` (tests 8–9)                  |
| **S** | Data API Isolation                            | **PASS** | PostgREST state OFF, direct PostgreSQL Drizzle queries                     |
| **T** | Hosted Schema Continuity                      | **PASS** | Migration `0007_customer_account_addresses.sql` applied cleanly            |

---

## Validation / CI Evidence

### Accepted Implementation CI Evidence (ACCT6-B / ACCT6-BE1)

- **GitHub Actions Run ID**: `32603084318`
- **Workflow**: `CI`
- **Event**: `push`
- **Branch**: `main`
- **Exact Commit SHA**: `897f7a36ee1541bb7b5f9d7e4cb31dabc2a01c2d`
- **Attempt**: `1`
- **Status**: `completed`
- **Conclusion**: `success`
- **Vitest Evidence**: 51 test files passed, 679 passed, 1 skipped, 680 total tests.
- **Playwright Evidence**: 141 passed, 1 flaky (pre-existing GP-014 video timing test, passed on retry #1), 0 failed, 1 retry, 142 total tests.
- **Next.js Build**: Compiled successfully in Turbopack across all 22 application routes.

---

## Deviations & Remediations

1. **ACCT4-BR1 (Privacy & Logging Sanitization)**: Removed raw Drizzle/PostgreSQL error messages from operational logger to prevent internal database schema or PII leakage. Cleaned profile DTO returned to client.
2. **ACCT5-BR1 (Address Error Truthfulness & Modal Focus)**: Replaced misleading empty state rendering during reader errors with a truthful error alert card. Added focus trap and restore mechanism to `address-modal.tsx`.
3. **ACCT5-BR2 (Default-Address Edit Contract)**: Removed misleading set-default checkbox from address edit modal, establishing strict contract separation where address editing updates content only, while default status is managed through dedicated default-selection actions.
4. **ACCT6-BE1 (Remote CI Evidence Recovery)**: Recovered and audited the canonical push-triggered GitHub Actions run evidence (`32603084318`), rectifying initial local validation substitute reporting.

---

## Residual Risks & Follow-Ups

1. **Commerce Checkout Address Integration**: GP-018 (Checkout) will consume the customer address book delivered in GP-016. Ensure checkout respects the same UBIGEO validation rules and capacity limits.
2. **Order History Runtime**: GP-020 (Order Management) will implement order persistence, status transitions, and history querying, replacing the `/cuenta/pedidos` entry state with full order tracking.
3. **Referral Engine**: GP-031 (Growth & Referral Engine) will deliver referral code generation, attribution, and balance tracking, activating the `/cuenta/referidos` surface.

---

## Wishlist Runtime Roadmap Gap

> [!IMPORTANT]
> **Mandatory Roadmap Coverage Gap Record**
>
> 1. Wishlist is required by Gamer Perú v1 specifications ([MASTER_SPEC.md](file:///D:/Documentos/GamerPeru/docs/specs/MASTER_SPEC.md) and [STOREFRONT_SPEC.md](file:///D:/Documentos/GamerPeru/docs/specs/STOREFRONT_SPEC.md)).
> 2. `WishlistItem` is defined by the canonical commerce domain model ([COMMERCE_DOMAIN_MODEL.md](file:///D:/Documentos/GamerPeru/docs/architecture/COMMERCE_DOMAIN_MODEL.md) § 39).
> 3. GP-016's executed authorization was limited to "wishlist entry surface".
> 4. Therefore GP-016 delivered `/cuenta/favoritos` entry surface and intentionally did NOT create `wishlist_items` schema, Server Actions, PDP wishlist toggles, or persistence.
> 5. No explicit later GP in the current GP-000..GP-052 roadmap presently owns Wishlist runtime implementation.
> 6. This constitutes a **ROADMAP COVERAGE GAP** that must receive an explicit execution owner and authorization gate before Gamer Perú v1 is considered complete.

---

## Repository State

- **Branch**: `main`
- **Working Tree**: Clean
- **Canonical Starting Checkpoint**: `ca658f334ce42553b4ace6ba1c11448b95e702c0`
- **Accepted Implementation Checkpoint**: `897f7a36ee1541bb7b5f9d7e4cb31dabc2a01c2d`
- **Total Application Routes**: 22 routes compiled in Next.js Turbopack build
- **Database Schema**: 16 application tables, 47 indexes, migration `0007_customer_account_addresses.sql`

---

## Final Verdict

**PASS WITH NOTES**

All explicitly authorized and scoped GP-016 deliverables (Customer Account Hub, Profile Runtime, Address Book Runtime, Future-Domain Entry Surfaces, and Navigation Canonicalization) are complete, tested, and verified through remote CI. The single note records the cross-roadmap Wishlist runtime coverage gap requiring future roadmap scheduling.

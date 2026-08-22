# GP-016 — Closure Report

## Status

COMPLETE

---

## Checkpoints

- **Prerequisite GP-015 Accepted Checkpoint**: `ca658f334ce42553b4ace6ba1c11448b95e702c0`
- **Canonical GP-016 Starting Repository Checkpoint**: `ca658f334ce42553b4ace6ba1c11448b95e702c0`
- **First GP-016 Schema Checkpoint**: `40c5d0e31605bb7b8440797634d849a68a11c5a4`
- **Key GP-016 Milestones & Gate Lineage**:
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
  - `ACCT7`: Final Acceptance & Closure Documentation `[REVIEWED / REMEDIATED]` (`43925e547ded2530671c7531be3aab630b43f385`)
  - `ACCT7-BR1`: Closure Documentation Integrity Remediation `[CURRENT]`
- **Accepted Implementation Checkpoint**: `897f7a36ee1541bb7b5f9d7e4cb31dabc2a01c2d`

---

## Executive Summary

GP-016 (Customer Account) establishes the core customer account hub, profile management, shipping address book, and future-domain account entry surfaces for Gamer Perú. Building upon the authentication and RBAC foundation established in GP-015, the implementation adheres strictly to server-side cryptographic authority, owner-scoped data isolation, and accessibility standards:

1. **Customer Account Hub (`/cuenta`)**: Implemented a responsive, authenticated account hub with 5 accessible domain cards, integrated account navigation across desktop and mobile, and server-side profile resolution.
2. **Profile Runtime (`/cuenta/perfil`)**: Delivered full profile editing with server-side validation for canonical document types (`DNI`, `CE`, `RUC`, `PASSPORT`) and document-pair invariants, telephone length limits, and single-error summary UX with strict owner-scoped mutation via verified `auth_user_id` and read-only email binding.
3. **Address Book Runtime (`/cuenta/direcciones`)**: Developed a complete customer shipping address book supporting read, create, edit, delete, and default selection with atomic transaction semantics, modal focus containment and restoration, accessible error feedback, and structured geography fields.
4. **Composite Foreign Key Same-Owner Invariant**: Deployed migration `0007_customer_account_addresses.sql` establishing table `customer_addresses` with `UNIQUE(customer_id, id)` and column `customer_profiles.default_shipping_address_id` with a database-level composite foreign key (`id, default_shipping_address_id`) referencing `customer_addresses(customer_id, id)` with `ON DELETE NO ACTION ON UPDATE NO ACTION`, guaranteeing that default address pointers can never reference an address belonging to a different customer.
5. **Future-Domain Entry Surfaces**: Implemented authentic, zero-fake-data future-domain entry pages for Orders (`/cuenta/pedidos`), Wishlist (`/cuenta/favoritos`), and Referral (`/cuenta/referidos`), each featuring truthful "Próximamente" badges and accurate explanatory copy without fabricating domain queries or records.
6. **Global Wishlist Link Canonicalization**: Updated global navigation data and header utilities to resolve to `/cuenta/favoritos`, canonicalizing customer wishlist access within the authenticated account area.
7. **Security, Privacy & Caching Isolation**: Enforced `force-dynamic` and `robots: { index: false, follow: false }` across all account routes, configured fixed event-only structured logging so exception-derived sensitive data is not emitted, and maintained PostgREST Data API exposure in disabled state (`OFF`).

---

## Scope Delivered

### 1. Customer Account Hub & Navigation

- **Account Hub Route (`/cuenta`)**: Server-rendered account overview presenting structured navigation cards for personal data, shipping addresses, orders, favorites, and referral program, alongside session logout controls.
- **Account Navigation (`account-navigation.tsx`)**: Responsive navigation component providing direct access to all 6 account destinations (`Resumen`, `Perfil`, `Direcciones`, `Pedidos`, `Favoritos`, `Referidos`) with active state tracking (`aria-current="page"`), focus-visible styling, and min-height 44px tap targets.
- **Root Layout Boundary (`/cuenta/layout.tsx`)**: Enforces authentication verification via `getCurrentCustomerProfile()`, redirecting unauthenticated requests to `/auth/login` and incomplete profiles to `/auth/completar-perfil`.

### 2. Profile Management Runtime (`/cuenta/perfil`)

- **Data Resolution**: Server-side profile data loading via `getCurrentCustomerProfile()` returning verified identity claims and database profile state.
- **Profile Form (`profile-form.tsx`)**: Client component providing accessible input controls with client and server Zod schema validation:
  - First name (`firstName`) and Last name (`lastName`)
  - Canonical document type (`documentType`: `DNI`, `CE`, `RUC`, `PASSPORT`) and document number (`documentNumber`) with pair invariant validation
  - Phone number (`phone`) with string length limits
  - Read-only email address bound to authenticated Supabase identity
- **Profile Mutation (`updateCustomerProfileAction`)**: Owner-scoped Server Action executing safe updates against `customer_profiles` via `WHERE auth_user_id = verified.identity.authUserId`, preventing privilege escalation, arbitrary customer updates, or cross-account data leakage.

### 3. Customer Address Book Runtime (`/cuenta/direcciones`)

- **Address List View (`address-list.tsx`, `address-card.tsx`)**: Renders shipping address cards displaying recipient name, phone, structured street address, optional interior/suite, reference notes, department, province, district, postal code, and default shipping address badge.
- **Address Dialogs & Forms (`address-form.tsx`, `address-delete-dialog.tsx`, `use-modal-focus.ts`)**: Accessible modal dialogs with focus trapping, `Escape` dismissal, focus restoration, and accessible form controls for creating, editing, and deleting shipping addresses.
- **Server Actions (`src/lib/account/address-actions.ts`)**:
  - `createCustomerAddressAction`: Creates a new shipping address for the authenticated customer; atomically assigns as default if selected.
  - `updateCustomerAddressAction`: Updates address content exclusively with strict owner isolation, leaving default pointer untouched.
  - `deleteCustomerAddressAction`: Deletes an address; atomically clears `default_shipping_address_id` before deleting if the deleted address was default.
  - `setDefaultCustomerAddressAction`: Dedicated owner-scoped action updating `default_shipping_address_id` via composite foreign key validation.

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
                                    [getClaims()] -> verified claims.sub (authUserId)
                                          |
                        +-----------------+-----------------+
                        |                                   |
         [UPDATE customer_profiles]             [customer_profiles lookup]
       (WHERE auth_user_id = authUserId)         (WHERE auth_user_id = authUserId)
                                                            |
                                                 [CustomerProfile.id (UUID)]
                                                            |
                                                [customer_addresses CRUD]
                                            (WHERE customer_id = profile.id)
```

Key Architectural Tenets:

1. **No CUSTOMER Role Dependency**: Customer account features operate on verified JWT ownership (`claims.sub` $\to$ `authUserId` $\to$ `CustomerProfile.id`), requiring zero staff role assignments.
2. **Fail-Closed Isolation**: All address mutations strictly filter by `customer_id = customerProfile.id`. Address IDs serve solely as resource locators, never as authorization tokens.
3. **Staff Access Boundary**: `SUPER_ADMIN` and staff roles provide zero bypass into customer account pages or mutations; staff operations remain strictly isolated in `/admin/*`.

---

## Profile Runtime

- **Validation Schema (`src/lib/account/validation.ts`)**:
  - `firstName`: string, trimmed, non-empty, maximum 100 characters, required
  - `lastName`: string, trimmed, non-empty, maximum 100 characters, required
  - `phone`: optional / nullable, trimmed, blank transforms to null, maximum 20 characters
  - `documentType`: optional / nullable, trimmed, blank transforms to null, canonical enum (`DNI`, `CE`, `RUC`, `PASSPORT`)
  - `documentNumber`: optional / nullable, trimmed, blank transforms to null, maximum 20 characters
  - **Canonical Document-Type & Pair Validation**: Enforces invariant that `documentType` and `documentNumber` must both be null or both be provided with a canonical type.
- **Authority & Privacy Hardening**: Profile mutation derives target record strictly from verified JWT `claims.sub` via `UPDATE customer_profiles WHERE auth_user_id = authUserId`. Minimized client profile DTO prevents leaking internal infrastructure IDs.

---

## Address Book Runtime

- **Validation Schema (`src/lib/account/address-validation.ts`)**:
  - `recipientName`: string, trimmed, non-empty, maximum 150 characters, required
  - `phone`: string, trimmed, non-empty, maximum 20 characters, required
  - `streetAddress`: string, trimmed, non-empty, maximum 255 characters, required
  - `apartmentSuite`: optional / nullable, trimmed, blank transforms to null, maximum 100 characters
  - `department`: string, trimmed, non-empty, maximum 100 characters, required (structured geography string)
  - `province`: string, trimmed, non-empty, maximum 100 characters, required (structured geography string)
  - `district`: string, trimmed, non-empty, maximum 100 characters, required (structured geography string)
  - `postalCode`: optional / nullable, trimmed, blank transforms to null, maximum 20 characters
  - `referenceNotes`: optional / nullable, trimmed, blank transforms to null
- **Default Address Mechanics**:
  - `customer_profiles.default_shipping_address_id` is the single source of truth for the default address.
  - `customer_addresses` contains no `is_default` boolean column, preventing multi-default desynchronization.
  - Foreign key constraint uses `ON DELETE NO ACTION ON UPDATE NO ACTION`.
  - When deleting the current default address, `deleteCustomerAddressAction` executes an explicit transaction:
    1. Updates `customer_profiles.default_shipping_address_id` to `NULL`.
    2. Deletes the owned `customer_addresses` row.
    3. Commits the transaction.
  - After default deletion, `defaultShippingAddressId` remains `null` with no automatic promotion of other addresses.

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

1. **Owner-Scoped Mutation Authorization**: Every Server Action validates verified JWT claims, resolves the internal `CustomerProfile.id` or `authUserId`, and scopes queries by owner identity. Cross-owner updates, deletions, or default assignments fail closed with unauthorized errors.
2. **Composite Foreign Key Database Invariant**:
   ```sql
   CONSTRAINT customer_profiles_default_shipping_address_fk
     FOREIGN KEY (id, default_shipping_address_id)
     REFERENCES customer_addresses (customer_id, id)
     ON DELETE NO ACTION
     ON UPDATE NO ACTION;
   ```
   Ensures that PostgreSQL itself rejects any attempt to link a default address owned by another customer.
3. **Data API Lockdown**: PostgREST Data API remains disabled (`OFF`), guaranteeing that direct client-side table access is completely revoked.
4. **Log Sanitization**: Employs fixed event-only structured logging (`account_profile_read_failed`, `account_profile_update_failed`, `account_addresses_read_failed`, `account_address_create_failed`, `account_address_update_failed`, `account_address_set_default_failed`, `account_address_delete_failed`) so that exception-derived sensitive data (SQL, stack traces, parameters, customer PII) is not emitted.

---

## Accessibility & Responsive Acceptance

1. **Gate-Specific Accessibility Audits**:
   - **ACCT4-BR1**: `/cuenta` and `/cuenta/perfil` passed Axe accessibility audits with 0 violations.
   - **ACCT5 / ACCT5-BR1**: `/cuenta/direcciones` create/edit dialog and delete alertdialog verified with real modal focus containment and focus restoration via `use-modal-focus.ts`.
   - **ACCT6-B**: Future-domain entry surfaces verified with semantic heading structures (`<h1>`), visible focus indicators, and tap targets exceeding 44x44px bounding boxes.
2. **Responsive UX**: Accepted GP-016 browser evidence covered mobile, tablet, and desktop viewports with zero reported horizontal overflow across account surfaces.

---

## GP-016 Acceptance Criteria Matrix

| Item  | Criterion                                     | Status             | Evidence Source                                                            |
| :---- | :-------------------------------------------- | :----------------- | :------------------------------------------------------------------------- |
| **A** | Account Hub (`/cuenta`)                       | **PASS**           | `tests/unit/customer-account-profile.test.ts`, ACCT4 accepted evidence     |
| **B** | Profile Read / Edit (`/cuenta/perfil`)        | **PASS**           | `tests/unit/customer-account-profile.test.ts`, ACCT4 accepted evidence     |
| **C** | Profile Ownership Isolation                   | **PASS**           | `tests/unit/customer-account-profile.test.ts`, ACCT4 accepted evidence     |
| **D** | Address Book Read (`/cuenta/direcciones`)     | **PASS**           | `tests/unit/customer-account-address.test.ts`, ACCT5 accepted evidence     |
| **E** | Address Create                                | **PASS**           | `tests/unit/customer-account-address.test.ts`, ACCT5 accepted evidence     |
| **F** | Address Edit                                  | **PASS**           | `tests/unit/customer-account-address.test.ts`, ACCT5 accepted evidence     |
| **G** | Address Delete                                | **PASS**           | `tests/unit/customer-account-address.test.ts`, ACCT5 accepted evidence     |
| **H** | Default Address Selection                     | **PASS**           | `tests/unit/customer-account-address.test.ts`, ACCT5 accepted evidence     |
| **I** | Cross-Owner Address Rejection                 | **PASS**           | `tests/unit/customer-account-address.test.ts`, ACCT5 accepted evidence     |
| **J** | Atomic Create + Default                       | **PASS**           | `tests/unit/customer-account-address.test.ts`, ACCT5 accepted evidence     |
| **K** | Atomic Default Delete                         | **PASS**           | `tests/unit/customer-account-address.test.ts`, ACCT5 accepted evidence     |
| **L** | Authenticated / Private Caching Boundary      | **PASS**           | `src/app/cuenta/layout.tsx`, `tests/unit/customer-account-entries.test.ts` |
| **M** | Responsive Account UX                         | **PASS**           | ACCT4/5/6 browser evidence, zero overflow across viewports                 |
| **N** | Accessibility / Keyboard Focus                | **PASS**           | ACCT4-BR1 & ACCT5-BR1 Axe audits, `use-modal-focus.ts` focus management    |
| **O** | PII-Safe Logging                              | **PASS**           | `tests/unit/customer-account-profile.test.ts`, event-only logger           |
| **P** | Orders Entry (`/cuenta/pedidos`)              | **PASS**           | `tests/unit/customer-account-entries.test.ts`, ACCT6-B accepted evidence   |
| **Q** | Wishlist Entry (`/cuenta/favoritos`)          | **PASS WITH NOTE** | `tests/unit/customer-account-entries.test.ts`, ACCT6-B accepted evidence   |
| **R** | Growth / Referral Entry (`/cuenta/referidos`) | **PASS**           | `tests/unit/customer-account-entries.test.ts`, ACCT6-B accepted evidence   |
| **S** | Data API Isolation                            | **PASS**           | PostgREST state OFF, direct PostgreSQL Drizzle queries                     |
| **T** | Hosted Schema Continuity                      | **PASS**           | Migration `0007_customer_account_addresses.sql` applied cleanly            |

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
- **Playwright Evidence**: 141 passed + 1 flaky (pre-existing GP-014 video timing test, passed on retry #1) = 142 total tests (0 failed, 1 retry).
- **Next.js Build**: Compiled successfully in Turbopack across all 22 application routes.

### Accepted Closure Documentation CI Evidence (ACCT7)

- **GitHub Actions Run ID**: `32603907337`
- **Workflow**: `CI`
- **Event**: `push`
- **Branch**: `main`
- **Exact Commit SHA**: `43925e547ded2530671c7531be3aab630b43f385`
- **Attempt**: `1`
- **Status**: `completed`
- **Conclusion**: `success`
- **Vitest Evidence**: 51 test files passed, 679 passed, 1 skipped, 680 total tests (duration: 26.66s).
- **Playwright Evidence**: 142 passed, 0 failed, 0 flaky, 0 retries (duration: 4.0m).

---

## Deviations & Remediations

1. **ACCT4-BR1 (Privacy & Logging Sanitization)**: Fixed event-only logging ensures exception-derived sensitive data is not emitted. Cleaned profile DTO returned to client.
2. **ACCT5-BR1 (Address Error Truthfulness & Modal Focus)**: Replaced misleading empty state rendering during reader errors with a truthful error alert card. Implemented accessible focus containment and restoration via `use-modal-focus.ts`.
3. **ACCT5-BR2 (Default-Address Edit Contract)**: Removed misleading set-default checkbox from address edit form, establishing strict contract separation where address editing updates content only, while default status is managed through dedicated default-selection action `setDefaultCustomerAddressAction`.
4. **ACCT6-BE1 (Remote CI Evidence Recovery)**: Recovered and audited canonical push-triggered GitHub Actions run evidence (`32603084318`), rectifying initial local validation substitute reporting.
5. **ACCT7-BR1 (Closure Documentation Integrity Remediation)**: Aligned closure documentation with exact runtime validation contracts, PostgreSQL composite FK constraints (`ON DELETE NO ACTION ON UPDATE NO ACTION`), explicit runtime deletion mechanics, correct Server Action names, and repository-relative architectural links.

---

## Residual Risks & Follow-Ups

1. **Commerce Checkout Address Integration**: GP-018 (Checkout & Order Creation) will consume the customer shipping address book delivered in GP-016.
2. **Order Lifecycle & Management**: GP-018 will handle initial order creation, GP-019 will handle manual payment submission (Yape/Plin), and GP-020 (Order Management) will implement full order lifecycle foundations, tracking, and management.
3. **Referral Engine**: GP-031 (Referral Engine) will deliver referral code generation, attribution, and balance tracking, activating the `/cuenta/referidos` surface.

---

## Wishlist Runtime Roadmap Gap

> [!IMPORTANT]
> **Mandatory Roadmap Coverage Gap Record**
>
> 1. Wishlist is required by Gamer Perú v1 specifications ([MASTER_SPEC.md](../specs/MASTER_SPEC.md) and [STOREFRONT_SPEC.md](../specs/STOREFRONT_SPEC.md)).
> 2. `WishlistItem` is defined by the canonical commerce domain model ([COMMERCE_DOMAIN_MODEL.md](../architecture/COMMERCE_DOMAIN_MODEL.md) § 39).
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

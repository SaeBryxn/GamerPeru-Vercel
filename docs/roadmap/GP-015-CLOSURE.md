# GP-015 — Closure Report

## Status

COMPLETE

---

## Checkpoints

- **Prerequisite GP-014 Accepted Checkpoint**: `f3e0210b800d822c06764224279343f335f8b8c2`
- **Canonical GP-015 Starting Repository Checkpoint**: `f3e0210b800d822c06764224279343f335f8b8c2`
- **First GP-015 Implementation Commit**: `034f8b44a5739073d6b3084cc4b27f688a30ac01`
- **Key GP-015 Milestones**:
  - `AUTH1` Accepted RBAC / Schema Checkpoint: `9bee5008227af1b5c99f6acb2ea5cd69039a5bbf`
  - `AUTH6` Accepted OAuth Checkpoint: `f0f45dfeb426e956bad377da0ee699b11a0e1733`
  - `AUTH7` Accepted Profile Checkpoint: `6ded4a36b4f0fcdeb97077a51eb7f249beb133da`
  - `AUTH8` Final Runtime Implementation Checkpoint: `e0c0081dcc8eaa0981a38bf5c7471bf009285c49`
  - `AUTH9-A` Accepted Implementation Checkpoint: `02cd10d1c63dbab0019a5871413f3df12695ef93`
  - Initial GP-015 Closure Candidate Checkpoint: `8560fe42ed66d00bbc0af71bfe9a08853c75c1ce`
  - `AUTH9-BR1` Real Local Security Evidence Checkpoint: `e8ff04f5abc0922132f8501c26f15bdce24a3c38`
- **AUTH Gate Execution Lineage**:
  - `AUTH0`: Pre-flight & Remote Architecture Gate `[APPROVED / CLOSED]`
  - `AUTH1`: Identity & RBAC DDL Migration 0004 `[APPROVED / CLOSED]`
  - `AUTH2`: External Architecture Review & Binding Decisions `[APPROVED / CLOSED]`
  - `AUTH3`: Migration 0005 Data API Hardening & Domain Isolation `[APPROVED / CLOSED]`
  - `AUTH4`: Supabase SSR Session Adapter & `getClaims()` Authority `[APPROVED / CLOSED]`
  - `AUTH5`: Email/Password Workflows & Scanner-Safe Verification `[APPROVED / CLOSED]`
  - `AUTH6`: Google OAuth PKCE Architecture & Same-Email Linking `[APPROVED / CLOSED]`
  - `AUTH7`: CustomerProfile Provisioning & Concurrency Safety `[APPROVED / CLOSED]`
  - `AUTH8-A`: Canonical RBAC Architecture & Model A Explicit Matrix `[APPROVED / CLOSED]`
  - `AUTH8-B`: Server-Side RBAC Resolver & Zero-Wildcard Runtime `[APPROVED / CLOSED]`
  - `AUTH8-BR1`: RBAC Seed Boundary Hardening & Error Sanitization `[APPROVED / CLOSED]`
  - `AUTH8-BR2`: Unknown Role Fail-Closed Resolution Hardening `[APPROVED / CLOSED]`
  - `AUTH8-C`: Migration 0006 Remote Application to Hosted PostgreSQL `[APPROVED / CLOSED]`
  - `AUTH8-D`: Operator SUPER_ADMIN Bootstrap & Hosted Allow/Deny Smoke `[APPROVED / CLOSED]`
  - `AUTH8-DR1`: Identity Label Continuity & Target Forensic Verification `[APPROVED / CLOSED]`
  - `AUTH9-A`: Minimal Account Root, Current-Session Logout & Lifecycle `[APPROVED / CLOSED]`
  - `AUTH9-B`: Final Security Acceptance Audit & Closure Candidate `[REVIEWED / REMEDIATED]`
  - `AUTH9-BR1`: Real Local Security Integration & Closure Remediation `[APPROVED / CLOSED]`
  - `AUTH9-BR2`: Final Closure Documentation Integrity Remediation `[CURRENT]`
- **Accepted Implementation Checkpoint**: `02cd10d1c63dbab0019a5871413f3df12695ef93`

---

## Executive Summary

GP-015 (Authentication) establishes the comprehensive authentication, session management, customer identity, and role-based access control (RBAC) foundation for Gamer Perú. The implementation integrates **Supabase Auth** with Next.js App Router server-rendered architectures, strictly enforcing server-side cryptographic authority, domain data isolation, and Peru-first commerce security constraints:

1. **Supabase Auth SSR Session Management**: Implemented `@supabase/ssr` request-scoped client factories (`createServerSupabaseClient()`, `createBrowserSupabaseClient()`, and `updateSession()`) using `getClaims()` for high-performance cryptographic JWT verification against cached project JWKS, completely eliminating insecure `getSession()` reliance in server authorization code.
2. **Canonical Authentication Workflows**: Delivered complete end-to-end flows for browser-direct email/password signup (`register-form.tsx`), scanner-safe email verification (`verifyConfirmationOtpAction`), browser-direct login (`login-form.tsx`), Google OAuth ("Continuar con Google") with PKCE state validation, scanner-safe password recovery and browser-direct reset (`password-change-form.tsx`), and local current-session logout (`signOutAction({ scope: "local" })`).
3. **Scanner-Safe Token Verification Pipeline**: Built explicit, user-initiated POST Server Action verification (`/auth/confirm`) protecting single-use TokenHash links against automated email security scanner invalidation.
4. **Idempotent Profile Provisioning & Same-Email Linking**: Developed `ensureCustomerProfile(auth_user_id)` with database-level concurrency protection (`ON CONFLICT (auth_user_id) DO NOTHING`) and native Supabase same-email linking across password and Google identities.
5. **Canonical Gamer Perú RBAC System**: Designed and deployed the 5-role, 10-permission, 17-mapping authorization model (ADR-003 Model A) with zero wildcards, zero code-level bypasses, strict server-side resolution, and hosted transactional bootstrap of the initial `SUPER_ADMIN`.
6. **Data API Hardening**: Executed migration `0005_data_api_hardening.sql` and disabled PostgREST Data API exposure, revoking direct table privileges from `anon`, `authenticated`, and `service_role` on domain tables in favor of trusted direct PostgreSQL connections.
7. **Cache & Storefront Isolation**: Guaranteed private, dynamic (`no-store`) rendering on all authenticated paths (`/cuenta`, `/auth/completar-perfil`, `/auth/cambiar-password`, `/admin/*`, `/api/admin/*`) while isolating the public storefront (`/`, `/productos/*`, `/categorias/*`, `/marcas/*`, `/buscar`) and public static auth pages (`/auth/login`, `/auth/registro`, `/auth/olvide-password`, `/auth/verificar`) from dynamic session resolution overhead.

---

## Scope Delivered

### 1. Supabase Auth SSR Infrastructure (`@supabase/ssr`)

- **Server Client Factory**: `createServerSupabaseClient()` in `src/lib/supabase/server.ts` creates isolated, request-scoped clients bound to Next.js `cookies()`.
- **Browser Client Factory**: `createBrowserSupabaseClient()` in `src/lib/supabase/client.ts` creates singleton browser clients for client components.
- **Proxy Middleware**: `updateSession()` in `src/lib/supabase/proxy.ts` and `src/proxy.ts` refreshes session cookies on matching protected routes (`/cuenta/:path*`, `/admin/:path*`, `/auth/cambiar-password`, `/auth/completar-perfil`, `/api/admin/:path*`) and emits strict `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0` headers.
- **Cryptographic Authority**: `getVerifiedIdentity()` in `src/lib/auth/claims.ts` validates JWT claims using `supabase.auth.getClaims()`, extracting the verified `authUserId` (`sub`). Zero application server code trusts `getSession()`.

### 2. User Authentication & Lifecycle Workflows

- **Registration**: Browser-direct registration in `src/components/auth/register-form.tsx` calling `supabase.auth.signUp()` with client Zod schema validation.
- **Email Verification**: User-initiated explicit POST form submission on `/auth/confirm` calling `verifyConfirmationOtpAction` with TokenHash, preventing enterprise email security scanners from consuming single-use tokens.
- **Login**: Browser-direct email/password login in `src/components/auth/login-form.tsx` calling `supabase.auth.signInWithPassword()`.
- **Google OAuth**: "Continuar con Google" using PKCE authorization flow on `/auth/callback` requesting minimal scopes (`openid`, `email`, `profile`). Zero Google provider access/refresh tokens stored in domain tables.
- **Password Recovery & Reset**: Password recovery requesting reset emails via custom SMTP/Resend, verified on `/auth/confirm` (type: recovery), and completed on `/auth/cambiar-password` with browser-direct `supabase.auth.updateUser({ password })`.
- **Logout & Session Termination**: `signOutAction` in `src/lib/auth/actions.ts` calls `supabase.auth.signOut({ scope: "local" })`, terminating the current browser session while preserving other devices and redirecting to `/auth/login?signed_out=true`.

### 3. Identity Linking & CustomerProfile Management

- **Schema**: `customer_profiles` table (migration `0004_famous_doomsday.sql`) with unique foreign key `auth_user_id` referencing `auth.users(id)` with `ON DELETE SET NULL`.
- **Idempotency**: `ensureCustomerProfile()` uses `INSERT INTO customer_profiles ... ON CONFLICT (auth_user_id) DO NOTHING` followed by canonical row retrieval, preventing duplicate profiles under concurrent authentication attempts.
- **Same-Email Linking**: Automatically links Google OAuth logins to existing email/password accounts with matching verified email addresses, preserving the single canonical `CustomerProfile`.

### 4. Canonical Role-Based Access Control (RBAC)

- **Schema & Vocabulary**: Migration `0006_canonical_rbac_seed.sql` establishes 5 canonical roles and 10 canonical permissions with 17 explicit mappings:
  - **Roles**: `SUPER_ADMIN`, `ADMIN_CATALOG`, `ADMIN_ORDERS`, `ADMIN_SUPPORT`, `CUSTOMER`
  - **Permissions**: `staff:manage`, `ai:manage_credentials`, `audit:export`, `catalog:manage`, `catalog:publish`, `catalog:ai_research`, `orders:manage`, `orders:verify`, `support:manage`, `support:review_rma`
- **Model A Explicit Mapping**: `SUPER_ADMIN` possesses 10 explicit mapping rows joined in `role_permissions`; zero wildcard (`*`) checks or code bypasses exist.
- **Fail-Closed Runtime**: `src/lib/auth/rbac.ts` evaluates `getVerifiedAuthContext()`, `getUserPermissions()`, `hasPermission()`, and `requirePermission()` exclusively against verified JWT identity and joined PostgreSQL tables, rejecting unknown roles and permissions.

### 5. Private Account Root (`/cuenta`)

- Server-rendered private entry point in `src/app/cuenta/page.tsx` with `export const dynamic = "force-dynamic"`.
- Validates identity server-side via `getVerifiedIdentity()`, redirecting unauthenticated requests to `/auth/login` and rendering minimal account information with `<LogoutButton />`.

---

## Real Local Security Integration Evidence (AUTH9-BR1)

The following security properties were executed and verified against a running local Supabase stack and local PostgreSQL instance on localhost:54322:

1. **Real Token Cryptographic Verification & Tamper Rejection**:
   - `getClaims(validJwt)`: Successfully verified against local JWKS; `claims.sub` returned and matched user ID.
   - `getClaims(tamperedPayloadJwt)`: Modified payload without re-signing was rejected with `Invalid JWT signature`; `claims_accepted_count = 0`.
   - `getClaims(tamperedSignatureJwt)`: Modified signature rejected with `Invalid JWT signature`.
   - Result: **PASS** (Zero forged tokens can breach Gamer Perú verified identity boundary).
2. **Real Session Refresh & Invalid Refresh Fail-Closed**:
   - `refreshSession({ refresh_token: validRefreshToken })`: Succeeded, emitted rotated access token with verified claims.
   - `refreshSession({ refresh_token: invalidRefreshToken })`: Rejected with `Refresh token is not valid`; `session_created = false`.
   - Result: **PASS** (Session continuity validated; invalid refresh fails closed).
3. **Real Identity Detachment & Foreign Key Execution**:
   - Pre-delete: `auth.users = 1`, `customer_profiles = 1` (linked by `auth_user_id`), `user_roles = 1`.
   - Deletion of local auth user via `admin.deleteUser(testUserId)` in local Supabase.
   - Post-delete in PostgreSQL:
     - `auth.users = 0`
     - `customer_profiles = 1` (preserved)
     - `customer_profiles.auth_user_id = NULL` (executed via `ON DELETE SET NULL`)
     - `user_roles = 0` (executed via `ON DELETE CASCADE`)
   - Result: **PASS** (Commerce history preserved while removing all staff privilege mappings).
4. **Detached Profile Non-Resolution & Reattachment Safety**:
   - Distinct user `LOCAL_OTHER_SUBJECT` authenticated and queried profile via `where(eq(customerProfiles.authUserId, otherUserId))`.
   - Result: `resolved_count = 0`, `matches_detached_null_profile = false`. Zero detached rows are resolved or reattached.

---

## Canonical GP-015 Acceptance Criteria Matrix

| Criterion | Requirement Description                         |  Status  | Evidence Source                                                                                  |
| --------- | ----------------------------------------------- | :------: | ------------------------------------------------------------------------------------------------ |
| **A**     | Functional email/password registration          | **PASS** | `src/components/auth/register-form.tsx`, `tests/unit/auth-workflow.test.ts`, hosted gate `AUTH7` |
| **B**     | Scanner-safe email verification                 | **PASS** | `src/lib/auth/actions.ts`, `tests/unit/auth-workflow.test.ts`                                    |
| **C**     | Email/password login                            | **PASS** | `src/components/auth/login-form.tsx`, hosted gate `AUTH7`                                        |
| **D**     | Current-session logout                          | **PASS** | `src/lib/auth/actions.ts`, `tests/unit/auth-session-logout.test.ts`, hosted gate `AUTH9-A`       |
| **E**     | Password recovery and reset                     | **PASS** | `src/components/auth/password-change-form.tsx`, `tests/unit/auth-workflow.test.ts`               |
| **F**     | Google OAuth with PKCE flow                     | **PASS** | `src/lib/auth/google-oauth.ts`, `src/app/auth/callback/route.ts`, hosted gate `AUTH6`            |
| **G**     | Next.js SSR session cookies (`@supabase/ssr`)   | **PASS** | `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts`, `tests/unit/auth-ssr-core.test.ts`    |
| **H**     | `getClaims()` verified identity authority       | **PASS** | `src/lib/auth/claims.ts`, `tests/unit/auth-ssr-core.test.ts`, local integration `AUTH9-BR1`      |
| **I**     | Idempotent `CustomerProfile` provisioning       | **PASS** | `src/lib/auth/profile.ts`, `tests/unit/auth-profile-behavioral.test.ts`, hosted gate `AUTH7`     |
| **J**     | Same-email identity linking                     | **PASS** | `tests/unit/auth-workflow.test.ts`, hosted gate `AUTH6` (and `AUTH7` profile preservation)       |
| **K**     | `CustomerProfile` concurrency safety            | **PASS** | `tests/unit/auth-profile-behavioral.test.ts`, hosted gate `AUTH7`                                |
| **L**     | RBAC isolation (Model A explicit mapping)       | **PASS** | `src/lib/auth/rbac.ts`, `tests/unit/auth-rbac-runtime.test.ts`, hosted gate `AUTH8-B`            |
| **M**     | Authenticated cache boundary (no-store headers) | **PASS** | `src/lib/supabase/proxy.ts`, `src/app/cuenta/page.tsx`, build output `ƒ /cuenta`                 |
| **N**     | Public storefront auth-overhead isolation       | **PASS** | `tests/unit/auth-session-logout.test.ts`, zero auth calls in `src/app/(storefront)`              |
| **O**     | Zero custom password hashing / session tables   | **PASS** | Delegated 100% to Supabase Auth; zero password hashes in domain tables                           |
| **P**     | Zero authoritative RBAC in user metadata        | **PASS** | `tests/unit/auth-final-acceptance.test.ts`, RBAC derived exclusively from PostgreSQL tables      |
| **Q**     | Scanner-safe confirmation/recovery flow         | **PASS** | Explicit POST Server Actions on `/auth/confirm`, `tests/unit/auth-workflow.test.ts`              |
| **R**     | Custom SMTP / Resend Auth email pipeline        | **PASS** | Verified in hosted Supabase project settings; zero auth emails routed through Inngest            |

---

## Roadmap Testing / Validation Matrix

| Area                                        | Scope & Coverage                                                                                                |       Status       | Validation Method                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | :----------------: | --------------------------------------------------------------------------------------------- |
| **1. Email/Password Signup & Verification** | Valid/invalid registration payloads, password strength Zod schema, TokenHash OTP verification.                  |      **PASS**      | Vitest unit suite + hosted email confirmation                                                 |
| **2. Password Recovery Flow**               | Recovery request, single-use token verification, password update action, redirect handling.                     |      **PASS**      | Vitest unit suite + hosted recovery verification                                              |
| **3. Google OAuth Callback**                | PKCE authorization flow, state parameter validation, cookie exchange, profile completion redirect.              |      **PASS**      | Vitest unit suite + hosted OAuth flow (`AUTH6`)                                               |
| **4. Token Signature Verification**         | Tampered JWT payloads, invalid signatures, missing `sub` claims rejected by real local `getClaims()`.           |      **PASS**      | Real local Supabase cryptographic integration test (`AUTH9-BR1`)                              |
| **5. Session Expiry & Refresh**             | Token rotation through proxy adapter `updateSession()`, expired access token refresh, revoked token fail-close. | **PASS WITH NOTE** | Real local Supabase refresh integration (`AUTH9-BR1`); literal wall-clock expiry unconfigured |
| **6. Cache Boundary**                       | Authenticated pages dynamic (`no-store`), zero session cookies cached on public routes.                         |      **PASS**      | Next.js build classification + proxy header assertions                                        |
| **7. Identity Linking**                     | Same-email linking between email/password and Google OAuth resolving to 1 `CustomerProfile`.                    |      **PASS**      | Hosted gate `AUTH6` multi-identity proof                                                      |
| **8. Concurrency**                          | Race condition resistance on `ensureCustomerProfile()` under unique `auth_user_id` constraint.                  |      **PASS**      | Vitest concurrency suite (`Promise.all` parallel insertions)                                  |
| **9. RBAC Isolation**                       | Google OAuth users hold 0 roles/permissions; Model A explicit joins; fail-closed unknown role rejection.        |      **PASS**      | `tests/unit/auth-rbac-runtime.test.ts`, hosted gate `AUTH8-D`                                 |
| **10. Identity Detachment**                 | Real local `auth.users` deletion executes `ON DELETE SET NULL` on profile and `CASCADE` on roles.               |      **PASS**      | Real local PostgreSQL database test (`AUTH9-BR1`)                                             |

---

## Quality Gates & DoD Verification

### 1. Functional DoD

- All scoped authentication workflows (signup, verification, login, Google OAuth, recovery, reset, logout, profile provisioning, RBAC resolution) pass with zero runtime warnings or unhandled exceptions.

### 2. Visual DoD

- User-facing auth components (`<AuthCard>`, `<LoginForm>`, `<SignupForm>`, `<RecoverPasswordForm>`, `<ResetPasswordForm>`, `<CompleteProfileForm>`, `<LogoutButton>`) strictly adhere to the Gamer Perú obsidian theme, semantic typography, and spacing tokens.

### 3. Performance DoD

- Fast SSR session resolution powered by `getClaims()` local signature verification against cached JWKS.
- Public storefront routes (`/`, `/productos/*`, `/categorias/*`, `/marcas/*`, `/buscar`) load with zero auth resolution overhead.

### 4. SEO DoD

- Public storefront routes maintain single H1 hierarchy, metadata generation, and Schema.org JSON-LD structured data.
- Private auth pages (`/cuenta`, `/auth/completar-perfil`, `/auth/cambiar-password`) are isolated behind dynamic handlers with no-store headers.

### 5. Security DoD

- Strict server-side authorization enforcement; zero trust in `getSession()`.
- Domain Data API completely disabled; domain access routed exclusively through direct server-side PostgreSQL.
- Zero credentials, tokens, or JWTs stored in client storage or domain tables.

### 6. Accessibility DoD

- Authentication forms feature semantic HTML elements, accessible form labels, explicit ARIA error announcements (`role="alert"` / `role="status"`), full keyboard operability, and motion safety.

---

## Deviations & Binding Decisions

1. **Amended ADR-003 Model A RBAC**: `SUPER_ADMIN` possesses 10 explicit rows joined in `role_permissions` rather than a wildcard or hardcoded code-level bypass.
2. **Scanner-Safe TokenHash Confirmation**: Replaced automatic GET query token exchange with an explicit, user-initiated POST Server Action form to prevent enterprise email scanners from consuming single-use tokens.
3. **Local-Only Logout Scope**: `signOutAction` explicitly specifies `{ scope: "local" }` to terminate the active browser session without globally terminating other active sessions.
4. **Data API Revocation (Migration 0005)**: All direct table privileges for `anon`, `authenticated`, and `service_role` revoked from domain tables; data layer operates solely via direct server PostgreSQL.

---

## Residual Risks & Truthful Operational Notes

1. **JWT Expiration Window**: Supabase access JWTs remain cryptographically valid until their encoded expiration timestamp (default: 1 hour). Local logout clears the browser session cookies and terminates refresh capabilities, but does not perform real-time cryptographic revocation of previously emitted JWT strings.
2. **Data API State**: Supabase PostgREST Data API is turned OFF. If enabled in the future, domain tables will remain protected because table-level grants have been explicitly revoked in migration `0005_data_api_hardening.sql`.
3. **Customer Role Auto-Assignment**: The `CUSTOMER` role exists in the canonical vocabulary but is not automatically inserted into `user_roles` upon registration. Ownership authorization for customer resources (e.g. orders, addresses in GP-016) is enforced via verified `auth_user_id` equality predicates.
4. **CAPTCHA & Leaked-Password Protections**: Supabase Auth rate limiting and application Zod validations are active. Cloudflare Turnstile / hCaptcha and HaveIBeenPwned API checks are currently disabled in Supabase settings and recommended as future production hardening.

---

## Future Work & GP-016 Boundary

- **GP-016 (Customer Portal)**: Customer dashboard, order history, shipping address management, wishlist, and profile editing.
- **Staff Operations (Admin UI)**: Operational interfaces for catalog, orders, and support management guarded by `requirePermission()`.
- **Global Logout**: Future sensitive security control offering "Cerrar sesión en todos los dispositivos" (`scope: "global"`).

---

## Repository & Hosted Database Final State

### Repository State

- **Branch**: `main`
- **Working Tree**: Clean
- **Vitest Suite**: 47 test files passed (602 passed, 1 skipped, 603 total)
- **Playwright Suite**: 142 tests passed (142 total, 0 failed, 0 flaky, 0 retries)

### Hosted Database Baseline

```json
{
  "applied_migrations": 7,
  "latest_migration": "0006_canonical_rbac_seed",
  "physical_application_indexes": 45,
  "roles": 5,
  "permissions": 10,
  "role_permissions": 17,
  "user_roles": 1,
  "super_admin_assignments": 1,
  "customer_profiles": 2,
  "data_api_state": "OFF"
}
```

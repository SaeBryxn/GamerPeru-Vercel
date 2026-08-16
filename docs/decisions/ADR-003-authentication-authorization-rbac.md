# ADR-003 — Authentication, Identity Management and RBAC

## Status

ACCEPTED

## Decision History

- **2026-08-16 (GP-003 Initial Decision)**: Selected Better Auth with a PostgreSQL database session store and custom Argon2id password hashing.
- **2026-08-16 (Pre-Implementation Owner Amendment)**: Superseded by **Supabase Auth** with **Email/Password** and **Google OAuth** as the canonical identity provider. The amendment was executed prior to repository bootstrap (GP-005) and auth implementation (GP-015), requiring zero code or database migration.
- **2026-08-16 (External Semantics & Lifecycle Verification)**: Refined canonical `@supabase/ssr` cookie semantics (shared browser/server cookies, not HttpOnly), canonicalized `getClaims()` as primary server-side identity verification, separated authentication vs application email pipelines, established request-scoped client lifetimes, and defined the identity detachment/deletion lifecycle.

## Context

Gamer Perú requires secure, multi-surface identity and access management supporting:

1. Customer email/password registration, login, email verification, password recovery, and Google OAuth ("Continuar con Google").
2. Administrative staff authentication with granular Role-Based Access Control (RBAC) across catalog management, order verification, customer support, and system settings.
3. Strict server-side authorization that never relies on client-side state, possession of an unverified cookie, or hidden UI routes for security.
4. Seamless integration with the selected Supabase PostgreSQL relational database.

## Decision Drivers

- **Integrated Identity Plane**: Maximize synergy with the existing Supabase infrastructure without introducing redundant custom auth tables or session adapters.
- **Modern Social Login**: Native support for Google OAuth as a first-class v1 login method alongside standard email/password.
- **Authoritative Server-Side RBAC**: Identity verification (handled by Supabase Auth) and authorization permissions (handled by Gamer Perú) must be strictly decoupled.
- **Operational Simplicity**: Minimize custom credential hashing and token lifecycle infrastructure before implementation.
- **Free-First Compatibility**: Operate within Supabase Free tier quotas during launch without forcing commercial plan upgrades.

## Options Considered

1. **Supabase Auth (Selected)**: Managed identity plane native to Supabase PostgreSQL. Provides robust email/password auth, Google OAuth, JWT/refresh-token session lifecycle via Next.js SSR cookies (`@supabase/ssr`), PKCE flow, and custom SMTP routing via Resend.
2. **Better Auth (Superseded Pre-Implementation Option)**: TypeScript-first library using database session storage. Provided good control but required building and maintaining custom credential hashing, session tables, and OAuth flows on top of Supabase.
3. **Auth.js (NextAuth v5)**: Established framework; historical API churn during Next.js App Router transitions and less cohesive database integration than native Supabase Auth.
4. **Third-Party Auth SaaS (Clerk / Auth0 / WorkOS)**: Fully managed identity SaaS; rejected due to high recurring per-MAU costs and unnecessary third-party redirect friction.

## Decision

Adopt **Supabase Auth** as the canonical authentication provider combined with **Gamer Perú Server-Side RBAC**:

1. **Authentication Architecture & Session Model**:
   - **Identity Provider**: Supabase Auth manages identity records in its internal, provider-owned `auth` schema (`auth.users`, credentials, OAuth identities, refresh tokens).
   - **Canonical v1 Login Methods**:
     1. `EMAIL_PASSWORD`: Standard email registration, email verification, login, and password recovery.
     2. `GOOGLE`: Google OAuth 2.0 with PKCE authorization flow for frictionless "Continuar con Google".
   - **Cookie & SSR Architecture (`@supabase/ssr`)**:
     - `@supabase/ssr` stores the Supabase session in cookies shared between browser and server (`SameSite=Lax`, `Secure` in production, `Path=/`).
     - Standard Supabase SSR session cookies are NOT HttpOnly because the browser-side Supabase client (`createBrowserClient`) requires access to the session tokens to maintain and refresh client sessions.
     - Access tokens are short-lived JWTs; refresh tokens handle session rotation.
     - Token validity and expiration are controlled by Supabase Auth.
     - Possession of a cookie alone is NEVER proof of identity; server-side code must independently verify JWT authenticity.
   - **Server Identity Verification Strategy**:
     - **Primary (`getClaims()`)**: Server actions, route handlers, and Server Components primarily verify identity using `getClaims()` (or verified JWT verification against cached project JWKS), validating token signature and claims without an unnecessary network roundtrip to the Auth server.
     - **Fresh Record (`getUser()`)**: Used when Gamer Perú specifically requires the authoritative user record directly from Supabase Auth servers (e.g. verifying updated email confirmation state or administrative user status).
     - **Non-Authoritative (`getSession()`)**: Used only when raw token metadata is required; `getSession()` user data alone is explicitly NOT trusted as authorization proof in server execution.
     - **Conceptual Server Helper (`getVerifiedAuthContext()`)**: GP-015 will implement a request-scoped helper that creates the Supabase server client, validates claims with `getClaims()`, extracts `auth_user_id` from the verified `sub` claim, and resolves `CustomerProfile` or RBAC roles. Client-supplied IDs are never trusted.
   - **Request-Scoped Server Client Lifetime**:
     - Server clients containing request-specific session state must be created within the current request scope on Vercel.
     - Shared module-level authenticated Supabase clients are strictly forbidden to prevent session state leakage across serverless requests or reused compute instances.
   - **Authenticated-Route Caching Policy**:
     - Routes handling authenticated sessions or session cookie refresh must not use ISR and must not be publicly cached with `Set-Cookie` headers.
     - User-specific authenticated pages render dynamically (`no-store` / `force-dynamic`).
     - Public catalog routes (PDP, PLP, brands) remain independently cacheable via ISR and CDN edge caching.
   - **Google OAuth Scope Boundary**:
     - Scopes are strictly limited to minimum login/profile permissions: `openid`, `email`, `profile`.
     - No Google provider access tokens (`provider_token`) or refresh tokens (`provider_refresh_token`) are stored in Gamer Perú domain tables.
     - Supabase Auth automatically links OAuth identities sharing the same verified email to a single Supabase user record.
   - **Email Pipelines Separation**:
     - **Authentication Emails**: Handled by Supabase Auth routed via **Resend custom SMTP** in production (signup confirmation, verification, password recovery/reset).
     - **Application Commerce Emails**: Handled by Gamer Perú Domain Events / Inngest via **Resend API** and React Email templates (order confirmations, payment receipts, shipment tracking).
     - No duplicate password-reset delivery systems exist.
   - **Identity Lifecycle & Detachment Model**:
     - `CustomerProfile.auth_user_id` is required for active linked accounts (`UNIQUE WHERE auth_user_id IS NOT NULL`), but becomes `NULL` upon customer account deletion/anonymization.
     - Account deletion anonymizes customer personal data, detaches `CustomerProfile.auth_user_id`, removes `UserRole` assignments, and deletes/disables the Supabase Auth user while permanently preserving historical commerce records (Orders, Payments, Refunds, Inventory ledger, Audit events).
     - Historical staff references (`created_by_auth_user_id`, `verifier_auth_user_id`, `actor_auth_user_id`, etc.) use nullable FK (`ON DELETE SET NULL`) while immutable `AuditEvent` logs preserve historical audit strings.
     - `Affiliate.auth_user_id` supports detachment/suspension without deleting historical clicks, commissions, or payouts.

2. **Authoritative Gamer Perú RBAC**:
   - Authentication (identifying the user) and Authorization (determining capabilities) remain strictly partitioned.
   - User roles and permissions are stored in Gamer Perú PostgreSQL tables (`roles`, `permissions`, `role_permissions`, `user_roles`).
   - Granular RBAC Roles:
     - `SUPER_ADMIN`: Full system access, staff provisioning, encrypted AI credential configuration, audit export.
     - `ADMIN_CATALOG`: Product creation, spec management, pricing, category taxonomy, AI product research drafts.
     - `ADMIN_ORDERS`: Order status updates, Yape/Plin payment verification, shipping tracking assignment.
     - `ADMIN_SUPPORT`: Customer inquiry management, return/RMA review.
     - `CUSTOMER`: Standard customer account access restricted exclusively to owned records.
   - Authorization Enforcement:
     - Every administrative server action, layout, and route handler invokes `requirePermission('permission:name')`.
     - Customer data queries verify identity via `getClaims()`, resolve `auth_user_id` to `CustomerProfile.id`, and enforce customer ownership.
     - Social OAuth login (Google) never automatically grants administrative privileges.

## Consequences

- **Positive**:
  - Leverages native Supabase identity infrastructure, eliminating custom credential hashing (Argon2id) and session maintenance.
  - Turnkey Google OAuth integration with standard PKCE and SSR cookie handling.
  - Fast, network-efficient server verification via `getClaims()` against cached JWKS.
  - Zero recurring auth vendor costs under the Supabase Free-first strategy (up to 50,000 monthly active users).
  - Clean separation: Supabase manages authentication identity; Gamer Perú manages customer business profile and RBAC.
- **Negative & Maturity Considerations**:
  - `@supabase/ssr` is the official recommended package but continues to evolve its API surface; GP-005 / GP-015 will pin a tested version and version upgrades require auth regression tests.
  - Tighter coupling to the Supabase identity tier compared to a provider-agnostic library; identity provider migration would require explicit export/migration of `auth.users`.

## Security / SEO / Performance Impact

- **Security**: Server-side RBAC, cryptographically verified JWT claims (`getClaims()`), PKCE OAuth flow, request-scoped server clients, and strict identity detachment enforce multi-layer defense-in-depth.
- **SEO**: Zero impact on public catalog; public routes require no authentication overhead.
- **Performance**: JWT claims verification against cached JWKS adds near-zero latency to authenticated SSR requests.

## Migration / Reversal

If identity requirements evolve, Supabase Auth users can be exported via standard PostgreSQL tools / Supabase management APIs, and authentication logic can transition to an alternative OpenID/OAuth identity provider without altering Gamer Perú commerce aggregates, order history, or detached customer profiles.

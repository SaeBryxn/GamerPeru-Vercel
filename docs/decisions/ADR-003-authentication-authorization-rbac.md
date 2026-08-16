# ADR-003 — Authentication, Identity Management and RBAC

## Status
ACCEPTED

## Decision History
- **2026-08-16 (GP-003 Initial Decision)**: Selected Better Auth with a PostgreSQL database session store and custom Argon2id password hashing.
- **2026-08-16 (Pre-Implementation Owner Amendment)**: Superseded by **Supabase Auth** with **Email/Password** and **Google OAuth** as the canonical identity provider. The amendment was executed prior to repository bootstrap (GP-005) and auth implementation (GP-015), requiring zero code or database migration.

## Context
Gamer Perú requires secure, multi-surface identity and access management supporting:
1. Customer email/password registration, login, email verification, password recovery, and Google OAuth ("Continuar con Google").
2. Administrative staff authentication with granular Role-Based Access Control (RBAC) across catalog management, order verification, customer support, and system settings.
3. Strict server-side authorization that never relies on client-side state, unverified tokens, or hidden UI routes for security.
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

1. **Authentication Architecture**:
   - **Identity Provider**: Supabase Auth manages identity records in its internal, provider-owned `auth` schema (`auth.users`, credentials, OAuth identities, refresh tokens).
   - **Canonical v1 Login Methods**:
     1. `EMAIL_PASSWORD`: Standard email registration, email verification, login, and password recovery.
     2. `GOOGLE`: Google OAuth 2.0 with PKCE authorization flow for frictionless "Continuar con Google".
   - **Session Transport & SSR**: Supabase short-lived JWT access tokens and rotated refresh tokens are stored in secure HTTP-only cookies managed via `@supabase/ssr`.
   - **Identity Boundary**: Gamer Perú tables reference `auth.users.id` (`UUID`) via `auth_user_id`. Gamer Perú / Drizzle does not own, migrate, or alter internal Supabase `auth` tables.
   - **Profile Separation & Provisioning**: `CustomerProfile` is owned exclusively by Gamer Perú and provisioned idempotently upon first authenticated session via `ensureCustomerProfile(auth_user_id)`. Business profile data (names, phone, document, default address) is stored in `CustomerProfile`, never in Supabase user metadata.
   - **Authentication Emails**: Supabase Auth transactional emails (signup confirmations, password resets) are routed through **Resend custom SMTP** in production.

2. **Authoritative Gamer Perú RBAC**:
   - Authentication (identifying the user) and Authorization (determining capabilities) remain strictly partitioned.
   - User roles and permissions are stored in Gamer Perú PostgreSQL tables (`roles`, `permissions`, `role_permissions`, `user_roles`).
   - Granular RBAC Roles:
     * `SUPER_ADMIN`: Full system access, staff provisioning, encrypted AI credential configuration, audit export.
     * `ADMIN_CATALOG`: Product creation, spec management, pricing, category taxonomy, AI product research drafts.
     * `ADMIN_ORDERS`: Order status updates, Yape/Plin payment verification, shipping tracking assignment.
     * `ADMIN_SUPPORT`: Customer inquiry management, return/RMA review.
     * `CUSTOMER`: Standard customer account access restricted exclusively to owned records.
   - Authorization Enforcement:
     * Every administrative server action, layout, and route handler invokes `requirePermission('permission:name')`.
     * Customer data queries verify the Supabase Auth session server-side (`getUser()`), resolve `auth_user_id` to `CustomerProfile.id`, and enforce customer ownership.
     * Social OAuth login (Google) never automatically grants administrative privileges.

## Consequences
- **Positive**:
  - Leverages native Supabase identity infrastructure, eliminating custom credential hashing (Argon2id) and session maintenance.
  - Turnkey Google OAuth integration with standard PKCE and SSR cookie handling.
  - Zero recurring auth vendor costs under the Supabase Free-first strategy (up to 50,000 monthly active users).
  - Clean separation: Supabase manages authentication identity; Gamer Perú manages customer business profile and RBAC.
- **Negative**:
  - Tighter coupling to the Supabase platform in the identity tier compared to a provider-agnostic library.
  - Future identity provider migration would require export/migration of `auth.users` identities.

## Security / SEO / Performance Impact
- **Security**: Server-side RBAC, short-lived JWTs, secure HTTP-only session cookies, PKCE OAuth flow, and verified server-side identity checks (`getUser()`) enforce multi-layer defense-in-depth.
- **SEO**: Zero impact on public catalog; public routes require no authentication overhead.
- **Performance**: JWT verification and indexed database RBAC lookups add negligible latency to authenticated requests.

## Migration / Reversal
If identity requirements evolve, Supabase Auth users can be exported via standard PostgreSQL tools / Supabase management APIs, and authentication logic can transition to an alternative OpenID/OAuth identity provider without altering Gamer Perú commerce aggregates or customer profiles.

# ADR-003 — Authentication, Session Management and RBAC

## Status
ACCEPTED

## Context
Gamer Perú requires secure, multi-surface identity management supporting:
1. Customer email/password registration, login, profile management, password reset, and order history.
2. Administrative staff authentication with granular Role-Based Access Control (RBAC) across catalog management, order verification, customer support, and system settings.
3. Server-side authorization that never relies on client-side state or hidden UI routes for security.

## Decision Drivers
- **Server-Side Authoritative RBAC**: Privileged operations must be verified in server actions and data access functions against database state.
- **Session Security**: Secure HTTP-only cookies, resistance to XSS and CSRF, secure token rotation, and robust session invalidation.
- **Customer Privacy**: Customer sessions must strictly isolate personal orders and private addresses.
- **Independence & Simplicity**: Low dependency overhead without black-box third-party lock-in for critical customer auth.

## Options Considered
1. **Better Auth (with PostgreSQL Database Adapter)**: Modern, TypeScript-first authentication framework designed for Next.js App Router and PostgreSQL, supporting native session management, password hashing, password reset tokens, and multi-factor auth.
2. **Auth.js (NextAuth v5)**: Established framework; viable but has experienced significant API churn during App Router transitions.
3. **Third-Party Auth SaaS (Clerk / Auth0 / WorkOS)**: Fully managed UI and session infrastructure. High recurring per-MAU costs, vendor lock-in, external redirect friction for customer checkout, and third-party dependency in the critical path.

## Decision
Adopt **Better Auth** with a **PostgreSQL Database Session Store** and **Argon2id** password hashing:

1. **Authentication Architecture & Hashing Configuration**:
   - **Core Better Auth Relational Models**: Better Auth manages its core technical schema (`user`, `session`, `account`, `verification`). Credential password hashes reside strictly in the `account` table, while token lifecycles are managed in `verification`.
   - **Password Hashing**: Explicitly configure **Argon2id** via custom `hash()` and `verify()` handlers in Better Auth (overriding Better Auth's default `scrypt` algorithm) to ensure high resistance against GPU-based brute force attacks.
   - **Session Transport**: Opaque signed session cookies (`HttpOnly`, `SameSite=Lax`, `Secure` in production) validated directly against the PostgreSQL `session` table on each authenticated request. (Cookies contain signed session identifiers, not arbitrary JWE encrypted payloads).
   - **Session Revocation on Password Reset**: Explicitly configure Better Auth's password reset workflow to invalidate all existing active database sessions for the target user upon successful credential change.
   - **Security Properties**:
     * `HttpOnly` prevents client-side JavaScript access to session tokens, mitigating token extraction via XSS.
     * `Secure` mandates HTTPS transport for all session cookies in production.
     * `SameSite=Lax` mitigates Cross-Site Request Forgery (CSRF) on cross-origin navigation.
2. **Authoritative Gamer Perú RBAC**:
   - Authentication (identifying the user) and Authorization (determining permissions) are strictly separated.
   - User roles and permissions are stored in PostgreSQL (`roles`, `permissions`, `user_roles`).
   - Granular RBAC Roles:
     * `SUPER_ADMIN`: Full system access, staff provisioning, encrypted AI credential configuration, audit export.
     * `ADMIN_CATALOG`: Product creation, spec management, pricing, category taxonomy, AI product research drafts.
     * `ADMIN_ORDERS`: Order status updates, Yape/Plin payment verification, shipping tracking assignment.
     * `ADMIN_SUPPORT`: Customer inquiry management, return/RMA review.
     * `CUSTOMER`: Standard customer account access restricted exclusively to owned records.
   - Authorization Enforcement:
     * Every administrative server action, layout, and route handler invokes `requirePermission('permission:name')`.
     * Customer data queries automatically inject `session.customerId` derived from the server session; client-provided user IDs are ignored.

## Consequences
- **Positive**: Complete control over user data and auth flows, zero recurring auth vendor costs, instant session revocation, zero external dependency during login/checkout.
- **Negative**: Requires explicit configuration of custom Argon2id hashing and password-reset session invalidation handlers during bootstrap.

## Security / SEO / Performance Impact
- **Security**: Server-side RBAC and secure session cookie attributes enforce defense-in-depth across customer and admin surfaces.
- **SEO**: Zero impact on public catalog; public routes require no authentication overhead.
- **Performance**: Indexed database session lookups add minimal overhead to authenticated requests.

## Migration / Reversal
User credentials, sessions, accounts, and verification tokens reside in standard PostgreSQL tables (`user`, `session`, `account`, `verification`, `roles`, `permissions`). Auth logic can easily transition to alternative authentication libraries or external identity providers in the future.

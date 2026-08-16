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
1. **Custom Server-Side Session Management with Auth.js / Lucia Core Pattern**: Native PostgreSQL session store, HTTP-only signed cookies, Argon2id password hashing, and explicit server-side RBAC middleware and guard functions.
2. **Third-Party Auth SaaS (Clerk / Auth0 / WorkOS)**: Fully managed UI and session infrastructure. High recurring per-MAU costs, vendor lock-in, external redirect friction for customer checkout, and third-party dependency in the critical path.
3. **Stateless JWT in LocalStorage / Client State**: Vulnerable to XSS token theft, impossible to reliably invalidate sessions immediately upon admin role revocation or password change.

## Decision
Adopt **Server-Side Session Authentication with Auth.js / Native PostgreSQL Session Store** utilizing:
- **Password Hashing**: `Argon2id` (or `bcrypt` with cost factor 12) for secure credential storage.
- **Session Cookies**: Encrypted, `HttpOnly`, `SameSite=Lax`, `Secure` cookies stored in PostgreSQL with rolling expiration and instant server-side revocation capability.
- **Granular RBAC Roles**:
  - `SUPER_ADMIN`: Full system access, staff management, AI provider credential configuration, audit log export.
  - `ADMIN_CATALOG`: Product creation, editing, pricing, category management, AI import drafts.
  - `ADMIN_ORDERS`: Order status updates, Yape/Plin payment verification, shipping tracking entry.
  - `ADMIN_SUPPORT`: Customer inquiry management, RMA processing, assistance review.
  - `CUSTOMER`: Standard customer account, personal order history, wishlist, address book.
- **Enforcement Layers**:
  1. *Route Guard*: Middleware redirecting unauthenticated or unauthorized requests before page rendering.
  2. *Layout Guard*: Server-side layout verification ensuring non-admins cannot render `/admin/*`.
  3. *Action & Data Layer Guard*: Authoritative permission check inside every server mutation (`requirePermission('orders:verify')`), ensuring API tampering is impossible.

## Consequences
- **Positive**: Complete control over user data and auth flows, zero recurring auth vendor costs, instant session revocation, zero external dependency during login/checkout.
- **Negative**: Gamer Perú engineering owns password reset email delivery and rate limiting.

## Security / SEO / Performance Impact
- **Security**: Strict server-side RBAC and HTTP-only session cookies eliminate token theft and unauthorized access risks.
- **SEO**: Zero impact on public catalog; public routes require no authentication overhead.
- **Performance**: Lightweight database session lookup (indexed by session token) adds sub-millisecond overhead.

## Migration / Reversal
User credentials and sessions reside in standard PostgreSQL tables (`users`, `sessions`, `roles`, `permissions`). Auth logic can easily transition to alternative authentication libraries or external identity providers in the future.

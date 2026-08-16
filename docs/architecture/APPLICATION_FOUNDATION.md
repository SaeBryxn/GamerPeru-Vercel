# Gamer Perú — Canonical Application Foundation Specification

---

## 1. Purpose

This document establishes the canonical specification for the **Application Foundation** of **Gamer Perú** (`gamerperu.com`). It defines the cross-cutting application shell, Next.js App Router topology, root layout responsibilities, error boundaries, structured server logging, observability baseline, health endpoints, security headers, and architectural boundaries governing all feature implementations.

---

## 2. Scope

These standards govern:

- The Next.js 16 App Router folder structure and layout hierarchy;
- Core application metadata and non-secret application configuration (`src/config/app.ts`);
- Cross-cutting error taxonomy (`AppError`) and public error sanitization;
- Framework error surfaces (`error.tsx`, `global-error.tsx`, `not-found.tsx`);
- Server-only structured JSON logging with Pino (`src/lib/logger/`);
- Mandatory sensitive data redaction in operational logs;
- Sentry observability foundation (`@sentry/nextjs`) with strict PII minimization;
- Application liveness endpoint (`GET /api/health`);
- HTTP security headers baseline in `next.config.ts`;
- Compile-time server/client isolation boundaries (`import "server-only"`);
- Degradation and failure semantics for upstream and downstream services.

---

## 3. App Router Topology

Gamer Perú uses a unified modular monolith App Router topology organized into logical route groups:

```text
src/app/
├── (storefront)/              # Public e-commerce surfaces (Catalog, PDP, Cart, Static pages)
│   ├── layout.tsx             # Storefront layout (Header, Nav, Footer in GP-009)
│   └── page.tsx               # Root homepage / (GP-010)
├── (customer)/                # Authenticated customer hub (Account, Orders, Saved Addresses) [GP-015+]
├── (admin)/                   # Protected operational backoffice (Inventory, Payments, AI) [GP-022+]
├── api/                       # API Route Handlers
│   └── health/
│       └── route.ts           # Liveness probe (GET /api/health)
├── error.tsx                  # Route segment error boundary
├── global-error.tsx           # Global root HTML error boundary
├── globals.css                # Global foundational styles & CSS custom properties
├── layout.tsx                 # Root application shell (<html>, <body>, global metadata)
└── not-found.tsx              # Canonical 404 page
```

---

## 4. Root Layout Responsibilities

The root layout (`src/app/layout.tsx`) is strictly minimal and structural:

1. **Semantic HTML Root**: Sets `<html lang="es-PE">` defining the Peruvian Spanish locale.
2. **Body Shell**: Renders the foundational `<body>` without visual chrome or premature navigation components.
3. **Application Metadata**: Provides baseline site title and description from `APP_CONFIG`.
4. **Global Styles**: Imports `globals.css` with core color tokens and font definitions.
5. **No Visual Chrome**: Header, navigation drawers, and footers belong exclusively to route group layouts (`(storefront)`, `(admin)`).

---

## 5. Route Groups

Route groups isolate layout concerns without affecting URL paths:

- **`(storefront)`**: Wraps all public shopping surfaces. In GP-007, contains the minimal layout and current homepage `/`.
- **`(customer)`**: Dedicated to authenticated customer profiles and order tracking; protected by session guards in GP-015.
- **`(admin)`**: Dedicated to internal staff operations; protected by authoritative server-side RBAC in GP-022.
- **`api`**: Dedicated to webhook receivers, health probes, and internal handlers.

---

## 6. Server / Client Boundary

To ensure complete data protection and zero secret leakage:

1. **Server-First Execution**: All App Router components are React Server Components (RSC) by default. Client components require an explicit `"use client"` directive.
2. **Compile-Time Server Isolation**: Every module accessing database connections, secrets, private object storage, or server environment variables must declare `import "server-only";` at line 1.
3. **Client Config Safety**: Client Components may only import public configuration from `@/config/public-env` (`NEXT_PUBLIC_*`).
4. **Sanitized Error Exposure**: Client-facing error boundaries and responses receive only public error representations (`toPublicError`), never internal database errors or stack traces.

---

## 7. Application Configuration

Static, non-secret application constants are defined in `src/config/app.ts`:

- `APP_CONFIG.name`: `"Gamer Perú"`
- `APP_CONFIG.legalName`: `"Gamer Perú S.A.C."`
- `APP_CONFIG.defaultLocale`: `"es-PE"`
- `APP_CONFIG.defaultCurrency`: `"PEN"`
- `APP_CONFIG.canonicalHost`: `"gamerperu.com"`

Dynamic business policies (tax rates, shipping fees, commission rates, reservation TTLs) are strictly prohibited from static configuration files and belong in database tables or dedicated domain modules.

---

## 8. Error Taxonomy

Gamer Perú defines a standard application error class in `src/lib/errors/index.ts`:

```ts
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly publicMessage: string;
  readonly isOperational: boolean;
}
```

Standard factory methods:

- `AppError.badRequest(message, publicMessage)` (400)
- `AppError.unauthorized(message, publicMessage)` (401)
- `AppError.forbidden(message, publicMessage)` (403)
- `AppError.notFound(message, publicMessage)` (404)
- `AppError.internal(message, cause)` (500)

### Public Error Sanitization (`toPublicError`)

Converts any thrown exception into a safe payload `{ code, statusCode, message }`. Unknown internal errors default to a friendly Spanish message without exposing database table names, SQL queries, or internal stack traces.

---

## 9. Error Boundary Hierarchy

1. **`src/app/global-error.tsx`**: The top-level catch-all boundary. Renders complete `<html>` and `<body>` tags if the root layout itself fails.
2. **`src/app/error.tsx`**: Catches errors within nested route segments. Provides a "Reintentar" retry trigger and automatically captures the exception in Sentry.
3. **Server Action Errors**: Caught in server actions and mapped via `toPublicError` before returning typed result objects to the client.

---

## 10. Not-Found Behavior

The canonical 404 handler (`src/app/not-found.tsx`):

- Emits real HTTP 404 status codes for unmatched routes;
- Renders an accessible heading (`<h1>Página no encontrada</h1>`);
- Provides a clear link back to the homepage (`/`);
- Contains zero private or debug information.

---

## 11. Structured Logging

Server-only structured logging is implemented via **Pino** (`src/lib/logger/index.ts`):

- **Format**: Structured JSON output with ISO timestamps and environment tags;
- **Runtime**: Strictly `server-only`; no browser logging;
- **Context**: Supports child loggers (`createChildLogger({ module, operation, requestId })`);
- **Severities**:
  - `debug`: Detailed development diagnostics.
  - `info`: Meaningful operational facts (e.g. order placed, payment hold transition).
  - `warn`: Recoverable unexpected conditions (e.g. rate limit approached, retryable network failure).
  - `error`: Failed operations requiring engineer investigation.
  - `fatal`: Process-level unrecoverable crashes.

---

## 12. Logging Redaction

Pino is configured with strict automatic path redaction for sensitive fields:

- `password`, `*.password`
- `authorization`, `*.authorization`, `headers.authorization`
- `cookie`, `*.cookie`, `headers.cookie`
- `token`, `*.token`, `access_token`, `refresh_token`
- `secret`, `*.secret`, `apiKey`, `api_key`
- `voucher_url`, `proof_url`, `operation_code`
- Master environment keys (`DATABASE_URL`, `SUPABASE_SECRET_KEY`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `AI_ENCRYPTION_KEY_V1`)

Redacted values are automatically replaced with `"[REDACTED]"`.

---

## 13. Sentry Observability

Sentry is integrated via `@sentry/nextjs` using the official Next.js 16 configuration files:

- `sentry.server.config.ts`: Server-side exception monitoring.
- `sentry.edge.config.ts`: Edge runtime exception monitoring.
- `sentry.client.config.ts`: Browser client error capture.
- `instrumentation.ts`: Next.js lifecycle hooks registering runtime Sentry initializers.
- `next.config.ts`: Configured with `withSentryConfig` to enable build integration.

### Optional Operation & Zero Build Failure

- Sentry DSN and auth tokens are strictly optional in local and CI environments.
- If Sentry credentials are not configured, the application and build pipeline execute normally without error.
- Zero external network requests are sent when Sentry is unconfigured.

---

## 14. PII / Sensitive Data Policy

1. **Default PII Disabled**: Sentry `sendDefaultPii` is set to `false`.
2. **No Operational PII**: Customer street addresses, phone numbers, raw credit cards, and cleartext passwords must never be logged or sent to observability sinks.
3. **Identifier Classification**: Anonymized entity IDs (UUIDs) and order numbers may be included in structured logs for traceability.

---

## 15. Health Endpoint

- **Route**: `GET /api/health`
- **Purpose**: Fast, low-overhead container/process liveness verification.
- **Contract**:
  ```json
  {
    "status": "ok"
  }
  ```
- **Guarantees**:
  - Returns HTTP 200 with `Cache-Control: no-store`;
  - Performs **zero** database, Auth, R2, or Inngest queries;
  - Exposes zero internal system metrics or dependency statuses.

---

## 16. Security Header Baseline

Configured in `next.config.ts` for all application routes:

| Header                      | Value                                          | Purpose                                           |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                      | Prevents MIME-type sniffing.                      |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`              | Limits referrer leakage on cross-origin requests. |
| `X-Frame-Options`           | `SAMEORIGIN`                                   | Protects against clickjacking.                    |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`     | Restricts browser device hardware features.       |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS connections.                       |

_(Obsolete `X-XSS-Protection` is omitted in accordance with modern security standards)._

---

## 17. CSP Deferral

Enforced Content Security Policy (CSP) with nonces is deliberately deferred to **GP-043 (Security Hardening)** to avoid premature conflicts with:

- Google OAuth popup and redirection flows;
- Cloudflare R2 media and dynamic image transformations;
- Sentry and PostHog client telemetry scripts;
- Next.js Turbopack hydration and server action nonces.

---

## 18. Request Correlation

Server operations can generate a standard UUIDv4 request identifier via `generateRequestId()` in `src/lib/correlation/index.ts`. This ID may be passed to child loggers to correlate log messages across complex asynchronous workflows without relying on global mutable state.

---

## 19. Testing Strategy

1. **Unit Tests (`tests/unit/`)**:
   - `AppError` instantiation, status codes, and operational flags;
   - `toPublicError` sanitization of known and unknown exceptions;
   - Pino sensitive key redaction;
   - `APP_CONFIG` schema constants.
2. **E2E & Integration Tests (`tests/e2e/`)**:
   - Verification of `/` HTTP 200 response and semantic headings;
   - Real HTTP 404 response on non-existent routes;
   - Health endpoint `GET /api/health` response and headers;
   - Security header assertions;
   - Automated Axe accessibility baseline.

---

## 20. Failure / Degradation Semantics

- **Sentry Unavailable**: Application operations continue completely unhindered; errors are logged locally via Pino.
- **Logging Failure**: An issue writing to stdout/stderr must never terminate active HTTP transactions.
- **Supabase Auth Unavailable**: Public storefront remains browsable; authenticated routes fail safely with clean error boundaries.
- **PostgreSQL Unavailable**: Database-dependent actions fail safely; the `/api/health` liveness endpoint remains responsive to confirm container runtime health.
- **Cloudflare R2 Unavailable**: Fallback media placeholders or graceful degradation are applied without crashing page renders.
- **Inngest Unavailable**: Interactive checkout paths record state in PostgreSQL; background job retries resume once Inngest connectivity is restored.

---

## 21. Later-GP Ownership

The Application Foundation provides the shared runtime shell. Future GPs own the following specialized domains:

- **GP-008**: UI Design System & Component Library.
- **GP-009**: Global Storefront Navigation & Chrome.
- **GP-010**: Homepage & Hero Layout.
- **GP-015**: Supabase Authentication & Session Guards.
- **GP-022**: Admin Portal Foundation & RBAC Guards.
- **GP-036+**: SEO Schema & Canonical Engine.
- **GP-043**: Security Hardening & CSP Nonce Implementation.
- **GP-044**: Performance & Core Web Vitals Optimization.
- **GP-045**: Accessibility Hardening.
- **GP-046**: Responsive QA & Cross-Browser Verification.

---

## 22. GP-007 Definition of Done

1. [x] Next.js 16 App Router shell with `(storefront)` route group established.
2. [x] Minimal root layout with `lang="es-PE"` and stable metadata.
3. [x] Error taxonomy (`AppError`) and public error sanitization implemented.
4. [x] `error.tsx`, `global-error.tsx`, and `not-found.tsx` error boundaries created.
5. [x] Server-only Pino structured logger with automatic sensitive data redaction.
6. [x] Sentry SDK integrated with zero-config build compatibility and PII protection.
7. [x] `GET /api/health` liveness endpoint created with dynamic execution and no downstream queries.
8. [x] Baseline HTTP security headers configured in `next.config.ts`.
9. [x] Unit and E2E test suites covering application foundation passing 100%.
10. [x] Zero business features, domain tables, migrations, or auth flows created.

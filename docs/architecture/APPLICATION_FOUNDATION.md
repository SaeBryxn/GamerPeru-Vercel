# Gamer Perú — Canonical Application Foundation Specification

---

## 1. Purpose

This document establishes the canonical specification for the **Application Foundation** of **Gamer Perú** (`gamerperu.com`). It defines the cross-cutting application shell, Next.js App Router topology, root layout responsibilities, error boundaries, structured server logging, observability baseline, health endpoints, security headers, and architectural boundaries governing all feature implementations.

---

## 2. Scope

These standards govern:

- The Next.js 16 App Router folder structure and layout hierarchy;
- Core application metadata and non-secret application configuration (`src/config/app.ts`);
- Cross-cutting error taxonomy (`AppError`) and public error sanitization (`toPublicError`);
- Framework error surfaces (`error.tsx`, `global-error.tsx`, `not-found.tsx`);
- Server-only structured JSON logging with Pino (`src/lib/logger/`);
- Mandatory sensitive data redaction in operational logs;
- Sentry observability foundation (`@sentry/nextjs`) with pure event sanitization (`src/lib/observability/sentry-sanitize.ts`);
- Next.js 16 instrumentation conventions (`instrumentation.ts`, `instrumentation-client.ts`);
- Application liveness endpoint (`GET /api/health`);
- HTTP security headers baseline in `next.config.ts`;
- Compile-time server/client isolation boundaries (`import "server-only"`);
- Degradation and failure semantics for upstream and downstream services.

---

## 3. App Router Topology

Gamer Perú uses a unified modular monolith App Router topology organized into logical route groups:

```text
├── instrumentation.ts         # Next.js 16 server/edge runtime instrumentation & onRequestError
├── instrumentation-client.ts  # Next.js 16 client runtime instrumentation & Sentry initialization
├── sentry.server.config.ts    # Sentry Node.js server initializer with beforeSend sanitizer
├── sentry.edge.config.ts      # Sentry Edge runtime initializer with beforeSend sanitizer
├── next.config.ts             # Security headers, withSentryConfig (telemetry: false)
└── src/
    ├── app/
    │   ├── (storefront)/      # Public e-commerce surfaces (Catalog, PDP, Cart, Static pages)
    │   │   ├── layout.tsx     # Storefront layout (Header, Nav, Footer in GP-009)
    │   │   └── page.tsx       # Root homepage / (GP-010)
    │   ├── (customer)/        # Authenticated customer hub (Account, Orders, Saved Addresses) [GP-015+]
    │   ├── (admin)/           # Protected operational backoffice (Inventory, Payments, AI) [GP-022+]
    │   ├── api/               # API Route Handlers
    │   │   └── health/
    │   │       └── route.ts   # Liveness probe (GET /api/health)
    │   ├── error.tsx          # Route segment error boundary
    │   ├── global-error.tsx   # Global root HTML error boundary
    │   ├── globals.css        # Global foundational styles & CSS custom properties
    │   ├── layout.tsx         # Root application shell (<html>, <body>, global metadata)
    │   └── not-found.tsx      # Canonical 404 page
    ├── config/
    │   ├── app.ts             # Static non-secret application constants
    │   ├── public-env.ts      # Public environment schema & parser
    │   └── server-env.ts      # Server-only environment schema & parser
    └── lib/
        ├── correlation/       # Request ID generation (UUIDv4)
        ├── errors/            # AppError taxonomy & public error sanitization
        ├── logger/            # Server-only Pino logger with canonical redaction
        └── observability/     # Sentry event sanitizer (sentryBeforeSend)
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
- `APP_CONFIG.defaultLocale`: `"es-PE"`
- `APP_CONFIG.defaultCurrency`: `"PEN"`
- `APP_CONFIG.canonicalHost`: `"gamerperu.com"`

### Legal Entity & Statutory Disclosures Rule

Legal company name, RUC (Registro Único de Contribuyentes), fiscal address, tax presentation, and statutory consumer disclosures must originate from an explicit approved owner/legal specification before being added to application configuration. GP-007 does not invent or assume legal entity names (e.g. `legalName` is omitted from runtime configuration until formally decided).

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
- Meets WCAG 2.1 AA color contrast standards;
- Provides a clear link back to the homepage (`/`);
- Contains zero private or debug information.

---

## 11. Structured Logging

Server-only structured logging is implemented via **Pino** (`src/lib/logger/index.ts`):

- **Format**: Structured JSON output with ISO timestamps and environment tags;
- **Runtime**: Strictly `server-only`; no browser logging;
- **Testability**: Exports `createLogger(options, destination)` allowing deterministic unit testing with memory streams;
- **Context**: Supports child loggers (`createChildLogger({ module, operation, requestId })`);
- **Severities**:
  - `debug`: Detailed development diagnostics.
  - `info`: Meaningful operational facts (e.g. order placed, payment hold transition).
  - `warn`: Recoverable unexpected conditions.
  - `error`: Failed operations requiring engineer investigation.
  - `fatal`: Process-level unrecoverable crashes.

---

## 12. Logging Redaction

Pino is configured with strict automatic path redaction for canonical environment secrets and sensitive commerce fields:

- `DATABASE_URL`, `*.DATABASE_URL`
- `SUPABASE_SECRET_KEY`, `*.SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`, `*.RESEND_API_KEY`
- `R2_ACCESS_KEY_ID`, `*.R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`, `*.R2_SECRET_ACCESS_KEY`
- `INNGEST_EVENT_KEY`, `*.INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`, `*.INNGEST_SIGNING_KEY`
- `AI_ENCRYPTION_KEY_V1`, `*.AI_ENCRYPTION_KEY_V1`
- `SENTRY_AUTH_TOKEN`, `*.SENTRY_AUTH_TOKEN`
- `password`, `*.password`, `*.*.password`
- `authorization`, `*.authorization`, `headers.authorization`, `headers.Authorization`
- `cookie`, `*.cookie`, `headers.cookie`, `headers.Cookie`
- `token`, `*.token`, `*.*.token`, `access_token`, `refresh_token`
- `secret`, `*.secret`, `*.*.secret`, `apiKey`, `api_key`
- `voucher_url`, `*.voucher_url`, `proof_url`, `*.proof_url`, `operation_code`, `*.operation_code`

Redacted values are automatically replaced with `"[REDACTED]"`.

---

## 13. Sentry Observability

Sentry is integrated via `@sentry/nextjs@10.70.0` following current Next.js 16 conventions:

- **`instrumentation.ts`**: Registers server/edge runtime configurations and exports `onRequestError = Sentry.captureRequestError` for capturing unhandled App Router / RSC request errors.
- **`instrumentation-client.ts`**: Native Next.js 16 client instrumentation entry point initializing browser Sentry client with `beforeSend: sentryBeforeSend`.
- **`sentry.server.config.ts`**: Server-side Node.js runtime initialization with `beforeSend: sentryBeforeSend`.
- **`sentry.edge.config.ts`**: Edge runtime initialization with `beforeSend: sentryBeforeSend`.
- **`next.config.ts`**: Configured with `withSentryConfig` setting `telemetry: false`, `sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN }`, and `release: { create: Boolean(process.env.SENTRY_AUTH_TOKEN) }`.

### Sentry Event Sanitization Boundary (`src/lib/observability/sentry-sanitize.ts`)

A centralized, pure `sentryBeforeSend` hook is attached to all Sentry runtimes. It:

1. Strips credentials from connection strings (e.g. `postgres://[REDACTED_CREDENTIALS]@host:port/db`);
2. Strips signed private R2 URLs and access signatures (`[REDACTED_SIGNED_URL]`);
3. Strips JWTs and 64-character hex master keys from error messages and exception values;
4. Redacts `authorization`, `cookie`, `set-cookie`, tokens, payment operation codes, and proof URLs from request contexts, breadcrumbs, and extra metadata;
5. Preserves diagnostic error types, sanitized messages, stack traces, and safe routes without mutating the original input object.

### Unconfigured Operation & Quiet Builds

- Sentry DSN, auth token, organization, and project are strictly optional in local and CI environments.
- When unconfigured, `next build` executes cleanly without warning spam, skips source-map uploads, skips remote release creation, and disables build-plugin telemetry (`telemetry: false`).

---

## 14. PII & Identifier Classification

1. **Default PII Disabled**: Sentry `sendDefaultPii` is set to `false`.
2. **No Operational PII**: Customer street addresses, phone numbers, raw credit cards, and cleartext passwords must never be logged or sent to observability sinks.
3. **Identifier Classification**: UUIDs are internal/pseudonymous identifiers (not anonymous). Safe internal entity identifiers may be logged only where operationally necessary and classification permits.

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
   - Pino sensitive key redaction using in-memory streams (`createLogger`);
   - Sentry event sanitization boundary (`sentryBeforeSend`, `sanitizeString`, `sanitizeObject`);
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
5. [x] Server-only Pino structured logger with automatic sensitive data redaction and stream testability.
6. [x] Sentry SDK integrated via Next.js 16 `instrumentation.ts` / `instrumentation-client.ts` with `onRequestError = Sentry.captureRequestError`, `telemetry: false`, and pure `sentryBeforeSend` event sanitization.
7. [x] `GET /api/health` liveness endpoint created with dynamic execution and no downstream queries.
8. [x] Baseline HTTP security headers configured in `next.config.ts`.
9. [x] Unit and E2E test suites covering application foundation passing 100%.
10. [x] Zero business features, domain tables, migrations, or auth flows created.

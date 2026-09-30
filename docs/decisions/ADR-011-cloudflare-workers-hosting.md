# ADR-011 — Cloudflare Workers Hosting

## Status

PROPOSED — supersedes the hosting part of
[ADR-008](ADR-008-testing-cicd-deployment.md) (Vercel as application host) once the first
production deployment passes the verification below. Testing and CI choices in ADR-008 are
unchanged.

## Context

The storefront, admin and APIs run on Vercel. The team wants to host them on Cloudflare
Workers, next to the R2 buckets and the DNS zone already on Cloudflare, on the Workers Free plan.

An earlier attempt was blocked by the Free plan's 3 MiB compressed size limit (the Worker is
~5.6 MiB compressed). Cloudflare has since removed the compressed limit: both plans now allow
64 MiB uncompressed, and the Worker is ~25.6 MiB uncompressed.

Constraints of the Workers runtime that shaped this decision:

- Native Node modules cannot load (`sharp`, used to normalize catalog photos).
- A socket opened by one request cannot be used by another, so a module-level database pool
  breaks from the second request on.
- WebAssembly cannot be compiled at runtime (the `@sentry/nextjs` server SDK does this).
- Next.js 16 `proxy.ts` runs on the Node runtime, which OpenNext supports only experimentally.
- Free plan: 10 ms CPU per request, 50 subrequests per request, 100,000 requests per day.

## Decision

Host the Next.js app on Cloudflare Workers through `@opennextjs/cloudflare` (OpenNext), with
`nodejs_compat`.

- **Images:** catalog photo normalization goes through an `ImageProcessor` port
  (`src/lib/admin/catalog/image-processor.ts`). Production uses the Cloudflare Images binding
  (`IMAGES`), which decodes JPEG/PNG/WebP/AVIF, applies EXIF orientation and drops metadata on
  WebP output. `sharp` is a dev dependency used only by the test implementation.
- **Database:** `src/db/index.ts` keeps the Node pool for dev, tests and builds. On Workers,
  `db` resolves per request to a client keyed by the request's execution context; a `HYPERDRIVE`
  binding, when configured, replaces `DATABASE_URL`. `max_pipeline: 0` and the postgres.js patch
  from the Supavisor fix apply on both runtimes.
- **Caching (ADR-010):** the Next.js incremental cache lives in R2 (`gamerperu-next-cache`)
  behind the regional cache; `revalidateTag` state and the ISR queue use Durable Objects.
- **Observability:** `open-next.config.ts` sets `GP_DEPLOY_TARGET=cloudflare` for `next build`.
  With it, `next.config.ts` leaves out `withSentryConfig` and the `node.ts` page extension, so
  the server instrumentation hook (`instrumentation.node.ts`) is not part of the Worker. Error
  boundaries load the Sentry SDK on demand in the browser only
  (`src/lib/observability/report-client-error.ts`). Browser error reporting is unchanged; server
  errors are visible in Workers Logs (`observability`). Vercel/Node builds keep Sentry as before.
- **Build:** OpenNext does not support Windows reliably. Builds run on Linux: Cloudflare Workers
  Builds from the repository, WSL, or CI.

## Consequences

- The app no longer depends on Vercel; Vercel deployments break for admin photo uploads (no
  `IMAGES` binding) and must not receive this branch.
- Server-side errors are not sent to Sentry until `@sentry/cloudflare` is added.
- `next/image` optimization and catalog photo processing consume Cloudflare Images
  transformations (5,000 unique per month on the free tier).
- Each request opens its own database connections unless Hyperdrive is configured.
- Node middleware support in OpenNext is experimental and not maintained by its core team.

## Verification

Before production (done, Linux container, real Supabase database, `wrangler dev`):
OpenNext build and `wrangler deploy --dry-run` succeed; home, category, product page, search
API and login return 200 on two consecutive rounds (the second round proves per-request
database clients); `/cuenta` and `/admin` redirect unauthenticated users.

After the first deployment (pending):

1. No `Error 1102: Worker exceeded CPU time limit` in Workers Logs for storefront, account,
   checkout and admin routes. If dynamic routes exceed 10 ms, the Free plan is not viable for
   them and Workers Paid (30 s default) is required.
2. A portrait phone photo uploaded in the admin comes out upright (EXIF orientation on the real
   Images binding; the local emulator does not apply it).
3. Checkout, payment proof upload and admin payment approval complete (transactions).

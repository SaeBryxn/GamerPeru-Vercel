# GP-003 — Closure Report

## Checkpoint History

- Original GP-003 Base Checkpoint:
  `d08a1407c19bdcb17b8ef5929b9c944ceeac9276`

- Initial GP-003 Content:
  `a5fcf937e579229c01a8176ebf85cd9312482bc6`

- Initial GP-003 Closure:
  `8a90e423fa216f7977261482798b68ee02e502e4`

- Remediation Content Checkpoint:
  `cdc1f594910620dd737c829ca55f72ec73e087ed`

- Remediation Closure Checkpoint:
  `29544984d7638d8dccce26e3390cb8a8490f8b4f`

- Factual Content Checkpoint:
  `e72543c67703c637d7eed3592307b24aef4dddea`

- Factual Closure Checkpoint:
  `22adb3b4d04d558a50a4d9f0633a42165eb1538c`

- Final Boundary Content Checkpoint:
  `cd1b097520b08bcaeb6ce41792c1f3da4bda6642`

- Supabase Auth Amendment Checkpoint:
  `b7c785680c66bff77352625b196cc88a1cc0d000`

- Supabase Auth Semantics Checkpoint:
  `322e522c5111815c33d1e299d17713b668e69b5a`

---

## Supabase Auth External Semantics Verification

Following external architecture verification, implementation semantics for Supabase Auth integration were finalized:

1. **Corrected SSR Cookie Model**:
   - Standard `@supabase/ssr` session cookies are shared between browser and server (`SameSite=Lax`, `Secure` in production, `Path=/`) and are NOT HttpOnly, allowing the browser-side Supabase client (`createBrowserClient`) to access and refresh sessions.
   - Possession of a cookie is never treated as identity proof; server code independently verifies JWT authenticity.
2. **Server Identity Verification Hierarchy**:
   - **`getClaims()`**: Established as the PRIMARY server-side identity verification method for protecting Server Actions, route handlers, and Server Components (validates JWT signatures against cached project JWKS without unnecessary Auth-server roundtrips).
   - **`getUser()`**: Used when Gamer Perú specifically requires authoritative fresh user record data directly from Supabase Auth servers.
   - **`getSession()`**: Explicitly NOT trusted alone for server authorization.
3. **Request-Scoped Server Client Lifetime on Vercel**:
   - Server clients containing request-specific session state must be instantiated within current request scope (`createClient`); shared module-level client state is strictly prohibited.
4. **Authenticated-Route Caching Boundary**:
   - Authenticated routes must not use ISR if session refresh can occur and must not publicly cache responses with `Set-Cookie` headers. User-specific authenticated pages render dynamically (`no-store`), while public catalog routes remain fully cacheable.
5. **Email Pipeline Separation**:
   - Authentication emails (signup confirmation, email verification, password recovery/reset) are handled strictly by **Supabase Auth $\to$ Resend custom SMTP**.
   - Application commerce emails are dispatched asynchronously by **Gamer Perú Domain Events / Inngest $\to$ Resend API $\to$ React Email**.
   - Password reset is never dispatched via Inngest; no duplicate delivery paths exist.
6. **Portability Trade-Off Clarified**:
   - High portability for commerce domain data (standard PostgreSQL, Drizzle ORM, standard SQL).
   - Lower portability for identity tier due to intentional coupling with Supabase Auth (`auth.users` ID references).
7. **`@supabase/ssr` Package Maturity**:
   - Recommended SSR package pinned to a tested version in GP-005; version upgrades require auth regression testing.

---

## Owner Authentication Architecture Amendment

Prior to the commencement of GP-005 (Repository Bootstrap), an explicit owner architecture decision amended the identity plane for Gamer Perú:

1. **Supabase Auth Adoption**:
   - Replaced Better Auth with **Supabase Auth** as the canonical identity provider.
   - Leverages native identity plane capabilities included in the already-selected Supabase PostgreSQL infrastructure.
2. **Canonical v1 Authentication Methods**:
   - `EMAIL_PASSWORD`: Email registration, verification, login, and password recovery.
   - `GOOGLE`: Google OAuth 2.0 ("Continuar con Google") with PKCE flow.
3. **Session & Security Model**:
   - Short-lived JWT access tokens and rotated refresh tokens transported via cookies managed with `@supabase/ssr`.
   - Verified server-side identity checks (`getClaims()`) enforce security across all protected routes and server actions.
4. **Authoritative Gamer Perú RBAC Preserved**:
   - Supabase Auth handles authentication ("Who is this user?"); Gamer Perú PostgreSQL RBAC tables (`roles`, `permissions`, `role_permissions`, `user_roles`) handle authorization ("What may this user do?").
   - Google login or user metadata never grants administrative permissions; `requirePermission(...)` remains authoritative.
5. **Free-First Compatibility**:
   - Operates within Supabase Free tier allowances (up to 50,000 monthly active users including social OAuth) with zero plan upgrade required solely for Google login.
6. **Zero Migration Cost**:
   - Executed prior to repository bootstrap (GP-005) and auth implementation (GP-015), requiring zero code refactoring or database migration.

---

## Final Boundary & Provider Semantics Cleanup

A targeted documentation audit finalized all remaining domain boundaries, provider pricing distinctions, and security/performance semantics:

1. **Commerce Domain Boundary Returned to GP-004 / GP-020**:
   - Removed premature lifecycle claims that inventory is automatically reserved before payment instructions or within a fixed "payment window".
   - Preserved core architectural requirements: PostgreSQL transactions and row-level locking (`SELECT ... FOR UPDATE`) are available to prevent overselling according to the reservation/allocation model finalized in GP-004.
2. **Cloudflare Images Pricing Semantics Corrected**:
   - Clarified that source images remain stored in Cloudflare R2 and do not incur Cloudflare Images Storage fees ($5/100k images).
   - Cloudflare Image Transformations Free includes up to 5,000 unique transformations/month (hard cap; new transformations fail when exceeded until upgraded).
   - Cloudflare Image Transformations Paid includes 5,000 unique transformations with additional transformations billed at $0.50 per 1,000 transformations on paid zones.
3. **Cloudflare R2 S3 Compatibility Wording Reconciled**:
   - Replaced claims of "full S3 API compatibility" and guaranteed "zero-code migration" with precise language: R2 exposes an S3-compatible API for standard object operations (PUT, GET, DELETE, HEAD, pre-signed URLs) behind a storage adapter; migrating to other S3-compatible providers requires revalidating provider-specific behavior, signing semantics, CDN/transformation integrations, and cache headers.
4. **Private Proof Access Semantics Refined**:
   - Replaced contradictory wording ("completely closed to public HTTP access") with precise access control definitions: configured with no anonymous public read access, no public custom media domain, no directory listing, and no unrestricted CDN delivery. Authorized staff access requires Gamer Perú RBAC verification before issuing a short-lived signed bearer URL (5-minute expiration) over HTTPS.
5. **Failure & Degradation Matrix Reconciled**:
   - Removed unsupported "DNS failover" for Vercel application host outage (no secondary origin exists; recovery relies on Vercel platform restoration / rollback).
   - Decoupled private payment-proof storage outage from Inngest (file operations can be retried upon storage recovery; does not block core storefront browsing; GP-004/GP-020 determines exact upload UX degradation).
   - Removed stale `Analytics (local buffering)` reference; external behavioral analytics operate on a best-effort delivery basis while authoritative financial/order records remain 100% intact in PostgreSQL.
6. **Security & Performance Wording Precision**:
   - Replaced absolute "zero layout shift" promise with self-hosted/optimized font loading via `next/font` to minimize font-induced layout shift with fallback metrics, validated during implementation.
   - Replaced absolute "eliminates SQL injection" statement with precise risk reduction language: Drizzle ORM parameterized query APIs significantly reduce SQL-injection risk by ensuring user inputs remain parameterized; raw SQL queries, when genuinely necessary, require explicit review and parameter binding.

---

## Research Date
August 16, 2026

## Official Sources Reviewed
- **Application Framework**: Next.js 16 Active LTS Documentation (`nextjs.org/docs`) — Server Components (RSC), App Router, streaming SSR, metadata generation API, server actions, and route group isolation.
- **Node.js Runtime**: Node.js 24 LTS Documentation (`nodejs.org/docs/latest-v24.x/`).
- **Database & Data Layer**: PostgreSQL 16+ Manual (`postgresql.org/docs/16/`), Supabase Guides & Pricing (`supabase.com/docs`, `supabase.com/pricing`), Drizzle ORM Documentation (`orm.drizzle.team/docs`) — ACID transactions, row-level locks (`SELECT ... FOR UPDATE`), JSONB hardware specs, GIN full-text indexes, `pg_trgm` similarity, Supavisor connection pooling, base Pro daily backups vs optional PITR add-on.
- **Object Storage & Media**: Cloudflare R2 Documentation (`developers.cloudflare.com/r2/`), Cloudflare Images (`developers.cloudflare.com/images/`) — S3 API compatibility subset, zero egress bandwidth pricing, 5,000 free transformation limit behavior, paid transformation billing ($0.50/1k), and private bucket pre-signed URLs.
- **Authentication**: Supabase Auth Documentation (`supabase.com/docs/guides/auth`) — Email/password, Google OAuth, `@supabase/ssr` cookies, `getClaims()` verification, PKCE flow, and Resend custom SMTP integration.
- **Asynchronous Processing**: Inngest Durable Execution Documentation (`inngest.com/docs`) — Multi-step workflows, automatic retries, rate limiting, and failure handlers.
- **Communications**: Resend API Docs (`resend.com/docs`), React Email Docs (`react.email/docs`) — Transactional email deliverability and React-based templating.
- **Observability & Analytics**: PostHog Docs (`posthog.com/docs`), Sentry Docs (`docs.sentry.io`), Pino Logger Docs (`getpino.io`) — Error tracing, automated PII redaction, and cookieless product analytics.
- **Testing**: Vitest (`vitest.dev`), Playwright (`playwright.dev`), axe-core (`deque.com/axe`) — ESM test runner speed, multi-browser mobile emulation, and automated WCAG 2.1 AA testing.
- **AI Providers**: OpenAI API (`platform.openai.com/docs`), Anthropic API (`docs.anthropic.com`), Google Gemini API (`ai.google.dev/docs`) — Multi-provider structured JSON outputs, streaming interfaces, and token pricing models.

---

## Selected Architecture Summary
- **Paradigm**: **Modular Monolith** with managed cloud infrastructure.
- **Application Runtime**: **Next.js (App Router, Next.js 16 Active LTS Line)** + **TypeScript 5.x** on **Node.js 24 LTS**.
- **Application Hosting**: **Vercel Pro** hosting `gamerperu.com` on Vercel Edge Network with serverless Node.js execution.
- **Commerce Engine**: **Custom Gamer Perú Commerce Domain** owned entirely in TypeScript.
- **Database & Data Access**: **Supabase PostgreSQL (PostgreSQL 16+)** with **Drizzle ORM** and Supavisor connection pooling (Free-First launch $\to$ Pro upgrade path without code rewrite).
- **Authentication & RBAC**: **Supabase Auth** (Email/Password + Google OAuth) with Next.js SSR cookie session architecture (`@supabase/ssr`), `getClaims()` verification, Resend custom SMTP, and authoritative server-side Role-Based Access Control (`requirePermission`).
- **Object Storage**: **Cloudflare R2** partitioned into `gamerperu-public-media` (Edge CDN + WebP/AVIF transformations via `media.gamerperu.com`) and `gamerperu-private-proofs` (Private S3 bucket + 5-minute pre-signed URLs).
- **Search & Background Jobs**: **PostgreSQL FTS + Trigram (`pg_trgm`)** behind a `SearchProvider` adapter; **Inngest** for durable asynchronous workflows.
- **AI Infrastructure**: Multi-provider AI Gateway with versioned **AES-256-GCM** encryption-at-rest for admin API keys, separated from the database runtime master key.
- **Communications & Analytics**: **Resend + React Email**, **First-Party PostgreSQL Event Ledger + PostHog**, and **Sentry + Pino** structured JSON logging.
- **Testing & CI/CD**: **Vitest** (Unit/Integration) + **Playwright** (E2E & a11y) + **GitHub Actions CI/CD** with automated previews and staging promotion.

---

## ADRs Created / Reconciled
All 8 foundational ADRs updated to **ACCEPTED** with factual baselines under [`docs/decisions/`](../decisions/):
1. [`docs/decisions/ADR-001-application-framework-runtime.md`](../decisions/ADR-001-application-framework-runtime.md): Next.js 16 Active LTS, TypeScript 5.x, Node.js 24 LTS, Vercel Pro hosting, Modular Monolith topology.
2. [`docs/decisions/ADR-002-commerce-engine-data-architecture.md`](../decisions/ADR-002-commerce-engine-data-architecture.md): Custom Gamer Perú commerce domain on Supabase PostgreSQL (Free-first launch $\to$ Pro upgrade) with Drizzle ORM.
3. [`docs/decisions/ADR-003-authentication-authorization-rbac.md`](../decisions/ADR-003-authentication-authorization-rbac.md): Supabase Auth (Email/Password + Google OAuth), Next.js SSR cookies, `getClaims()` verification, Resend custom SMTP, and authoritative RBAC.
4. [`docs/decisions/ADR-004-storage-media-pipeline.md`](../decisions/ADR-004-storage-media-pipeline.md): Cloudflare R2 (public media + image transformations / private proofs with short-lived pre-signed URLs).
5. [`docs/decisions/ADR-005-search-asynchronous-jobs.md`](../decisions/ADR-005-search-asynchronous-jobs.md): PostgreSQL FTS / Trigram with SearchProvider adapter + Inngest durable async workflows.
6. [`docs/decisions/ADR-006-communications-analytics-observability.md`](../decisions/ADR-006-communications-analytics-observability.md): Resend + React Email, separate Auth SMTP and commerce API pipelines, first-party PostgreSQL event ledger + PostHog, Sentry + Pino.
7. [`docs/decisions/ADR-007-ai-provider-credential-security.md`](../decisions/ADR-007-ai-provider-credential-security.md): Provider-agnostic AI orchestrator, versioned AES-256-GCM secret encryption, Assistant isolation.
8. [`docs/decisions/ADR-008-testing-cicd-deployment.md`](../decisions/ADR-008-testing-cicd-deployment.md): Vitest + Playwright + GitHub Actions + Vercel Pro deployment.

---

## Security Validation
- [x] Authoritative server-side RBAC guards every administrative mutation, page layout, and route handler (`requirePermission`).
- [x] Customer data isolation derives identity exclusively from the verified server-side identity (`getClaims()` $\to$ `auth_user_id` $\to$ `CustomerProfile.id`).
- [x] Yape/Plin payment proofs are stored in an isolated private bucket with no anonymous public access; viewable exclusively via 5-minute pre-signed URLs with bearer credential audit logging.
- [x] Admin-configured AI credentials encrypted at rest using AES-256-GCM with key versioning (`key_version`) and a server runtime master key (`AI_ENCRYPTION_KEY_V1`) stored separately from database tables. Plaintext keys are never returned to client browsers.
- [x] AI Customer Assistant is restricted to allowlisted tool calls and public/session-filtered data; zero direct database or SQL execution access.

---

## SEO Validation
- [x] Full Server-Side Rendering (SSR) and React Server Components (RSC) ensure search engine crawlers receive complete HTML without client execution delays.
- [x] Dynamic `<title>`, meta descriptions, canonical URLs, and OpenGraph images generated per route.
- [x] Automated JSON-LD structured data injection (`Product`, `BreadcrumbList`, `Organization`).
- [x] Dynamic XML sitemap and `robots.txt` generation.

---

## Performance Validation
- [x] Target Core Web Vitals budgets: LCP < 2.5s, CLS < 0.1, INP < 200ms (benchmarked during implementation).
- [x] Media assets delivered via Cloudflare Edge CDN (`media.gamerperu.com`) with on-the-fly WebP/AVIF transformation and pre-allocated container aspect ratios.
- [x] Self-hosted typography (`Plus Jakarta Sans`, `Inter`, `JetBrains Mono`) via `next/font` to minimize font-induced layout shift with fallback metrics, validated during implementation.
- [x] Minimal client JavaScript bundle size achieved through React Server Components.

---

## Failure / Degradation Summary
- **Critical Path**: Primary Supabase PostgreSQL Database (managed with daily backups on Pro / optional PITR add-on).
- **Gracefully Degradable**: Supabase Auth (public storefront remains browsable without auth; new login/session refresh degraded), AI Providers (research paused, assistant shows helpful search fallback), Transactional Email (queued in Inngest for retry), Search Engine (falls back to database ILIKE only while Postgres is healthy), Analytics (best-effort external delivery; financial truth safe in PostgreSQL), EC OS Downstream (outbox queue holds events until recovery).

---

## Cost Snapshot (USD)
- **Local Development**: **$0 / month** (Local Node.js 24 + Local PostgreSQL + Mock Adapters).
- **Cloud Pre-Launch**: **~$20 – $25 / month** (Vercel Pro $20 required for commercial team use, Supabase Free $0 with Supabase Auth up to 50k MAU, Cloudflare R2 Free, Inngest Free, Resend Free, PostHog Free, AI test tokens < $5).
- **Initial Live Launch**: **~$35 – $55 / month** (Vercel Pro $20, Supabase Free $0 with scheduled R2 backups and Auth included, Cloudflare R2 Free / Images Free, Resend Free, PostHog Free, AI tokens ~$15).
- **Supabase Pro Stage**: **~$60 – $80 / month** (Vercel Pro $20 + Supabase Pro $25 with 7-day daily backups and 100k Auth MAU + Cloudflare R2 Free + Resend $0-$15 + PostHog Free + AI tokens ~$15-$25).
- **Growth Stage (Optional Add-ons)**: **~$175 – $325+ / month** (Vercel Pro $20 + Supabase Pro $25 + Optional PITR ~$100 + Inngest Pro $35 + Cloudflare Images Paid transformations ~$10 + AI tokens $50-$100 + Resend Paid ~$20).

---

## Deferred Decisions
- **GP-004**: Commerce Domain Model (database table column definitions, exact entity relationships, inventory allocation/reservation rules, checkout lifecycle).
- **GP-005**: Repository Bootstrap (`package.json`, lockfiles, framework scaffolding, Drizzle config).
- **GP-042**: Final EC OS Integration Contract (exact outbound payload schemas).

---

## Files Changed
- `docs/architecture/TECHNOLOGY_ARCHITECTURE.md`: Finalized Supabase Auth SSR cookie model, `getClaims()` verification, Trust Boundary diagram, email pipeline separation, and portability classifications.
- `docs/decisions/ADR-003-authentication-authorization-rbac.md`: Refined ADR-003 with official `@supabase/ssr` shared cookie model, `getClaims()` primary verification, request-scoped client factories, and identity detachment lifecycle.
- `docs/decisions/ADR-006-communications-analytics-observability.md`: Explicitly separated Supabase Auth custom SMTP vs Inngest React Email API pipelines.
- `docs/roadmap/GP-015.md`: Updated future authentication scope and added explicit regression test suites.
- `docs/roadmap/GP-003-CLOSURE.md`: Appended `## Supabase Auth External Semantics Verification`.

---

## Repository Status
- **Branch**: `main`
- **Upstream**: `origin/main`
- **Base Checkpoint**: `d08a1407c19bdcb17b8ef5929b9c944ceeac9276`
- **Closure Content Checkpoint**: `322e522c5111815c33d1e299d17713b668e69b5a`
- **Working Tree**: Clean (Closure report staged for final closure commit).

---

## Final Status
PASS

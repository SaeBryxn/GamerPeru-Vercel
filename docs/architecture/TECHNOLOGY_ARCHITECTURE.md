# Gamer Perú — Canonical Technology Architecture Specification

---

## 1. Executive Decision Summary

This document defines the canonical technology architecture for **Gamer Perú** (`gamerperu.com`). It establishes the authoritative software stack, runtime environments, data boundaries, security models, hosting topology, and operational infrastructure required to build a high-performance multi-brand gaming peripherals e-commerce platform in Peru.

**Canonical Decisions Summary**:
- **Architecture Paradigm**: **Modular Monolith** with managed cloud infrastructure (avoiding premature microservices).
- **Application Framework**: **Next.js (App Router) with TypeScript** running on the **Node.js Runtime**, providing server-rendered catalog pages, React Server Components (RSC), streaming AI responses, and strict server-side authorization.
- **Commerce Domain Engine**: **Custom Gamer Perú Commerce Domain** owned entirely in TypeScript, optimized for Peruvian domestic payments (`YAPE_MANUAL`, `PLIN_MANUAL`), dynamic multi-category hardware specifications, and modular Product Story layouts.
- **Database & Data Layer**: **PostgreSQL 16+** with **Drizzle ORM**, providing strict ACID transactions, row-level locking for inventory allocation, JSONB for hardware spec extensions, and automated migrations.
- **Authentication & RBAC**: **Server-Side Session Authentication** with PostgreSQL session persistence and authoritative server-side Role-Based Access Control (RBAC).
- **Object Storage & Media Pipeline**: **Cloudflare R2** with edge CDN and on-the-fly WebP/AVIF transformation for public media; isolated private bucket with time-limited pre-signed URLs for customer Yape/Plin vouchers.
- **Search & Asynchronous Processing**: **PostgreSQL Full-Text Search + Trigram (`pg_trgm`)** behind a clean `SearchProvider` adapter for v1; **Inngest** for durable asynchronous background workflows (AI product imports, email retries, outbound EC OS events).
- **AI Infrastructure & Credential Security**: Multi-provider AI Gateway (OpenAI, Anthropic, Google Gemini) with **AES-256-GCM** encryption-at-rest for admin-managed API keys, separated from the database master key.
- **Communications, Analytics & Observability**: **Resend + React Email**, **First-Party PostgreSQL Event Ledger + PostHog/Plausible**, and **Sentry + Pino** structured JSON logging with automatic PII masking.
- **Testing & Deployment**: **Vitest** (Unit/Integration) + **Playwright** (E2E & a11y) + **GitHub Actions CI/CD** with automated staging and preview deployments.

---

## 2. Decision Date & Research Method

- **Decision Date**: August 16, 2026
- **Research Method**: Every candidate technology was evaluated against official vendor and open-source project documentation, current stable production releases, enterprise support longevity, Latin American regional latency, operational complexity, and alignment with Gamer Perú's canonical specifications.
- **Primary Documentation Sources Consulted**:
  - Next.js 15+ Documentation (`nextjs.org/docs`)
  - PostgreSQL 16 Official Manual (`postgresql.org/docs/16/`)
  - Drizzle ORM Documentation (`orm.drizzle.team/docs`)
  - Cloudflare R2 & Image Optimization Docs (`developers.cloudflare.com/r2/`)
  - Inngest Durable Execution Docs (`inngest.com/docs`)
  - Resend & React Email Documentation (`resend.com/docs`, `react.email/docs`)
  - Sentry SDK Documentation (`docs.sentry.io`)
  - Web Content Accessibility Guidelines (WCAG 2.1 AA)

---

## 3. Canonical Constraints

1. **Peru-First Multi-Brand Focus**: Architecture must natively support domestic Soles (`S/`) pricing, Yape and Plin manual verification workflows, local courier integrations, and domestic inventory transparency.
2. **SEO & Performance Dominance**: Zero client-only rendering for public catalog content; all products, categories, specs, and editorial stories must render as crawlable semantic HTML with near-zero Cumulative Layout Shift (CLS).
3. **No Premature Microservices**: All core business capabilities (Storefront, Customer Hub, Cart, Checkout, Inventory, Admin, Affiliates, AI Product Assistant) reside within a single modular codebase with explicit boundaries.
4. **EC OS Operational Independence**: Downstream failure or latency in EC OS must NEVER degrade, delay, or block Gamer Perú storefront sales or administrative payment verification.
5. **AI Never Source of Truth**: Artificial intelligence is strictly an advisory, extraction, and presentation layer; prices, stock levels, orders, and payment confirmations are governed exclusively by deterministic application logic and database transactions.

---

## 4. Architecture Principles

1. **Authority at the Server**: Privileged authorization, business rule validation, inventory reservation, and payment status transitions occur strictly on the server. Client state is treated as untrusted presentation.
2. **Type Safety Across Boundaries**: A single TypeScript domain layer ensures type consistency from database schemas and domain models to server actions and React components.
3. **Data Isolation & Least Privilege**: Public marketing data, authenticated customer records, and internal business margins occupy isolated security zones.
4. **Resilient Asynchrony**: Any operation exceeding 500ms (AI research, batch imports, email delivery, outbound webhooks) is delegated to durable background workers with automatic retries and backoff.
5. **Reversibility & Standard Interfaces**: All external infrastructure (search, email, storage, AI) is accessed through domain adapter interfaces, preventing vendor lock-in.

---

## 5. Selected Architecture Overview

```text
+---------------------------------------------------------------------------------------------------+
|                                     CLIENT SURFACES                                               |
|  Public Storefront (Desktop/Mobile)  |  Customer Portal  |  Admin Operational Backoffice          |
+---------------------------------------------------------------------------------------------------+
                                                  |  (HTTPS / Next.js Server Actions / APIs)
                                                  v
+---------------------------------------------------------------------------------------------------+
|                            NEXT.JS APPLICATION RUNTIME (Node.js)                                  |
|                                                                                                   |
|  +-----------------------+  +------------------------+  +---------------------------------------+ |
|  | Route Group: Storefront|  | Route Group: Customer  |  | Route Group: Admin                    | |
|  | - Server Components    |  | - Auth Session Guard   |  | - Server-Side RBAC Guard               | |
|  | - Streaming Product SSR|  | - Customer Order Views |  | - Yape/Plin Verification Workflow    | |
|  | - JSON-LD / SEO engine |  | - Wishlist / Addresses |  | - Inventory & Product Story Builder   | |
|  +-----------------------+  +------------------------+  +---------------------------------------+ |
|                                                                                                   |
|  +----------------------------------------------------------------------------------------------+ |
|  |                           MODULAR DOMAIN SERVICES LAYER (TypeScript)                        | |
|  |  [Catalog]  [Cart & Checkout]  [Orders & Payments]  [Inventory]  [Affiliates]  [AI Gateway]  | |
|  +----------------------------------------------------------------------------------------------+ |
+---------------------------------------------------------------------------------------------------+
      |                       |                       |                      |               |
      v                       v                       v                      v               v
+-------------+      +------------------+      +-------------+      +-----------------+  +----------+
| PostgreSQL  |      | Cloudflare R2    |      | Inngest     |      | AI Providers    |  | Resend   |
| Primary DB  |      | Object Storage   |      | Async Queue |      | (OpenAI/Anth/   |  | Transact |
| (Postgres16+|      | - Public Media   |      | - AI Jobs   |      |  Gemini Gateway)|  | Email    |
| + Drizzle)  |      | - Private Proofs |      | - Retries   |      | Encrypted Keys  |  | Templates|
+-------------+      +------------------+      +-------------+      +-----------------+  +----------+
```

---

## 6. Logical Architecture Diagram

```mermaid
graph TD
    User([Shopper / Customer]) -->|HTTPS| CDN[Cloudflare Edge CDN]
    Admin([Staff / Super Admin]) -->|HTTPS| CDN
    
    subgraph "Application Runtime (Next.js)"
        CDN --> AppRouter[Next.js App Router]
        AppRouter --> Storefront[Storefront Pages & RSC]
        AppRouter --> CustomerHub[Customer Account Portal]
        AppRouter --> AdminPortal[Admin Operational Portal]
        
        Storefront --> DomainServices[Domain Services Layer]
        CustomerHub --> DomainServices
        AdminPortal --> DomainServices
        
        DomainServices --> AuthModule[Auth & Session Engine]
        DomainServices --> OrderModule[Orders & Manual Payment Engine]
        DomainServices --> CatalogModule[Catalog & Search Service]
        DomainServices --> AIGateway[AI Provider Gateway]
    end
    
    subgraph "Data & Infrastructure Tier"
        DomainServices -->|Drizzle ORM / SQL| DB[(PostgreSQL 16+ Primary DB)]
        DomainServices -->|S3 API| R2Public[(R2 Public Media Bucket)]
        DomainServices -->|Signed URLs| R2Private[(R2 Private Proofs Bucket)]
        DomainServices -->|Events| Inngest[Inngest Background Worker]
        AIGateway -->|Encrypted Keys| DB
        AIGateway -->|HTTPS API| LLMs[OpenAI / Anthropic / Gemini]
        Inngest -->|Async Tasks| Resend[Resend Transactional Email]
        Inngest -->|Outbox Events| ECOS[Downstream EC OS]
    end
```

---

## 7. Trust Boundary Diagram

```mermaid
graph LR
    subgraph "Zone 1: Public Internet"
        Browser[Public Browser]
        Bot[Search Engine Crawlers]
    end
    
    subgraph "Zone 2: Authenticated Perimeter"
        CustSession[Customer Session Cookie]
        AdminSession[Admin RBAC Session Cookie]
    end
    
    subgraph "Zone 3: Server Application Trust Boundary"
        AppServer[Next.js Server Actions & API Handlers]
        ZodValidator[Zod Input & Payload Validation]
        RBACGuard[Authoritative RBAC Guard]
    end
    
    subgraph "Zone 4: Isolated Storage & Infrastructure"
        DB[(PostgreSQL ACID Store)]
        Vault[(AES-256-GCM Encrypted Key Table)]
        PrivateProofs[(Private S3 Voucher Storage)]
    end
    
    Browser -->|Public Requests| AppServer
    Bot -->|Crawl Requests| AppServer
    CustSession -->|Verified by Cookie| ZodValidator
    AdminSession -->|Verified by Cookie| RBACGuard
    
    RBACGuard -->|Requires 'orders:verify'| PrivateProofs
    RBACGuard -->|Requires 'ai:manage'| Vault
    ZodValidator --> AppServer
    AppServer --> DB
```

---

## 8. Application Framework & Runtime

- **Selected Framework**: **Next.js (App Router)** with **TypeScript** (ADR-001).
- **Server Runtime**: **Node.js (LTS)** on serverless/container infrastructure.
- **Rendering Strategy**:
  - *Public Catalog / Product Story*: Streaming Server-Side Rendering (SSR) with React Server Components (RSC) and On-Demand Incremental Static Regeneration (ISR) for static policy pages.
  - *Dynamic Commerce Data*: Product stock availability, cart drawers, and price checks render with fresh server data on request.
  - *Customer Hub & Admin Backoffice*: Dynamic server rendering with strict server-side session checks.
- **API & Server Mutations**: Implemented primarily via type-safe Next.js **Server Actions** backed by Zod schemas, minimizing boilerplate REST endpoint maintenance while guaranteeing server-side execution.

---

## 9. Storefront / Admin Topology

- **Topology Model**: **Single Unified Modular Application (Modular Monolith)**.
- **Route Structure**:
  - `app/(storefront)/*`: Public catalog, search, product detail pages, marketing, and footer pages.
  - `app/(customer)/*`: Authenticated customer profile, saved addresses, order tracking, and wishlist.
  - `app/(admin)/*`: Protected administrative backoffice, inventory management, Yape/Plin verification workbench, staff management, and AI settings.
  - `app/api/*`: Specialized webhook handlers (Resend, EC OS) and streaming AI endpoints.
- **Security Boundary**: Security is enforced at the layout, server action, and database query layers. Non-admin sessions attempting to access `/admin` are rejected by server middleware before any UI or data leaks.

---

## 10. Commerce Engine Strategy

- **Selected Strategy**: **Custom Gamer Perú Commerce Domain** on PostgreSQL (ADR-002).
- **Core Modules**:
  - `Cart & Pricing`: Client cart state synchronized with server-side pricing, tax (IGV in Soles), and promotional discount calculators.
  - `Checkout & Reservation`: Atomic inventory reservation during order placement using PostgreSQL row-level locks (`SELECT ... FOR UPDATE`).
  - `Manual Payment Verification`: State machine specifically designed for Yape/Plin domestic verification (`PENDING_PAYMENT` $\to$ `PAYMENT_SUBMITTED` $\to$ `PAYMENT_VERIFIED` $\to$ `PAID` / `REJECTED`).
  - `Multi-Category Hardware Catalog`: Dynamic specifications stored in structured JSONB columns with category-specific Zod schema validation (Mice, Keyboards, Audio, Mousepads).
  - `Product Story Engine`: Modular 13-block editorial PDP content builder.
  - `Affiliates & Commissions`: First-party affiliate tracking, coupon attribution, and commission status management with automatic invalidation upon order cancellation or return.

---

## 11. Database & Data Access

- **Database Engine**: **PostgreSQL 16+** (ADR-002).
- **Managed Provider Strategy**: **Supabase** or **Neon / AWS RDS** with connection pooling (PgBouncer) enabled.
- **Data Access Layer**: **Drizzle ORM** (TypeScript-native schema-as-code).
- **Schema Discipline**:
  - Core financial and inventory entities use strict foreign keys, unique constraints, and check constraints.
  - Category hardware specifications and modular Product Story blocks use PostgreSQL `JSONB` columns with Zod validation.
  - Migrations are generated as standard SQL scripts (`.sql`) via `drizzle-kit` and versioned in Git.
- **Connection Management**: Serverless execution pools connections through PgBouncer in transaction mode to prevent connection exhaustion.

---

## 12. Authentication

- **Authentication Strategy**: **Server-Side Session Authentication** with PostgreSQL persistence (ADR-003).
- **Password Security**: Passwords hashed using **Argon2id** (or `bcrypt` with cost factor 12).
- **Session Transport**: Encrypted, `HttpOnly`, `SameSite=Lax`, `Secure` session cookies.
- **Session Management**: Session tokens stored in PostgreSQL with rolling expiration; instant revocation upon password reset or admin session termination.
- **Customer Flows**: Registration, login, password reset via signed email tokens, and profile update.

---

## 13. Authorization / RBAC Boundary

- **Authorization Model**: **Authoritative Server-Side RBAC** (ADR-003).
- **Role Definitions**:
  - `SUPER_ADMIN`: Unrestricted platform access, staff provisioning, encrypted AI credential configuration, audit export.
  - `ADMIN_CATALOG`: Product creation, spec management, pricing, category taxonomy, AI product research drafts.
  - `ADMIN_ORDERS`: Order status updates, Yape/Plin payment verification, shipping tracking assignment.
  - `ADMIN_SUPPORT`: Customer inquiry management, return/RMA review.
  - `CUSTOMER`: Standard customer account access restricted exclusively to owned records.
- **Enforcement Rules**:
  - Every server action and data query calls `requirePermission('permission:name')`.
  - Customer queries automatically filter by `session.customerId` derived from the verified session cookie; client-supplied user IDs are ignored.

---

## 14. Public Media Storage

- **Storage Provider**: **Cloudflare R2** (ADR-004) with **Cloudflare Edge CDN**.
- **Bucket**: `gamerperu-public-media` (Publicly accessible via `media.gamerperu.com`).
- **Optimization Pipeline**: Dynamic edge transformation to WebP and AVIF based on browser headers.
- **Caching**: `Cache-Control: public, max-age=31536000, immutable` for immutable hashed assets.

---

## 15. Private Payment-Proof Storage

- **Storage Provider**: **Cloudflare R2 Private Bucket** (ADR-004).
- **Bucket**: `gamerperu-private-proofs` (Completely closed to public HTTP access).
- **Access Control**: Zero public URLs or CDN endpoints. Staff view vouchers exclusively via **time-limited pre-signed URLs** (5-minute expiration) generated on-demand by server actions after verifying `orders:verify` permission.
- **Upload Validation**: Enforces strict MIME type checks (JPEG, PNG, WebP) and a 5MB size limit.

---

## 16. Search Architecture

- **v1 Search Engine**: **PostgreSQL Full-Text Search (`tsvector`) + Trigram Similarity (`pg_trgm`)** (ADR-005).
- **Search Capabilities**: Sub-10ms queries across product titles, brand names, categories, and technical attributes with typo tolerance and Spanish stemming.
- **Abstraction**: Encapsulated behind a clean TypeScript **`SearchProvider`** interface.
- **Scale / Migration Trigger**: If the catalog exceeds 10,000 SKUs or requires complex vector similarity, `SearchProvider` can transition to **Meilisearch** or **Typesense** without altering UI or business logic.

---

## 17. Caching Architecture

- **Public Edge Caching**: Category pages, brand directories, and static editorial content cached at the Cloudflare Edge CDN with tag-based on-demand revalidation.
- **Authoritative Dynamic Boundary**: Cart calculations, checkout availability, inventory reservations, customer account data, and admin interfaces are strictly excluded from edge caching (`Cache-Control: no-store`).
- **Checkout Invariant**: Checkout always queries the database directly with row-level locks before confirming an order.

---

## 18. Background Jobs & Asynchronous Queues

- **Job Orchestrator**: **Inngest** (ADR-005).
- **Supported Workflows**:
  - Long-running AI Product Research & enrichment jobs (15–45s).
  - Batch product imports with provider rate-limiting.
  - Transactional email dispatch with exponential backoff retries.
  - Outbound EC OS integration event delivery with dead-letter queueing.
  - Search index synchronization and cache warming.
- **Reliability**: Step-level state persistence, automatic retries, idempotency keys, and full execution observability.

---

## 19. AI Provider Architecture

- **Abstraction Layer**: Implements `docs/architecture/AI_PROVIDER_ARCHITECTURE.md` (ADR-007).
- **Adapter Interface**: Unified TypeScript `AIProvider` supporting **OpenAI**, **Anthropic**, and **Google Gemini**.
- **AI Profiles**: Reusable operational profiles (`PRODUCT_RESEARCH_FAST`, `PRODUCT_RESEARCH_DEEP`, `SEO_COPY`, `PRODUCT_STORY`, `BATCH_IMPORT`, `CUSTOMER_SUPPORT`).
- **Output Safety**: All model outputs are strictly validated through Zod schemas before being presented as draft proposals for human admin approval.

---

## 20. AI Credential Storage & Security

- **Encryption Standard**: **AES-256-GCM** with authenticated data (ADR-007).
- **Key Separation**:
  - Ciphertext, IV, and auth tag are stored in PostgreSQL (`ai_provider_credentials` table).
  - Master Key (`AI_ENCRYPTION_KEY`, 256-bit) resides strictly in server runtime environment variables, never in the database.
- **Admin UI Masking**: Admin settings display only masked identifiers (`sk-...abcd`) and connection health test status; plaintext keys are never returned to the client.
- **In-Memory Decryption**: Decryption occurs strictly within server-side AI adapters during job execution.

---

## 21. AI Customer Assistant Boundary

- **Architecture Boundary**: Implements `docs/architecture/AI_CUSTOMER_ASSISTANT_ARCHITECTURE.md` (ADR-007).
- **Data Zones**:
  - `PUBLIC`: Published products, prices, specifications, public FAQs.
  - `CUSTOMER_PRIVATE`: Customer's own orders, accessed strictly via session-verified tool functions (e.g. `get_my_order(session_customer_id, order_ref)`).
  - `INTERNAL`: Internal margins, supplier costs, unapproved drafts, and secrets are physically excluded from tool gateways.
- **SQL Protection**: The LLM has zero direct database or SQL execution access.

---

## 22. Validation Architecture

- **Validation Engine**: **Zod** across the entire application stack.
- **Validation Layers**:
  - *HTTP Inputs & Server Actions*: Form parameters and mutation payloads validated before execution.
  - *AI Structured Outputs*: Model JSON responses validated against strict entity schemas.
  - *Environment Variables*: Server configuration validated at startup via `@t3-oss/env-nextjs` / Zod schemas.
  - *Integration Webhooks*: EC OS and Resend webhook signatures and payloads validated.

---

## 23. Manual Payment Architecture

- **Canonical v1 Methods**: `YAPE_MANUAL` and `PLIN_MANUAL` (ADR-002).
- **State Machine**:
  1. `PENDING_PAYMENT`: Order created, inventory reserved for payment window, QR code and instructions displayed.
  2. `PAYMENT_SUBMITTED`: Customer inputs operation code and optional voucher upload. (Explicitly informs customer that submission $\ne$ payment confirmed).
  3. `PAYMENT_VERIFIED`: Authorized admin reviews bank account receipt and clicks "Confirmar Pago".
  4. `PAID` / `REJECTED`: Order transitions to fulfillment or cancellation.
- **Audit Logging**: Every status transition records timestamp, acting admin ID, and reason.

---

## 24. Email & Transactional Communications

- **Provider**: **Resend** with **React Email** (ADR-006).
- **Template Architecture**: Type-safe React components shared within the codebase.
- **Transactional Triggers**: Order confirmation, payment submitted notice, payment verified receipt, order shipped tracking, password reset.
- **Reliability**: Dispatched via Inngest background jobs with automatic retry on provider downtime.

---

## 25. Analytics Architecture

- **First-Party Commerce Ledger**: Financial revenue, orders, and affiliate commission attribution are computed exclusively from PostgreSQL records (ADR-006).
- **Web & Funnel Analytics**: **PostHog** / **Plausible** for privacy-first, cookieless traffic and funnel metrics without heavy client scripts.
- **Privacy Standard**: Zero PII (passwords, vouchers, customer phone numbers) sent to external analytics.

---

## 26. Observability & Logging

- **Error & Performance Tracking**: **Sentry** for full-stack exception reporting, source map integration, and Core Web Vitals tracking (ADR-006).
- **Structured Logging**: **Pino** formatting JSON logs with automated redaction filters for passwords, API tokens, and voucher IDs.
- **Alerting**: Critical alerts on payment verification queues, AI provider failures, and 5xx spikes.

---

## 27. Hosting, CDN & Deployment Topology

- **Hosting Platform**: **Vercel** or **AWS (ECS / Amplify) / Node.js Container** (ADR-008).
- **Edge CDN**: Global edge distribution with points of presence in South America (including Lima, Peru).
- **Environment Separation**:
  - `LOCAL`: Developer workstations (Local Node.js + Local/Docker PostgreSQL).
  - `PREVIEW`: Ephemeral pull-request preview deployments.
  - `STAGING`: Staging environment for pre-release validation.
  - `PRODUCTION`: High-availability production environment (`gamerperu.com`).

---

## 28. Environment Configuration Model

| Config Class | Storage Location | Example Variables | Exposure |
|---|---|---|---|
| **PUBLIC CONFIG** | `NEXT_PUBLIC_*` | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CDN_URL` | Browser & Server |
| **SERVER CONFIG** | Server Environment | `DATABASE_URL`, `RESEND_API_KEY`, `R2_ACCESS_KEY` | Server Runtime Only |
| **MASTER SECRET** | Server Environment | `AI_ENCRYPTION_KEY`, `AUTH_SECRET` | Server Runtime Only |
| **ENCRYPTED SECRET** | PostgreSQL Table | Encrypted OpenAI/Anthropic/Gemini API Keys | In-Memory Decryption Only |

---

## 29. Local Development Architecture

- **Zero Cloud Requirement for Basic Dev**: Developers can clone the repository, run `pnpm install`, launch a local PostgreSQL container, run migrations (`pnpm db:migrate`), and start the dev server (`pnpm dev`).
- **Mock Adapters**: Built-in mock adapters for email (console output), object storage (local filesystem), and AI providers (mock responses) enable full offline feature development.

---

## 30. Testing Architecture

- **Unit & Domain Tests**: **Vitest** testing domain entities, pricing calculators, and state machines (ADR-008).
- **Integration Tests**: **Vitest** with isolated PostgreSQL database verifying Drizzle queries and transaction integrity.
- **End-to-End Tests**: **Playwright** testing multi-viewport customer journeys and admin workflows.
- **Accessibility Testing**: `@axe-core/playwright` assertions embedded in E2E suites verifying WCAG 2.1 AA compliance.

---

## 31. CI/CD Architecture

- **Pipeline Runner**: **GitHub Actions** (ADR-008).
- **Validation Gates**: Type check (`tsc`), Lint (`eslint`), Format (`prettier`), Unit/Integration test execution, Build verification, and Ephemeral Preview deployment.
- **Production Gate**: Migration verification and atomic zero-downtime deployment with instant rollback.

---

## 32. Backups & Disaster Recovery

- **Automated DB Backups**: Daily automated full backups with 7-day Point-in-Time Recovery (PITR) via managed PostgreSQL.
- **Media Redundancy**: Object storage versioning enabled on Cloudflare R2 public and private buckets.
- **Recovery Testing**: Documented runbook for spinning up a restored database instance from snapshot.

---

## 33. EC OS Integration Boundary

- **Independence Principle**: Gamer Perú operates completely independently; EC OS outages never impact customer storefront transactions.
- **Outbound Event Transport**: Asynchronous outbox pattern dispatched via Inngest webhooks with HMAC-SHA256 signature verification and exponential backoff retries.
- **Event Contracts**: Governed by GP-042 (Final EC OS Integration Contract).

---

## 34. Security Architecture & Controls

| Security Control | Implementation Layer | Enforcement Mechanism |
|---|---|---|
| **Admin RBAC** | Server Actions & API | Authoritative database role check (`requirePermission`) |
| **Customer Data Isolation** | Data Access Layer | Enforced `session.customerId` filter from session cookie |
| **Payment Voucher Protection**| Private Storage | S3 private bucket + 5-minute pre-signed URLs |
| **AI Credential Protection** | Database / Server | AES-256-GCM encryption at rest + separate server master key |
| **SQL Injection Prevention** | Data Layer | Drizzle ORM parameterized SQL queries |
| **XSS & CSRF Prevention** | Framework & HTTP | Next.js automatic encoding, SameSite=Lax HttpOnly cookies |
| **Rate Limiting** | Edge / Middleware | IP & Session token bucket rate limiting on auth and AI routes |

---

## 35. SEO Architecture Validation

- [x] Full Server-Side Rendering (SSR) for all products, categories, and brand pages.
- [x] Dynamic `<title>`, meta descriptions, canonical URLs, and OpenGraph images generated per route.
- [x] Automated JSON-LD structured data injection (`Product`, `BreadcrumbList`, `Organization`).
- [x] Dynamic XML sitemap and `robots.txt` generation.
- [x] Semantic HTML headings hierarchy (`<h1>` through `<h3>`).

---

## 36. Performance Architecture Validation

- [x] Core Web Vitals target: LCP < 2.5s, CLS < 0.1, INP < 200ms.
- [x] Automatic WebP/AVIF generation with pre-allocated container aspect ratios.
- [x] Font optimization: `Plus Jakarta Sans`, `Inter`, and `JetBrains Mono` self-hosted via `next/font` with zero layout shift.
- [x] Minimal client JavaScript bundle by leveraging React Server Components.

---

## 37. Failure & Degradation Matrix

| Service / Dependency | Criticality | Behavior on Outage | Recovery / Fallback |
|---|---|---|---|
| **Primary Database** | **CRITICAL** | Storefront displays cached pages; mutations show graceful 503 error | Automated PITR failover |
| **AI Providers** | **DEGRADABLE** | Product research paused; Customer Assistant displays helpful FAQ/search fallback | Background retry / manual input |
| **Email Provider (Resend)**| **DEGRADABLE** | Emails queued in Inngest; checkout completes successfully | Inngest exponential retries |
| **Search Engine** | **DEGRADABLE** | Fallback to basic database ILIKE / category browsing | Automatic query fallback |
| **Analytics (PostHog)** | **NON-CRITICAL** | Zero customer impact; events buffered locally | Discard non-critical telemetry |
| **EC OS Downstream** | **NON-CRITICAL** | Zero customer impact; outbound events held in outbox queue | Automatic retry when EC OS returns |

---

## 38. Cost & Scalability Model

*Research Date: August 16, 2026. All costs based on official published tiers in USD.*

| Phase | Fixed Infrastructure Cost | Estimated Variable Cost | Total Estimated Monthly Cost |
|---|---|---|---|
| **Development / Pre-Launch** | $0 (Free tiers: Vercel Hobby, Supabase Free, Cloudflare R2 Free, Inngest Free) | < $5 (AI test tokens) | **$0 – $5 / month** |
| **Launch (1k-5k visits/mo)** | ~$45 (Vercel Pro $20, Supabase Pro $25, R2 ~$0, Resend $0-$20) | ~$15 (AI Product Research + Email) | **~$60 – $80 / month** |
| **Growth (50k+ visits/mo)** | ~$90 (Compute + Database Pro + Storage + Inngest Pro) | ~$50 - $100 (AI Customer Assistant + Email) | **~$140 – $190 / month** |

---

## 39. Scaling Triggers

1. **Catalog Expansion (>10,000 SKUs)**: Switch `SearchProvider` from PostgreSQL FTS to dedicated Meilisearch/Typesense cluster.
2. **High Concurrency Traffic (>1,000 req/s)**: Add read replicas to PostgreSQL and enable edge caching for public catalog APIs.
3. **Media Bandwidth (>1 TB/mo)**: Cloudflare R2 scales linearly with zero egress bandwidth charges.

---

## 40. Vendor Lock-In & Exit Strategy

- **Database**: Standard PostgreSQL schema; exportable via `pg_dump` and portable to any cloud provider in minutes.
- **ORM**: Drizzle generates standard SQL migrations; domain code uses standard TypeScript interfaces.
- **Object Storage**: S3-compatible API; assets transferable via standard S3 sync tools.
- **AI Infrastructure**: Internal `AIProvider` gateway allows switching model vendors by updating configuration.

---

## 41. Technology Decision Matrix

| Technology Domain | Selected Solution | Key Alternatives Considered | Deciding Factors |
|---|---|---|---|
| **App Framework** | **Next.js (App Router)** | Remix, Astro, Nuxt | SEO dominance, React Server Components, unified route groups, AI streaming. |
| **Commerce Engine** | **Custom Domain** | Medusa, Saleor, Shopify | Native Yape/Plin verification, custom hardware specs, zero platform rent. |
| **Primary Database** | **PostgreSQL 16+** | MySQL, MongoDB | Strict ACID transactions, row-level locks, JSONB hardware specs, GIN search. |
| **Data Access Layer**| **Drizzle ORM** | Prisma, Kysely, TypeORM | Zero runtime overhead, pure TypeScript schema, native SQL control, fast cold-starts. |
| **Authentication** | **Server Session (Auth.js)**| Clerk, Auth0, Supabase Auth | Full data ownership, zero MAU SaaS fees, instant server session revocation. |
| **Object Storage** | **Cloudflare R2** | AWS S3, Cloudinary | Zero egress fees, global edge CDN, S3 API compatibility, private bucket support. |
| **Search Engine** | **PostgreSQL FTS/Trigram** | Meilisearch, Algolia | Zero extra infrastructure for v1, instant transactional updates, sub-10ms queries. |
| **Async Background**| **Inngest** | BullMQ, Temporal | Durable TypeScript workflows, step-level retries, serverless compatibility. |
| **AI Gateway** | **Custom Multi-Provider** | Single Vendor SDK | Zero vendor lock-in, AES-256-GCM credential encryption, structured Zod output. |
| **Email** | **Resend + React Email** | Postmark, SendGrid | Type-safe React components, modern developer API, reliable deliverability. |
| **Observability** | **Sentry + Pino** | Datadog, New Relic | Deep Next.js error tracing, structured JSON logs, automated PII scrubbing. |
| **Testing** | **Vitest + Playwright** | Jest + Cypress | ESM-native speed, multi-browser E2E, integrated accessibility testing. |

---

## 42. Accepted ADR Index

1. [`ADR-001: Application Framework, Runtime and Topology`](../decisions/ADR-001-application-framework-runtime.md)
2. [`ADR-002: Commerce Engine and Data Architecture`](../decisions/ADR-002-commerce-engine-data-architecture.md)
3. [`ADR-003: Authentication, Session Management and RBAC`](../decisions/ADR-003-authentication-authorization-rbac.md)
4. [`ADR-004: Object Storage and Media Pipeline`](../decisions/ADR-004-storage-media-pipeline.md)
5. [`ADR-005: Search and Asynchronous Job Architecture`](../decisions/ADR-005-search-asynchronous-jobs.md)
6. [`ADR-006: Communications, Analytics and Observability`](../decisions/ADR-006-communications-analytics-observability.md)
7. [`ADR-007: AI Provider Gateway and Credential Security`](../decisions/ADR-007-ai-provider-credential-security.md)
8. [`ADR-008: Testing, CI/CD and Deployment Architecture`](../decisions/ADR-008-testing-cicd-deployment.md)

---

## 43. Deferred Decisions

1. **Exact Domain Entity Schemas**: Deferred to **GP-004 (Commerce Domain Model)**.
2. **Project File Scaffolding & Lockfiles**: Deferred to **GP-005 (Repository Bootstrap)**.
3. **Database Migration Script Generation**: Deferred to **GP-005 / GP-006**.
4. **Final Downstream EC OS Event Contracts**: Deferred to **GP-042 (EC OS Integration Contract)**.
5. **Commercial Business Decisions**: Courier provider selection, warranty durations, and support channels (`[TBD BUSINESS DECISION]`).

---

## 44. Inputs for GP-004 (Commerce Domain Model)

This document provides GP-004 with exact architectural boundaries:
- Relational database schema requirements on PostgreSQL 16+.
- Core entities vs. JSONB dynamic spec extension patterns.
- Manual Yape/Plin payment verification state machine transitions.
- Multi-brand catalog relationships and variant inventory reservation logic.
- Affiliate attribution and commission cancellation rules.

---

## 45. Inputs for GP-005 (Repository Bootstrap)

This document establishes the exact technology choices to be initialized in GP-005:
- Next.js (App Router) + TypeScript.
- Drizzle ORM + Drizzle Kit configuration.
- Tailwind / CSS styling architecture mapping to GP-002 design tokens.
- Vitest + Playwright testing harness.
- GitHub Actions CI workflow definitions.

---

## 46. GP-003 Definition of Done

* [x] Exactly ONE canonical technology architecture selected and documented.
* [x] All 8 foundational Architecture Decision Records (ADRs 001–008) authored and ACCEPTED.
* [x] Current official documentation consulted for all technologies.
* [x] Complete 46-section `TECHNOLOGY_ARCHITECTURE.md` specification created.
* [x] Multi-brand SEO-first storefront requirements verified.
* [x] Server-side authoritative Admin RBAC verified.
* [x] Customer-private data isolation verified.
* [x] Transactional manual Yape/Plin payment architecture verified.
* [x] Private payment-proof storage isolated from public CDN assets.
* [x] Multi-provider AI Gateway and AES-256-GCM credential encryption architecture defined.
* [x] AI Customer Assistant data boundaries (PUBLIC / CUSTOMER_PRIVATE / INTERNAL) verified.
* [x] EC OS operational independence guaranteed.
* [x] Backup, recovery, failure degradation, and cost models documented.
* [x] Zero application source code or database migrations prematurely created.
* [x] GP-004 and GP-005 remain PLANNED and unexecuted.

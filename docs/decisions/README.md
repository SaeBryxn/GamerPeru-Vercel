# Architecture Decision Records (ADRs)

This directory contains the canonical Architecture Decision Records for Gamer Perú. All architectural changes and core technology selections must be recorded here using [`ADR_TEMPLATE.md`](../templates/ADR_TEMPLATE.md).

## Index of Accepted ADRs

| ADR | Title | Status | Date | Decision Summary |
|---|---|---|---|---|
| [ADR-001](./ADR-001-application-framework-runtime.md) | Application Framework, Runtime and Topology | **ACCEPTED** | 2026-08-16 | Next.js (App Router), TypeScript, Node.js Runtime, Modular Monolith topology. |
| [ADR-002](./ADR-002-commerce-engine-data-architecture.md) | Commerce Engine and Data Architecture | **ACCEPTED** | 2026-08-16 | Custom Gamer Perú commerce domain on PostgreSQL 16+ with Drizzle ORM. |
| [ADR-003](./ADR-003-authentication-authorization-rbac.md) | Authentication, Session Management and RBAC | **ACCEPTED** | 2026-08-16 | Server-side session authentication with PostgreSQL store and authoritative RBAC. |
| [ADR-004](./ADR-004-storage-media-pipeline.md) | Object Storage and Media Pipeline | **ACCEPTED** | 2026-08-16 | Cloudflare R2 / S3 with CDN for public media + private signed URLs for payment proofs. |
| [ADR-005](./ADR-005-search-asynchronous-jobs.md) | Search and Asynchronous Job Architecture | **ACCEPTED** | 2026-08-16 | PostgreSQL FTS / Trigram with SearchProvider adapter + Inngest durable async jobs. |
| [ADR-006](./ADR-006-communications-analytics-observability.md) | Communications, Analytics and Observability | **ACCEPTED** | 2026-08-16 | Resend + React Email, first-party PostgreSQL event ledger + PostHog, Sentry + Pino. |
| [ADR-007](./ADR-007-ai-provider-credential-security.md) | AI Provider Gateway and Credential Security | **ACCEPTED** | 2026-08-16 | Provider-agnostic AI orchestrator, AES-256-GCM secret encryption, Assistant isolation. |
| [ADR-008](./ADR-008-testing-cicd-deployment.md) | Testing, CI/CD and Deployment Architecture | **ACCEPTED** | 2026-08-16 | Vitest + Playwright + GitHub Actions + Vercel/Cloud hosting. |

# Architecture Principles

## Core Principles
- **Modular Monolith**: One coherent application codebase with clean internal module boundaries; avoid premature microservices.
- **Architecture by ADR**: Significant architectural decisions are governed by accepted Architecture Decision Records in [`docs/decisions/`](../decisions/).
- **Canonical Authority**: [`TECHNOLOGY_ARCHITECTURE.md`](./TECHNOLOGY_ARCHITECTURE.md) (established in GP-003) is the authoritative technology and infrastructure specification for Gamer Perú.
- **Server Authority**: Privileged authorization, business rule validation, inventory allocation, and payment status transitions are strictly server-side.
- **Structured Domain Model**: Relational PostgreSQL core for financial, inventory, and order integrity with typed JSONB for dynamic hardware specs.
- **Payment Verification**: Manual Yape/Plin verification state machine with isolated private voucher storage.
- **SEO-Dominant Rendering**: Full server-side rendering for public catalog and marketing pages.
- **Performant Media Pipeline**: Cloudflare R2 edge CDN with on-the-fly WebP/AVIF optimization.
- **Operational Auditability & Observability**: Structured JSON logging, PII scrubbing, full error tracking via Sentry, and point-in-time database backups.
- **Downstream Independence**: Versioned EC OS integration contracts (GP-042) ensuring Gamer Perú storefront remains 100% operational regardless of EC OS availability.

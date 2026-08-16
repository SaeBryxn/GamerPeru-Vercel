# ADR-002 — Commerce Engine and Managed Database Architecture

## Status
ACCEPTED

## Context
Gamer Perú requires an authoritative commerce domain model covering multi-brand products, category-specific hardware specifications, variant matrices, customer accounts, cart and checkout, inventory reservation, manual Yape/Plin payment verification workflows, affiliate attribution and commissions, and administrative order management. We must select the commerce domain implementation strategy, the managed database provider, and the type-safe data access layer.

## Decision Drivers
- **Peru-First Payment Workflows**: Manual Yape/Plin verification state machine (customer submission does not confirm payment; customer provides operation code and optional voucher; payment enters verification workflow; authorized admin verifies funds before approving/rejecting; all transitions audited).
- **Domain Specialization**: Hardware-specific dynamic attributes (polling rates, sensor models, switch types) and modular Product Story layouts.
- **Transactional Correctness**: Strict ACID transactions, row-level locking for inventory checkout, and immutable order history.
- **Operational Independence**: Gamer Perú must remain fully operational without external commerce platform dependencies or EC OS downtime.
- **Cost Efficiency & Free-First Strategy**: Zero unnecessary infrastructure cost during local and early cloud development, with a seamless, zero-rewrite upgrade path to enterprise reliability.

## Options Considered
1. **Custom Domain on Supabase PostgreSQL + Drizzle ORM**: Custom relational domain designed specifically for Gamer Perú's workflow using managed Supabase PostgreSQL (PostgreSQL 16+) and Drizzle ORM.
2. **Headless Open-Source Commerce (Medusa / Saleor)**: Prebuilt commerce engines. While functional, they impose rigid default checkout and payment provider models that fight manual Yape/Plin verification, add dual-database operational overhead, and complicate custom affiliate/commission models.
3. **Headless SaaS Commerce (Shopify Plus / BigCommerce)**: High subscription costs, vendor lock-in, recurring transaction fees, and severe friction implementing manual Peruvian domestic payment verification and custom AI product workflows.

## Decision
1. **Commerce Strategy**: Build a **Custom Gamer Perú Commerce Domain** owned entirely in TypeScript. Exact entity fields, state machine names, and inventory reservation time limits remain deferred to GP-004 and GP-020.
2. **Managed Database Provider**: Adopt **Supabase PostgreSQL** as the canonical managed relational database.
   - **Free-First Plan Strategy**: Early cloud development and pre-launch use the **Supabase Free Plan** (500MB storage, Supavisor connection pooling).
   - **Free-Stage Backup Strategy**: Scheduled encrypted PostgreSQL logical dumps (`pg_dump`) executed via automated workflows and stored in an isolated private Cloudflare R2 backup bucket (`gamerperu-db-backups-private`) with 30-day retention.
   - **Pro Upgrade Triggers**: Transition to **Supabase Pro** ($25/mo) is triggered by:
     * Launching production operations with live customer transactions (eliminating inactivity pausing).
     * Database size exceeding 350 MB (70% of free limit).
     * Commercial requirement for managed automated daily backups and 7-day Point-in-Time Recovery (PITR).
     * High traffic concurrency requiring unthrottled compute.
   - *Zero-Rewrite Guarantee*: Transitioning from Supabase Free to Supabase Pro is an infrastructure plan upgrade that requires zero application code changes.
3. **Data Access Layer**: Adopt **Drizzle ORM** (with PostgreSQL dialect) and `drizzle-kit` for schema-as-code and automated SQL migrations.
   - Core financial, user, and inventory entities use strict foreign keys, unique constraints, and check constraints.
   - Category-specific hardware specifications and modular Product Story blocks use PostgreSQL `JSONB` columns with Zod validation.

## Consequences
- **Positive**: Total ownership of business logic, exact fit for Yape/Plin manual payment workflows, zero third-party licensing fees, optimal database query performance, seamless integration with AI import and affiliate modules.
- **Negative**: Requires maintaining free-stage scheduled backup scripts until upgrading to Supabase Pro.

## Security / SEO / Performance Impact
- **Security**: Strict database constraints and parameterized queries via Drizzle eliminate SQL injection risks.
- **SEO**: Product slugs, category hierarchies, and metadata are queried with sub-millisecond latency for server rendering.
- **Performance**: Supabase Supavisor connection pooling ensures high concurrency during traffic spikes.

## Migration / Reversal
Database schemas use standard PostgreSQL DDL. Drizzle generates standard SQL migration files (`.sql`). Because application code avoids proprietary Supabase client bindings in domain services, the database can be migrated to any PostgreSQL-compatible provider (Neon, AWS RDS, GCP Cloud SQL, self-hosted PostgreSQL) without rewriting business logic.

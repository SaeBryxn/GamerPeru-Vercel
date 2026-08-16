# ADR-002 — Commerce Engine and Data Architecture

## Status
ACCEPTED

## Context
Gamer Perú requires an authoritative commerce domain model covering multi-brand products, category-specific hardware specifications, variant matrices, customer accounts, cart and checkout, inventory reservation, manual Yape/Plin payment verification workflows, affiliate attribution and commissions, and administrative order management. We must decide whether to build a custom commerce domain or adopt an existing headless commerce platform, and choose the underlying database and data access layer.

## Decision Drivers
- **Peru-First Payment Workflows**: Manual Yape/Plin verification state machine (customer submission $\ne$ payment confirmed, optional screenshot upload, manual admin verification).
- **Domain Specialization**: Hardware-specific dynamic attributes (polling rates, sensor models, switch types) and modular Product Story layouts.
- **Transactional Correctness**: Strict ACID transactions, row-level locking for inventory checkout, and immutable order history.
- **Operational Independence**: Gamer Perú must remain fully operational without external commerce platform dependencies or EC OS downtime.
- **Data Portability**: Full ownership of customer, catalog, and order data.

## Options Considered
1. **Custom Domain on PostgreSQL + Drizzle ORM**: Custom relational domain designed specifically for Gamer Perú's workflow using PostgreSQL 16+ and Drizzle ORM.
2. **Headless Open-Source Commerce (Medusa / Saleor)**: Prebuilt commerce engines. While functional, they impose rigid default checkout and payment provider models that fight manual Yape/Plin verification, add dual-database operational overhead, and complicate custom affiliate/commission models.
3. **Headless SaaS Commerce (Shopify Plus / BigCommerce)**: High subscription costs, vendor lock-in, recurring transaction fees, and severe friction implementing manual Peruvian domestic payment verification and custom AI product workflows.

## Decision
Build a **Custom Gamer Perú Commerce Domain** backed by **PostgreSQL 16+** (managed via Supabase or Neon/AWS RDS with PgBouncer connection pooling) using **Drizzle ORM** as the type-safe data access layer.

Key Architectural Elements:
- **Relational Core**: Strict foreign keys, unique constraints, and check constraints for financial, inventory, and user data.
- **ACID Transactions**: Checkout and order placement use row-level locking (`SELECT ... FOR UPDATE`) to guarantee atomic stock allocation and eliminate overselling.
- **JSONB for Hardware Extensions**: Standard product entities store structured core fields (SKU, brand, price, slug, stock), while category-specific specifications and modular Product Story layouts use typed JSONB columns validated by Zod schemas.
- **Drizzle ORM**: Schema-as-code in TypeScript, zero runtime overhead, instant cold-starts in serverless/Node runtimes, native SQL control without ORM query translation surprises, and robust automated migrations via `drizzle-kit`.

## Consequences
- **Positive**: Total ownership of business logic, exact fit for Yape/Plin manual payment workflows, zero third-party licensing fees, optimal database query performance, seamless integration with AI import and affiliate modules.
- **Negative**: Requires implementing standard commerce primitives (cart calculations, discount engines) from scratch during GP-004/GP-011.

## Security / SEO / Performance Impact
- **Security**: Strict database constraints and parameterized queries via Drizzle eliminate SQL injection risks.
- **SEO**: Product slugs, category hierarchies, and metadata are queried with sub-millisecond latency for server rendering.
- **Performance**: PostgreSQL connection pooling (PgBouncer) ensures high concurrency during traffic spikes.

## Migration / Reversal
Database schemas use standard ANSI SQL and PostgreSQL features. Drizzle generates standard SQL migration files (`.sql`). The database can be migrated to any PostgreSQL-compatible provider (AWS RDS, GCP Cloud SQL, self-hosted PostgreSQL) without code changes.

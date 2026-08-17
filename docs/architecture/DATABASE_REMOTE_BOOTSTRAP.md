# Database Remote Bootstrap

## Status

COMPLETE

## Purpose

This gate established the first physical PostgreSQL database schema for Gamer Perú on remote Supabase before implementing GP-011 Category & Brand Pages.

This represents the minimum canonical Catalog foundation required for catalog discovery and persistence, not the entire multi-phase Commerce Domain Model (which will incrementally introduce specs, merchandising collections, customer accounts, orders, inventory, and payment ledgers in subsequent roadmap gates).

## Approved Checkpoints

- **Initial Phase A Implementation**: [`913c48a2ef8bab76b22426715d5757e24834d23f`](https://github.com/latamcreativa/GamerPeru/commit/913c48a2ef8bab76b22426715d5757e24834d23f)
- **Phase A Final Formatting HEAD**: [`9b96701974ec8ab61b65d29edd31f6d73d79663f`](https://github.com/latamcreativa/GamerPeru/commit/9b96701974ec8ab61b65d29edd31f6d73d79663f)
- **Migration Artifact**: [`src/db/migrations/0000_superb_ink.sql`](../../src/db/migrations/0000_superb_ink.sql)
- **Migration Git Blob SHA**: `229eeb06e1a6b2eff0707cab6dccc154241cb6e2`

_(Note: Phases C1 and C2 performed read-only preflight and remote migration execution directly against the remote Supabase project and intentionally made zero repository commits)._

## Connection Architecture

Gamer Perú enforces a strict dual-connection architecture:

1. **`DATABASE_URL` (Application Runtime)**:
   - **Target**: Supabase Supavisor Transaction Pooler
   - **Port**: `6543`
   - **Driver Configuration**: `postgres.js` with `prepare: false` (required for transaction pooler compatibility)
   - **Role**: Serves all stateless Next.js Server Components, Route Handlers, and server-side data access.

2. **`DATABASE_MIGRATION_URL` (Migration & Admin Tooling)**:
   - **Target (Preferred)**: Direct PostgreSQL connection on port `5432`
   - **Target (IPv4 Fallback)**: Supabase Supavisor Session Pooler on port `5432`
   - **Role**: Exclusively used by Drizzle CLI / migration runner for schema DDL and transactional migrations.
   - **Fail-Closed Guard**: [`drizzle.config.ts`](../../drizzle.config.ts) throws an explicit configuration error if `DATABASE_MIGRATION_URL` is absent in non-local environments, preventing migrations from attempting to execute over port 6543.

Secret isolation:

- All real remote database credentials reside strictly within `.env.local` (local-only and ignored by Git).
- No passwords, full connection URIs, or secret keys are committed or stored in repository documentation.

## Runtime Boundary

- **Browser $\times$ PostgreSQL**: Web clients never establish direct TCP or authenticated connections to PostgreSQL.
- **Browser $\times$ Supabase Data API**: Public/PostgREST Data APIs are disabled for core commerce data. All catalog mutations and authoritative queries run server-side via Next.js and Drizzle ORM.
- **Next.js Server $\to$ Drizzle ORM $\to$ PostgreSQL**: Authoritative server runtime using `server-only` environment contracts.
- **Supabase Auth**: Auth integration is decoupled and scheduled for GP-015.
- **Row-Level Security (RLS)**: Server-only tables are accessed exclusively through trusted server backend connections. No public RLS policies or client-side bypass policies are implemented.

## Migration Policy

Schema evolutions follow a strict 10-step canonical procedure:

1. Drizzle schema TypeScript files under `src/db/schema/` serve as the single source of truth.
2. `pnpm db:generate` produces deterministic SQL migration artifacts under `src/db/migrations/`.
3. Generated SQL artifacts must be manually inspected for safety (verifying zero unintended `DROP`, `TRUNCATE`, or destructive operations).
4. Migration artifact and snapshot journal are committed to Git.
5. GitHub Actions CI validation suite passes completely.
6. Target remote database passes read-only preflight inspection (verifying zero schema/type collisions).
7. `pnpm db:migrate` applies the exact committed migration over `DATABASE_MIGRATION_URL`.
8. Remote schema is introspected post-application to verify created tables, types, foreign keys, constraints, and indexes.
9. Constraint integrity is verified using isolated transactions that are strictly rolled back.
10. Migration idempotence is verified by re-running the migration runner.

**Prohibitions**:

- `drizzle-kit push` is strictly prohibited against staging and production environments.
- Ad-hoc manual DDL execution via Supabase SQL Editor is strictly prohibited as a release path.

## Physical Catalog Schema

The bootstrap establishes exactly five (5) physical catalog tables under `public`:

1. **`media_assets`**: Authoritative binary metadata truth for media assets stored in Cloudflare R2 object storage (object key, dimensions, file size, MIME type, SHA-256 checksum, security classification).
2. **`brands`**: Hardware manufacturers and peripheral brands (name, unique kebab-case slug, logo reference, status, website URL).
3. **`categories`**: Hierarchical multi-tier hardware taxonomy (name, unique kebab-case slug, self-referential parent relation, display order, status).
4. **`products`**: Conceptual product models and families (brand FK, category FK, primary media FK, unique slug, marketing subtitle, description, featured status, catalog status).
5. **`product_variants`**: Canonical sellable SKU items (product cascade FK, unique SKU code, pricing in integer minor units, compare-at pricing, unit cost, physical weight, JSONB attributes, status, display order).

_(Detailed domain concepts and lifecycle specifications are documented in [`docs/architecture/COMMERCE_DOMAIN_MODEL.md`](COMMERCE_DOMAIN_MODEL.md))._

## Enums

Canonical PostgreSQL enum types created under `public`:

- **`catalog_status`**: `'DRAFT'`, `'PUBLISHED'`, `'ARCHIVED'`
- **`variant_status`**: `'ACTIVE'`, `'INACTIVE'`, `'ARCHIVED'`
- **`security_class`**: `'PUBLIC_MEDIA'`, `'PRIVATE_PAYMENT_PROOF'`, `'PRIVATE_BACKUP'`
- **`media_type`**: `'IMAGE'`, `'VIDEO'`, `'DOCUMENT'`

## Key Catalog Invariants

- **Product vs. Variant**: `Product` represents the conceptual hardware family; `ProductVariant` represents the physical sellable SKU.
- **Monetary Units**: All monetary fields (`price_cents`, `compare_at_price_cents`, `cost_cents`) are stored as non-negative integer minor units in Peruvian Soles (PEN).
- **Public Visibility Invariant**: Storefront discovery queries require all parent entities to be active: `Product.status = 'PUBLISHED'`, `Brand.status = 'PUBLISHED'`, `Category.status = 'PUBLISHED'`, and at least one variant with `ProductVariant.status = 'ACTIVE'`.
- **Starting Price**: Storefront product cards display the starting price computed as the minimum price among active variants (`MIN(product_variants.price_cents)` where `status = 'ACTIVE'`).
- **Cost Privacy**: `cost_cents` is strictly internal and never exposed to client-facing APIs.
- **Discovery Media Source**: `Product.primary_media_id` serves as the authoritative visual representation for category and brand discovery cards in GP-011.
- **Variant Media Architecture**: Comprehensive SKU-specific image associations and PDP galleries are deferred to GP-014.

## Category Hierarchy

- `categories.parent_id` provides a self-referential foreign key targeting `categories.id` (`ON DELETE RESTRICT`).
- **Database-Level Protection**: Direct 1-hop self-cycles are strictly prevented at the database level via `CHECK (parent_id IS NULL OR parent_id <> id)`.
- **Multi-Hop Validation**: Full acyclic graph validation across multi-hop category ancestry is the responsibility of the future authoritative Catalog Mutation Service before administrative hierarchy updates are permitted.

## UUIDv7 Contract

- All primary keys use RFC 9562 UUIDv7 generated application-side via [`src/db/utils/uuid.ts`](../../src/db/utils/uuid.ts).
- Structure: 48-bit Unix epoch millisecond timestamp, 4-bit version (`7`), 2-bit RFC variant (`10xx`), and 74 cryptographically secure random bits.
- **Monotonicity**: Natural chronological sorting is deterministic across distinct millisecond timestamps. Strict lexical monotonicity within the exact same millisecond is not guaranteed.

## Timestamp Semantics

- `created_at`: Initialized via database default `now()`.
- `updated_at`: Initialized via database default `now()`. Subsequent update modifications are handled at the application/ORM layer via Drizzle `$onUpdateFn(() => new Date())` and mutation services.
- **Note**: No PostgreSQL procedural update triggers are installed.

## Deferred Catalog Domain

The following concepts are acknowledged in canonical domain specifications but deliberately deferred from this initial bootstrap:

- **`Category.current_spec_schema_id`**: Deferred nullable canonical FK (will be added when `CategorySpecificationSchema` is physically authored in GP-013/GP-014).
- **`collections` & `product_collections`**: Canonical merchandising grouping concepts physically deferred until an approved merchandising collection feature gate.
- **`CategorySpecificationSchema` & `ProductSpecifications`**: Deferred to GP-013 and GP-014.
- **`ProductStory`**: Deferred to GP-014 PDP editorial architecture.
- **Variant Media Gallery Architecture**: Deferred to GP-014 PDP media architecture.

## Remote Verification Evidence

Remote preflight and migration verification (Phase C1 and Phase C2) were executed locally against the authoritative remote Supabase project:

- **Project Reference**: `jpjffalmvlxpufvtvskx`
- **Database Name**: `postgres`
- **PostgreSQL Version**: `PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`
- **Drizzle Migration Registry**: Schema `drizzle`, Table `__drizzle_migrations`, Applied Records: `1`
- **Physical Public Tables**: `5` (`media_assets`, `brands`, `categories`, `products`, `product_variants`)
- **Public PostgreSQL Enums**: `4` (`catalog_status`, `media_type`, `security_class`, `variant_status`)
- **Foreign Key Constraints**: `6`
- **CHECK Constraints**: `14` domain-level checks
- **Indexes**: `18` (including primary keys, unique constraints, and composite discovery pagination indexes)
- **Authoritative Data Rows**: `0` across all five catalog tables (zero commercial seed data exists).

## Constraint Verification

Rollback-only transactional test suites verified that PostgreSQL strictly enforces all schema invariants:

1. **Positive 5-Table Relation Chain**: Verified complete entity graph insertion (`media_assets` $\to$ `brands` $\to$ `categories` $\to$ `products` $\to$ `product_variants`) and clean rollback.
2. **Invalid Brand Slug**: Verified rejection of non-kebab-case slugs via `CHECK` constraint.
3. **Duplicate Brand Slug**: Verified rejection via `UNIQUE` constraint.
4. **Category Self-Cycle**: Verified rejection of `parent_id = id` via `CHECK` constraint.
5. **Product Invalid Brand FK**: Verified rejection of nonexistent brand references via `FOREIGN KEY` constraint.
6. **Variant Invalid Product FK**: Verified rejection of nonexistent product references via `FOREIGN KEY` constraint.
7. **Variant Zero Price**: Verified rejection of `price_cents = 0` via `CHECK` constraint.
8. **Variant Negative Display Order**: Verified rejection of `display_order = -1` via `CHECK` constraint.
9. **Media Zero File Size**: Verified rejection of `file_size_bytes = 0` via `CHECK` constraint.
10. **Media Invalid Checksum**: Verified rejection of non-64-hex SHA-256 strings via `CHECK` constraint.

## Idempotence

- A second sequential invocation of `pnpm db:migrate` completed successfully with zero duplicate DDL statements executed.
- The migration registry remained at exactly 1 recorded migration, and public domain tables remained at exactly 5.

## Security & Storage Boundaries

- `.env.local` is isolated, ignored by Git, and contains all local developer credentials.
- Zero credentials or secrets are committed to version control.
- `DATABASE_MIGRATION_URL` is restricted to server-side CLI execution.
- Cloudflare R2 remains the authoritative binary object storage tier for media assets; Supabase Storage is not utilized for public catalog media.

## GP-011 Readiness

The physical database prerequisite for **GP-011 Category & Brand Pages** is **SATISFIED**.

GP-011 implementation remains **PLANNED** and will be executed upon explicit roadmap authorization.

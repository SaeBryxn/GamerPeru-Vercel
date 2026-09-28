# ADR-010 — Storefront Catalog Caching and Serverless Connection Budget

## Status

ACCEPTED

## Context

Gamer Perú runs on Vercel (serverless) against Supabase's free tier. Until this decision every
public storefront request read the catalog from PostgreSQL:

- The storefront layout resolves the navigation (menu settings, catalog facts, menu product
  shelves) on **every** page, before the page's own queries.
- `src/lib/catalog/cached-queries.ts` used React `cache()`, which only deduplicates within one
  request (GP-013 scoped it explicitly to "no cross-request business caching").
- The home page was statically prerendered **without** a revalidation window, so it kept the
  products read at build time until the next deploy.
- Each serverless instance could open up to 10 database connections.

In production this exhausted Supabase's session pooler (port 5432, 15 clients on the free tier):
requests failed with `EMAXCONNSESSION` whenever a new instance needed a connection and succeeded
when they landed on a warm one, so the site appeared to work "only sometimes". Moving
`DATABASE_URL` to the transaction pooler (port 6543) removed the hard limit, but read traffic
still scaled database load linearly with page views.

[ADR-003](ADR-003-authentication-authorization-rbac.md) already allows public catalog routes
(PDP, PLP, brands) to be cached via ISR and CDN edge caching, provided authenticated routes and
responses setting session cookies are never publicly cached.

## Decision

Three layers, all within the existing (non Cache Components) Next.js 16 caching model:

1. **Cross-request data cache for public catalog reads.** `src/lib/catalog/catalog-cache.ts`
   wraps queries with `unstable_cache`, tag `storefront-catalog`, window
   `CATALOG_REVALIDATE_SECONDS` (300 s). It is applied:
   - to the Postgres catalog, product-detail and story-related readers
     (`src/lib/catalog/cached-readers.ts`, wired in `get-reader.ts`), which covers category and
     brand listings, facets, the PDP and the home rails;
   - to the navigation's raw queries (`menu-settings.ts`, `catalog-facts.ts`,
     `menu-catalog.ts`).
2. **ISR for pages that do not depend on the query string.** The home page revalidates every
   300 s; `/productos/[slug]` is generated on first visit (`generateStaticParams` returns `[]`)
   and revalidates every 300 s. Category and brand pages stay dynamic because their filters live
   in `searchParams`, but their data comes from layer 1.
3. **Connection budget.** `src/db/index.ts` caps each instance at `DATABASE_POOL_MAX` (default 3,
   `src/db/pool-config.ts`) and logs `database_session_pooler_in_production` when production
   points at the Supabase session pooler.

Invalidation: every admin write that changes what the storefront shows (catalog, story publish,
taxonomy, menu, inventory) calls `revalidateStorefrontCatalog()`, which expires the tag
immediately (`revalidateTag(tag, { expire: 0 })`) and revalidates the root layout. Admin edits are
therefore visible on the next request; the 300 s window only bounds staleness for changes that
bypass the admin.

## Invariants

- Only production caches (`NODE_ENV === "production"`). Development and the E2E suites, which run
  on `next dev`, always read the database.
- Cached functions must **throw** on failure. Fail-soft fallbacks (empty menu, empty rail) live
  outside the cache, so a transient database error is never stored for the whole window.
- Cached results must be JSON-serializable. Structures such as `Map` are rebuilt per request from
  cached rows (`getCatalogNavigationFacts`).
- The cache holds public catalog projections only: no stock, cost, customer, session or admin
  data. Checkout keeps reading prices and stock from PostgreSQL inside its transaction, so a
  cached price is informational and can never be charged.
- Authenticated routes (`/cuenta`, `/admin`, checkout, cart) and search remain uncached.

## Consequences

- Public catalog traffic reaches PostgreSQL at most once per query and cache window per key,
  instead of once per page view.
- A price or catalog change made directly in the database (not through the admin) can take up to
  300 s to appear.
- `unstable_cache` is superseded by `"use cache"` under Cache Components. Migrating is a separate
  decision, because enabling `cacheComponents` changes the rendering model of every route.

## Verification

- Unit tests: `tests/unit/storefront-catalog-cache.test.ts`, `tests/unit/admin-story-actions.test.ts`.
- Production build classifies `/` as static with a 5 m revalidation and `/productos/[slug]` as
  SSG. Against `next start`, a PDP served `MISS` (1.99 s) then `HIT` (0.03 s); a category page
  dropped from 1.08 s to 0.03 s on repeat requests.

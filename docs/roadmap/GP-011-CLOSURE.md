# GP-011 — Closure Report

## Status

CLOSED

## Scope Delivered

- Dynamic Category discovery route (`/categorias/[slug]`) and Brand discovery route (`/marcas/[slug]`).
- Server-side authoritative Catalog discovery reader ([`PostgresCatalogDiscoveryReader`](../../src/lib/catalog/postgres-reader.ts)) powered by canonical Drizzle query builders ([`postgres-queries.ts`](../../src/lib/catalog/postgres-queries.ts)).
- Public discovery projection enforcing strict publication eligibility, `MIN(price_cents)` over ACTIVE variants, and zero internal `cost_cents` exposure.
- Safe public media CDN resolver ([`resolvePublicMediaUrl`](../../src/lib/media/resolve-public-media-url.ts)) supporting same-origin local `/media/...` relative resolution and approved remote CDN patterns.
- Accessible, compact bounded pagination ([`Pagination`](../../src/components/catalog/pagination/pagination.tsx)) with clean base URLs, `?page=N` canonical handling, and non-link `aria-hidden="true"` ellipsis separators.
- SEO canonicalization, self-canonical paginated URLs, and truthful `noindex, follow` handling for unsupported future filter parameters.
- Responsive ProductCard grid adhering to the 4-column (desktop) / 3-column (tablet) / 2-column (mobile) matrix with zero horizontal overflow.
- 200 OK authoritative empty states with truthful copy and CTAs.
- Synthetic test fixture reader ([`FixtureCatalogDiscoveryReader`](../../src/lib/catalog/fixture-reader.ts)) completely isolated to Playwright test runs with zero production leakage.

## Base Checkpoint

`0734b29b44ee022ac40e4ab9c037c5d78ef74d11`

## Implementation Commit

- **SHA**: `d2ad81d8fc873ee0d3699a31e53eb84f951a10b2`
- **Subject**: `feat: implement GP-011 category and brand discovery`

## External Review Remediation Commit

- **SHA**: `ed6c2ac40d7a2aeecc83cd54aa3038a0b3f65292`
- **Subject**: `fix: remediate GP-011 external review findings`

## Routes

- **Category Discovery**: `/categorias/[slug]` ([`src/app/(storefront)/categorias/[slug]/page.tsx`](<../../src/app/(storefront)/categorias/[slug]/page.tsx>))
- **Brand Discovery**: `/marcas/[slug]` ([`src/app/(storefront)/marcas/[slug]/page.tsx`](<../../src/app/(storefront)/marcas/[slug]/page.tsx>))

> [!NOTE]
> No `/productos/[slug]` route was introduced in GP-011. GP-014 remains the authoritative owner of the Product Detail System.

## Database / Runtime Boundary

- **Database Migrations**: None.
- **Remote Database Mutation**: None.
- **Commercial Seed**: None (database remains with 0 commercial rows).
- **Runtime Boundary**: Storefront Server Components execute queries via `CatalogDiscoveryReader` -> Drizzle -> `DATABASE_URL` -> PostgreSQL.
- `DATABASE_MIGRATION_URL` is never referenced or exposed in storefront runtime.

## Public Eligibility

- **Product**: `products.status = 'PUBLISHED'`
- **Brand**: `brands.status = 'PUBLISHED'`
- **Category**: `categories.status = 'PUBLISHED'`
- **Variant**: At least one `product_variants.status = 'ACTIVE'`
- **Starting Price**: Calculated strictly as `MIN(product_variants.price_cents)` over ACTIVE variants.
- **Product Count**: Calculated strictly as `COUNT(DISTINCT products.id)` over eligible published products.
- **Confidential Fields**: `cost_cents` and supplier-private data are never selected or projected.

## Media Security

- `Product.primary_media_id` resolves publicly only when `media_assets.security_class = 'PUBLIC_MEDIA'` AND `media_assets.media_type = 'IMAGE'`.
- If missing, non-image, or private (`PRIVATE_PAYMENT_PROOF`, `PRIVATE_BACKUP`), `primaryMedia` evaluates to `null` and renders an abstract fallback stage.
- Brand logo follows equivalent public image security filtering.
- `NEXT_PUBLIC_CDN_URL` serves as the public media base contract. Same-origin local CDN URLs resolve to relative `/media/...` paths matching `next.config.ts` `localPatterns`. Production remote media is constrained to `https://media.gamerperu.com/**`.

## Pagination

- **Page Size**: `12` items per page.
- **URL Schema**: `?page=N`.
- **Page 1 Canonical**: Clean base URL (`/categorias/[slug]` or `/marcas/[slug]`).
- **Page N Canonical**: Self-referencing canonical URL (`/categorias/[slug]?page=N`).
- **Parameter Normalization**: `?page=1`, `?page=0`, or invalid alphanumeric page parameters redirect cleanly to base URL.
- **Out-of-Bounds**: `404 Not Found` (`notFound()`).
- **Empty Entity**: `200 OK` empty state on page 1; `404 Not Found` on `?page=2+`.
- **Windowing**: Compact bounded algorithm rendering at most 7 page-number/ellipsis elements for any catalog size.

## Future Filter Intent

- **Recognized Future Parameters**: `tipo`, `sub`, `formato`, `superficie`, `tamano`.
- **Behavior**: GP-011 does not filter catalog data. Base products remain visible.
- **Truthful Notice**: `"Este filtro aún no está disponible. Mostrando todos los productos de esta categoría."`
- **Robots & Canonical**: `noindex, follow` applied to robots metadata; canonical tag points to clean base URL.
- **Ownership**: GP-013 remains responsible for Filters & Sorting.

## Test / CI Fixture Architecture

- `FixtureCatalogDiscoveryReader` is synthetic test infrastructure only.
- Activation is guarded: requires `E2E_CATALOG_FIXTURES=1` AND `PLAYWRIGHT_TEST=1` in non-production environments.
- Throws an error if activated in production or outside Playwright test runners.
- Production database outages propagate to error boundaries and never fall back to fixtures.
- GitHub Actions CI executes without requiring real Supabase credentials.

## Build Behavior

- Discovery routes are dynamic Server Components (`export const dynamic = "force-dynamic"`).
- `next build` runs in CI without contacting remote PostgreSQL.
- No `generateStaticParams` remote catalog dependency.
- No Cache Components / `cacheTag` architecture introduced in GP-011.

## Tests

- **Vitest**: 14 test files passed, 144 unit/component tests passed, 0 failed.
- **Playwright**: 66 tests passed across 5 test suites, 0 failed.
- **Coverage Areas**: Published category/brand resolution, DRAFT 404, ARCHIVED 404, unknown 404, valid empty state, minimum ACTIVE price, distinct product count, private media exclusion, non-image exclusion, public image behavior, bounded pagination, unsupported future filters, CDN path resolution security, ProductCard optional `href` contract, responsive matrix (360px–1920px), Axe accessibility audits (WCAG 2.1 AA), zero horizontal overflow, and network isolation.

## External Review Findings Remediated

1. **Same-origin local CDN Image path mismatch**: RESOLVED (Pure resolver returns relative `/media/...` path when CDN origin matches site origin).
2. **Query tests duplicated query definitions instead of testing runtime builders**: RESOLVED (Extracted canonical query builders in [`postgres-queries.ts`](../../src/lib/catalog/postgres-queries.ts) shared by runtime reader and unit tests).
3. **Pagination rendered an unbounded list of page numbers**: RESOLVED (Implemented compact windowed pagination algorithm bounded at max 7 elements with non-link `aria-hidden="true"` ellipsis separators).
4. **Brand metadata incorrectly used "Catálogo oficial"**: RESOLVED (Replaced with neutral `"Catálogo de ${brand.name} en Gamer Perú."`).
5. **ProductCard href API was not functionally implemented**: RESOLVED (Optional `href` connects media stage and title in isolated tests without nested-anchor conflicts with Brand link; production GP-011 routes pass `undefined`).
6. **Explicit ARCHIVED lifecycle fixtures/tests were missing**: RESOLVED (Added `status: 'ARCHIVED'` fixtures returning 404 for category and brand routes).
7. **Generic QA fixture naming was cleaned where relevant**: RESOLVED (Neutral QA names used across synthetic fixtures and test components).

## External Visual Review

- **Overall Visual Acceptance**: `PASS`
- **Evidence Reviewed**:
  - `scratch/visual-qa/gp011/category-1920.png` (PASS)
  - `scratch/visual-qa/gp011/category-1280.png` (PASS)
  - `scratch/visual-qa/gp011/category-768.png` (PASS)
  - `scratch/visual-qa/gp011/category-360.png` (PASS)
  - `scratch/visual-qa/gp011/brand-1920.png` (PASS)
  - `scratch/visual-qa/gp011/brand-360.png` (PASS)
  - `scratch/visual-qa/gp011/category-empty-1920.png` (PASS)
  - `scratch/visual-qa/gp011/category-empty-360.png` (PASS)
- **Category Page**: PASS
- **Brand Page**: PASS
- **Responsive Desktop / Tablet / Mobile**: PASS (Zero horizontal scrollbar across 360px–1920px)
- **Empty State**: PASS
- **Grid Geometry**: PASS
- **Visual Hierarchy**: PASS
- **WLMOUSE Structural Convergence**: PASS WITH MEDIA NOTE
- **Owner Product Media**: PENDING / NON-BLOCKING
- **Final Product-Art Parity**: NOT CLAIMED

## Accepted Visual Limitations

Abstract `ProductCard` fallback media stages are intentionally temporary. Future owner-supplied production renders and product photography will elevate visual fidelity without requiring GP-011 architecture redesign.

## CI History

- **Implementation Commit**: `d2ad81d8fc873ee0d3699a31e53eb84f951a10b2` — CI: `SUCCESS`
- **Remediation Commit**: `ed6c2ac40d7a2aeecc83cd54aa3038a0b3f65292` — CI: `SUCCESS` (Run ID: `32003012743`)
  - Format: PASS
  - Typecheck: PASS
  - Lint: PASS
  - Vitest: 144 / 144 PASS
  - Build: PASS
  - Playwright: 66 / 66 PASS

## Known LOW Notes

1. The neutral Brand metadata unit assertion verifies the fallback copy format concept directly rather than executing `generateMetadata()`. (LOW / NON-BLOCKING)
2. `PaginationProps` supports both `baseUrl` and `basePath` for backwards-compatibility. (LOW / NON-BLOCKING)

## Security

- No credentials or `.env.local` contents committed.
- No `DATABASE_MIGRATION_URL` runtime exposure.
- No private `media_assets` object keys projected.
- No `cost_cents` projected.
- No real Supabase credentials required in CI.
- No commercial catalog fixture data written to PostgreSQL.
- No WLMOUSE proprietary code or assets copied.

## Dependencies

- No GP-011 database migrations.
- No GP-011 commercial seed.
- No new architectural dependencies beyond the existing stack.

## Scope Exclusions

- **GP-012**: Search
- **GP-013**: Filters & Sorting
- **GP-014**: Product Detail System
- **GP-015**: Authentication
- **Other Excluded Features**: Cart/Checkout mutations, Admin mutation, Inventory tracking, Reviews, Wishlist, Recommendations, Merchandising Collections, Product Story, and Variant Gallery.

## Acceptance

GP-011 acceptance criteria are fully satisfied across functional discovery, database/publication invariants, security, SEO/pagination, responsive layout composition, accessibility, automated CI testing, external code review, and external visual review.

## Final Closure Status

**CLOSED**

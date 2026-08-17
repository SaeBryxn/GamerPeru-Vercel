# GP-012 — Closure Report

## Status

CLOSED

## Scope Delivered

- Desktop and mobile Search experience accessible via Header Utilities launcher with native `<dialog>` right-drawer modal.
- Fast, live predictive search API endpoint (`GET /api/search/predictive?q=...`) providing bounded suggestions across products (max 6), brands (max 3), and categories (max 3).
- Authoritative full-page search discovery route (`/buscar`) powered by PostgreSQL `pg_trgm` GIN indexes and Drizzle ORM query builders.
- Canonical query normalization: collapsing redundant whitespace, NFC Unicode normalization, code-point length consistency, literal SQL wildcards escaping (`%`, `_`, `\`), and canonical redirects on material differences.
- First-valid duplicate parameter parsing for repeated query (`q`) and pagination (`page`) parameters.
- Bounded 12-item responsive pagination on search results with clean page 1 URLs and self-referencing canonical URLs.
- Truthful empty and zero-results states with recovery links ("Limpiar búsqueda", "Volver al inicio").
- Responsive ProductGrid adhering to the 4-column (desktop) / 3-column (tablet) / 2-column (mobile) matrix with zero horizontal overflow across 360px–1920px viewports.
- Automated WCAG 2.1 AA accessibility compliance (Axe audits passed across bare landing, results page, and open search modal).
- Strict publication invariants, media security validation, internal cost hiding, and search query telemetry sanitization.
- Environment-isolated reader mode architecture: `PostgresCatalogSearchReader`, `DevCatalogSearchReader` (development preview), and `FixtureCatalogSearchReader` (isolated Playwright E2E testing).

## Base Checkpoint

`679086efc6d235fe8b8c5068c9c6e41b2a399f1f`

## Canonical Implementation History

1. **Pre-GP-012 Planning Checkpoint**: `679086efc6d235fe8b8c5068c9c6e41b2a399f1f`
2. **DB1 Migration Candidate**:
   - **SHA**: `5b182a5ba7664f0c2704a9e2ef575d3d6fbca136`
   - **Subject**: `feat(db): add GP-012 search trigram indexes`
3. **DB2 Remote Migration**:
   - Applied `src/db/migrations/0001_search_pg_trgm.sql` to Supabase PostgreSQL 17.6 via `DATABASE_MIGRATION_URL`.
   - No repository code commit.
4. **DB3 Initial Implementation**:
   - **SHA**: `0dc05cedeef06ef443f5aa056e26dfd1e0827a9c`
   - **Subject**: `feat: implement GP-012 search experience`
5. **DB3 Test Remediation**:
   - **SHA**: `5d22dfaf4de5f904cd317e5b98fae80ae7486d3f`
   - **Subject**: `fix(test): use fixture reader in predictive search api unit test`
6. **External Review Remediation**:
   - **SHA**: `0a95f33c855cf76ad3b482fe47615ca42f909fd7`
   - **Subject**: `fix(search): remediate GP-012 external review findings`
7. **Typecheck Follow-Up Checkpoint**:
   - **SHA**: `734ecab2fc8a7a83a1f3de2a801506bfe4588fd5`
   - **Subject**: `fix(test): type GP-012 PostgreSQL escape smoke`

## Database Closure State

- **Engine**: PostgreSQL 17.6
- **Supabase Project Ref**: `jpjffalmvlxpufvtvskx`
- **Extension**: `pg_trgm` installed (version 1.6) in `extensions` namespace
- **GIN Operator Class**: `extensions.gin_trgm_ops`
- **GP-012 Physical Indexes**:
  1. `brands_name_trgm_idx` (GIN on `brands.name` via `gin_trgm_ops`)
  2. `categories_name_trgm_idx` (GIN on `categories.name` via `gin_trgm_ops`)
  3. `products_name_trgm_idx` (GIN on `products.name` via `gin_trgm_ops`)
  4. `products_subtitle_trgm_idx` (GIN on `products.subtitle` via `gin_trgm_ops`)
- **Total Application Physical Indexes**: 22
- **Drizzle Migration Records**: 2 (`0000_fluffy_iron_fist`, `0001_search_pg_trgm`)
- **Commercial Catalog Rows**:
  - `media_assets`: 0
  - `brands`: 0
  - `categories`: 0
  - `products`: 0
  - `product_variants`: 0
- **Remote Commercial Seed**: NONE
- **Remote Application DML**: NONE

## Search Architecture Decisions

- **Route**: `/buscar` ([`src/app/(storefront)/buscar/page.tsx`](<../../src/app/(storefront)/buscar/page.tsx>))
- **Predictive Endpoint**: `GET /api/search/predictive?q=...` ([`src/app/api/search/predictive/route.ts`](../../src/app/api/search/predictive/route.ts))
- **Query Contract**:
  - Minimum length: 2 code points (queries < 2 code points return empty predictive results and display search guidance)
  - Maximum length: 100 code points (excess characters truncated safely)
  - Unicode: NFC canonical normalization
  - Whitespace: Canonical single-space collapsing
  - LIKE Wildcard Escaping: Literal escaping for `%`, `_`, and `\` via `ESCAPE '\\'`
  - Slug Search: Exact lowercase query value match
- **Accent-Insensitive Matching**: DEFERRED (accent-sensitive exact substring / trigram matching in GP-012)
- **Typo Recall Guarantee**: NO (trigram index supports substring matching; fuzzy typo expansion is out of scope)
- **Predictive Totals**: NOT PERFORMED (predictive endpoint avoids expensive unbounded `COUNT(*)` queries)
- **Predictive Bounds**: Max 6 Products, Max 3 Brands, Max 3 Categories
- **Full Results Page Size**: 12 products per page
- **Component Architecture**:
  - `/buscar` Search Page: Server Component for authoritative data fetching and SEO
  - Predictive Search: Compact Client Component boundary ([`SearchModal`](../../src/components/search/search-modal.tsx), [`PredictiveResults`](../../src/components/search/predictive-results.tsx))
  - Header Utilities: Server-first shell ([`HeaderUtilities`](../../src/components/navigation/header-utilities/header-utilities.tsx))
  - Accessibility: Native `<dialog>` modal with standard links
- **PDP Product Links**: NONE until GP-014 (Product Detail System)
- **Filter / Sort UI**: NONE (GP-013 owns Faceted Discovery)

## Public Data & Security Invariants

- **Product Eligibility**: `products.status = 'PUBLISHED'` only
- **Brand Eligibility**: `brands.status = 'PUBLISHED'` only
- **Category Eligibility**: `categories.status = 'PUBLISHED'` only
- **Variant Eligibility**: At least one `product_variants.status = 'ACTIVE'` required
- **Starting Price**: Calculated strictly as `MIN(product_variants.price_cents)` over ACTIVE variants
- **Media Security**: `media_assets.security_class = 'PUBLIC_MEDIA'` AND `media_assets.media_type = 'IMAGE'` only
- **Private Data Protection**: Internal `cost_cents`, supplier identifiers, and private media keys are never selected or exposed
- **Telemetry Privacy**: Raw search queries are not logged in application output; Sentry error instrumentation redacts query parameters
- **Fallback Invariant**: Database outages propagate to error boundaries and NEVER trigger synthetic fallback
- **DEV Preview**: Activated only when `DEV_CATALOG_PREVIEW=1` in `NODE_ENV=development` outside CI
- **Playwright Fixtures**: Activated only when `E2E_CATALOG_FIXTURES=1` AND `PLAYWRIGHT_TEST=1` in non-production

## Production Code Hygiene Decision

GP-012 codified the repository-wide **Production Code Hygiene** standard in [`AGENTS.md`](../../AGENTS.md):

- Concise and conventional production code.
- No decorative comment banners (e.g. `/* ===== */`).
- Comments explain non-obvious WHY rather than obvious WHAT.
- No emojis in production code, comments, logs, or commits unless user-facing.
- No AI or tool attribution comments in source code.
- No dead commented-out code or temporary debug logs.
- Documentation Markdown remains detailed for architectural clarity and maintainability.

## PostgreSQL ESCAPE Verification Evidence

External remediation verified PostgreSQL LIKE ESCAPE semantics live against Supabase PostgreSQL 17.6:

- `SHOW standard_conforming_strings;` -> `"on"`
- Escaping `\%`, `\_`, and `\\` in Drizzle tagged templates emitted `ESCAPE '\'` in generated SQL.
- Literal matching verified:
  - `100\%` matched `100% Cotton` (1 row), ignored `1000 Cotton`.
  - `mouse\_model\_1` matched `mouse_model_1` (1 row), ignored `mouse-model-1`.
  - `C:\\test` matched `C:\test\dir` (1 row), ignored `C:testdir`.
- All 5 production SQL builders were exercised against PostgreSQL with zero database errors.
- Runtime PostgreSQL smoke test is automated in [`tests/unit/search-runtime-escape.test.ts`](../../tests/unit/search-runtime-escape.test.ts) and cleanly skipped in CI when `DATABASE_URL` is absent.

## Tests & CI Evidence

- **Accepted Implementation Checkpoint**: `734ecab2fc8a7a83a1f3de2a801506bfe4588fd5`
- **GitHub Actions CI Run**: `32053998763`
- **CI Workflow Status**: `completed`
- **CI Workflow Conclusion**: `success`
- **CI Job**: `Format, Typecheck, Lint, Test, Build & E2E` (Passed, 4m 22s)
- **Vitest Unit Suite**: 23 test files, 219 passed, 1 skipped (remote PostgreSQL smoke without DB in CI), 220 total tests.
- **Playwright E2E Suite**: 80 passed across 6 test files.
- **Production Build (`pnpm build`)**: Passed (11 static/dynamic routes compiled).
- **Typecheck (`pnpm typecheck`)**: Passed (0 errors).
- **Linter (`pnpm lint`)**: Passed (0 errors, 0 warnings).
- **Formatter (`pnpm format:check`)**: Passed (all files compliant).
- **Git Diff Check (`git diff --check`)**: Passed (clean whitespace).

## Process Deviations Recorded

1. **Process Deviation 1 (Non-Functional)**:
   - During initial DB3 execution (`0dc05ce`), a unit test CI failure prompted an automatic fix commit (`5d22dfa`) before external authorization.
   - **Classification**: Non-functional process deviation; no Git history was squashed or rewritten, and review was properly resumed.
2. **Process Deviation 2 (CI Typecheck Failure & Repair)**:
   - External remediation commit `0a95f33` failed CI run `32053195350` at `Run Typecheck` due to missing property checks and parameter typing in the new smoke test file.
   - Antigravity strictly STOPPED per invariant; external authorization was granted for follow-up type repair `734ecab`, which successfully achieved a green CI.

## External Visual Acceptance

- **Overall Verdict**: `PASS WITH NON-BLOCKING VISUAL NOTES`
- **Inspected Visual States**:
  1. `search-drawer-empty-1920.png` (1920x1080) — Empty search modal drawer with guidance
  2. `search-drawer-predictive-1920.png` (1920x1080) — Predictive suggestions for "mouse"
  3. `search-drawer-mobile-360.png` (360x640) — Mobile search modal drawer
  4. `search-results-1920.png` (1920x1080) — Desktop results grid with pagination
  5. `search-results-768.png` (768x1024) — Tablet results grid
  6. `search-results-360.png` (360x640) — Mobile results grid with zero overflow
  7. `search-zero-1920.png` (1920x1080) — Zero-results state with recovery links
  8. `search-zero-360.png` (360x640) — Mobile zero-results state
- **Visual Elements Accepted**: Desktop Search drawer structure, mobile composition, predictive visual hierarchy, responsive grid scaling, zero-state clarity, header/footer layout integration, and truthful presentation.
- **Owner Product Media**: PENDING / NON-BLOCKING (synthetic fallback stages used prior to commercial product photography).
- **Final Product-Art Parity**: NOT CLAIMED (WLMOUSE is an architectural/visual benchmark only; Gamer Perú maintains independent multi-brand identity, Signal Crimson palette, and PEN pricing).

## Non-Blocking Visual Follow-Ups (Storefront Visual Polish Phase)

The following items are accepted for future storefront convergence and do NOT block GP-012:

- **A. Brand/Category Match Block**: Quieter editorial treatment to prevent visual overlap with future GP-013 facet filters.
- **B. Search Input Focus Treatment**: Subtle softening of Signal Crimson outline while preserving WCAG focus visibility.
- **C. Mobile Search Header Density**: Micro-refinement of Clear and Close button spacing on ultra-compact mobile viewports.
- **D. Product Media**: High-fidelity owner renders will replace synthetic fallback media stages upon catalog onboarding.
- **E. Large Viewport Utilization**: Evaluation of enlarged product card scales for ultra-wide desktop viewports (> 1920px).
- **F. Zero-State Editorial Polish**: Further aesthetic typography refinements during final storefront polish.

## Roadmap Transition

- **GP-012 Status**: `COMPLETE`
- **Next Roadmap Milestone**: `GP-013 — Filters & Sorting` (`PLANNED / NOT STARTED`)

## Final Verdict

**GP-012 — CLOSED (PASS WITH NOTES)**

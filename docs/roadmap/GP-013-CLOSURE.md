# GP-013 — Closure Report

## Status

COMPLETE

## Scope Delivered

GP-013 (Filters & Sorting) establishes the faceted discovery architecture across Gamer Perú storefront category, brand, and search surfaces:

1. **Faceted Discovery Core**:
   - Multi-brand selection with unrepresented brand pruning.
   - Multi-category selection with unrepresented category pruning.
   - PEN currency price range filtering with Peruvian decimal format normalization (comma and dot decimal separators, positive integer cents conversion).
   - Technical specification filtering dynamically driven by PostgreSQL `category_specification_schemas` and `product_specifications` JSONB data:
     - `ENUM_MULTI`: Multi-select facet options with represented-value detection.
     - `NUMBER_RANGE`: Continuous numeric boundary filtering (`_min` and `_max`).
     - `BOOLEAN`: Flag filtering (`hasRepresentedTrue`).
   - Explicit sorting options (`recientes`, `precio-menor`, `precio-mayor`, `nombre-asc`, `nombre-desc`).
   - Canonical query-state serialization using repeated parameters for multi-select (e.g. `?forma=simetrico&forma=ergonomico`), omitting default sort and `page=1`.
   - Paginated discovery with strict boundary enforcement (out-of-range pages return HTTP 404).
   - Dismissible applied-filter chips with individual remove URLs and clear-all actions.
   - Accessible desktop and mobile filter drawers with focus trapping, Escape key dismiss, and focus restoration.
   - Filtered zero-state fallback with recovery actions.
   - Legacy navigation compatibility redirects (permanent HTTP 308 for historical alias URLs, direct HTTP 200 for canonical destinations).
   - Global navigation rewrite to canonical GP-013 URLs.
   - Integration across Category (`/categorias/[slug]`), Brand (`/marcas/[slug]`), and Search (`/buscar?q=...`) surfaces.

2. **Predictive Search Invariant**:
   - GP-012 predictive Search drawer remains bounded, performant, and non-faceted.

---

## Architecture Decisions

1. **Dynamic Specification Schema**:
   - Category specification schemas are stored in PostgreSQL table `category_specification_schemas` with JSONB `field_definitions` conforming to a strict Zod runtime schema.
   - Active schemas are pointed to by `categories.current_spec_schema_id`.
   - Product technical specifications are stored in `product_specifications.spec_values` as JSONB key-value records.

2. **Reader Pattern & Request-Scoped Deduplication**:
   - Discovery surfaces access data through `CatalogDiscoveryReader` and `CatalogSearchReader` interfaces, with zero N+1 queries and bounded query execution budgets.
   - Category base queries, schemas, and entity lookups use `React cache()` from `react` for request-scoped deduplication between `generateMetadata()` and page rendering within the same HTTP request.
   - No cross-request business caching is introduced by these helpers.

3. **Closed Decimal Domain Authority**:
   - `parseTechnicalDecimal` strictly bounds public numeric inputs and ensures closure under its own canonical serializer `formatTechnicalDecimal` (`parse(raw) -> format -> parse(canonical) === parse(raw)`).

---

## Database

- **PostgreSQL Version**: 17.6
- **Repository Migration Journal**:
  - `0000_superb_ink` (Base catalog & media)
  - `0001_search_pg_trgm` (Search trigram indexes)
  - `0002_silky_dazzler` (GP-013 Catalog specification schemas & product specifications)
- **Migration Journal File**: `src/db/migrations/meta/_journal.json` (3 entries)
- **Remote Drizzle Migration Record Count**: 3 records in `drizzle.__drizzle_migrations`.
- **New Tables Introduced**:
  - `category_specification_schemas`
  - `product_specifications`
- **Columns Added**:
  - `categories.current_spec_schema_id`
- **Physical Index Delta (+6 added in GP-013)**:
  - **Primary-Key-Backed Physical Indexes (2)**:
    1. `category_specification_schemas_pkey` (on `category_specification_schemas.id`)
    2. `product_specifications_pkey` (on `product_specifications.product_id`)
  - **Unique-Constraint-Backed Physical Index (1)**: 3. `category_spec_schemas_category_id_schema_version_key` (UNIQUE on `category_specification_schemas(category_id, schema_version)`)
  - **Explicit Physical Indexes (3)**: 4. `category_spec_schemas_category_idx` (btree on `category_specification_schemas(category_id, is_active)`) 5. `product_specifications_schema_id_idx` (btree on `product_specifications(schema_id)`) 6. `product_specifications_spec_values_gin_idx` (GIN on `product_specifications(spec_values jsonb_path_ops)`)
- **Index Composition**:
  - PK indexes: 2
  - Unique indexes: 1
  - Explicit indexes: 3
  - GP-013 index delta: +6
- **Total Application Physical Indexes**: 28
- **Foreign Keys Added (4)**:
  - `category_specification_schemas.category_id` -> `categories.id` (`ON DELETE RESTRICT`)
  - `product_specifications.product_id` -> `products.id` (`ON DELETE CASCADE`)
  - `product_specifications.schema_id` -> `category_specification_schemas.id` (`ON DELETE RESTRICT`)
  - `categories.current_spec_schema_id` -> `category_specification_schemas.id` (`ON DELETE SET NULL`)
- **Structural Checks Added**: 4
- **Triggers**: 0
- **DB2 Idempotence & Supavisor Visibility**: PASS
- **Persistent Catalog Rows**: 0 (test catalog is purely synthetic/fixture-based).
- **Inventory Tables/Columns Introduced**: NONE.
- **Evidence Qualification**: Remote PostgreSQL DB2 verification was produced by authorized local execution against the private Supabase project; it was not independently queried by the external GitHub reviewer.

---

## Discovery Surfaces

1. **Category Discovery (`/categorias/[slug]`)**:
   - Displays published category entity, Brand facets, Price range, Technical facets from active schema, Sorting options, and Paginated product results.
2. **Brand Discovery (`/marcas/[slug]`)**:
   - Displays published brand entity, Category facet options, Price range, Sorting options, and Paginated product results.
   - Conditionally activates Technical facets when exactly one valid Category is selected.
3. **Search Discovery (`/buscar?q=...`)**:
   - Preserves GP-012 text search query predicate (`q`).
   - Displays Brand facets, Category facets, Price range, Sorting options, and Paginated product results.
   - Conditionally activates Technical facets when exactly one valid Category is selected.

---

## EligibleVariant

- **EligibleVariant V1 Authority**:
  - `ProductVariant.status = 'ACTIVE'`
  - Active variant price bounds (`price_cents >= precio_min_cents` AND `price_cents <= precio_max_cents`) where supplied.
- **Scope of Invariant**:
  - Governs product inclusion in discovery results, `startingPriceCents` calculation (minimum price among matching active variants), and price sorting (`PRICE_ASC`, `PRICE_DESC`).
- **Stock Boundary**:
  - `ProductVariant.status` represents variant lifecycle activation and is NOT stock/inventory availability.

---

## Technical Specifications

- `field_definitions` validated prior to SQL query construction.
- Strict validation of machine `key` and `publicParam` identifiers (`/^[a-z][a-z0-9_]{0,39}$/`):
  - Total length <= 40 characters (`FILTER_SAFETY_BOUNDS.MAX_PUBLIC_PARAM_LENGTH = 40`).
  - First character must be lowercase `a-z`.
  - Remaining characters may be lowercase letters, digits, or underscores.
- Collision protection against reserved parameter names (`marca`, `categoria`, `precio_min`, `precio_max`, `sort`, `page`, `q`).
- Protection against duplicate effective query parameters.
- Validated ENUM options (non-empty string values and labels).
- Validated numeric metadata (`min <= max`, `step > 0`).
- Native JSONB numeric, boolean, and string semantics.
- Defensive handling of historical or inconsistent specification values (treated as non-matching without throwing HTTP 500).
- Write-time schema consistency enforcement is assigned to GP-024 (Admin Catalog).

---

## URL & SEO Contract

- **Canonical Public Parameters**:
  - `marca`: Multi-value brand slugs.
  - `categoria`: Multi-value category slugs.
  - `precio_min` / `precio_max`: PEN currency bounds.
  - `<publicParam>`: ENUM multi-select values or boolean flags.
  - `<publicParam>_min` / `<publicParam>_max`: Technical numeric ranges.
  - `sort`: Sorting criteria (`recientes`, `precio-menor`, `precio-mayor`, `nombre-asc`, `nombre-desc`).
  - `page`: 1-based page number (omitted for page 1).
  - `q`: Search query string (search surface only).
- **Serialization**:
  - Repeated parameter syntax for multi-values (e.g. `?marca=marca-a&marca=marca-b`).
  - Deterministic parameter ordering.
  - Automatic pruning of invalid or unrepresented values.
- **Robots & Canonical Directives**:
  - Clean Category / Brand: `index, follow`, self-canonical.
  - Filtered / Sorted Category / Brand: `noindex, follow`, normalized self-canonical.
  - Search with query / filters: `noindex, follow`, normalized self-canonical.
  - Bare `/buscar`: preserves GP-012 indexable landing behavior.

---

## Legacy Redirection Evidence

- Historical alias parameters issue permanent HTTP 308 redirects to canonical URLs:
  - `/categorias/mouses?tipo=ultraligeros` -> `/categorias/mouses?peso_max=45`
  - `/categorias/mouses?sub=skates` -> `/categorias/accesorios?tipo_accesorio=skates`
  - `/categorias/teclados?formato=compactos` -> `/categorias/teclados?formato=60&formato=65`
  - `/categorias/teclados?formato=tkl-75` -> `/categorias/teclados?formato=75&formato=tkl`
  - `/categorias/teclados?formato=magneticos` -> `/categorias/teclados?tipo_switch=magnetico`
  - `/categorias/audio?tipo=iems` -> `/categorias/audio?tipo_audio=iem`
  - `/categorias/accesorios?tipo=skates` -> `/categorias/accesorios?tipo_accesorio=skates`
- Canonical keyboard `formato` URLs (`/categorias/teclados?formato=60`, `/categorias/teclados?formato=60&formato=65`, `/categorias/teclados?formato=75&formato=tkl`) resolve directly with HTTP 200 without redirect.
- Canonical mousepad parameters (`superficie`, `tamano`) resolve directly with HTTP 200.

---

## Availability Deviation

- **Classification**: `REQUIRED ARCHITECTURAL SCOPE DEVIATION` (not an unfinished defect).
- **Status**: `DEFERRED_REQUIRED_PREREQUISITE`.
- **Canonical Owner**: GP-021 (Inventory Management).
- **Rationale**: No canonical Inventory or Stock authority exists in the data layer yet. GP-013 intentionally avoided creating fake inventory tables, stock columns, or speculative availability filter UI.

---

## Variant Attribute Facets

- **Status**: `DEFERRED`.
- **Rationale**: Public faceting on arbitrary `product_variants.attributes` (e.g. color, layout, switch) requires formal variant facet metadata definitions, which will be introduced in subsequent catalog administration milestones.

---

## Query Budgets

- **Category Discovery (with technical context)**:
  - GP-013 faceted-discovery queries: **MAX 5** (1. current specification schema, 2. Brand facet options, 3. represented technical values, 4. filtered Product count, 5. filtered Product items).
  - The fixed Category entity lookup by route slug is outside this faceting budget and is request-deduplicated through `React cache()`.
- **Brand Discovery**:
  - Without selected Category: **MAX 3** GP-013 faceted-discovery queries (1. Category facet options, 2. filtered Product count, 3. filtered Product items). Fixed Brand entity lookup: outside faceting budget.
  - With exactly one selected Category: **MAX 5** GP-013 faceted-discovery queries (1. Category facet options, 2. current specification schema, 3. represented technical values, 4. filtered Product count, 5. filtered Product items). Fixed Brand entity lookup: outside faceting budget.
- **Search Discovery**:
  - Without selected Category: GP-013 faceting **MAX 4** (1. Brand facets, 2. Category facets, 3. filtered Search count, 4. filtered Search items) + GP-012 entity-navigation suggestion queries: **2** (matching brands, matching categories) = **6 maximum total**.
  - With exactly one selected Category: GP-013 faceting **MAX 6** (1. Brand facets, 2. Category facets, 3. current specification schema, 4. represented technical values, 5. filtered Search count, 6. filtered Search items) + GP-012 entity-navigation queries: **2** = **8 maximum total**.
- **N+1 Prevention**: Zero N+1 query patterns; all aggregations and facet options execute in bounded single queries.

---

## Validation Evidence

- **Accepted Implementation Checkpoint**: `0d8e4c04b73d3d22ce3ddbcd9380f45b224767cd`
- **GitHub Actions CI Run**: ID `32118113326` (Status: `completed`, Conclusion: `success`)
- **Unit & Integration Suite (Vitest)**:
  - Test Files: 31
  - Passed: 284
  - Skipped: 1 (optional GP-012 remote PostgreSQL runtime smoke test)
  - Total: 285
- **End-to-End Suite (Playwright)**:
  - Passed: 118 across 7 test suites
  - Automated Axe accessibility checks: PASS
  - Keyboard/focus behavior: covered by Playwright GP-013 tests
  - External visual/manual review: PASS WITH NON-BLOCKING NOTES
- **Code Quality Gates**:
  - `pnpm format:check`: PASS (Clean Prettier code style)
  - `pnpm typecheck`: PASS (Zero TypeScript errors)
  - `pnpm lint`: PASS (`eslint . --max-warnings=0`, zero warnings)
  - `pnpm build`: PASS (Turbopack production build succeeded)

---

## External Code Review

- **Verdict**: `PASS WITH NOTES`
- **Notes Recorded**:
  1. Query-budget unit evidence uses instrumented test Readers rather than directly counting production page orchestration; reviewed production code strictly adheres to documented budgets.
  2. Search sorting has stronger deterministic behavioral assertions for price and alphabetical sorts than for the explicit "recientes" path; production ordering operates correctly.
  3. The earlier DB1 test titled conceptually as verifying prior migrations byte-for-byte checks file presence; external review independently verified migration blobs remained unchanged.

---

## External Visual Review

- **Verdict**: `PASS WITH NON-BLOCKING NOTES`
- **Viewports Inspected**: 1920px (Desktop), 768px (Tablet), 360px (Mobile).
- **Visual QA Evidence Artifacts** (untracked in `scratch/visual-qa/gp013/`):
  - `category-unfiltered-1920.png`
  - `category-filter-open-1920.png`
  - `category-filtered-1920.png`
  - `category-filtered-768.png`
  - `category-filter-open-360.png`
  - `category-filtered-360.png`
  - `filtered-zero-1920.png`
  - `filtered-zero-360.png`
  - `brand-filtered-1920.png`
  - `search-filtered-1920.png`
- **Non-Blocking Polish Notes (Future Milestones)**:
  - A. At 360px the Sort select text has slight visual clipping; future storefront polish should provide a dedicated mobile toolbar.
  - B. At 360px the second Price input in the filter drawer extends near the edge; future polish can stack inputs vertically on mobile.
  - C. Search suggested Category links visually concatenate in desktop preview; future polish will improve separation.
  - D. 1920px desktop layouts have generous vertical whitespace; content density can be tuned during final storefront styling convergence.
  - E. Filtered zero-state desktop is functionally complete but can receive further editorial polish.
  - F. Synthetic placeholder media will transition to high-resolution product photography in production catalog data.

---

## Production Code Hygiene

- Zero debug logging or temporary console statements in production source.
- Zero AI/tool attribution comments.
- Zero dead or commented-out code.
- Zero tracked screenshot binaries in Git.
- Professional, operational error handling and strict TypeScript typing.

---

## Canonical Checkpoints

- **Starting Base**: `2066ef44efe015526a96117dc743f4810e388880`
- **DB1 Migration Candidate**: `3e12725ea71def26d76c4dce41e6d3ef23357bfd` (`feat(db): add GP-013 catalog specification schema`)
- **DB2**: Remote migration applied to Supabase PostgreSQL (no repository commit).
- **DB3 Initial Implementation**: `0d16a10add5118acc42c8f9170808450ad488849` (`feat: implement GP-013 faceted discovery`)
- **Remediation 1**: `3b6140afbb73992320272491875af0187bc002d1` (`fix: remediate GP-013 external review findings`)
- **Remediation 2**: `01b5e51543a12a8b97249cb5a0e9cc8deab1e9ca` (`fix: complete GP-013 remediation gaps`)
- **Remediation 3 (Verification)**: `505f4b3841d82e4771a7a10903edd36efd972df8` (`fix: finalize GP-013 verification`)
- **Final Accepted Implementation Checkpoint**: `0d8e4c04b73d3d22ce3ddbcd9380f45b224767cd` (`fix: close GP-013 decimal domain`)

---

## Dependency Gate

- **GP-013 Status**: COMPLETE.
- **GP-014 Dependency**: All prerequisite GP-013 faceted discovery, specification schema, and filtering contracts are fully satisfied.
- **Authorization**: Authorizes **GP-014 PLANNING ONLY** after external verification of this closure commit.
- **GP-014 Implementation**: NOT STARTED.

# GP-054 — Closure Report

## Base Checkpoint

`b546511` on `feat/cloudflare-workers` (GP-053 closed).

## Closure Checkpoint

The GP-054 commit that adds this report on `feat/cloudflare-workers` (not pushed).

## Summary

`/admin` now opens on the work that needs a person: payments to verify, orders to prepare,
unpaid orders and out-of-stock SKUs, each linking to its filtered view. Below come quick
actions with wireframe cards (home, catalog, menu, orders), the state of the administrable home,
and a catalog health list built with the authoritative publish validator, where each product
links to the editor tab of its most severe issue. The period metrics follow under "Métricas del
período" with their selector, and every indicator with a destination is a link.

## Files Changed

- `src/lib/admin/dashboard-operations.ts` (new) — order queue snapshot, home status, catalog
  health (`buildCatalogHealth`, `summarizeHomeSections` are pure and unit-tested).
- `src/lib/admin/dashboard-reader.ts`, `dashboard-types.ts` — three new payload sections,
  fetched in the same `Promise.all` and gated by permission.
- `src/components/admin/dashboard/` — `attention-section.tsx`, `quick-actions.tsx`,
  `home-status-section.tsx`, `catalog-health-section.tsx`, `dashboard-links.ts`,
  `operations.module.css` (new); financial, order pipeline, payment, catalog and inventory
  sections accept destinations; `dashboard-header.tsx` exposes `PeriodSelector`.
- `src/components/admin/ui/admin-ui.tsx`, `admin-ui.module.css` — `MetricWidget` `href`.
- `src/app/admin/(protected)/page.tsx`, `page.module.css` — new order of the page.
- `src/lib/admin/catalog/publish-readiness.ts`, `readiness-guidance.ts` — `MISSING_SPEC_WEIGHT`.
- Tests: `admin-dashboard-operations.test.tsx` (new), `admin-dashboard-reader.test.ts`.
- `docs/roadmap/GP-054.md`, this report.

## Decisions

- **Snapshot vs. period.** "Requiere tu atención" shows the current state (payment queue, orders
  by status now); the metrics below keep the selected period. Period metrics link to the orders
  list with the same inclusive Lima dates (`from`/`to`).
- **Permissions.** Each block and link appears only when the operator can open its destination:
  orders need `orders:manage`, payments `orders:verify`, products, home and menu
  `catalog:manage`. Home status and catalog health queries do not run without `catalog:manage`.
- **One rule set.** Catalog health calls `evaluatePublishReadiness` and maps codes with
  `readiness-guidance.ts`; the only extra check is "story not published" (a suggestion). Order of
  the list: published products with blockers, drafts with blockers, warnings, suggestions.
- **Weight guidance fix.** Since `067d6af` the weight is edited only in the technical sheet when
  the category declares a weight field, but the warning still pointed to "Variantes y stock",
  where the field is hidden. The validator now emits `MISSING_SPEC_WEIGHT` (→ "Ficha técnica")
  in that case and keeps `MISSING_WEIGHT` (→ "Variantes y stock") otherwise; this also fixes the
  product editor's checklist.
- **Performance.** Nine narrow reads for catalog health plus one each for the order queue and the
  home, all concurrent with the existing metrics; the number of queries does not grow with the
  catalog and there is no per-product query.

## Validation Performed

- `pnpm check`: Prettier, `tsc`, ESLint `--max-warnings=0`, 1784 unit tests (153 files), build —
  PASS.
- `pnpm test:e2e`: 143/143 PASS in fixture mode.
- Unit: weight guidance (spec field present/absent), catalog health (ready product omitted, story
  suggestion, spec-weight link to the technical sheet, ordering and worst-issue tab, list limit
  with totals), home status (seeded home: 10 visible, 10 unedited, 7 images to upload; hidden and
  invalid sections), links (inclusive Lima dates, permission filtering), attention items and
  links, all-clear state, quick action links and wireframes, health rows, unavailable home;
  reader permission gating for the new sections (`orders:manage` only vs. `catalog:manage` only).
- **Production (`3648bcd`, Workers build completed 14:20:56 UTC), owner session, read-only:**
  - Attention shows the live state: 1 order to prepare (`/admin/orders?orderStatus=CONFIRMED`),
    2 unpaid (`?orderStatus=PENDING`), 1 out-of-stock SKU (`/admin/products?pending=stock`); the
    payment item is omitted because the queue is 0.
  - Quick actions link to `/admin/home`, `/admin/products`, `/admin/menu`, `/admin/orders`.
  - Home status: 10 of 10 visible, 7 images to upload, 10 never edited (matches `home_sections`).
  - Catalog health: 13 of 14 products with pending items, 1 with blockers; JINMS X7 Ultra Black
    first ("Sube al menos una foto" → `#imagenes`), then warnings and story suggestions, each with
    a descriptive link name ("Editar JINMS X7 Ultra Black en Fotos").
  - Period links: "Pedidos pagados" opens
    `/admin/orders?paymentStatus=PAID&from=2026-09-16&to=2026-10-15`, which lists exactly the 2
    paid orders the dashboard counts.
  - No console errors; no horizontal overflow at 409 px (mobile) or 1280 px (desktop); dark
    (system preference) and light (attribute set in memory, preference not stored) both legible.
  - **Defect found:** on phones each quick-action card showed a full-width schematic and the
    block was 1332 px tall. Fixed with a 96 px thumbnail beside the text (494 px, verified by
    injecting the CSS in memory); shipped in the follow-up commit.
- E2E admin specs stay excluded from the default suite (they need a seeded database), as before;
  E13 (no fabricated metrics) is unaffected: every new figure is read from the database.

## Acceptance Criteria

- Attention items and metrics link to their filtered views — met.
- Catalog health rows open the editor on the tab of the first issue — met.
- Home status reflects `home_sections` and degrades with a clear message — met.
- Blocks and links hidden without the matching permission — met.

## Deviations / Notes

- Two pre-existing intermittent E2E failures surfaced during validation and were fixed in their
  own commits: the story video control could miss a "play" event fired between hydration and
  its listener effect (now it reads the element state when it subscribes), and the bootstrap
  Axe audit sampled the social rail mid fade-in (it now waits for the rail to settle).
- "Ver los N productos con pendientes" opened the full product list in `3648bcd`; the follow-up
  commit adds the `pending=issues` filter to `/admin/products` (same evaluation as the dashboard)
  and points the link to it.

## Risks / Follow-ups

- The mobile quick-actions fix and the `pending=issues` filter need one more push to reach
  production.

## Repository Status

Clean after the GP-054 commit; not pushed.

## Final Status

PASS (verified in production; the two follow-up fixes are committed and pending push).

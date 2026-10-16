# GP-056 — Closure Report

## Base Checkpoint

`e77f7b8` on `feat/cloudflare-workers` (proxy hardening, pushed).

## Closure Checkpoint

The GP-056 commit that adds this report on `feat/cloudflare-workers` (not pushed).

## Summary

The ten mega-menu destinations that returned 404 are real pages: three buying guides whose
options are live, schema-validated catalog filters with product counts; a software centre with
the official software per catalog brand, 8K receiver pairing and firmware precautions; a support
hub; and the official-store page with the operational factory-defect summary. The navigation seed
no longer declares brands, series or promos, the admin registry lists no missing destinations,
and the site serves `sitemap.xml` and `robots.txt`.

## Files Changed

- Guides: `src/content/guides/{types,mouses,teclados,mousepads,index}.ts`,
  `src/lib/guides/resolve-guide-options.ts` (schema validation, counting, canonical hrefs),
  `src/lib/guides/guide-seo.ts` (Article/BreadcrumbList/FAQPage graph),
  `src/app/(storefront)/guia-de-compra/[slug]/page.tsx`,
  `src/components/guides/buying-guide.module.css`.
- Software: `src/content/software/{brand-software,kinds}.ts`,
  `src/components/software/{brand-software-list.tsx,software.module.css}`,
  `src/app/(storefront)/software/page.tsx`, `src/app/(storefront)/software/[tipo]/page.tsx`.
- Support: `src/content/support/official-store.ts`, `src/components/support/warranty-summary.tsx`,
  `src/components/support/support-hub.module.css`, `src/app/(storefront)/soporte/page.tsx`,
  `src/app/(storefront)/soporte/tienda-oficial/page.tsx`.
- Navigation: `src/components/navigation/navigation-data.ts` (static brands, series and promos
  emptied), `src/lib/navigation/menu-entries.ts` (no missing destinations, descriptions updated).
- SEO: `src/lib/seo/sitemap-entries.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`.
- Tests: `tests/unit/buying-guides.test.ts`, `tests/unit/support-destinations.test.ts`,
  `tests/unit/navigation-link-coverage.test.ts` (new); `tests/unit/storefront-menu-visibility.test.ts`
  (expects no missing destinations); `tests/e2e/mega-menu-destinations.spec.ts` (new, 17 tests).
- Docs: `docs/roadmap/GP-056.md`, `docs/roadmap/ROADMAP.md`, this report.

## Decisions

- **Options are validated against the live schema, not trusted.** The discovery parser drops
  parameters a schema does not define, which would widen a filter silently; an option is shown
  only when every parameter it uses survives parsing and it matches at least one published
  product. The same content therefore adapts to production schemas (`peso`, `forma`, `polling`,
  `bateria`; `superficie`, `largo`, `grosor`) and to the fixture schemas used by E2E.
- **Criteria without options keep their explanation** (e.g. keyboards, with no schema or products
  in production today), so the guide still reads as advice and the aside offers contact.
- **Official links only.** ATK V HUB is linked on atk.store (download, firmware and 2.4G/4K/8K
  receiver pairing confirmed on that page). No official MCHOSE or JINMS page could be verified
  (search results only showed resellers), so those entries offer "Pídenos el enlace oficial"
  instead of a guessed URL. X-raypad products (skates and pads) need no software.
- **Warranty copy is operational, not legal.** It lists what is evaluated as a factory defect and
  what is not, and says each case is reviewed under the Código de Protección y Defensa del
  Consumidor; no periods or terms are stated because none are defined in the repository. No
  address or hours are shown beyond what `company.ts` defines.
- **Empty `series`/`promos`/`brands` stay declared** in the navigation seed: their presence is
  what asks `getStorefrontNavigation()` to derive them from the catalog. In fixture runs (no
  database) these blocks are now omitted instead of rendering placeholder brands.
- **No brand page links on the new pages**: `/marcas/{slug}` depends on catalog state and would
  404 for an unpublished brand.
- **Sitemap** lists static pages plus published categories, brands and products (cached with the
  catalog tag, fail-soft to static pages, static-only in fixture mode). **Robots** disallows
  `/admin`, `/api/`, `/cuenta`, `/checkout`, `/carrito`, `/auth/`.

## Validation

- `pnpm check`: PASS — format, typecheck, lint with zero warnings, 158 files / 1854 unit tests,
  production build (guides and software pages prerendered, `revalidate` 5 min).
- `pnpm test:e2e` (fixture mode): 160/160 PASS on the final run. A first run had one failure in
  `global-navigation.spec.ts` L (mobile drawer not yet open when asserted); repeating that spec
  under `--repeat-each=3` passed L and timed out J on `page.goto` under load, and the following
  full run passed. Both are timing-related and outside the files changed here; the React
  hydration warnings in the log come from the home `VideoHero`, also unrelated.
- Visual check in a local fixture preview at 1280 px and 375 px: guide criteria, option cards
  with counts and the sticky aside; support hub cards and warranty columns; firmware caution and
  steps. The three warranty steps were changed to a single column after this review.
- Production was not exercised (development rule: no requests to gamerperu.com).

## Acceptance Criteria

- Ten routes return 200 with real content; every `NAVIGATION_CONFIG` link resolves to a route —
  met (unit coverage test + E2E).
- Guide options open the canonical filtered URL with live counts; empty options hidden — met.
- Software pages list only official destinations, contact fallback otherwise — met.
- `sitemap.xml` and `robots.txt` served, private paths disallowed — met.
- No missing destinations in `menu-entries.ts` — met.

## Deviations / Notes

- The proxy hardening (`e77f7b8`) and the `/admin/products` CPU fix (`7937c42`) were committed
  separately before this GP.
- The mega-menu software tiles reference `/media/mega-menu/software/*.png`, which do not exist in
  the repository (only `.gitkeep`); the tiles link correctly but show their image fallback.

## Risks / Follow-ups

- Production verification of the ten routes, `sitemap.xml` and `robots.txt` after push (owner
  session, single requests).
- Add the official MCHOSE and JINMS software URLs once confirmed with the brands.
- Provide the software tile images or switch those tiles to icons.
- Workers Free CPU limit remains the underlying risk behind Error 1102 (see the proxy fix
  commit); the guide pages add catalog count queries on ISR regeneration.

## Repository Status

Clean after the GP-056 commit; not pushed.

## Final Status

PASS WITH NOTES (production verification pending the push; MCHOSE/JINMS links use the contact
fallback).

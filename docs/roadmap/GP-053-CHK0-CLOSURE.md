# GP-053 CHK0 — Closure Report

## Base Checkpoint

`5ae993e` on `feat/cloudflare-workers` (ADR-012 accepted, GP-053 opened).

## Closure Checkpoint

The CHK0 commit that adds this report on `feat/cloudflare-workers` (not pushed).

## Summary

The storefront home now renders from operator-managed sections (ADR-012) with zero visual
change. Migration `0021_home_sections` creates `home_section_type`, `home_sections` and
`home_section_media`, protects both tables from the Supabase Data API, and seeds the current
home. Every section type has a strict Zod payload schema. A cached reader (`storefront-home`
tag) resolves visible sections and their media, skips invalid rows, and falls back to the
declared defaults when the table is empty, unreadable or entirely invalid, and in E2E fixture
mode.

**The migration has not been applied to any hosted database.** Applying it to production
requires explicit owner authorization (`GAMERPERU_MIGRATION_ENV=hosted`).

## Files Changed

- `src/db/schema/content/home-sections.ts`, `src/db/schema/index.ts` — Drizzle schema.
- `src/db/migrations/0021_home_sections.sql`, `meta/0021_snapshot.json`, `meta/_journal.json` —
  generated offline against the canonical local URL, plus RLS, privilege revocation and seed.
- `src/lib/home/section-schemas.ts` — payload schemas, link/slug/video-id rules, media slots.
- `src/lib/home/default-sections.ts` — the pre-ADR-012 home, used by the seed and the fallback.
- `src/lib/home/read-home-sections.ts` — cached reader and fallback rules.
- `src/components/home/home-sections.tsx` — section renderer; catalog sections load products at
  render time.
- `src/app/(storefront)/page.tsx`, `page.module.css` — page reads the home; visually hidden H1
  when the hero is hidden.
- `src/components/home/{video-hero,home-image,split-showcase,compare-slider,bento-showcase,community-banner}`
  — hero video id and scroll label as props; image `src` may be `null`; banner CTA href prop.
- `src/lib/catalog/story-validation.ts` — exports `SafeString` for reuse.
- `tests/unit/home-sections.test.ts`, `tests/unit/home-video-hero-floating-ui.test.tsx`.

## Decisions

- The seed has **10** rows (nine section types; `catalog_rail` appears twice, for mouses and
  mousepads). ADR-012 "nine sections" refers to the nine types.
- Seed ids are fixed (`01a1c000-0000-7000-8000-0000000000NN`) and equal to the default
  configuration; a unit test asserts the migration seed and `DEFAULT_HOME_SECTIONS` are
  identical.
- Hiding every section is an operator decision and renders an empty home (H1 kept); only an
  empty or fully invalid table falls back to the defaults.
- Images resolve only when the slot is registered in `home_section_media` for that section with
  the same asset id, so content cannot reference media it did not register.
- The hero now reveals the store layer (`#tienda`) instead of `#coleccion`; anchors `coleccion`,
  `mouses` and `mousepads` are kept, with numeric suffixes for repeated sections.
- Missing images no longer request `/images/home/*` (no more 400s); the slot renders the same
  empty surface the failed request produced before.
- Only the YouTube video source exists in schema v1; uploaded video is added in CHK3 as an
  additive union member.

## Validation Performed

- `pnpm check`: Prettier, `tsc`, ESLint `--max-warnings=0`, 1722 unit tests (148 files), build —
  PASS.
- `pnpm test:e2e`: 142/142 PASS (fixture mode, home from defaults, no database reads).
- Migration executed in an isolated PGlite (PostgreSQL in WebAssembly) instance with stub
  `auth.users`, `media_assets` and Supabase roles: 10 seeded rows with dense order; RLS enabled
  on both tables; no grants for `anon`, `authenticated`, `service_role`; rejected a second hero,
  a negative order, non-object content and an unknown type; refused deleting an asset in use;
  cascaded media rows on section delete.
- No hosted Supabase or R2 operation was performed.

## Acceptance Criteria

- Schema and migration match the approved ADR-012 design — met.
- Storefront home renders from the reader with zero visual change — met (E2E home, navigation
  and design-system suites unchanged and green).
- Fail-soft fallback and fixture isolation — met (unit tests).

## Deviations / Notes

- RLS enablement and privilege revocation were added to the migration, following migrations
  `0018`/`0019`; ADR-012 did not list them explicitly.

## Risks / Follow-ups

- Apply `0021` to production only with owner authorization; until then production keeps
  rendering the defaults (empty-table fallback is not reached because the table does not exist:
  the read fails and falls back).
- CHK1 (shared direct upload) is the next checkpoint and requires separate approval.

## Repository Status

Clean after the CHK0 commit; not pushed. CHK1 awaits owner approval.

## Final Status

PASS WITH NOTES (migration not applied to any hosted database, by design).

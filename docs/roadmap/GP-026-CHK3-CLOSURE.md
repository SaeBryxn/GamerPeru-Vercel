# GP-026 CHK3 — Closure

## Status

GP-026 CHK3 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER

## Exact Lineage

- CHK2 closure baseline: `57176c3c8eaa585828300c79b65bdd1d5c239373`
- Original CHK3 candidate: `1d157a49d4fde9dc5064c28271efb194026924a8`
- Approved CHK3-BR1: `f45108a1d2f5faf70ad6409cfd3f36a22b13bdc6`
- Current integrated implementation: `f45108a1d2f5faf70ad6409cfd3f36a22b13bdc6`
- Integration method: exact fast-forward only (`git merge --ff-only`).

The approved CHK3-BR1 implementation was integrated unchanged into `main`. No merge commit, squash, rebase, cherry-pick, amendment, or conflict-resolution rewrite was introduced.

## Delivered CHK3 Authority

CHK3 delivered:

- Structured editors for all 13 canonical Story block types:
  1. `hero_media` (headline, tagline, editorial body, primary image, poster, MP4 video);
  2. `full_bleed_image` (media picker, alt text, caption);
  3. `image_text` (headline, body, media picker, left/right image positioning);
  4. `stat_highlight` (block title, repeatable stat rows with value, label, optional unit, add/reorder/remove);
  5. `spec_feature` (title, description, optional media, optional badge);
  6. `video` (MP4 video picker, poster picker, title, caption);
  7. `gallery` (gallery title, 3 to 6 image items with alt text, caption, add/reorder/remove);
  8. `comparison` (comparison title, 2 to 6 column headers, 1 to 20 rows with synchronized cells, add/reorder/remove, accessible horizontal scroll region);
  9. `dimensions` (length, width, height numeric decimal inputs, blueprint media picker, repeatable grip types with add/reorder/remove);
  10. `box_contents` (block title, repeatable accessory items with title, count, optional media, add/reorder/remove);
  11. `technical_specs` (block title, 1 to 10 spec groups with group name, 1 to 20 specs per group with label and value, add/reorder/remove for groups and nested specs);
  12. `faq` (section title, 1 to 15 question/answer items, add/reorder/remove);
  13. `related_products` (section title, 1 to 10 catalog products selected via server search, no self-reference, duplicate selection disabled, add/reorder/remove).
- Bounded local editor model (`EditorStoryBlock`):
  - discriminated union mapping each block type to its editable payload;
  - temporary invalid/incomplete values safely held in local component state;
  - no fabricated placeholder business content;
  - client-only stable nested IDs (`clientId`) for predictable React keying and focus management;
  - canonical block IDs preserved; fresh UUIDs generated on block duplication;
  - client-only helper IDs stripped before canonical validation and persistence.
- Media picker dialog (`MediaPickerDialog`):
  - accessible modal dialog with focus trapping and return-focus;
  - search/filter by alt text or variant title;
  - strict media-type filtering remains authoritative (`IMAGE` excludes videos, `VIDEO` excludes images);
  - variant attribution context rendered truthfully;
  - `ProductMedia.id` used strictly as browser authoring identity.
- Related products picker dialog (`RelatedProductPickerDialog`):
  - accessible modal dialog with server search via `searchStoryRelatedProductsAction`;
  - active product excluded (no self-reference);
  - already-selected products disabled (`ya está seleccionado`);
  - public eligibility badge rendered truthfully.

## Normalization & Validation Contract

- Save Draft uses one deterministic boundary:
  `EditorStoryBlock[]` -> canonical candidate -> `validateAuthoringStoryDocument(..., { allowEmpty: true })` -> normalized `AuthoringStoryDocument` -> `MutationRequestTracker` fingerprint -> CHK1 `saveProductStoryDraftAction`.
- Canonical normalization guarantees:
  - strings trimmed; empty optional strings omitted;
  - numeric string inputs converted to finite numbers only when canonically valid;
  - invalid numeric strings preserved locally without becoming zero or `NaN`;
  - comparison row widths strictly synchronized with header count;
  - only canonically valid data reaches CHK1.

## BR1 Remediation & Validation UX Contract

CHK3-BR1 resolved three material checkpoint defects:

1. **Validation UX Reachability (Blocker A)**:
   - Canonical validation failure does NOT disable the "Guardar borrador" button.
   - Save button remains disabled only for active async operations (`isSaving`, `isDiscarding`), the 30-block hard limit, or when the document is already clean.
   - When the operator activates Save on an invalid document:
     - runs local canonical normalization;
     - dispatches ZERO Server Actions (`saveProductStoryDraftAction` is never invoked);
     - activates `validationIssues` and displays persistent `ValidationSummary`;
     - renders inline field errors and `aria-invalid="true"` attributes;
     - auto-expands the first invalid block if collapsed;
     - focuses and scrolls the exact first invalid control into view;
     - preserves all local raw/draft values;
     - maintains dirty tracking as `true`;
     - recalculates validation live as the operator edits so corrected fields clear in real time.
2. **Exact Field-Error Path Matching (Blocker B)**:
   - Exported `getExactFieldIssue(issues, relativePayloadPath)` in `story-builder-model.ts`.
   - Replaced all ambiguous substring matching (`.includes()`) across all 13 editors with exact canonical relative path matching.
   - Prevents nested repeater errors (e.g. `items[0].title` or `groups[0].specs[0].value`) from polluting parent fields (e.g. block `.title` or group name).
3. **Comprehensive Browser E2E & Axe Coverage (Blocker C)**:
   - Expanded `tests/e2e/admin-story-builder.spec.ts` to author all 13 canonical Story block types end-to-end through real browser UI controls.
   - Proved row addition, reordering, deletion, field input, validation blockers, correction, Save Draft, reload, and PostgreSQL persistence round-trip.
   - Verified zero WCAG 2.1 A/AA Axe violations across representative complex builder states.

## Remote CI Infrastructure Waiver

- GitHub Actions remains unavailable due to the documented account billing/spending infrastructure condition.
- For the approved CHK3-BR1 SHA `f45108a1d2f5faf70ad6409cfd3f36a22b13bdc6`:
  - no remote workflow run exists;
  - no remote CI PASS is claimed;
  - no code, test, build, or migration failure was observed remotely because no runner executed.
- Classification: `REMOTE CI INFRASTRUCTURE BLOCKED / GP-026 CHK3-SPECIFIC WAIVER`.
- GP-026 CHK3 is closed under the same infrastructure-waiver model used for CHK1 and CHK2, following full local substitute validation against the exact integrated SHA.

## Approved Local Validation Evidence

All required commands exited successfully against exact SHA `f45108a1d2f5faf70ad6409cfd3f36a22b13bdc6`.

The database and Supabase API targets were guarded local endpoints only:

- PostgreSQL: `127.0.0.1:54322/postgres`;
- Supabase API: `127.0.0.1:54321`;
- migration mode: `local`;
- hosted database, hosted Supabase, hosted R2, and production data: untouched.

| Gate                                                                                                    | Result                                                                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Focused CHK3 unit/component (`admin-story-builder.test.tsx`, `admin-story-editors.test.tsx`)            | PASS — 58/58 tests (31 in builder, 27 in editors)                              |
| Focused Story validation/reference (`admin-story-validation.test.ts`, actions, architecture, migration) | PASS — 33/33 tests                                                             |
| Focused CHK3 Admin Playwright E2E (`tests/e2e/admin-story-builder.spec.ts`)                             | PASS — 9/9 tests (24.5s) covering all 13 block editors                         |
| Focused CHK3 Axe accessibility audit (WCAG 2.1 A/AA)                                                    | PASS — zero violations across tested complex states                            |
| Admin live integration (`pnpm test:admin:live`)                                                         | PASS — 11 files, 263 tests                                                     |
| Story migration integration (`admin-story-migration.test.ts`)                                           | PASS — 12/12 tests                                                             |
| Story lifecycle integration (`admin-story-lifecycle.test.ts`)                                           | PASS — 32/32 tests                                                             |
| `pnpm format:check`                                                                                     | PASS — all matched files use Prettier style                                    |
| `pnpm typecheck`                                                                                        | PASS — zero TypeScript errors                                                  |
| `pnpm lint`                                                                                             | PASS — zero ESLint warnings/errors                                             |
| `pnpm test` (vitest unit suite)                                                                         | PASS — 121 files, 1,509 tests                                                  |
| `pnpm build` (Next.js Turbopack production build)                                                       | PASS — compiled successfully                                                   |
| `pnpm check`                                                                                            | PASS — format, typecheck, lint, 121 files/1,509 tests, and build               |
| Canonical full E2E (`pnpm test:e2e`)                                                                    | PASS — 146/146 tests (49.1s, intentionally excludes admin story builder suite) |
| `git diff --check`                                                                                      | PASS — zero whitespace issues                                                  |
| Pre-closure `git status --short`                                                                        | PASS — clean                                                                   |
| Schema delta                                                                                            | ZERO                                                                           |
| Migration delta                                                                                         | ZERO                                                                           |
| Hosted-services delta                                                                                   | ZERO                                                                           |

## Strict Checkpoint Boundaries

CHK3 does NOT include:

- Preview route / button (CHK4);
- ProductStoryRenderer Admin preview (CHK4);
- Publish button / UI (CHK4);
- Unpublish button / UI (CHK4);
- `catalog:publish` UX (CHK4);
- public PDP mutation UX (CHK4);
- storefront presentation redesign;
- AI Story generation.

- CHK4: NOT STARTED
- GP-026A: CANCELLED / SUPERSEDED / HISTORICAL / NON-AUTHORITATIVE

## Scope Confirmations

- Production implementation delta after approved BR1 integration: ZERO.
- Test-code delta after approved BR1 integration: ZERO.
- Schema delta after approved BR1 integration: ZERO.
- Migration delta after approved BR1 integration: ZERO.
- Hosted-production-services delta: ZERO.
- Migrations 0000–0014: UNCHANGED.
- The closure operation adds documentation only. It does not modify runtime behavior, tests, schema, migrations, migration metadata, hosted configuration, or hosted services.

## Final Classification

GP-026 CHK3 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER

# GP-026 CHK4 — Closure

## Status

GP-026 CHK4 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER

## Exact Lineage

- CHK3 corrected closure baseline: `2a9299e3b42d15c089294a9c26c404a8388dc39f`
- Original CHK4 candidate: `db66fa08b7864a954848652dfa0ab25c05ce0ce0`
- Approved CHK4-BR1: `8bca30a129653a585a1e402d58435ca2a3f947cd`
- Approved CHK4-BR2: `4f4211ff1820f3ef1038edb9ee5c0adf08bcabe9`
- Integrated implementation: `4f4211ff1820f3ef1038edb9ee5c0adf08bcabe9`
- Integration method: exact fast-forward only (`git merge --ff-only`).

The externally approved CHK4 lineage was integrated unchanged into `main`. No merge commit, squash, rebase, cherry-pick, amendment, conflict-resolution rewrite, or implementation change was introduced.

## Protected Saved-Draft Preview Contract

CHK4 delivered the protected, server-rendered Preview route:

`/admin/products/[productId]/story/preview?revision=<draftRevisionId>`

The route requires server-enforced `catalog:manage` and independently verifies:

- the Product route parameter is a valid UUID;
- an explicit `revision` query parameter is present;
- the requested revision is a valid UUID;
- the Product exists;
- the Story aggregate exists;
- the requested revision equals the aggregate's current `draft_revision_id`;
- the requested revision belongs to the same Product;
- the requested revision status is `DRAFT`.

The route fails closed for missing, malformed, stale, superseded, published, archived, and cross-Product revisions. The revision selector is never authorization.

## Preview Validation & Rendering Contract

The Preview path is frozen as:

`saved DB draft` -> `validatePersistedStoryDocument(..., { allowEmpty: true })` -> current persisted reference validation -> explicit empty-draft branch -> `validateStoryBlocks(...)` -> complete public projection requirement -> `ProductStoryRenderer`.

- Preview reuses the canonical public Story renderer; no second Admin renderer exists.
- Partial invalid Story projections are rejected.
- A valid empty saved draft renders a private empty state.
- Related Product hydration reuses the public reader path.
- `relatedProductsMap` is keyed by Product slug, matching persisted `productSlugs` behavior.
- Unavailable or non-public related Products fail closed under public-reader eligibility rather than an Admin-only card model.

## Preview Privacy & SEO Contract

- `dynamic = "force-dynamic"`.
- `revalidate = 0`.
- Robots: `noindex`, `nofollow`.
- Preview emits no `ProductJsonLd`, FAQPage JSON-LD, or public canonical Story metadata.
- Draft content remains private and absent from the public PDP until Publish succeeds.

## Publish Authority & UX Contract

- CHK4 does not implement a second publication engine.
- Publish calls `publishProductStoryAction(...)`, which delegates to the frozen CHK1 publication service.
- `catalog:publish` remains server-enforced; client `canPublish` is convenience UX only and defaults fail-closed.
- Publish submits the exact `productId`, `expectedDraftRevisionId`, `expectedPublishedRevisionId`, and `mutationRequestId`.
- There is no "publish latest" behavior.
- Publish requires a durable current draft, a clean local editor, at least one saved Story block, a canonically valid normalized document, no stale conflict, no unresolved mutation ambiguity, and accessible confirmation.
- Successful Publish promotes the exact draft, clears the draft pointer, updates the published pointer, retains the canonical editor document and saved baseline, and leaves dirty state false.
- Subsequent editing starts from the published Story; the next Save creates a new draft over the current published revision.

## Persisted-to-Authoring Validation Adapter

The presentation-only error-path adapter uses exact known token mappings:

| Persisted token     | Authoring token    |
| ------------------- | ------------------ |
| `mediaKey`          | `mediaId`          |
| `posterKey`         | `posterMediaId`    |
| `videoKey`          | `videoMediaId`     |
| `blueprintMediaKey` | `blueprintMediaId` |
| `productSlugs`      | `productIds`       |

Mapping is token-exact. Unknown paths are not guessed, and CHK1 server validation paths remain unchanged.

## Unpublish Authority & State Preservation

- Unpublish calls `unpublishProductStoryAction(...)` using exact expected pointers and a dedicated `mutationRequestId`.
- Unpublish archives the current published revision, clears the public published pointer, and never hard-deletes Story history.

For `DRAFT_OVER_PUBLISHED` (`draft = D`, `published = P`), successful Unpublish preserves draft D, its revision number, the canonical saved baseline, the local editor document, and dirty state exactly. Only published-pointer metadata is cleared, lifecycle becomes `DRAFT_ONLY`, and no replacement draft is created.

For `PUBLISHED_ONLY` (`draft = null`, `published = P`), successful Unpublish preserves the displayed Story document locally, then sets both durable pointers to null, lifecycle to `NO_STORY`, and saved baseline to an empty document. Non-empty preserved content becomes unsaved local work (`dirty = true`). The operator may explicitly Save Draft; Unpublish never creates one automatically.

## Durable Mutation Ambiguity Contract

Publish and Unpublish use dedicated `MutationRequestTracker` instances and preserve the response classes `SUCCESS`, `DEFINITIVE_FAILURE`, and `AMBIGUOUS_FAILURE`.

After an unknown or ambiguous response:

- tracker identity remains active;
- retry of the exact operation reuses the same `mutationRequestId`;
- authoritative success/replay or definitive failure completes the tracker;
- local editing does not clear Publish/Unpublish ambiguity;
- competing durable mutations remain blocked.

Calling `router.refresh()` is not equivalent to accepting authoritative state. When ambiguity requests a reload, ambiguity and tracker identity remain active, exact retry remains possible, and competing durable mutations remain blocked. Only acceptance of refreshed `initialStory` by the authoritative rehydration path may replace the document, baseline, and durable pointers; complete mutation trackers; and clear ambiguous Save, Publish, and Unpublish state. If refresh fails or authoritative props never arrive, uncertainty remains unresolved.

## Approved Browser Evidence

### Stale Publish Protection

The approved two-context browser scenario proved:

- Context A opened draft X;
- Context B saved replacement draft Y;
- Context A's attempt to Publish X produced `STORY_STALE_WRITE` UX;
- X was not published;
- Y remained the current draft;
- the published pointer remained unchanged;
- Context A's local content remained intact;
- authoritative reload was offered;
- Y was never auto-published.

### Old Public / New Private Parity

For published revision P containing the OLD Story and draft revision D containing the NEW Story:

- before Publish, the public PDP showed OLD and not NEW;
- Admin Preview D showed NEW and did not substitute OLD;
- after Publish D, the public PDP showed NEW and not OLD;
- `published_revision_id = D` and `draft_revision_id = null`;
- P became `ARCHIVED` and D became `PUBLISHED`.

### PDP & FAQ SEO Parity

- Saved drafts remain private.
- Published Story content reaches the public PDP through the existing reader and renderer.
- Published FAQ blocks project to the existing FAQPage structured data.
- Unpublish removes Story content and Story-derived FAQPage data from the PDP.
- Preview never emits public Product or FAQ JSON-LD.
- Story authoring does not replace product title, canonical, meta description, Open Graph, or Product/Offer/Breadcrumb structured-data ownership.

### Accessibility & Responsive Evidence

Focused browser evidence covered protected Preview, Publish and Unpublish confirmation dialogs, keyboard cancellation, trigger focus restoration, Story Builder controls, 360px layout, canonical Comparison contained scrolling, and absence of document-level horizontal overflow. Tested CHK4 states reported zero WCAG 2.1 A/AA Axe violations.

## Test Harness Classification

- `playwright.admin.config.ts` is the dedicated Admin suite and uses guarded local PostgreSQL/Supabase for the dedicated Admin specifications.
- `pnpm test:admin:e2e` remains the authoritative Admin E2E command.
- `pnpm test:e2e` remains the canonical non-Admin Storefront regression suite.
- Their test counts are intentionally separate; exclusion from the general configuration does not remove Admin execution.

## Remote CI Infrastructure Waiver

Independent external verification of approved SHA `4f4211ff1820f3ef1038edb9ee5c0adf08bcabe9` found zero commit status checks and zero workflow runs.

- No GitHub Actions PASS is claimed.
- No remote Catalog Gate PASS is claimed.
- No remote CI success is claimed.
- No workflow, implementation, or empty trigger commit was introduced to work around the account billing/spending condition.
- Classification: `REMOTE CI INFRASTRUCTURE BLOCKED / GP-026 CI INFRASTRUCTURE WAIVER`.

## Approved Local Substitute Evidence

All evidence below is local substitute evidence against the approved CHK4-BR2 implementation, not remote GitHub Actions evidence.

| Gate                                      | Result                        |
| ----------------------------------------- | ----------------------------- |
| Focused Story Builder                     | PASS — 47 tests               |
| Focused CHK4/Story unit group             | PASS — 176 tests              |
| Dedicated Admin E2E                       | PASS — 63 tests               |
| Admin live integration                    | PASS — 263 tests              |
| Story lifecycle integration               | PASS — 32 tests               |
| Story migration integration               | PASS — 12 tests               |
| `pnpm format:check`                       | PASS                          |
| `pnpm typecheck`                          | PASS                          |
| `pnpm lint`                               | PASS — zero warnings/errors   |
| Vitest through `pnpm check`               | PASS — 122 files, 1,537 tests |
| Next.js production build                  | PASS                          |
| `pnpm check`                              | PASS                          |
| Canonical non-Admin E2E (`pnpm test:e2e`) | PASS — 142 tests              |
| `git diff --check`                        | PASS                          |
| Approved implementation working tree      | CLEAN                         |
| Schema delta                              | ZERO                          |
| Migration and migration-metadata delta    | ZERO                          |
| Hosted Supabase/database delta            | ZERO                          |
| R2 write delta                            | ZERO                          |

## Strict Closure Boundaries

- The closure operation adds this documentation file only.
- Runtime code, tests, public assets, package manifests, lockfile, Playwright configuration, schema, migrations, migration metadata, hosted configuration, hosted services, and R2 behavior remain unchanged by the closure commit.
- GP-026 CHK5 was not started.
- GP-026A remains CANCELLED / SUPERSEDED / HISTORICAL / NON-AUTHORITATIVE.

## Final Classification

GP-026 CHK4 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER

# GP-026 — Final Closure Candidate

## Status

PENDING EXTERNAL REVIEW

## Verdict

PASS WITH CI INFRASTRUCTURE WAIVER, conditional only on the CHK5 candidate's remote workflow
repeating the established failure-before-runner-allocation condition. All canonical local gates
pass. This document does not claim that GP-026 is externally approved or closed.

## Exact Baseline and Candidate Boundary

- Authorized `origin/main` baseline: `f1bcb664f265484ed73065319e4674bbc79aee49`.
- Pre-GP-026 comparison baseline: `672222b098aff8713be902ef2173f9c13e761e35`.
- CHK5 branch: `audit/gp026-chk5`.
- The immutable CHK5 candidate SHA is intentionally reported only after commit and publication.
- Candidate files:
  - `docs/roadmap/GP-026.md`;
  - `docs/roadmap/GP-026-CLOSURE.md`;
  - `scripts/test/seed-admin-e2e.mjs`;
  - `scripts/test/cleanup-admin-e2e.mjs`.
- Production/runtime code delta: ZERO.
- Test tooling delta: the deterministic Admin E2E seed and cleanup scripts only.
- Schema, migration, migration metadata, package, lockfile, workflow, public asset, and hosted
  service deltas: ZERO.

## Approved CHK0–CHK4 Lineage

The exact integrated lineage from the discovery baseline is:

```text
672222b098aff8713be902ef2173f9c13e761e35  pre-GP-026 discovery baseline
aa4d3c2e844e10ded53e77bd46ec3f157dcc3f57  original CHK0 candidate
690874d51e803b8bf3ee42a2aa0fc2ef889fa3f1  approved CHK0-BR1 remediation
6d6ccb5d981f159f26e6c10eb19a9ed961315557  CHK0 closure
95480db88c25791d62afc7ef2751b706bd0b124b  original CHK1 candidate
ba6aaf1779661bb424342761540e2669e5221a99  approved CHK1-BR1 remediation
f270b86a16e36385940ec8b0f4b0bc8f269db676  CHK1 closure
801f1b1827e80c4b038edea6ee6e0225b31c5b1b  original CHK2 candidate
3cd2589b7e680f7301c9511005d83194656f39b5  approved CHK2-BR1 remediation
57176c3c8eaa585828300c79b65bdd1d5c239373  CHK2 closure
1d157a49d4fde9dc5064c28271efb194026924a8  original CHK3 candidate
f45108a1d2f5faf70ad6409cfd3f36a22b13bdc6  approved CHK3-BR1 remediation
aaa1c2795bdf5206962f0bcab3f8beb65fe24216  original CHK3 closure
2a9299e3b42d15c089294a9c26c404a8388dc39f  corrected CHK3 closure
db66fa08b7864a954848652dfa0ab25c05ce0ce0  original CHK4 candidate
8bca30a129653a585a1e402d58435ca2a3f947cd  approved CHK4-BR1 remediation
4f4211ff1820f3ef1038edb9ee5c0adf08bcabe9  approved CHK4-BR2 remediation
f1bcb664f265484ed73065319e4674bbc79aee49  CHK4 closure / CHK5 baseline
```

Original and intermediate candidates remain historical evidence; only their explicitly approved
remediations and closures are authoritative. No rejected candidate is represented as approved.

## Final Architecture Summary

The integrated implementation matches the frozen GP-026 contract:

- Exactly 13 canonical Story block types exist: `hero_media`, `full_bleed_image`, `image_text`,
  `stat_highlight`, `spec_feature`, `video`, `gallery`, `comparison`, `dimensions`,
  `box_contents`, `technical_specs`, `faq`, and `related_products`.
- A Story document contains at most 30 blocks and accepts no arbitrary HTML, Markdown, or custom
  code execution path.
- Revisions are immutable document snapshots. The aggregate owns distinct active draft and
  published pointers, both constrained to the same Product.
- Partial unique indexes permit at most one active `DRAFT` and one active `PUBLISHED` revision per
  Product.
- The public PDP reads only the active published pointer. Preview reads only the exact current,
  durably saved draft.
- `ProductStoryRenderer` remains the single canonical public and Preview presentation layer.
- Browser authoring selects `ProductMedia.id`; the server resolves ownership and eligibility and
  persists only the safe immutable media key.
- Related Product authoring uses Product identity and persists the canonical public slug after
  server validation.
- `catalog:manage` protects authoring and Preview; `catalog:publish` protects Publish and
  Unpublish. Identity, role, permissions, and ownership are server-derived and fail closed.

## Persistence and Lifecycle

### Save and Discard

- Save validates and normalizes the complete authoring document, archives the exact prior active
  draft, inserts a new immutable draft revision, and updates the aggregate pointer atomically.
- Revision numbers increase monotonically.
- Discard archives the exact active draft and clears the draft pointer atomically without
  modifying the published revision.
- Empty Story documents remain valid saved drafts where the contract permits them.
- No Story lifecycle path hard-deletes revisions.

### Publish and Unpublish

- Publish promotes the exact expected current draft, archives the prior published revision when
  present, clears the draft pointer, and updates the published pointer atomically.
- There is no "publish latest" shortcut.
- Unpublish archives the exact current published revision and clears the published pointer.
- `DRAFT_OVER_PUBLISHED` preserves its draft through Unpublish.
- `PUBLISHED_ONLY` preserves the displayed document as unsaved local work after Unpublish; it does
  not fabricate a replacement draft.

### Idempotency, concurrency, and stale handling

- Actor-scoped mutation digests, canonical request fingerprints, transaction-scoped advisory
  locks, and durable `audit_events` markers enforce replay fidelity.
- Same request ID and same fingerprint replays the committed result before stale evaluation.
- Same request ID and a different fingerprint fails closed as an idempotency conflict.
- Concurrent identical requests serialize to one durable lifecycle transition.
- Optimistic expected pointers reject stale Save, Discard, Publish, and Unpublish operations.
- Ambiguous post-commit retries retain mutation identity until authoritative server state is
  accepted, preventing duplicate transitions.
- Transaction failures roll back revision, pointer, status, timestamp, and audit changes.

## Preview, Public Rendering, and SEO

- Preview is an authenticated `catalog:manage` route requiring an explicit current saved draft
  revision belonging to the route Product.
- Missing, malformed, stale, superseded, published, archived, and cross-Product revisions fail
  closed.
- Preview is force-dynamic, no-store, `noindex`, and `nofollow`; it emits neither Product nor
  FAQPage JSON-LD.
- Draft content is absent from the public PDP, sitemap, canonical metadata, Open Graph data, and
  public structured data.
- Published Story content appears only through the published pointer and introduces no additional
  `h1`.
- Published `faq` content projects to matching FAQPage JSON-LD; Unpublish removes both the Story
  and Story-derived FAQPage data.
- Product title, canonical, description, Open Graph, Product/Offer, and Breadcrumb ownership stay
  with the existing PDP SEO path.
- Related Product cards resolve to valid canonical public product routes.

## Security Review

- Unauthenticated and unauthorized Builder, Preview, Server Action, Publish, and Unpublish paths
  fail closed under server-derived RBAC.
- Cross-Product draft, published, media, and related-Product identities are rejected, as are
  malformed UUIDs and stale or historical Preview revisions.
- Unknown discriminators, unknown envelope/payload keys, script-like/raw HTML input, invalid
  numeric bounds, and invalid array bounds are rejected by strict validation.
- Private media, documents, unsupported MIME types, and cross-Product media are rejected.
- Browser DTOs expose neither raw object keys nor storage credentials or upload authority.
- Story-facing responses and logs do not expose SQL, table names, stack traces, raw object keys,
  credentials, auth/session secrets, raw mutation request IDs, or actor-private data.

## Accessibility, Responsive, and Visual Evidence

- Dedicated Admin E2E and Story Builder coverage reported zero WCAG 2.1 A/AA Axe violations for
  representative populated Builder, validation, selector, confirmation, Preview, and published PDP
  states.
- Keyboard and focus behavior passed for adding, ordering, duplicating, deleting, nested editing,
  Save, Discard, Preview, Publish, Unpublish, dialog Escape/cancel, focus restoration, and
  validation-summary navigation.
- Reduced-motion rendering remains intact.
- Browser evidence at 360 px, 390 px, and 1440 px showed no document-level horizontal overflow;
  comparison overflow stays within its labelled region, dialogs fit, controls remain reachable,
  and required operational targets remain usable.
- Ten deterministic, temporary screenshots covered heterogeneous Builder content, both selector
  dialogs, private Preview, published PDP, FAQ, Comparison, media-heavy Story, and desktop/mobile
  layouts. They showed no spacing, typography, clipping, media aspect-ratio, duplicate-heading,
  inherited-Admin-style, or Preview/public-renderer divergence defect.
- Screenshot binaries were kept outside the repository and are not part of this candidate.
- The final Impeccable static detector returned no findings for the audited Builder, selectors,
  Preview, and renderer files.

## Performance Evidence

The same machine, Chromium runtime, product, media interception, reduced-motion setting, and
production-mode configuration were used for three desktop and three mobile-emulated runs per
revision.

| Evidence                 | `672222b…` baseline | CHK5 baseline/candidate | Result                         |
| ------------------------ | ------------------: | ----------------------: | ------------------------------ |
| Median desktop LCP       |              152 ms |                  176 ms | +24 ms; no material regression |
| Median mobile LCP        |              120 ms |                  140 ms | +20 ms; no material regression |
| Median desktop resources |                  50 |                      50 | unchanged                      |
| Median mobile resources  |                  38 |                      38 | unchanged                      |
| Median desktop transfer  |           376,718 B |               377,119 B | +401 B / +0.11%                |
| Median mobile transfer   |           367,570 B |               367,990 B | +420 B / +0.11%                |
| PDP entry JavaScript     |           178,907 B |               178,971 B | +64 B / +0.04%                 |
| Desktop document width   |    1,440 / 1,440 px |        1,440 / 1,440 px | no overflow                    |
| Mobile document width    |        393 / 393 px |            393 / 393 px | no overflow                    |

The first run in each group was retained rather than discarded. Median values avoid presenting a
single warm-up result as authoritative. The small LCP movement is low in absolute terms and is not
accompanied by a resource-count or meaningful transfer/bundle increase.

Static comparison found no change between the pre-GP-026 and CHK5 PDP page/reader/query files.
The public path still performs one Story revision read and one deduplicated related-Product
hydration operation, with no per-block SQL, per-keystroke public request, client-side Story fetch,
public mutation action, Admin Builder dependency, Preview dependency, or duplicate renderer.

Across every route, build artifacts grew by 197,410 JavaScript bytes (+9.38%) and 36,316 CSS bytes
(+10.95%), primarily reflecting the authorized Admin feature. The public PDP's route entry grew by
only 64 bytes. Its client references remain the existing ambient-video and video-player components;
the renderer itself remains server-rendered.

Performance verdict: PASS — no repeatable material or unexplained public regression.

## Operational and Data Integrity Evidence

- Disposable local Supabase/PostgreSQL only:
  - PostgreSQL `127.0.0.1:54322/postgres`;
  - Supabase API `127.0.0.1:54321`.
- A clean local database reset completed and canonical `pnpm db:migrate` applied all 15 migration
  records (`0000` through `0014`). Migration `0015` is absent.
- Final integrity checks reported zero orphan draft/published pointers, cross-Product pointers,
  identical active pointers, status mismatches, duplicate active drafts/published revisions, and
  invalid Story audit replay markers.
- No hosted Supabase, hosted PostgreSQL, production data, Cloudflare R2 object, or hosted
  configuration was read or mutated for the validation workflow.

## CHK5 Hardening Deviations

Two genuine test-environment defects prevented a fresh disposable database from reproducing the
complete required Admin E2E suite:

1. The Admin seed used an inventory-location foreign key owned by another fixture set and did not
   create the two public Related Product records its Story Builder scenario searches for. The seed
   now owns a deterministic local location and two deterministic published products with active
   variants.
2. Admin cleanup deleted Story aggregates/revisions but left scoped Story replay audit markers.
   Cleanup now deletes only `product_story_revision` markers for the four fixed Admin fixture
   Product IDs before removing those fixtures, and removes the owned inventory location.

These corrections are limited to deterministic test tooling. They introduce no production/runtime,
schema, migration, media, package, or hosted-service change. After remediation, a fresh reset,
migration, full Admin E2E run, cleanup, and integrity audit all passed.

## Complete Validation Table

| Gate                                 | Result                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Architecture freeze audit            | PASS — all frozen lifecycle, identity, RBAC, renderer, and content-safety invariants confirmed |
| 13-block registry / 30-block cap     | PASS — exactly 13 canonical types and maximum 30                                               |
| Focused Story unit/component group   | PASS — 10 files, 200/200 tests                                                                 |
| Story migration integration          | PASS — 12/12 tests                                                                             |
| Story lifecycle integration          | PASS — 32/32 tests                                                                             |
| `pnpm test:admin:live`               | PASS — 11 files, 263/263 tests                                                                 |
| `pnpm test:admin:e2e`                | PASS — 63/63 tests                                                                             |
| Admin foundation                     | PASS — 15 tests                                                                                |
| Admin Product Manager                | PASS — 27 tests                                                                                |
| Admin AI Product Assistant           | PASS — 4 tests                                                                                 |
| Admin Story Builder                  | PASS — 17 tests                                                                                |
| Focused previously failing Story E2E | PASS — 1/1 test after fresh reset                                                              |
| Canonical Storefront E2E             | PASS — 142/142 tests on complete one-worker rerun                                              |
| Story Builder / published PDP Axe    | PASS — zero WCAG 2.1 A/AA violations in tested states                                          |
| Visual evidence                      | PASS — ten deterministic desktop/mobile screenshots manually inspected                         |
| Performance comparison               | PASS — no material public regression                                                           |
| `pnpm format:check`                  | PASS                                                                                           |
| `pnpm typecheck`                     | PASS                                                                                           |
| `pnpm lint`                          | PASS — zero warnings/errors                                                                    |
| `pnpm test`                          | PASS — 122 files, 1,537/1,537 tests                                                            |
| `pnpm build`                         | PASS — Next.js 16.3.1 production build                                                         |
| `pnpm check`                         | PASS — format, typecheck, lint, unit tests, and production build                               |
| `pnpm ignored-builds`                | PASS — `@google/genai` remains explicitly allowlisted; no unexpected ignored build             |
| `git diff --check`                   | PASS                                                                                           |

The first full Storefront run produced 139 passes and three navigation timeouts under 12-worker dev
load. The exact three tests passed 3/3 in isolation, then the complete canonical suite passed
142/142 with one worker. This is classified as local parallel runner instability, not a product
failure. An initial Admin live worker exit also had no assertion failure; the exact complete rerun
passed 263/263.

## GitHub Actions and Infrastructure Waiver

The last integrated CHK4 implementation produced GitHub Actions run `35167047894` on
`4f4211ff1820f3ef1038edb9ee5c0adf08bcabe9`. Light CI failed before runner allocation with an empty
`runner_name` and zero steps; Catalog Gate and Full Gate were skipped. That is infrastructure
failure, not executed code/test failure.

At this document freeze, the CHK5 commit does not yet exist and therefore has no candidate-specific
run to inspect. No remote CI PASS is claimed. After publication, the immutable candidate SHA, run
ID, runner allocation, executed steps, and conclusion must be reported externally. A genuine
executed code/test failure blocks closure and cannot use the waiver. If the candidate again fails
before allocation with zero steps, classify it as:

`REMOTE CI INFRASTRUCTURE BLOCKED / PASS WITH CI INFRASTRUCTURE WAIVER`.

## Documentation Drift Audit

`GP-026.md`, the frozen contract, and all CHK0–CHK4 closure reports were compared against the
integrated implementation. Migrations, block inventory, permissions, Save/Discard,
Publish/Unpublish, Preview, media identity, Related Product identity, replay/idempotency, renderer,
and accepted CI-waiver language remain consistent. Historical rejected/remediated candidates stay
identified as historical evidence. No architectural documentation contradiction remains.

## Residual Risks and Follow-ups

- GitHub Actions remains subject to the account-level runner allocation/billing condition. This is
  the only allowed unresolved CHK5 condition if the candidate reproduces the same zero-step state.
- Dedicated future roadmap gates GP-036+, GP-043, GP-044, GP-045, GP-046, GP-047, and GP-048 remain
  responsible for their broader SEO, security, performance, accessibility, responsive, and commerce
  hardening scopes.
- This closure does not authorize AI-generated Story content, public preview tokens, new block
  types, a second renderer, media upload/transcoding, or a storefront redesign.
- GP-027 remains NOT AUTHORIZED and was not started.

## Repository and Authority Status

- Candidate scope is intentional and limited to the four files listed above.
- Temporary screenshots, performance harnesses, and baseline worktree artifacts are not tracked.
- Final repository cleanliness and remote SHA equality are reported after commit and publication.
- GP-026A remains `CANCELLED / SUPERSEDED / HISTORICAL / NON-AUTHORITATIVE`.
- GP-026 remains pending external review; this candidate does not declare it closed.

## Final Candidate Classification

GP-026 CHK5 FULL INTEGRATED REGRESSION / FINAL CLOSURE CANDIDATE / PENDING EXTERNAL APPROVAL / READY FOR EXTERNAL VERIFICATION

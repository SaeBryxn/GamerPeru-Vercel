# GP-026 CHK1 — Closure

## Status

GP-026 CHK1 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER

## Exact Lineage

- CHK0 closure baseline: `6d6ccb5d981f159f26e6c10eb19a9ed961315557`
- Original CHK1: `95480db88c25791d62afc7ef2751b706bd0b124b`
- Externally approved BR1: `ba6aaf1779661bb424342761540e2669e5221a99`
- Current integrated implementation: `ba6aaf1779661bb424342761540e2669e5221a99`
- Integration method: exact fast-forward only.

The approved BR1 was integrated unchanged. No merge commit, squash, rebase, cherry-pick,
amendment, or conflict-resolution change was introduced.

## Delivered CHK1 Authority

CHK1 delivered:

- additive migration `0014_steep_skreet.sql`;
- nullable `product_stories.draft_revision_id`;
- same-Product Story pointer constraints;
- a distinct draft/published pointer check;
- one active DRAFT per Product partial unique index;
- one active PUBLISHED per Product partial unique index;
- fail-closed legacy-data preflights, including
  `GP026_CHK1_PREFLIGHT_ORPHAN_PUBLISHED_REVISION`;
- no automatic adoption of orphan PUBLISHED revisions;
- no automatic `published_revision_id` backfill;
- no arbitrary archival of legacy orphan publication data;
- immutable Story document revisions;
- archive-old-DRAFT-before-replacement sequencing;
- optimistic expected-pointer concurrency;
- strict 13-block authoring validation;
- a side-effect-free Admin Story reader and DTO;
- atomic Save Draft;
- atomic Discard Draft;
- atomic Publish;
- atomic Unpublish;
- durable replay and idempotency;
- `StoryLifecycleIntegrityError` protection against orphan or mismatched PUBLISHED state;
- the `catalog:manage` authoring boundary;
- the `catalog:publish` publication boundary;
- fail-closed, server-derived authorization;
- ProductMedia ownership validation;
- PUBLIC_MEDIA enforcement;
- canonical `MediaAsset.objectKey` persistence;
- related-Product validation;
- thin Server Actions; and
- transaction rollback and fault-injection coverage.

Migration 0014 does not adopt orphan PUBLISHED revisions, automatically backfill
`published_revision_id`, arbitrarily archive orphan publication data, or modify migrations
0000–0013.

## Remote CI Infrastructure Waiver

- Automatic GitHub Actions run ID: `35025929837`.
- Intended SHA: `ba6aaf1779661bb424342761540e2669e5221a99`.
- Workflow conclusion: `FAILURE`.
- Light CI job ID: `104572836637`.
- The Light CI job started no workflow steps and received no runner allocation.
- GitHub blocked execution before runner allocation because recent account payments failed or
  the Actions spending limit needed to be increased.
- The remote failure is an infrastructure/account failure before repository code execution. It
  is not evidence of a code, test, build, or migration failure.
- Catalog Gate was not dispatched after the failed Light CI, following the approved stop rule.
- GitHub Actions is not classified as PASS, and Catalog Gate is not classified as PASS.
- Remote CI was unavailable for infrastructure/account reasons.
- This checkpoint was closed only after the full local Catalog-equivalent substitute gate passed
  against the exact already-integrated SHA.

Classification: INFRASTRUCTURE FAILURE BEFORE RUNNER EXECUTION / REMOTE CI INFRASTRUCTURE
BLOCKED / GP-026 CHK1-SPECIFIC WAIVER.

## Local Catalog-Equivalent Substitute Evidence

All required commands below exited successfully against
`ba6aaf1779661bb424342761540e2669e5221a99`.

The database and Supabase API targets were guarded local endpoints only:

- PostgreSQL: `127.0.0.1:54322/postgres`;
- Supabase API: `127.0.0.1:54321`;
- migration mode: `local`;
- hosted database, hosted Supabase, hosted R2, and production data: untouched.

| Gate                             | Result                                                           |
| -------------------------------- | ---------------------------------------------------------------- |
| Local Supabase startup           | PASS                                                             |
| Local PostgreSQL connectivity    | PASS                                                             |
| `pnpm db:migrate`                | PASS — canonical migration flow completed successfully           |
| `pnpm format:check`              | PASS                                                             |
| `pnpm typecheck`                 | PASS                                                             |
| `pnpm lint`                      | PASS — zero ESLint failures or warnings                          |
| `pnpm test`                      | PASS — 119 files, 1,448 tests, 0 failed, 0 skipped               |
| `pnpm build`                     | PASS — Next.js production build completed                        |
| `pnpm check`                     | PASS — format, typecheck, lint, 119 files/1,448 tests, and build |
| Focused GP-026 Story unit suites | PASS — 4 files, 30 tests, 0 failed, 0 skipped                    |
| Story migration live suite       | PASS — 1 file, 12 tests, 0 failed, 0 skipped                     |
| Story lifecycle live suite       | PASS — 1 file, 32 tests, 0 failed, 0 skipped                     |
| `pnpm test:admin:live`           | PASS — 11 files, 263 tests, 0 failed, 0 skipped                  |
| Deterministic Admin E2E seed     | PASS                                                             |
| `pnpm test:admin:e2e`            | PASS — 46 tests, 0 failed, 0 skipped                             |
| Deterministic Admin E2E cleanup  | PASS                                                             |
| `git diff --check`               | PASS                                                             |
| Pre-closure `git status --short` | PASS — clean                                                     |

The Story migration suite verified clean compatible application of migration 0014 and the
approved migration invariants: legacy backfill, cross-Product and invalid-status pointer
rejection, null `published_at` rejection, duplicate active DRAFT/PUBLISHED rejection, both orphan
PUBLISHED preflights, authoritative published-pointer preservation, partial unique indexes,
same-Product pointer constraints, and Product cascade behavior.

The Story lifecycle suite verified Save Draft, successive immutable drafts, first-save and later
save concurrency, stale protection, replay, idempotency conflict, replay-integrity failure,
Discard, Publish, Unpublish, orphan/mismatched PUBLISHED defense, media and related-Product
validation, RBAC, and transaction rollback/fault injection.

## Full Storefront E2E Historical Classification

The previously executed full storefront E2E run remains classified as:

NOT CLEAN / ONE UNRELATED GP-025 TIMEOUT / ISOLATED RETRY PASS

That historical run produced 145 passes and one unrelated GP-025 timeout under parallel load; the
isolated rerun passed. It is not represented as a full E2E PASS. A new full storefront run was not
required for this CHK1 infrastructure-waiver closure.

## Scope Confirmations

- Production implementation delta after approved BR1 integration: ZERO.
- Test-code delta after approved BR1 integration: ZERO.
- Schema delta after approved BR1 integration: ZERO.
- Migration delta after approved BR1 integration: ZERO.
- Hosted-production-services delta: ZERO.
- Migrations 0000–0013: UNCHANGED.
- GP-026 CHK2: NOT STARTED.
- GP-026 CHK3: NOT STARTED.
- GP-026 CHK4: NOT STARTED.
- GP-026A: CANCELLED / SUPERSEDED / HISTORICAL / NON-AUTHORITATIVE.

The closure operation adds documentation only. It does not modify runtime behavior, tests,
schema, migrations, migration metadata, hosted configuration, or hosted services.

## Final Classification

GP-026 CHK1 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER

# GP-026 CHK0 --- Contract Freeze Closure Report

## Base Checkpoint

- **Canonical discovery baseline:** `672222b098aff8713be902ef2173f9c13e761e35`
- **Original CHK0 candidate:** `aa4d3c2e844e10ded53e77bd46ec3f157dcc3f57`
- **Externally approved CHK0-BR1:** `690874d51e803b8bf3ee42a2aa0fc2ef889fa3f1`
- **Approved branch:** `audit/gp026-chk0-br1`

Exact approved lineage:

```text
672222b098aff8713be902ef2173f9c13e761e35
  -> aa4d3c2e844e10ded53e77bd46ec3f157dcc3f57
  -> 690874d51e803b8bf3ee42a2aa0fc2ef889fa3f1
```

## Integration Checkpoint

- `origin/main` was fetched and verified at the canonical discovery baseline before integration.
- The approved branch and both parent relationships were verified exactly.
- `main` was advanced to `690874d51e803b8bf3ee42a2aa0fc2ef889fa3f1` using exact
  fast-forward-only integration.
- No merge commit, squash, rebase, cherry-pick, amendment, conflict resolution, or contract rewrite
  occurred during integration.
- This closure commit has the exact approved BR1 head as its parent.

## Summary

GP-026 CHK0 is closed. The externally approved Product Story Builder contract is frozen as binding
implementation authority for future separately authorized GP-026 checkpoints. The freeze approves
the implementation decisions; it does not mean GP-026 runtime functionality is implemented or that
GP-026 is complete.

GP-026 remains `PLANNED`, with GP-024 and GP-014 as its dependencies. CHK1 has not started and still
requires explicit separate authorization.

## Files Changed by the Closure Commit

- `docs/roadmap/GP-026-CONTRACT.md`
- `docs/roadmap/GP-026-CHK0-CLOSURE.md`

No substantive contract decision was changed. The contract edit only records its externally
approved, frozen authority and amendment boundary.

## Frozen Contract Decisions

### Product and visual authority

- GP-026 is a manual Admin Product Story Builder.
- AI-generated Product Story creation remains out of scope.
- The existing Gamer Perú storefront and current public `ProductStoryRenderer` remain authoritative.
- The canonical block inventory remains the 13 current Story types:
  `hero_media`, `full_bleed_image`, `image_text`, `stat_highlight`, `spec_feature`, `video`,
  `gallery`, `comparison`, `dimensions`, `box_contents`, `technical_specs`, `faq`, and
  `related_products`.

### Persistence, lifecycle, concurrency, and idempotency

- Story document revisions are immutable after insertion; lifecycle status and publication
  metadata may transition transactionally.
- `product_stories.draft_revision_id` is the explicit active-draft identity.
- Draft and published pointers require same-Product ownership constraints.
- Partial unique indexes permit at most one active `DRAFT` and one active `PUBLISHED` revision per
  Product.
- A replacement save archives the exact old `DRAFT` before inserting the new `DRAFT`, with both
  operations in one transaction so the partial unique index remains active.
- Exact expected draft and published pointers provide optimistic concurrency and stale-editor
  protection.
- Save, discard, publish, and unpublish lifecycle changes are atomic PostgreSQL transactions.
- GP-024-style actor-scoped mutation digests, request fingerprints, advisory locks, and durable
  `audit_events` markers provide replay/idempotency.
- A committed matching replay returns the committed result before a second lifecycle transition.
- Any failure before commit rolls back archive, insert, pointer, timestamp, and audit changes,
  restoring the prior lifecycle state.

### RBAC

- `catalog:manage` protects authoring, draft reads/writes, discard, and protected preview.
- `catalog:publish` protects publication and unpublication.
- Identity and permissions are derived from the canonical verified server session.
- Browser-supplied actor, role, permission, and ownership claims carry no authority.
- Every route, reader, action, and service remains fail closed.

### Media

- The browser selects an existing `ProductMedia` association.
- The server verifies Product/Variant ownership, `PUBLIC_MEDIA` security class, media type, MIME,
  and public resolution.
- The persisted Story payload uses the canonical `MediaAsset.objectKey` expected by the existing
  validator and renderer.
- Private media and documents are forbidden.
- The GP-024 image pipeline is reused. GP-026 creates no parallel upload system.

### Preview

- Preview targets a durably saved current draft.
- Preview is an authenticated, authorization-checked Admin route with private/no-store and
  noindex/nofollow behavior.
- Preview uses the actual `ProductStoryRenderer` and the same public related-product hydration.
- No public signed preview token, duplicate renderer, or publication mutation is introduced.

## CHK1 Ownership and Boundary

When separately authorized, CHK1 exclusively owns:

- the additive Story migration, including `draft_revision_id`, same-Product pointer constraints,
  and active-status partial unique indexes;
- strict complete-document write validation;
- the Admin Story reader and sanitized DTO;
- transactional save/discard/publish/unpublish services and thin Server Actions;
- audit replay, idempotency, rollback, concurrency, authorization, and physical-database integration
  tests.

CHK1 has not started. This closure does not implement or authorize any of those deliverables.

## GP-026A Authority Boundary

GP-026A remains `CANCELLED / SUPERSEDED BY OWNER DECISION / HISTORICAL ONLY`.

GP-026A-CONTRACT remains `SUPERSEDED / HISTORICAL ONLY / NOT IMPLEMENTATION AUTHORITY`. Its CHK1
through CHK6 direction and rejected runtime candidate do not guide GP-026. The pre-GP-026A Gamer
Perú storefront remains canonical.

## Validation Performed

- Exact `origin/main`, approved BR1 SHA, and two-commit approved lineage: verified before
  integration.
- Integration method: exact `git merge --ff-only` fast-forward.
- Post-integration `HEAD`: exact approved BR1 SHA before the closure edit.
- `pnpm format:check`: required for the documentation-only closure.
- `git diff --check`: required for the documentation-only closure.
- Closure file boundary: exactly the two roadmap documents listed above.
- Full database/runtime/E2E validation: not required, not run, and not claimed for this
  documentation-only closure.
- GitHub Actions: report only the actual remote state after publishing final `main`.

## Acceptance Criteria

- [x] The exact externally approved lineage was integrated unchanged by fast-forward.
- [x] The contract status is `CHK0 CONTRACT FROZEN / EXTERNALLY APPROVED`.
- [x] Frozen authority is distinguished from completed implementation.
- [x] Material architectural changes require a separately reviewed amendment.
- [x] GP-026 remains `PLANNED` with GP-024 and GP-014 dependencies.
- [x] GP-026 remains a manual Product Story Builder and AI Story generation remains out of scope.
- [x] Existing storefront and Product Story renderer authority is preserved.
- [x] Persistence, concurrency, idempotency, RBAC, media, preview, and 13-block decisions are frozen.
- [x] GP-026A remains historical and non-authoritative.
- [x] The closure is documentation-only and CHK1 was not started.

## Deviations / Notes

- No production code, tests, schema, migration, public media, package/lockfile, hosted service, or
  domain behavior changed.
- No migration 0014 was created.
- The closure commit uses `[skip ci]`; a missing workflow run is classified as documentation-only,
  not as a CI PASS.

## Risks / Follow-ups

- Future checkpoints must implement the frozen contract without silent divergence.
- Any material architectural change requires a separately reviewed contract amendment.
- CHK1 requires explicit separate owner authorization before work starts.
- GP-026 remains open until its implementation, complete validation, and final GP closure are
  separately achieved.

## Repository Status

- **GP-026 status:** `PLANNED`
- **Dependencies:** GP-024, GP-014
- **Contract status:** `CHK0 CONTRACT FROZEN / EXTERNALLY APPROVED`
- **Production-code delta:** ZERO
- **Test-code delta:** ZERO
- **Schema delta:** ZERO
- **Migration delta:** ZERO
- **Public-media delta:** ZERO
- **Hosted-services delta:** ZERO
- **Domain-behavior delta:** ZERO
- **GP-026 CHK1:** NOT STARTED

## Final Status

GP-026 CHK0 CLOSED / CONTRACT FROZEN / EXTERNALLY APPROVED

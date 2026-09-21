# GP-027 CHK0 — Closure

## Status

GP-027 CHK0 CLOSED / CONTRACT FROZEN / EXTERNALLY APPROVED / INTEGRATED

## Base Checkpoint

- Authorized pre-GP-027 `origin/main`: `fab89780a7e2f5576849a54b143f58c9d291da84`.
- Original CHK0 candidate: `c56d30f4df163e72d103088532448c20e463951c` on `audit/gp027-chk0`.
- Externally approved CHK0-BR1: `aa26b95ca1885dbdaa8684ed49b7ce85b6cd7477` on `audit/gp027-chk0-br1`.
- Exact lineage: `fab89780a7e2f5576849a54b143f58c9d291da84` → `c56d30f4df163e72d103088532448c20e463951c` → `aa26b95ca1885dbdaa8684ed49b7ce85b6cd7477`.

## Closure Checkpoint

The approved lineage was integrated to `main` by exact `git merge --ff-only` and pushed. Both local `HEAD` and fetched `origin/main` resolved to `aa26b95ca1885dbdaa8684ed49b7ce85b6cd7477` before this closure-only documentation commit. No merge commit, squash, rebase, cherry-pick, amendment, or contract rewrite occurred. This closure commit must have `aa26b95ca1885dbdaa8684ed49b7ce85b6cd7477` as its exact parent.

The authoritative, externally approved implementation contract is [GP-027-CONTRACT.md](GP-027-CONTRACT.md), frozen at `aa26b95ca1885dbdaa8684ed49b7ce85b6cd7477`. Later checkpoints may implement it; material deviations require external review. Closing CHK0 does **not** mean GP-027 runtime is implemented or GP-027 itself is complete.

## Summary

GP-027 owns the Admin Orders list, exact-email/order-prefix search, canonical filters, keyset pagination, immutable-snapshot detail, durable-evidence Admin timeline, internal append-only notes, and eligibility-driven exposure of exactly two existing GP-020 actions: `cancelUnpaidOrder` and `cancelPaidPreShipmentAndRefund`. `orders:manage` is the sole GP-027 permission; `SUPER_ADMIN` and `ADMIN_ORDERS` are the seeded authorized roles. Server-side route, reader, Server Action, and mutation guards remain mandatory.

GP-028 exclusively owns payment proof/code review, `VERIFYING`, approval/rejection, payment-review notes, verification queue, `orders:verify` mutation workflow, and terminal rejection decisions. GP-027 has no generic status setter, standalone refund workbench, fulfillment transition, return/RMA workflow, or customer-order redesign.

## Files Changed

The approved CHK0 lineage introduced `docs/roadmap/GP-027-CONTRACT.md`, updated `docs/roadmap/GP-027.md`, and repaired formatting in `docs/roadmap/GP-026-CLOSURE.md`. This closure-only commit changes exactly `docs/roadmap/GP-027.md` and `docs/roadmap/GP-027-CHK0-CLOSURE.md`; the frozen contract is unchanged.

The GP-026 document change is classified **PRE-EXISTING BASELINE DOCUMENT FORMAT DEFECT / REPAIRED WITHOUT SEMANTIC CHANGE**. Pre- and post-Prettier non-whitespace content is identical; the edit added only two blank lines. GP-026 remains `CLOSED / EXTERNALLY APPROVED / FROZEN / MAIN INTEGRATION COMPLETE / CI INFRASTRUCTURE WAIVER`; its functionality and verdict were not reopened.

The integrated lineage and closure have zero production/runtime, test, schema, migration, package, workflow, and hosted-service deltas. No hosted service was mutated.

## Decisions

- List is a bounded server projection, sorted `orders.created_at DESC, orders.id DESC`, with keyset pagination (25 default, 50 maximum) and no full historical browser dataset or unbounded count.
- Search is exact case-insensitive purchase-time email or anchored uppercase order-number prefix; no partial email, name, phone, operation-code, transaction-ID, or external-reference search. Canonical physical status filters and Lima-calendar dates map to a server-side UTC half-open interval.
- List email redaction uses the first Unicode code point of the stored local part plus `***@` and the stored domain; malformed/unsafe values show `Correo no disponible`. Full purchase-time email is guarded detail-only.
- Detail uses immutable order-item, address, and pricing snapshots and purchase-time contact fields, never current catalog/profile/address reconstruction. Null `customerId` does not prove guest checkout.
- The Admin timeline is a thin projection over durable evidence, not the customer/guest `getOrderTimeline` reader. It never fabricates `ORDER_CONFIRMED` from `orders.updatedAt`, includes all relevant shipments, and distinguishes `INTERNAL_NOTE` from lifecycle events.
- No direct `OrderStatus` writes are authorized. Admin unpaid cancellation requires an explicit validated 1–255-character operational reason; its UUID `cancellationAttemptId` is stable through uncertain results and exact retries. The wrapper passes that reason to unchanged GP-020 service and creates no duplicate lifecycle audit/outbox record.
- Paid pre-shipment cancellation/refund reuses unchanged `cancelPaidPreShipmentAndRefund`, with explicit reason, stable attempt ID, and operator confirmation of an already completed external refund; the application initiates no bank transfer.
- Future migration `0015` may add the append-only, internal `order_notes` table with unique request identity, fingerprint and actor binding, 2,000-code-point maximum, and atomic `orders:note_added` audit without note body in metadata. Note replay never creates a second note or audit row.
- Money remains integer cents with explicit currency; mismatches fail as integrity conditions. Mandatory note indexes and evidence-driven read-index candidates remain governed by local seeded PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` before retention.

## Validation Performed

- Exact remote branch SHAs, clean preflight, and both parent relationships were verified before integration.
- `git merge --ff-only` advanced `main` exactly to the approved BR1 SHA; push and fetch confirmed local and remote equality.
- Approved audit branch had zero workflow runs and zero status contexts. The main integration push also had zero workflow runs for the integrated SHA; the current CI workflow ignores docs-only push paths. **No CI PASS is claimed.** If a later run is observed, its actual runner/step outcome must be adjudicated separately.
- The inherited GP-026 scoped Prettier failure was repaired by formatting only. Repository-wide `pnpm format:check` returned **PASS** on the integrated approved lineage.
- Closure-only `pnpm format:check`, `git diff --check`, and clean working-tree verification are required before the closure commit; results are reported in the final publication report rather than predicting them here.
- No database command, hosted migration, full application test suite, or E2E suite was run for this documentation-only closure. No such gate is claimed PASS.

## Acceptance Criteria

The CHK0 contract is externally approved, integrated without rewrite, and frozen for later separately authorized checkpoints. Scope, GP-028 boundary, RBAC, audit/idempotency, snapshots, money, and later validation gates are explicit. GP-027 CHK1 has not started; GP-028 has not started.

## Deviations / Notes

The GP-026 formatting repair is baseline document hygiene only, not GP-026 runtime remediation or an architectural change. The documentation-only main push has no GitHub Actions run under the current path filter; absence of a run is not CI success or a code/test failure.

## Risks / Follow-ups

CHK1 must first implement the approved additive local migration/read/mutation foundations and obtain its own gate. Non-note indexes require local query evidence. Material contract deviation requires external review. Migration `0015` is authorized for future local disposable PostgreSQL/Supabase CHK1 work only, using the canonical `pnpm db:migrate` path when applicable: no hosted deployment, manual hosted SQL, or `drizzle push` is authorized by this closure.

## Repository Status

The final closure publication report must verify the closure parent, exactly two changed files, fetched `origin/main` at the closure SHA, and an empty `git status --short`.

## Final Status

**PASS — GP-027 CHK0 CLOSED / CONTRACT FROZEN / EXTERNALLY APPROVED / INTEGRATED.** This is a documentation/contract gate only, not GP-027 implementation completion.

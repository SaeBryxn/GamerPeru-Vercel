# GP-027 CHK1 — Closure

## Status

GP-027 CHK1 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER

## Base Checkpoint

- Canonical `main` before CHK1 integration: `b8ce3433c8dfd10920486f0a3e1cc81f10df84b5`.
- Original CHK1 candidate: `8c0b3c1cc1a41beb0dbd0761d7aeda0d4352fcdc` on `audit/gp027-chk1`.
- Externally approved CHK1-BR1: `d7e907ff1cecbcaaa180542fa8bd5f8eb54b75e7` on `audit/gp027-chk1-br1`.
- Exact lineage: `b8ce3433c8dfd10920486f0a3e1cc81f10df84b5` → `8c0b3c1cc1a41beb0dbd0761d7aeda0d4352fcdc` → `d7e907ff1cecbcaaa180542fa8bd5f8eb54b75e7` → this documentation-only closure commit. Its exact parent must be `d7e907ff1cecbcaaa180542fa8bd5f8eb54b75e7`; the final publication report records its SHA.

## Closure Checkpoint

The approved lineage was integrated unchanged by `git merge --ff-only` and pushed to `main`. Local `HEAD` and fetched `origin/main` both resolved to `d7e907ff1cecbcaaa180542fa8bd5f8eb54b75e7` before this closure-only commit. No merge commit, squash, rebase, cherry-pick, amendment, or rewrite occurred. GP-027 is not complete; CHK2 requires separate authorization and has not started.

## Summary

CHK1 delivers the server-side Orders Admin foundations under the frozen [GP-027 contract](GP-027-CONTRACT.md): local migration `0015`, append-only internal notes and their audit/idempotency, bounded list/detail/timeline readers, and thin wrappers over the existing GP-020 cancellation services. The Orders Admin UI and navigation are not part of this checkpoint. GP-028 payment-review authority remains separate.

## Files Changed

The approved CHK1 lineage contains runtime, schema, migration, and test changes. This closure commit changes exactly `docs/roadmap/GP-027.md` and `docs/roadmap/GP-027-CHK1-CLOSURE.md`. It changes no runtime code, tests, schema, migrations or metadata, package files, Playwright configuration, or workflows. No hosted Supabase/database or R2 operation was performed.

## Decisions

- Migration `src/db/migrations/0015_nifty_prowler.sql`, after `0014_steep_skreet`, is frozen in the canonical `0000–0015` chain; there is no `0016`. It remains **LOCAL VALIDATED ONLY**, not deployed to hosted Supabase, staging, or production. No `drizzle push` or manual hosted SQL is authorized here.
- The migration creates `order_notes` with an order foreign key using `ON DELETE RESTRICT`, nullable `auth.users` author foreign key using `ON DELETE SET NULL`, nonblank body constrained to at most 2,000 characters, and unique `mutation_request_id`. It retains `order_notes(order_id, created_at, id)`, `orders(created_at DESC, id DESC)`, and `orders(lower(customer_email), created_at DESC, id DESC)` indexes. The proposed prefix-specific index is not retained.
- Internal `order_notes` are append-only and not customer/public data. Each has UUIDv7 `id`, `order_id`, nullable `author_auth_user_id`, `body`, `created_at`, `mutation_request_id`, `intent_fingerprint`, and `actor_binding_digest`. Exact same-request/same-actor/same-order/same-normalized-body replay returns the committed note without another note or audit. Changed same-actor intent conflicts; foreign-actor reuse fails closed; concurrent identical intent commits once; audit failure rolls the note back.
- The canonical note audit has `actor_type=ADMIN`, the verified auth user as `actor_id`, `action=orders:note_added`, `target_type=Order`, `target_id=order.id`, and only `{ noteId }` as metadata—no body, PII, or raw mutation request ID.
- The server-only list reader sorts by `created_at DESC, id DESC`, uses keyset pagination (25 default, 50 maximum), and binds cursors to search, filters, and page size. Search is exact case-insensitive purchase-time email or anchored canonical order-number prefix. Physical filters cover order, payment, and shipment status, including both `NOT_RECORDED` states, plus a Lima creation-date interval. Shipment matching must not duplicate orders.
- Detail uses purchase-time item, address, pricing, and contact snapshots, not mutable Product, Variant, Customer, or saved-address data. Money remains integer cents; unsupported/mismatched currencies are explicit integrity failures, and money-dependent actions fail closed. The browser never computes refund authority.
- The Admin timeline projects exactly eight evidence source classes: `ORDER_PLACED`, `PAYMENT_SUBMITTED`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `REFUND_ISSUED`, `SHIPMENT_DISPATCHED`, `ORDER_DELIVERED`, and `INTERNAL_NOTE`. Five repeatable sources each read at most `PAGE_SIZE + 1 = 51` rows, and three singleton sources at most one; the fixed maximum is 258 returned source rows and eight source queries per page. There is no unbounded global event union.
- Timeline selection uses one global opaque, order-bound cursor on the `(timestamp, precedence, sourceId)` tuple, with descending selection and ascending presentation. PostgreSQL microsecond precision is preserved; cross-order use is `INVALID_INPUT`. Same-timestamp precedence follows the listed source order for deterministic display, **not** causal truth.
- `ORDER_CONFIRMED` requires durable approval audit/outbox evidence and is never inferred from current status or `updatedAt`; duplicate audit/outbox evidence projects once. `ORDER_CANCELLED` prefers canonical `orders:cancel`, `orders:refund_and_cancel`, or `orders:apply_terminal_payment_rejection` audit and uses `cancelled_at` only when no such audit exists. Each valid shipped/delivered timestamp across multiple shipment rows contributes its event.
- Admin cancellation wrappers remain thin calls to unchanged `src/lib/orders/service.ts` and create no separate lifecycle SQL, audit, outbox, or generic status setter. Unpaid cancellation requires `orders:manage`, exact order number, explicit normalized operational reason other than `Cancelado por el cliente`, and stable `cancellationAttemptId`. Paid pre-shipment cancellation also requires existing GP-020 eligibility, an explicit reason, stable attempt ID, `externalRefundCompleted === true`, and a GP-020-valid external reference when supplied. The application records an already completed external refund; it does not move money. Standalone `recordRefund` is outside GP-027.
- GP-028 retains payment-proof and operation-code review, approval/rejection, `VERIFYING` mutation, verification notes, `orders:verify`, and terminal rejection decisions. None were implemented in GP-027 CHK1.

## Validation Performed

- Preflight verified exact remote branch SHAs, clean working tree, and both parent relationships. `git merge --ff-only` advanced `main` exactly to the approved BR1 commit, and push/fetch confirmed the same `HEAD` and `origin/main` SHA.
- Approved local evidence: migration physical **1/1 PASS**; focused GP-027 unit **14/14 PASS**; original GP-027 PostgreSQL integration **9/9 PASS** before BR1 expansion; Order domain live **38/38 PASS**; Admin live after BR1 **13 files, 277/277 PASS**; full Vitest **125 files, 1551/1551 PASS**; canonical Storefront E2E **142/142 PASS**; build **PASS**; `pnpm check` **PASS**. The focused BR1 evidence covers bounded source windows, eight queries/page, 258-row bound, 220-note pagination, dedupe/non-omission, same-timestamp order, durable confirmation and cancellation evidence, multiple shipments, and physical combined/`NOT_RECORDED` filters.
- Main-triggered GitHub Actions [run `35658681432`](https://github.com/latamcreativa/GamerPeru/actions/runs/35658681432), workflow `CI`, for `d7e907ff1cecbcaaa180542fa8bd5f8eb54b75e7` concluded `failure`. `Light CI` concluded `failure` with empty `runner_name`, `runner_id=0`, and **zero steps**. Dependent `Catalog Gate` and `Full Gate` were `skipped`, also with empty runner and zero steps. No repository command ran. Classification: **REMOTE CI INFRASTRUCTURE BLOCKED / PASS WITH CI INFRASTRUCTURE WAIVER**. **NO REMOTE TEST PASS IS CLAIMED.**
- Closure-only `pnpm format:check`, `git diff --check`, file boundary, commit parent, remote SHA, and clean-tree results are verified in the final publication report rather than predicted here. The full runtime/DB/E2E suite is not rerun solely for documentation closure.

## Acceptance Criteria

The externally approved CHK1 lineage is integrated unchanged; its migration, notes, readers, timeline, and cancellation scope are frozen. The main CI run was adjudicated against actual job allocation and step evidence, and the authorized pre-runner infrastructure waiver is used. CHK2 and GP-028 have not started. No hosted migration or deployment occurred.

## Deviations / Notes

The CI workflow run exists and concluded failure, but the primary job never received a runner and executed no steps; this is not an executed repository-command failure and is not a remote PASS. The locally passing commands emitted non-failing diagnostics, including `NO_COLOR`/`FORCE_COLOR`, LCP logging, aborted storefront request diagnostics, and scenario logs. Their exit codes and assertions passed; no blanket “zero warnings everywhere” claim is made. Lint had no warning failure.

## Risks / Follow-ups

The remote runner infrastructure condition remains unresolved. A future CI run that allocates a runner and fails a repository step would require separate remediation and review; this waiver cannot excuse it. CHK2 is the next eligible checkpoint but requires its own authorization. Hosted migration `0015` and GP-028 require separate future gates.

## Repository Status

This closure commit must be directly on `d7e907ff1cecbcaaa180542fa8bd5f8eb54b75e7`, change only the two documentation files listed above, and leave fetched `origin/main` at the closure SHA with an empty `git status --short`. The final publication report records the verified SHA and state.

## Final Status

**PASS WITH NOTES — GP-027 CHK1 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER.** The notes are the unexecuted remote CI run and the explicitly classified non-failing local diagnostics, not an unresolved application-test failure.

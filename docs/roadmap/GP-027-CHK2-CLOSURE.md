# GP-027 CHK2 — Closure

## Base Checkpoint

- Canonical `main` before CHK2 integration: `842a56989ed368664587c32f4fe4770179b410ec`.
- Externally approved implementation commit: `0b8ebad388eef5d743e21feed3aea796f6e0f764` on `audit/gp027-chk2`, exactly one commit ahead and zero behind the baseline.
- The implementation candidate changed exactly the 17 files listed below. Its parent is the canonical baseline. No schema, migration, package, workflow, or hosted-service delta was present.

## Closure Checkpoint

The approved implementation commit was integrated unchanged by `git merge --ff-only 0b8ebad388eef5d743e21feed3aea796f6e0f764` and pushed to `main`. After fetch, local `HEAD` and `origin/main` both resolved to `0b8ebad388eef5d743e21feed3aea796f6e0f764`. There was no merge commit, rebase, squash, cherry-pick, amendment, or reconstruction. The documentation-only closure candidate `5ec723a02c7ae7cc2035345b4960ad23dc7cc57b` was committed directly on that implementation SHA, published to `main`, and definitively approved by external review. This final documentary status update records the approved verdict without changing implementation behavior.

## Summary

CHK2 adds the first user-facing Orders Admin surface at `/admin/orders` and the permission-filtered **Pedidos** navigation item. The force-dynamic Server Component independently requires `orders:manage` and consumes the frozen CHK1 `getAdminOrderList` reader without duplicating its search, filter, cursor, aggregation, masking, or Lima-date logic. It provides exact-email or anchored order-number-prefix search, canonical physical status filters, Lima date controls, opaque keyset next-page navigation, explicit invalid/empty/error states, a semantic desktop table, and genuine narrow-screen order cards. Order numbers remain non-interactive in CHK2; detail links belong to CHK3.

The list displays only the reader's masked purchase-time email and operational DTO. It does not render full email, phone, address, payment proof or operation code, refund reference, or internal note body. Payment and shipment states, including `NOT_RECORDED` and multiple shipments, are read-only; no mutation or payment verification was added. Integer-cent totals and `America/Lima` timestamps remain explicit.

## Files Changed

The approved implementation candidate changed exactly:

1. `docs/roadmap/GP-027.md`
2. `playwright.admin.config.ts`
3. `scripts/test/cleanup-admin-e2e.mjs`
4. `scripts/test/seed-admin-e2e.mjs`
5. `src/app/admin/(protected)/orders/order-filters.tsx`
6. `src/app/admin/(protected)/orders/order-status-options.ts`
7. `src/app/admin/(protected)/orders/orders.module.css`
8. `src/app/admin/(protected)/orders/page.tsx`
9. `src/components/admin/admin-header.tsx`
10. `src/components/admin/admin-mobile-nav.tsx`
11. `src/components/admin/admin-shell.tsx`
12. `src/components/admin/admin-sidebar.tsx`
13. `src/lib/admin/navigation.ts`
14. `tests/e2e/admin-orders-list.spec.ts`
15. `tests/e2e/admin-story-builder.spec.ts`
16. `tests/e2e/helpers/admin-fixtures.ts`
17. `tests/unit/admin-navigation.test.ts`

The closure candidate and this final approval-status commit each change exactly `docs/roadmap/GP-027.md` and `docs/roadmap/GP-027-CHK2-CLOSURE.md`. Neither changes runtime, tests, configuration, schema, migrations, packages, workflows, or hosted services.

## Decisions

- CHK1 server behavior and migration `0015` remain frozen. Migration `0015` was validated locally in CHK1 but has **not** been deployed to hosted Supabase; there is no `0016`.
- Page-level `orders:manage` is defense in depth alongside the independently guarded reader. Navigation visibility is not authorization.
- Search, filters, date conversion, and cursor validation stay server-authoritative. Filter submission resets the previous cursor; the UI does not decode cursors or invent numbered/reverse pagination.
- Desktop uses a semantic table; narrow screens use cards containing the same essential operational meaning. Status text accompanies color. No CHK3 detail link or GP-028 payment action appears.
- The local Admin E2E system seeds 30 deterministic Orders and cleans up only its known IDs and dependent rows in FK-safe order. The verified cleanup reduced those fixture orders from 30 to 0.

## Validation Performed

- Integration preflight: clean tree; exact baseline and candidate SHA; merge-base equal to the baseline; candidate 0 behind/1 ahead; 17-file diff; no undeclared schema, migration, workflow, or package change. Fast-forward push and subsequent fetch verified the exact implementation SHA on `main`.
- Approved local implementation evidence: `pnpm check` **PASS** (`pnpm format:check`, `pnpm typecheck`, `pnpm lint --max-warnings=0`, 125 Vitest files/1551 tests, production build); `pnpm test:admin:live` **13 files, 277/277 PASS**; `pnpm test:order:live` **38/38 PASS**; `git diff --check` **PASS**.
- Final unfiltered `pnpm test:admin:e2e`: **5 files, 74/74 PASS**, including **11/11 Orders** tests. The Orders suite covers direct-route permission denial, masked/limited data, search, physical filters, `NOT_RECORDED`, Lima dates, keyset non-duplication, malformed input, responsive layout, keyboard access, and Axe audits.
- `pnpm test:e2e` under the default Storefront configuration: **142 PASS + 11 intentional Orders skips**. The same 11 Orders tests were executed and passed under the serial Admin E2E configuration. Neither zero skips nor a Storefront execution of those 11 is claimed.
- Manual Orders visual QA at 1440, 768, 390, and 360 px found no horizontal viewport overflow or clipped controls. Axe reported zero tested WCAG 2.1 A/AA violations on the populated desktop, populated mobile, and filtered-empty Orders states.
- Main-triggered GitHub Actions [run `35681978201`](https://github.com/latamcreativa/GamerPeru/actions/runs/35681978201), workflow `CI`, event `push`, head SHA `0b8ebad388eef5d743e21feed3aea796f6e0f764`, completed with conclusion `failure`. `Light CI` (job `106600663883`) completed `failure` with `runner_name` empty, `runner_id=0`, and **zero steps**. `Catalog Gate` (job `106600664493`) and `Full Gate` (job `106600664609`) were `skipped`, with no runner and no steps. No repository command executed or failed. Classification: **REMOTE CI INFRASTRUCTURE BLOCKED / CI INFRASTRUCTURE WAIVER**, as explicitly authorized for CHK2. **This is not CI PASS.**
- Documentation-only `pnpm format:check`, `git diff --check`, two-file boundary, closure parent, remote SHA, and clean-tree verification are recorded in the final publication report, not predicted here. Runtime, database, and E2E gates are not rerun solely for this documentation commit.

## Acceptance Criteria

The exact externally approved CHK2 implementation is integrated. The Orders list, guarded navigation, presentation, local fixtures, and E2E coverage meet the approved CHK2 scope. No CHK1 server semantics, schema, migration, hosted Supabase/database, R2, or infrastructure were changed. External review has approved the CHK2 closure with the documented pre-runner GitHub Actions infrastructure waiver.

## Deviations / Notes

The remote workflow's `failure` conclusion is reported as-is; the authorized waiver applies only because the primary job had no runner and zero steps. Local passing suites emitted non-failing diagnostics from negative scenarios, synthetic image fixtures, aborted requests, and LCP advisories. No blanket global “zero warnings” claim is made. No full `pnpm check` or E2E pass is claimed for the documentation-only closure commit.

## Risks / Follow-ups

- The remote runner infrastructure condition remains unresolved. Any future runner-executed repository step failure requires separate remediation; this waiver cannot excuse it.
- CHK4 should normalize the Playwright harness inconsistency: the new `admin-orders-list.spec.ts` self-skips under the default configuration, while older Admin specs are excluded there using `testIgnore`. This is non-blocking for CHK2 and is not changed during this closure.
- `/admin/orders/[orderNumber]`, timeline, notes, and Admin cancellation UX are separately authorized CHK3 scope, not part of CHK2. GP-028 payment review has not started. Hosted migration `0015` requires separate authorization.

## Repository Status

The closure candidate `5ec723a02c7ae7cc2035345b4960ad23dc7cc57b` is directly on `0b8ebad388eef5d743e21feed3aea796f6e0f764` and changed only the two documentation files identified above. This final approval-status commit changes the same two files only. Its SHA and clean remote state are recorded in the publication report; that SHA becomes the authorized CHK3 baseline.

## Final Status

**PASS WITH NOTES — GP-027 CHK2 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER.** The note is solely GitHub Actions run `35681978201`: `Light CI` had no runner and zero steps, while dependent jobs were skipped. No repository command ran remotely; this is not CI PASS.

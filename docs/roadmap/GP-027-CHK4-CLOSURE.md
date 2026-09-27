# GP-027 CHK4 — Closure

## Status

**GP-027 CHK4 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER**

External review approved closure candidate `06304f765f88ce6fd86d2b51901007d63abd8871` with notes limited solely to the established GitHub Actions runner/account-capacity condition. CHK4 is definitively closed and CHK5 is authorized for final canonical validation. This approval is not CI PASS.

## Integration Checkpoints

- Approved baseline: `521bf59a9ef03a0a0a9434b19d696db511922e99`.
- Approved branch: `audit/gp027-chk4`.
- Approved implementation: `89a28f31f65023ac641408546a51e36b892d112e`.
- Verified parent: `521bf59a9ef03a0a0a9434b19d696db511922e99`.
- Verified merge-base with `main`: `521bf59a9ef03a0a0a9434b19d696db511922e99`.
- Verified lineage: one commit ahead and zero behind.
- Integration command: `git merge --ff-only 89a28f31f65023ac641408546a51e36b892d112e`.
- Implementation integration result: local `HEAD` and `origin/main` both resolved to `89a28f31f65023ac641408546a51e36b892d112e` after push and fetch.
- History preservation: no merge commit, squash, rebase, cherry-pick, amend, reconstruction, or rewritten implementation SHA.

## Exact Implementation Delta

The approved CHK4 implementation changes exactly these 10 files:

1. `docs/roadmap/GP-027.md`
2. `playwright.checkout.config.ts`
3. `playwright.config.ts`
4. `playwright.payment.config.ts`
5. `src/lib/admin/orders/reader.ts`
6. `src/lib/admin/orders/validation.ts`
7. `tests/e2e/admin-orders-list.spec.ts`
8. `tests/e2e/admin-z-orders-detail.spec.ts`
9. `tests/unit/admin-orders-actions.test.ts`
10. `tests/unit/admin-orders-validation.test.ts`

The implementation contains no schema delta, no migration delta or migration metadata delta, no package delta, no workflow delta, and no hosted-service delta. It creates no migration `0016` and does not modify the GP-027 firewall or implement GP-028.

## Playwright Harness Normalization

- The default `playwright.config.ts` now ignores `admin-orders-list.spec.ts` and `admin-z-orders-detail.spec.ts` rather than collecting them and relying on self-skip guards.
- The redundant self-skip guards were removed from both Orders specs.
- The dedicated `playwright.admin.config.ts` remains the authority for Admin Orders E2E.
- The checkout and payment Playwright configurations also exclude the Admin Orders specs from their scoped suites.
- The default Storefront E2E execution now completes with 142 passing tests and zero skips; the dedicated Admin E2E execution completes with 87 passing tests and zero skips.

## Security Hardening

`safeTrackingUrl` remains a server-side allowlist applied before an Admin Orders detail response exposes a tracking link. The implementation:

- permits only the `https:` protocol;
- rejects embedded usernames and passwords;
- rejects raw IPv4 and IPv6 hosts;
- requires at least two hostname labels;
- rejects `.local` and `.internal` host suffixes;
- rejects non-standard explicit ports, allowing no explicit port or canonical HTTPS port `443`;
- validates every hostname label with the implemented ASCII-label expression `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`;
- returns the canonicalized URL string produced by `URL.toString()` only when every check succeeds.

This is a deliberately bounded tracking-link validator, not a complete general-purpose RFC hostname validator. Tracking links remain available to the protected detail UI only after this validation succeeds.

## Query and Performance Hardening

The Orders list ordering changed from:

`ORDER BY o.created_at DESC, o.id DESC`

to:

`ORDER BY o.created_at DESC NULLS LAST, o.id DESC NULLS LAST`

`orders.created_at` is `NOT NULL`, so this does not change the ordering semantics of valid rows. It explicitly aligns the query with the frozen `orders_created_id_idx` definition from migration `0015`. No new index, migration `0016`, manual DDL, or hosted database operation was introduced.

Local PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` evidence reported by the approved implementation run showed:

- the default Orders page used `orders_created_id_idx`;
- keyset pagination used the same index;
- exact lowercased email lookup used `orders_lower_email_created_id_idx`;
- the prefix lookup rationally selected a sequential scan for the small local fixture dataset, so no speculative prefix index was added;
- note pagination remained bounded;
- purchase-truth reconstruction did not introduce N+1 queries;
- the timeline architecture remained bounded.

These are reported local PostgreSQL observations. External review did not independently reproduce the timing values, and local sub-millisecond timings are not production performance guarantees.

## Corrected Reporting Terminology

This closure corrects three wording inaccuracies in the implementation report:

1. **Search length:** each raw query value longer than 1,024 characters is rejected; normalized `q` longer than 255 characters is rejected; an order-number prefix is additionally constrained by `normalizeOrderNumber` to the implemented 4–30 character grammar. This is not summarized as merely “over 100 characters.”
2. **Cancellation attempts:** Admin cancellation attempt identifiers are **cryptographically random UUIDs, stable per logical client intent**, generated with `crypto.randomUUID()`. They are not described as UUIDv7.
3. **Note digests:** the note constructions are **non-secret, domain-separated SHA-256 digests** using `order_note_actor:`, `order_note_intent:`, and `order_note_request:` domains. They are not salted hashes. Audit metadata contains only the allowed note identifier metadata; raw note bodies and raw mutation request IDs are not placed in audit metadata.

## Validation Evidence

The externally approved implementation report records the following local results for `89a28f31f65023ac641408546a51e36b892d112e`:

- `pnpm test:admin:live`: **277 PASS**.
- `pnpm test:order:live`: **38 PASS**.
- `pnpm test:inventory:live`: **32 PASS**.
- `pnpm test:payment:live`: **27 PASS**.
- `pnpm test:checkout:live`: **24 PASS**.
- `pnpm test:cart:live`: **14 PASS**.
- `pnpm test:admin:e2e`: **87 PASS / 0 skips**.
- `pnpm test:payment:e2e`: **2 PASS**.
- `pnpm test:checkout:e2e`: **6 PASS**.
- `pnpm test:cart:e2e`: **11 PASS**.
- `pnpm test:e2e`: **142 PASS / 0 skips**.
- `pnpm check`: **PASS**, including formatting, TypeScript, ESLint with `--max-warnings=0`, unit tests, and production build.
- `git diff --check`: **PASS**.

`pnpm lint` therefore passed with zero lint warnings, and `pnpm typecheck` produced zero TypeScript errors. No global zero-warning claim is made. Non-failing diagnostics observed in the implementation validation included synthetic LCP fixture notices and intentional stream/network reset output from abort and lost-response tests; assertions and command exit codes passed.

## Accessibility and Responsive Evidence

The approved CHK4 evidence covers widths 1440, 768, 390, and 360. It confirms:

- a semantic desktop Orders table;
- responsive mobile cards;
- an accessible horizontally scrollable item table;
- no overflow in the tested viewports;
- cancellation-dialog keyboard operation;
- Escape dismissal and trigger focus restoration;
- zero Axe violations in the tested surfaces.

This evidence is scoped to the tested surfaces and is not presented as a universal WCAG certification.

## Security, Privacy, and Scope Firewall

CHK4 preserves the approved GP-027 boundaries. It does not add payment proof or operation-code access, payment verification, `orders:verify`, payment approval/rejection, generic order or payment status writers, fulfillment writers, a refund workbench, returns/RMA, order deletion, mutable staff notes, bulk exports, or GP-028 routes.

Admin cancellation attempt UUIDs remain in Client Component memory per logical intent, while GP-020 remains the durable mutation authority. The existing privacy boundary remains unchanged: no GP-027 customer/order data is introduced into browser storage.

Migration `0015` remains **LOCAL VALIDATED ONLY**. It was not deployed to hosted Supabase. There is no migration `0016`, no hosted Supabase operation, and no Cloudflare R2 operation.

## GitHub Actions Classification

The implementation push to `main` created GitHub Actions run `35761217977` for workflow `CI`.

- Overall run: `completed`, conclusion `failure`.
- `Light CI`, job `106859433639`: `completed`, conclusion `failure`, `runner_id=0`, empty `runner_name`, and zero steps.
- `Catalog Gate`, job `106859435575`: skipped, zero steps.
- `Full Gate`, job `106859436060`: skipped, zero steps.
- No runner executed any checkout, repository command, test, or build step.

Classification: **REMOTE CI INFRASTRUCTURE BLOCKED / CI INFRASTRUCTURE WAIVER — NOT CI PASS**.

This waiver applies only to the observed lack of runner allocation and cannot excuse a future runner-executed repository failure.

## Closure Scope

The externally approved closure candidate `06304f765f88ce6fd86d2b51901007d63abd8871` modified exactly:

1. `docs/roadmap/GP-027.md`
2. `docs/roadmap/GP-027-CHK4-CLOSURE.md`

It contains documentation only. It does not modify runtime code, tests, Playwright configuration, schema, migrations, workflows, packages, or hosted services.

## External Decision

- CHK4 implementation: externally approved and exactly integrated.
- CHK4 closure: externally approved and definitively closed.
- CHK5: not started.
- GP-027 final closure: not started.
- GP-028: not started.
- Migration `0015`: not deployed.

## Final Status

**GP-027 CHK4 CLOSED / EXTERNALLY APPROVED / INTEGRATED / CI INFRASTRUCTURE WAIVER**

**REMOTE CI INFRASTRUCTURE BLOCKED / CI INFRASTRUCTURE WAIVER — NOT CI PASS**

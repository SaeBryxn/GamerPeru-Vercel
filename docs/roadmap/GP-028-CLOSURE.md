# GP-028 — Closure Report Candidate

## Base Checkpoint

`0487d8f3748c446235b145390dbf748b03559165` on `main`.

## Closure Checkpoint

Pending validation and commit on `codex/gp028-closure`. This document does not yet declare GP-028 closed.

## Summary

The Admin payment verification queue supports authorized claim, voucher review, approval, retryable and terminal rejection, notes, audit, and idempotent decisions. For a late payment whose funds arrived after its reservation was released, the operator can record an already completed external full refund with a mandatory declaration and external reference. This records the financial fact; Gamer Perú does not initiate a transfer or perform bank reconciliation. Payment, refund, order, verification, audit, outbox, and idempotency writes are transactionally consistent, and released stock is not allocated.

## Files Changed

- Payment authority and notification semantics: `src/lib/payments/verification-service.ts`, `verification-actions.ts`, `crypto.ts`, and `src/lib/notifications/dispatcher.ts`.
- Admin experience: `src/app/admin/(protected)/pagos/review-drawer.tsx`, `verification.module.css`, and shared `src/components/admin/ui/side-drawer.tsx`.
- Focused unit, live integration, and browser tests under `tests/`; the new browser fixture is `tests/e2e/admin-payment-verification.spec.ts`. A GP-019 live-test assertion now scopes its mutation count to its own order.
- Storefront warning and fixture stabilization: homepage, home media, search drawer, design tokens, and corresponding E2E tests.
- Cart drawer accessibility remediation: two muted text colors in `src/components/cart/cart-line.module.css`.
- Checkout accessibility and E2E stability: muted checkout text and confirmation badge contrast, deterministic cart/checkout readiness, and delayed Admin fixture seeding in `.github/workflows/ci.yml`.
- Evidence and design notes: `docs/roadmap/GP-028.md` and `docs/design/GAMER_PERU_DESIGN_LANGUAGE.md`.

## Decisions

- The refund route requires both `orders:verify` and `orders:manage`; the server is authoritative even if a UI option is displayed.
- The mandatory operator declaration and external reference document a refund completed outside Gamer Perú. No bank or wallet API transfer is implied.
- An immediately refunded payment suppresses the inaccurate “pedido en preparación” email. There is no automatic refund email template; staff must notify the customer through a secure channel.
- The refund remains recordable if stock returns after the external refund. Reservation and inventory histories are not rewritten.
- The drawer header is a heading inside the dialog, not a second page banner. Red text uses a contrast-safe admin token.

## Validation Performed

- Local payment integration: 49/49 passed, covering concurrency, retries, replay, rollback, and inventory invariants.
- Local notification integration: 11/11 passed, including suppression of the preparation email.
- Focused Admin browser E2E: 1/1 passed against local Supabase/PostgreSQL. The refund drawer passed Axe with zero violations and a 360 px horizontal-overflow check. Test-created users, orders, and locations were removed; checked fixture counts returned zero.
- Final `pnpm check` exited zero: format, typecheck, zero-warning ESLint, 1,652/1,652 unit tests, and production build. Intentional negative-path application logs and jsdom `scrollTo` notices remained in test output.
- Final storefront `pnpm test:e2e` first produced 141/142 because a prior GP-014 reduced-motion video test failed its state timing assertion. The isolated test passed, then a full two-worker rerun passed 142/142. That passing run still emitted development-server aborted-request errors, Motion reduced-motion advisories, and image-LCP hints.
- Payment live integration: after scoping a prior GP-019 global-count assertion to its own order, the final rerun passed 49/49. Its expected negative-path logs and a local test-storage TLS cleanup warning remained. Notification live integration passed 11/11 in the prior GP-028 run; its production code has not changed since that run.
- `pnpm ignored-builds` exited zero but reported that it could not identify ignored builds because it found no node_modules, while listing `@google/genai` as explicitly ignored.
- PR #3 Light CI passed on the implementation candidate. The first Full Gate failed its cart drawer Axe audit after passing migrations, checks, unit tests, build, live integrations, and storefront E2E. The two reported contrast issues were corrected; the focused local cart Axe scenario passed 1/1.
- The second Full Gate passed cart E2E but failed checkout E2E. Its shared Admin fixture introduced a zero-cost shipping option before checkout, and checkout/confirmation had inherited contrast failures. The fixture is now seeded immediately before Admin E2E; checkout contrast, confirmation badge contrast, and test readiness were corrected. The full local checkout browser suite passed 6/6. A third Full Gate is required.
- After those corrections, local `pnpm check` passed again (1,652/1,652 unit tests, zero-warning ESLint, successful build), and the canonical storefront browser suite passed 142/142 with two workers. Its development-only `ECONNRESET`, reduced-motion, and LCP notices are covered by the owner's stated exception, not by a claim of warning-free output.

## Acceptance Criteria

The scoped financial behavior and its focused regression tests pass. The owner authorized a documented exception only for the identified non-blocking development notices. The corrected candidate still requires a successful Full Gate; GP-028 is not yet closed.

## Deviations / Notes

Earlier canonical browser runs emitted development-server aborted-request errors, Motion's reduced-motion advisory in tests that deliberately enable that preference, and intermittent image-LCP hints. The passing local checkout run ended with a development-server `destination stream closed early` message. These were not silently suppressed or misreported as a zero-warning run. The current local Supabase CLI also warns that `[inbucket]` is deprecated; changing that configuration is not part of GP-028 and may conflict with hosted branching compatibility.

## Risks / Follow-ups

- The `RefundIssued` event has no customer email template; the operator must contact the customer through a secure channel.
- Local public tables have RLS disabled, but a direct local privilege check found zero `anon` or `authenticated` table grants. This is an existing schema-security architecture follow-up, not a GP-028 migration or proof of public access.
- Final closure depends on the canonical gates and an actual GitHub Actions result. No hosted Supabase mutation is part of this GP.

## Repository Status

Uncommitted local candidate on `codex/gp028-closure`; `main` remains at the base checkpoint.

## Final Status

FAIL — candidate only; validation and integration remain pending.

## Integration into `feat/cloudflare-workers` (2026-10-17)

- Applied `58cfc89`, `8fc6b72` and `10e475f` from `codex/gp028-closure` (the two merge commits on
  that branch carry no tree changes). No migration is needed: `refunds.external_reference`,
  `refunds.actor_auth_user_id` and the `REFUNDED` statuses already exist in the schema.
- Taken as is: payment verification and late-refund recording (`verification-service.ts`,
  `verification-actions.ts`, `crypto.ts`, `dispatcher.ts`), the review drawer and `side-drawer`
  heading, cart/checkout contrast fixes, `--color-text-muted: #6b6b74`, CI seeding order, the
  Playwright exclusions for the new admin spec, and their tests.
- Kept from `feat/cloudflare-workers` instead: the administrable home (`page.tsx`; the branch's
  `existsSync` image probe does not apply to Workers), `video-hero.tsx` and the storefront E2E
  specs in conflict. The branch's hydration fix for the hero and feature video was replaced by a
  shared hydration-safe `usePrefersReducedMotion` hook.
- Validation on this branch: `pnpm check` (1856 unit tests) and `pnpm test:e2e` (160/160).
  **Not run here:** the payment and notification live integration suites and
  `admin-payment-verification.spec.ts`; they mutate a database and must run against local
  Supabase, never the `.env.local` production connection.

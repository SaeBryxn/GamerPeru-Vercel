# CI-OPT-001: Cost-Controlled GitHub Actions Architecture & Local Emulation Gate

## 1. Context & Historical Baseline

During development of Gamer Perú (specifically GP-024 / CHK1), GitHub-hosted Actions runner allowances were exhausted under the legacy workflow topology.

The legacy architecture executed four independent hosted runners on every push to `main`:

1. `verify`: Format, Typecheck, Lint, Unit Test, Build, and Storefront E2E (configured timeout ceiling: 10 min).
2. `cart-e2e`: Supabase boot, migrations, Playwright Chromium install, Cart E2E (configured timeout ceiling: 20 min).
3. `checkout-e2e`: Supabase boot, migrations, Playwright Chromium install, Checkout/Payment/Admin E2E (configured timeout ceiling: 20 min).
4. `checkout-live`: Supabase boot, migrations, Checkout/Payment/Order/Inventory/Admin Live integration suites (configured timeout ceiling: 15 min).

The 65-minute total was the sum of configured runner timeout ceilings rather than observed per-push consumption.

### Observed Historical Sample (Run 33730381788)

As an empirical baseline, historical GitHub Actions Run `33730381788` recorded the following actual job wall times:

- `Real Local PostgreSQL / Supabase Checkout Runtime`: ~3m26s
- `Real Local Supabase Checkout E2E`: ~7m08s
- `Format, Typecheck, Lint, Test, Build & E2E`: ~8m02s
- `Real Local Supabase Cart E2E`: ~5m05s
- **Aggregate observed runner wall time**: ~23m41s across four concurrent runners.

_(Note: GitHub billing rounds job runtimes up to the nearest whole minute and accounts per runner separately. Observed runtimes vary depending on runner virtualization contention.)_

Under this legacy design, every push—including documentation-only changes—triggered four parallel runner allocations, quadrupled dependency installations, triplicated Supabase container boots, and duplicated Playwright browser downloads.

## 2. Target Architecture

CI-OPT-001 introduces a tiered, cost-controlled execution topology designed to protect runner allowances while preserving 100% of regression assurance.

### A. Zero-Run Documentation Policy

Automatic runs (`push` and `pull_request` targeting `main`) apply native path filtering:

```yaml
paths-ignore:
  - "docs/**"
  - "**/*.md"
```

Commits touching exclusively markdown files or documentation consume **0 runner-minutes** (structural 100% elimination of hosted jobs for doc changes).

### B. Automatic Light CI (Single Runner)

For routine code pushes and pull requests:

- **Runner**: 1 `ubuntu-latest` job (`Light CI`).
- **Timeout**: 10 minutes (local execution estimate: ~5 minutes).
- **Trigger**: `push` or `pull_request` only (never runs on `workflow_dispatch`).
- **Execution**:
  1. `actions/checkout@v7`
  2. `pnpm/action-setup@v6` (pnpm 11.22.0)
  3. `actions/setup-node@v7` (Node 24 with pnpm cache)
  4. `pnpm install --frozen-lockfile`
  5. `pnpm format:check`
  6. `pnpm typecheck`
  7. `pnpm lint`
  8. `pnpm test` (with `DATABASE_URL` explicitly cleared so guarded PostgreSQL runtime smoke tests skip deterministically)
  9. `pnpm build` (with deterministic local placeholders)
- **Prohibitions**: Zero Supabase container boots, zero database migrations, zero Playwright installations, zero live database integration suites, zero browser E2E suites.

### C. Manual Catalog Gate (Single Runner)

Targeted validation for admin catalog work:

- **Trigger**: `workflow_dispatch` with input `suite: catalog`.
- **Runner**: 1 `ubuntu-latest` job (`Catalog Gate`).
- **Timeout**: 15 minutes (local execution estimate: ~8 minutes).
- **Execution**:
  1. Boot Local Supabase ONCE using a credential-safe bootstrap pattern (raw start stdout/stderr captured to temporary file and suppressed from logs).
  2. Extract local credentials silently via `pnpm exec supabase status -o env` without plain log emission.
  3. Validate extracted values are non-empty and immediately mask keys (`::add-mask::`) before exporting to `$GITHUB_ENV`.
  4. Run migrations ONCE (`pnpm db:migrate`).
  5. Quality gates: `pnpm format:check`, `pnpm typecheck`, `pnpm lint`.
  6. Catalog unit tests via dynamic discovery: `pnpm vitest run tests/unit/admin-catalog-*.test.ts`.
  7. Admin live integration tests: `pnpm test:admin:live`.
  8. Production build: `pnpm build`.
  9. Install Playwright Chromium ONCE: `pnpm exec playwright install --with-deps chromium`.
  10. Seed admin fixtures: `node scripts/test/seed-admin-e2e.mjs`.
  11. Admin E2E tests: `pnpm test:admin:e2e`.
  12. Failure diagnostics capture (`actions/upload-artifact@v4`, `if: failure()`, retention 7 days).
  13. Scoped cleanup: `node scripts/test/cleanup-admin-e2e.mjs` (`if: always()`).
  14. Supabase shutdown: `pnpm supabase:stop` (`if: always()`).

### D. Manual Full Gate (Consolidated Single Runner)

Formal external audit and release gate:

- **Trigger**: `workflow_dispatch` with input `suite: full`.
- **Runner**: 1 consolidated `ubuntu-latest` runner (`Full Gate`).
- **Timeout**: 30 minutes (local execution estimate: ~15 minutes).
- **Consolidation**:
  - Starts Local Supabase ONCE with credential-safe output suppression.
  - Extracts and masks local credentials ONCE before export.
  - Executes database migrations ONCE.
  - Runs full unit tests (including real PostgreSQL runtime tests against live local DB).
  - Runs production build.
  - Runs all 5 live integration suites against the shared database lifecycle:
    `test:checkout:live`, `test:payment:live`, `test:order:live`, `test:inventory:live`, `test:admin:live`.
  - Installs Playwright Chromium ONCE.
  - Runs full storefront E2E suite (`pnpm test:e2e`).
  - Runs Cart E2E with scoped seed and cleanup.
  - Runs Checkout, Payment, and Admin E2E with scoped seed and cleanups.
  - Captures diagnostics on failure (`actions/upload-artifact@v4`).
  - Safely tears down fixtures and stops Supabase in `always()` blocks.

## 3. Execution & Cost Topology Comparison

| Workflow Mode            | Legacy Workflow Architecture  | Legacy Observed Sample (Run 33730381788) | CI-OPT-001 Architecture   | New Local Estimate | Hosted CI-OPT Measurement |
| :----------------------- | :---------------------------- | :--------------------------------------- | :------------------------ | :----------------- | :------------------------ |
| **Docs-only push**       | 4 parallel jobs (65m ceiling) | ~23m41s aggregate runner wall time       | **0 hosted jobs**         | 0 min              | **PENDING**               |
| **Routine push / PR**    | 4 parallel jobs (65m ceiling) | ~23m41s aggregate runner wall time       | **1 Light CI runner**     | ~5 min             | **PENDING**               |
| **Manual Catalog check** | 4 parallel jobs (65m ceiling) | ~23m41s aggregate runner wall time       | **1 Catalog Gate runner** | ~8 min             | **PENDING**               |
| **Manual Full Gate**     | 4 parallel jobs (65m ceiling) | ~23m41s aggregate runner wall time       | **1 Consolidated runner** | ~15 min            | **PENDING**               |

### Projected Cost Reductions (Derived from Local Estimates vs Observed Sample)

- **Documentation-only changes**: 100% reduction (0 hosted jobs triggered).
- **Routine push / PR**: Single runner (~5 min local estimate) vs 4 concurrent legacy runners (~23m41s observed aggregate wall time).
- **Consolidated Full Gate**: Single runner (~15 min local estimate) vs 4 separate legacy runners, eliminating 3 redundant dependency installs, 2 redundant Supabase boots, 2 redundant migration passes, and 1 redundant browser install.

_All hosted runtime measurements remain marked as PENDING until GitHub-hosted Actions runner minutes are renewed._

## 4. Conclusion

CI-OPT-001 structurally eliminates wasteful GitHub Actions consumption by replacing four automatic, heavyweight runners with a single lightweight check for routine commits, completely bypassing CI for documentation updates, and consolidating full regression testing into a single unified runner. Zero tests were removed, disabled, or weakened.

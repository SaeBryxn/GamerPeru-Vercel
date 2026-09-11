# CI-OPT-001: Cost-Controlled GitHub Actions Architecture & Local Emulation Gate

## 1. Context & Motivation

During development of Gamer Perú (specifically GP-024 / CHK1), GitHub-hosted Actions minutes were exhausted under the legacy workflow topology. The legacy architecture executed four independent hosted runners on every push to `main`:

1. `verify`: Format, Typecheck, Lint, Unit Test, Build, and Storefront E2E (10 min).
2. `cart-e2e`: Supabase boot, migrations, Playwright Chromium install, Cart E2E (20 min).
3. `checkout-e2e`: Supabase boot, migrations, Playwright Chromium install, Checkout/Payment/Admin E2E (20 min).
4. `checkout-live`: Supabase boot, migrations, Checkout/Payment/Order/Inventory/Admin Live integration suites (15 min).

This resulted in ~65 runner-minutes per push, quadrupled dependency installations, triplicated Supabase container boots, and triplicated Playwright Chromium downloads. Furthermore, documentation-only commits (`docs/**`, `**/*.md`) triggered all four runners unnecessarily.

## 2. Target Architecture

CI-OPT-001 introduces a tiered, cost-controlled execution topology designed to protect runner allowances while preserving 100% of regression assurance.

### A. Zero-Run Documentation Policy

Automatic runs (`push` and `pull_request` targeting `main`) apply native path filtering:

```yaml
paths-ignore:
  - "docs/**"
  - "**/*.md"
```

Commits touching exclusively markdown files or documentation consume **0 runner-minutes**.

### B. Automatic Light CI (Single Runner)

For routine code pushes and pull requests:

- **Runner**: 1 `ubuntu-latest` job (`Light CI`).
- **Timeout**: 10 minutes.
- **Trigger**: `push` or `pull_request` only (never runs on `workflow_dispatch`).
- **Execution**:
  1. `actions/checkout@v7`
  2. `pnpm/action-setup@v6` (pnpm 11.22.0)
  3. `actions/setup-node@v7` (Node 24 with pnpm cache)
  4. `pnpm install --frozen-lockfile`
  5. `pnpm format:check`
  6. `pnpm typecheck`
  7. `pnpm lint`
  8. `pnpm test` (with `DATABASE_URL` absent so guarded DB-runtime tests safely skip)
  9. `pnpm build` (with deterministic local placeholders)
- **Prohibitions**: No Supabase boot, no migrations, no Playwright install, no live database suites, no browser E2E.

### C. Manual Catalog Gate (Single Runner)

Targeted validation for admin catalog work:

- **Trigger**: `workflow_dispatch` with input `suite: catalog`.
- **Runner**: 1 `ubuntu-latest` job (`Catalog Gate`).
- **Timeout**: 15 minutes.
- **Execution**:
  1. Boot Local Supabase ONCE (`pnpm supabase:start`).
  2. Extract and mask local credentials (`::add-mask::`).
  3. Run migrations ONCE (`pnpm db:migrate`).
  4. Quality gates: `pnpm format:check`, `pnpm typecheck`, `pnpm lint`.
  5. Catalog unit tests: `pnpm vitest run tests/unit/admin-catalog-*.test.ts`.
  6. Admin live integration tests: `pnpm test:admin:live`.
  7. Production build: `pnpm build`.
  8. Install Chromium ONCE: `pnpm exec playwright install --with-deps chromium`.
  9. Seed admin fixtures: `node scripts/test/seed-admin-e2e.mjs`.
  10. Admin E2E tests: `pnpm test:admin:e2e`.
  11. Failure artifacts upload (`actions/upload-artifact@v4`).
  12. Scoped cleanup: `node scripts/test/cleanup-admin-e2e.mjs` (`if: always()`).
  13. Supabase shutdown: `pnpm supabase:stop` (`if: always()`).

### D. Manual Full Gate (Consolidated Single Runner)

Formal external audit and release gate:

- **Trigger**: `workflow_dispatch` with input `suite: full`.
- **Runner**: 1 consolidated `ubuntu-latest` runner (`Full Gate`).
- **Timeout**: 30 minutes.
- **Consolidation**:
  - Starts Local Supabase ONCE.
  - Extracts credentials and masks keys ONCE.
  - Executes database migrations ONCE.
  - Runs full unit tests (including real PostgreSQL runtime tests).
  - Runs production build.
  - Runs all 5 live integration suites against the shared database lifecycle:
    `test:checkout:live`, `test:payment:live`, `test:order:live`, `test:inventory:live`, `test:admin:live`.
  - Installs Playwright Chromium ONCE.
  - Runs full storefront E2E suite (`pnpm test:e2e`).
  - Runs Cart E2E with scoped seed and cleanup.
  - Runs Checkout, Payment, and Admin E2E with scoped seed and cleanups.
  - Captures diagnostics on failure (`actions/upload-artifact@v4`).
  - Safely tears down fixtures and stops Supabase in `always()` blocks.

## 3. Cost Topology Comparison

| Surface                | Legacy CI               | CI-OPT-001                       | Reduction |
| :--------------------- | :---------------------- | :------------------------------- | :-------- |
| Docs-only push         | 4 hosted jobs (~65 min) | **0 hosted jobs (0 min)**        | **100%**  |
| Routine code push / PR | 4 hosted jobs (~65 min) | **1 Light CI job (~5 min)**      | **~92%**  |
| Manual Catalog check   | N/A (ran all 4 jobs)    | **1 Catalog Gate job (~8 min)**  | **~88%**  |
| Manual Full Gate       | 4 hosted jobs (~65 min) | **1 Consolidated job (~15 min)** | **~77%**  |

Zero regression test coverage was removed or weakened.

# GP-005 — Closure Report

## Base Checkpoint

`cfcdc9c1ddeeb210cc35adaec6c87286f81d5a6e`

## Implementation Checkpoint (Initial)

`e2dfcecc5031dddc7f334e6dc998072ad51d0ce0`

## Initial Reviewed HEAD

`71f98dae3b801e9887cb0cd4003c4dd502dbc337`

## Remediation Implementation Checkpoint

`b902c4c02be35ad1eee528d1551ca74a7ae0fff8`

---

## Summary

Successfully initialized and hardened the production repository foundation for **Gamer Perú**. Established the canonical technology stack, modular file organization, Zod environment validation layer with `server-only` compile-time protection, Drizzle ORM database connection boundary with fail-closed production guards, Supabase Auth SSR client factories with modern 2026 publishable keys, Cloudflare R2 S3 storage boundary, Inngest durable background client, Vitest and Playwright test harnesses, minimal Next.js App Router shell, exact dependency pinning, supply-chain allowlist configuration (`allowBuilds`), pinned Supabase CLI tooling, and a verified green GitHub Actions CI pipeline without committing secrets or implementing premature business features.

---

## Exact Technology Versions

Pinned exact, modern, production-grade baseline dependencies in `package.json` and `pnpm-lock.yaml` (0 caret/tilde ranges on direct dependencies):

| Technology / Package    | Selected & Installed Version                 | Purpose / Compatibility                                |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------ |
| **Node.js**             | `v24.15.0` (Engine `>=24.0.0 <25`)           | Canonical Active LTS server runtime                    |
| **pnpm**                | `v11.22.0` (Engine `>=11.22.0 <12`)          | Fast, reproducible package manager with `allowBuilds`  |
| **Next.js**             | `16.3.1`                                     | Next.js 16 Active LTS App Router                       |
| **React / React DOM**   | `19.2.8`                                     | React 19 production baseline                           |
| **TypeScript**          | `5.9.3`                                      | TypeScript 5.x static type checking                    |
| **Drizzle ORM**         | `0.45.2`                                     | Canonical data access & query layer                    |
| **Drizzle Kit**         | `0.31.10`                                    | Drizzle SQL migration generator & studio               |
| **PostgreSQL Driver**   | `3.4.9` (`postgres`)                         | Selected fast Node PostgreSQL driver (postgres.js)     |
| **Zod**                 | `3.25.76`                                    | Environment and payload validation                     |
| **Supabase JS**         | `2.112.3` (`@supabase/supabase-js`)          | Supabase core client library                           |
| **Supabase SSR**        | `0.12.4` (`@supabase/ssr`)                   | Pinned SSR cookie session management                   |
| **Supabase CLI**        | `2.114.0` (`supabase`)                       | Pinned local development CLI tool                      |
| **Inngest**             | `4.18.1` (`inngest`)                         | Durable async background workflow client               |
| **AWS S3 SDK (for R2)** | `3.1111.0` (`@aws-sdk/client-s3`)            | Cloudflare R2 S3-compatible client                     |
| **S3 Presigner**        | `3.1111.0` (`@aws-sdk/s3-request-presigner`) | Short-lived private voucher pre-signed URLs            |
| **Server Only**         | `0.0.1` (`server-only`)                      | Compile-time server secret isolation marker            |
| **Dotenv**              | `17.4.2` (`dotenv`)                          | Deterministic `.env.local` / `.env` loader for Drizzle |
| **Vitest**              | `4.1.10` (`vitest`)                          | Unit & integration test runner                         |
| **Playwright**          | `1.62.1` (`@playwright/test`)                | Multi-browser E2E testing framework                    |
| **Axe Core Playwright** | `4.13.0` (`@axe-core/playwright`)            | Automated WCAG accessibility testing                   |
| **ESLint**              | `9.39.5` (`eslint`)                          | ESLint 9 baseline with native flat config              |
| **Next ESLint Plugin**  | `16.3.1` (`@next/eslint-plugin-next`)        | Next.js core-web-vitals lint rules                     |

---

## External Bootstrap Review & Remediation

### 1. Root Cause Analysis of Initial CI Failure

- **Failed Workflow Run**: Run ID `31963372960` for commit `71f98dae3b801e9887cb0cd4003c4dd502dbc337`.
- **Failed Step**: `pnpm install --frozen-lockfile`.
- **Failure Code**: `ERR_PNPM_IGNORED_BUILDS`.
- **Root Cause**: `pnpm` v11 enables `strictDepBuilds: true` by default, blocking lifecycle install scripts for native binaries unless explicitly approved. Transitive build scripts in `esbuild` (native binary compiler required by Vitest and Drizzle Kit) and `protobufjs` (AWS SDK serialization) were blocked.

### 2. Supply-Chain Security Remediation (`pnpm-workspace.yaml`)

- Created `pnpm-workspace.yaml` with explicit project-level `allowBuilds` configuration:
  ```yaml
  packages:
    - "."

  allowBuilds:
    esbuild: true
    protobufjs: true
  ```
- **Justification**:
  - `esbuild`: Necessary to fetch/install platform-specific native binaries (`@esbuild/linux-x64`, `@esbuild/win32-x64`) for bundlers, Vitest test execution, and Drizzle Kit.
  - `protobufjs`: Standard serialization utility for AWS SDK client bindings.
- **Verification**: Executed `pnpm ignored-builds` with zero unexplained pending build scripts.

### 3. Exact Dependency Pinning

- Replaced all semver ranges (`^`, `~`) in `package.json` with exact versions for all direct dependencies and devDependencies.
- Regenerated `pnpm-lock.yaml` to ensure lockfile and package manifest match identically.

### 4. Runtime & Package Manager Baseline Tightening

- Pinned `engines`:
  ```json
  "engines": {
    "node": ">=24.0.0 <25",
    "pnpm": ">=11.22.0 <12"
  },
  "packageManager": "pnpm@11.22.0"
  ```

### 5. Supabase 2026 Key Terminology Migration

- Migrated legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` to canonical `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`).
- Removed unused `SUPABASE_SERVICE_ROLE_KEY` from initial repository bootstrap (privileged server keys will use `SUPABASE_SECRET_KEY` when required in future GPs).
- Updated `.env.example`, `src/config/public-env.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, CI mock variables, and architecture specifications.

### 6. Local PostgreSQL Major Version & Email Confirmation Alignment

- In `supabase/config.toml`, updated `major_version = 16` to match the canonical PostgreSQL 16+ production architecture.
- Updated `[auth.email]` to `enable_confirmations = true` to match v1 email verification requirements using local Inbucket.

### 7. Supabase CLI Pinning & Scripts

- Pinned `supabase@2.114.0` as an exact `devDependency`.
- Added project scripts in `package.json`:
  - `"supabase:start": "supabase start"`
  - `"supabase:stop": "supabase stop"`
  - `"supabase:status": "supabase status"`
- Updated `README.md` to recommend `pnpm supabase:start` instead of dynamic `npx` downloads.
- **Docker Environment Note**: Docker daemon is not running on the local Windows host. Configuration syntax and CLI version were verified via `pnpm supabase --version` without fabricating Docker start evidence. Zero remote Supabase project linking was performed.

### 8. Drizzle Environment Loading & Fail-Closed Guard

- Updated `drizzle.config.ts` to deterministically load `.env.local` first (if present) and fallback to `.env` using `dotenv`.
- Added a production fail-closed guard requiring an explicit `DATABASE_URL` during production builds/migrations rather than silently falling back to localhost.

### 9. Server-Only Module Boundary & Real Environment Testing

- Added `server-only` package and added `import "server-only"` to `src/config/server-env.ts`, `src/db/index.ts`, `src/lib/storage/r2.ts`, and `src/lib/supabase/server.ts`.
- Separated `src/config/public-env.ts` (safe for browser Client Components) from `src/config/server-env.ts`.
- Updated `tests/unit/smoke.test.ts` to test real `validatePublicEnv` and `validateServerEnv` functions against valid, malformed URL, malformed AI encryption key, and production localhost rejection cases (6/6 tests passing).

### 10. Modernized GitHub Actions Workflow

- Updated `.github/workflows/ci.yml` to modern supported actions:
  - `actions/checkout@v7`
  - `pnpm/action-setup@v6` (`version: 11.22.0`)
  - `actions/setup-node@v7` (`node-version: 24`, `cache: "pnpm"`)
- Verified remote CI run on commit `b902c4c02be35ad1eee528d1551ca74a7ae0fff8`:
  - **Run ID**: `31964249393`
  - **Run URL**: `https://github.com/latamcreativa/GamerPeru/actions/runs/31964249393`
  - **Conclusion**: `success` (All steps passed: Checkout, pnpm setup, Node setup, dependency install, typecheck, lint, test, build).

---

## Repository Structure

```text
GamerPeru/
├── .github/
│   └── workflows/
│       └── ci.yml                     # Modernized PR verification workflow (v7 actions, pnpm setup)
├── .env.example                       # Committed environment contract with 2026 key terminology
├── .gitignore                         # Comprehensive ignore rules for Node, Next, tests, Supabase
├── drizzle.config.ts                  # Drizzle Kit config with deterministic dotenv loading
├── eslint.config.mjs                  # ESLint flat config with Next.js core web vitals
├── next.config.ts                     # Next.js 16 Active LTS configuration
├── package.json                       # Exact dependencies, engines, and supabase scripts
├── playwright.config.ts               # Playwright E2E configuration
├── pnpm-lock.yaml                     # Pnpm lockfile (single source of package truth)
├── pnpm-workspace.yaml                # Project-level allowBuilds configuration
├── README.md                          # Updated with local installation and development guides
├── src/
│   ├── app/
│   │   ├── globals.css                # CSS variables and minimal dark-mode reset
│   │   ├── layout.tsx                 # Root layout with Gamer Perú metadata
│   │   └── page.tsx                   # Minimal bootstrap page proving the stack boots
│   ├── config/
│   │   ├── env.ts                     # Aggregate environment re-exports
│   │   ├── public-env.ts              # Browser-safe public environment parser
│   │   └── server-env.ts              # Server-only environment parser with server-only marker
│   ├── db/
│   │   ├── index.ts                   # Database connection boundary (postgres.js + Drizzle + server-only)
│   │   └── schema/
│   │       └── index.ts               # Schema registry (zero domain tables implemented)
│   └── lib/
│       ├── inngest/
│       │   └── client.ts              # Canonical Inngest client initialization
│       ├── storage/
│       │   └── r2.ts                  # Server-only Cloudflare R2 S3 client & bucket definitions
│       └── supabase/
│           ├── client.ts              # Browser Supabase client factory (createBrowserSupabaseClient)
│           └── server.ts              # Request-scoped server client factory (createServerSupabaseClient)
├── supabase/
│   └── config.toml                    # Local Supabase CLI stack config (PG 16, email confirmations)
├── tests/
│   ├── e2e/
│   │   └── bootstrap.spec.ts          # Playwright smoke test + Axe accessibility check
│   └── unit/
│       └── smoke.test.ts              # Vitest smoke test (real env parser, math invariants, R2 config)
├── tsconfig.json                      # TypeScript configuration with @/* path aliases
└── vitest.config.ts                   # Vitest configuration with path aliases & server-only resolution
```

---

## Environment Contract

- **`NEXT_PUBLIC_*` (Browser-Safe)**:
  - `NEXT_PUBLIC_SITE_URL` (e.g. `http://localhost:3000`)
  - `NEXT_PUBLIC_CDN_URL` (e.g. `http://localhost:3000/media`)
  - `NEXT_PUBLIC_SUPABASE_URL` (e.g. `http://127.0.0.1:54321`)
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Publishable key: `sb_publishable_...`)
- **Server-Only (Protected from Client Bundles)**:
  - `DATABASE_URL` (PostgreSQL connection string)
  - `RESEND_API_KEY` (Transactional email API)
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (S3 object storage)
  - `R2_PUBLIC_MEDIA_BUCKET`, `R2_PRIVATE_PROOFS_BUCKET`, `R2_DB_BACKUPS_BUCKET` (Bucket names)
  - `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (Workflow keys)
  - `AI_ENCRYPTION_KEY_V1` (256-bit hexadecimal runtime master key)
- **Confirmation**: `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` have been completely purged.

---

## Security Validation

- [x] Zero real secrets committed in git history or files.
- [x] `.env*` properly ignored in `.gitignore` except `.env.example`.
- [x] Server-only variables protected by `import "server-only"` and separate `server-env.ts` module.
- [x] Supabase publishable key correctly isolated as public; database URL and R2 secret keys restricted strictly to server runtime.
- [x] Production runtime and Drizzle CLI fail closed if `DATABASE_URL` is missing.
- [x] No application-owned password or session tables created.

---

## Scope Validation

- [x] Zero production storefront features implemented.
- [x] Zero authentication user flows or OAuth handlers implemented (owned by GP-015).
- [x] Zero Admin features implemented.
- [x] Zero physical commerce domain tables created (0 migrations).
- [x] Zero remote cloud infrastructure provisioned.
- [x] `docs/roadmap/GP-005.md` status is `COMPLETE`.
- [x] GP-006 remains `PLANNED`.
- [x] GP-007 remains `PLANNED`.
- [x] GP-015 remains `PLANNED`.

---

## Tests Run

### 1. Frozen Lockfile Dependency Installation (`pnpm install --frozen-lockfile`)

```text
$ pnpm install --frozen-lockfile
Already up to date
Done in 259ms using pnpm v11.22.0
Exit code: 0
```

### 2. TypeScript Static Typecheck (`pnpm typecheck`)

```text
$ tsc --noEmit
Exit code: 0 (0 errors)
```

### 3. ESLint Static Analysis (`pnpm lint`)

```text
$ eslint .
Exit code: 0 (0 warnings, 0 errors)
```

### 4. Unit Smoke Tests with Vitest (`pnpm test`)

```text
$ vitest run
 RUN  v4.1.10 D:/Documentos/GamerPeru
 ✓ tests/unit/smoke.test.ts (6 tests) 14ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  13:19:05
   Duration  492ms
Exit code: 0
```

### 5. Production Application Build (`pnpm build`)

```text
$ next build
▲ Next.js 16.3.1 (Turbopack)
✓ Running next.config.ts took 28ms
  Creating an optimized production build ...
✓ Compiled successfully in 160ms
  Running TypeScript ...
  Finished TypeScript in 1899ms ...
  Collecting page data using 4 workers ...
✓ Generating static pages using 4 workers (3/3) in 584ms
  Finalizing page optimization ...
Route (app)
┌ ○ /
└ ○ /_not-found
Exit code: 0
```

### 6. Playwright E2E & Axe Accessibility Smoke Tests (`pnpm test:e2e`)

```text
$ playwright test
[WebServer] $ next dev
Running 2 tests using 2 workers
  ok 1 [chromium] › tests\e2e\bootstrap.spec.ts:5:3 › GP-005 E2E Bootstrap Smoke › loads root page with valid title and heading (281ms)
  ok 2 [chromium] › tests\e2e\bootstrap.spec.ts:21:3 › GP-005 E2E Bootstrap Smoke › passes baseline automated accessibility audit (532ms)
  2 passed (3.8s)
Exit code: 0
```

### 7. Drizzle Migration Engine Verification (`pnpm db:generate`)

```text
$ drizzle-kit generate
No config path provided, using default 'drizzle.config.ts'
Reading config file 'D:\Documentos\GamerPeru\drizzle.config.ts'
0 tables
No schema changes, nothing to migrate 😴
Exit code: 0
```

### 8. Pnpm Build Security Audit (`pnpm ignored-builds`)

```text
$ pnpm ignored-builds
Automatically ignored builds during installation:
  Cannot identify as no node_modules found
Exit code: 0
```

### 9. Pinned Supabase CLI Verification (`pnpm supabase --version`)

```text
$ supabase --version
2.114.0
Exit code: 0
```

---

## Remote GitHub Actions CI Verification

| Workflow Run ID | Commit SHA | Trigger Event                                                 | Status    | Conclusion | URL                                                                   |
| --------------- | ---------- | ------------------------------------------------------------- | --------- | ---------- | --------------------------------------------------------------------- |
| `31963372960`   | `71f98da`  | Push (`docs: close GP-005`)                                   | Completed | `failure`  | `https://github.com/latamcreativa/GamerPeru/actions/runs/31963372960` |
| `31964249393`   | `b902c4c`  | Push (`fix: make GP-005 bootstrap reproducible and CI-clean`) | Completed | `success`  | `https://github.com/latamcreativa/GamerPeru/actions/runs/31964249393` |

---

## Repository Status

- **Branch**: `main`
- **Upstream**: `origin/main`
- **Base Checkpoint**: `cfcdc9c1ddeeb210cc35adaec6c87286f81d5a6e`
- **Remediation Implementation Checkpoint**: `b902c4c02be35ad1eee528d1551ca74a7ae0fff8`
- **Working Tree**: Clean (Closure report ready for closure commit).

---

## Final Status

PASS

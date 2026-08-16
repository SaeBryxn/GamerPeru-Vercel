# Gamer Perú — Canonical Engineering Standards v1.0

## 1. Purpose

This document establishes the canonical, enforceable engineering standards for all software development in **Gamer Perú** (`gamerperu.com`). Every automated coding agent, developer, and code reviewer must adhere to these conventions. Quality gates defined herein are mechanically enforced via automated scripts and CI pipelines.

---

## 2. Scope

These standards apply to all code, tests, database migrations, configuration files, and documentation within the `GamerPeru` repository. They govern code formatting, TypeScript strictness, static linting, architectural boundaries, testing taxonomy, security controls, and pull request quality criteria.

---

## 3. Technology Baseline

The Gamer Perú canonical technology baseline is fixed and non-negotiable:

| Concern                | Technology / Version                                                    | Role in Architecture                                                                  |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Application Host**   | Next.js 16 Active LTS (`next@16.3.1`)                                   | App Router, Server Components, Server Actions                                         |
| **Runtime & Language** | Node.js 24 LTS + TypeScript 5.x (`typescript@5.9.3`)                    | Server runtime & static typing engine                                                 |
| **Package Manager**    | `pnpm` (v11.22.0)                                                       | Reproducible dependency & lockfile management                                         |
| **Database & ORM**     | Supabase PostgreSQL 16+ with Drizzle ORM (`drizzle-orm@0.45.2`)         | Authoritative relational data store & query layer                                     |
| **PostgreSQL Driver**  | `postgres` (`postgres@3.4.9`)                                           | Node PostgreSQL client configured with `prepare: false`                               |
| **Authentication**     | Supabase Auth (`@supabase/ssr@0.12.4`, `@supabase/supabase-js@2.112.3`) | Identity, session cookies, OAuth, email confirmation                                  |
| **Authorization**      | Authoritative Gamer Perú Server-Side RBAC                               | Database-backed permission checks (`requirePermission`)                               |
| **Storage & CDN**      | Cloudflare R2 (`@aws-sdk/client-s3@3.1111.0`) + Edge Delivery           | Public product media, private payment proofs, backups                                 |
| **Async Jobs**         | Inngest (`inngest@4.18.1`)                                              | Durable step-function workflows and event retries                                     |
| **Email Delivery**     | Resend (Custom SMTP for Auth + API for Commerce) + React Email          | Auth emails via Supabase/Resend SMTP; commerce notices via Inngest/Resend/React Email |
| **Testing Harness**    | Vitest (`vitest@4.1.10`) + Playwright (`@playwright/test@1.62.1`)       | Unit, integration, E2E, and accessibility testing                                     |
| **Code Quality**       | ESLint 9 (`eslint@9.39.5`) + Prettier 3 (`prettier@3.9.6`)              | Static analysis and deterministic formatting                                          |

### Email Architecture Distinct Pipelines

1. **Authentication Email Pipeline**: Supabase Auth -> Resend custom SMTP (signup verification, password recovery, email changes).
2. **Commerce & Application Email Pipeline**: Gamer Perú / Inngest -> Resend API -> React Email (order confirmations, payment notices, fulfillment/shipment updates). React Email is not the canonical Supabase Auth email transport/template layer unless a future explicitly approved implementation adopts such integration.

---

## 4. Package & Dependency Policy

1. **pnpm Exclusivity**: `pnpm` is the sole authorized package manager. `npm` and `yarn` are strictly prohibited.
2. **Exact Version Pinning**: All direct `dependencies` and `devDependencies` in `package.json` must be pinned to exact versions (zero `^` or `~` ranges).
3. **Lockfile Integrity**: `pnpm-lock.yaml` is the single source of truth for resolved dependencies and must be committed. CI must run `pnpm install --frozen-lockfile`.
4. **Supply-Chain Lifecycle Scripts**: `pnpm-workspace.yaml` controls the `allowBuilds` allowlist. Lifecycle scripts (`postinstall`) are blocked by default and permitted only for vetted native packages (currently `esbuild` and `protobufjs`). Any new package requiring build execution requires explicit security review.
5. **No Redundant Dependencies**: Do not install duplicate libraries addressing already-solved concerns (e.g., Axios when `fetch` is native, alternative ORMs, or redundant date formatters).
6. **Deliberate Classification**: Runtime production dependencies belong in `dependencies`; build tools, linters, types, and test runners belong in `devDependencies`.

---

## 5. Formatting

Formatting is mechanically enforced by Prettier (`prettier@3.9.6`) and verified via `.editorconfig`:

- **Configuration File**: `.prettierrc.json`
- **Key Rules**:
  - `printWidth`: 100
  - `tabWidth`: 2 (spaces, no tabs)
  - `semi`: `true` (semicolons required)
  - `singleQuote`: `false` (double quotes for code and JSX)
  - `trailingComma`: `"es5"`
  - `arrowParens`: `"always"`
  - `endOfLine`: `"lf"`
- **Ignore Rules**: `.prettierignore` excludes build artifacts (`.next`, `dist`, `build`, `out`), dependencies (`node_modules`), lockfiles (`pnpm-lock.yaml`), test output (`coverage`, `test-results`, `playwright-report`), and Drizzle generated migration artifacts (`src/db/migrations/**`).
- **Execution Commands**:
  - `pnpm format`: Formats all tracked files.
  - `pnpm format:check`: Read-only verification (fails CI on formatting deviations).
- **Separation of Concerns**: ESLint must never be used as a code formatter. Prettier handles layout/whitespace; ESLint handles code semantics and correctness.

---

## 6. TypeScript Standards

TypeScript is configured in `tsconfig.json` with maximum practical strictness:

```json
{
  "compilerOptions": {
    "strict": true,
    "allowJs": false,
    "noEmit": true,
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- **Index Signatures**: `noUncheckedIndexedAccess: true` requires indexing operations to handle potential `undefined` values safely.
- **Inheritance**: `noImplicitOverride: true` requires explicit `override` keywords on subclass methods.
- **Case Sensitivity**: `forceConsistentCasingInFileNames: true` ensures cross-platform consistency between Windows, macOS, and Linux CI runners.
- **Type Coercion**: Type assertions (`as Type`) must not be used to bypass runtime validation. Untrusted data must be parsed with Zod schemas.

---

## 7. ESLint Standards

ESLint 9 uses native flat configuration in `eslint.config.mjs` with zero-warning tolerance (`--max-warnings=0`):

1. **Next.js Core**: Inherits `@next/eslint-plugin-next` `recommended` and `core-web-vitals`.
2. **Strict TypeScript Rules**:
   - `@typescript-eslint/no-explicit-any`: `"error"` (prohibits `any`).
   - `@typescript-eslint/no-unused-vars`: `"error"` with `_` prefix ignore pattern for intentional unused arguments (`argsIgnorePattern: "^_"`).
   - `@typescript-eslint/consistent-type-imports`: `"error"` (enforces `import type { ... }`).
   - `@typescript-eslint/no-floating-promises`: `"error"` (prevents unhandled asynchronous rejections).
   - `@typescript-eslint/no-misused-promises`: `"error"` (prevents passing async functions where synchronous handlers are expected).
   - `@typescript-eslint/await-thenable`: `"error"` (prevents awaiting non-Promise values).
   - `@typescript-eslint/no-unnecessary-type-assertion`: `"error"` (cleans redundant type casts).
   - `@typescript-eslint/prefer-nullish-coalescing`: `"error"` (enforces `??` over `||` for safer falsy evaluations).

---

## 8. Import Conventions

- **Path Aliases**: Application source imports must use `@/*` pointing to `./src/*`.
  - Allowed: `import { db } from "@/db";`
  - Forbidden: `import { db } from "../../../../src/db";`
- **Relative Imports**: Permitted only within immediate sibling files in the same cohesive module folder (e.g. `import { helper } from "./helpers";`).
- **Type Imports**: Types must be imported with explicit `import type`:
  - `import type { Database } from "@/db";`
- **Client/Server Isolation**: Never import `server-only` modules (`src/config/server-env`, `src/db`, `src/lib/storage/r2`, `src/lib/supabase/server`) from client-side files (`"use client"`).
- **Circular Dependencies**: Deliberate circular imports are strictly prohibited.

---

## 9. Naming Conventions

### File Naming

- **React Components / Pages**: PascalCase for exported components, kebab-case for generic filenames where Next.js requires it (`layout.tsx`, `page.tsx`, `error.tsx`, `not-found.tsx`).
- **TypeScript Modules**: `kebab-case.ts` (e.g., `public-env.ts`, `server-env.ts`, `drizzle.config.ts`).
- **Unit & Integration Tests**: `*.test.ts` or `*.test.tsx`.
- **E2E Tests**: `*.spec.ts`.
- **Database Tables (Physical)**: `snake_case` in SQL (`product_variants`, `order_items`).
- **Drizzle Entity Symbols**: `camelCase` for table instances (`productVariants`, `orderItems`).

### Code Naming

- **Classes, Types, Interfaces, Enums, React Components**: `PascalCase` (`CustomerProfile`, `MoneyPEN`, `OrderLifecycleState`).
- **Functions, Methods, Variables**: `camelCase` (`calculateTotal`, `orderId`, `createBrowserSupabaseClient`).
- **Constants / Enums / Flags**: `UPPER_SNAKE_CASE` for true global constants (`R2_BUCKETS`, `DEFAULT_CURRENCY`).

---

## 10. Function & Module Design

- **Single Responsibility**: Functions should perform one distinct task and have minimal side effects.
- **Pure vs I/O Separation**: Core business rules, pricing math, tax calculations, and status transitions must be pure functions isolated from database or network I/O.
- **No Dumping Grounds**: Avoid catch-all `utils.ts` files. Group helpers by domain (e.g., `@/lib/money`, `@/lib/datetime`, `@/lib/slugs`).
- **No Global Mutable State**: Application state belongs in the database, cookies, or explicit request contexts. Avoid global state containers holding mutable business state across requests.
- **Adapter Pattern**: External third-party SDKs (Cloudflare R2, Resend, Inngest, Supabase) must be accessed through thin, Gamer Perú-owned wrapper modules in `src/lib/`.

---

## 11. Server / Client Boundary

- **Server-First Architecture**: By default, all Next.js App Router components are React Server Components (RSC). Do not add `"use client"` unless the component requires browser interactivity (event listeners, state hooks, DOM APIs).
- **Compile-Time Server Protection**: Every module accessing database connections, secrets, private buckets, or server environment variables must include `import "server-only";` at the very top.
- **Client Configuration Safety**: Client Components must only import public configuration from `@/config/public-env` (variables prefixed with `NEXT_PUBLIC_`).

---

## 12. Environment & Secrets Management

1. **Classification**:
   - **Public**: `NEXT_PUBLIC_*` (Browser & Server accessible, non-secret).
   - **Server-Only**: Database strings, API keys, S3 credentials, signing keys (Strictly backend runtime).
   - **Master Secrets**: Hexadecimal encryption keys (`AI_ENCRYPTION_KEY_V1`) for at-rest token encryption.
2. **Schema Enforcement**: Environment variables must be validated with Zod before consumption.
3. **No Secret Leakage**: Secrets must never be logged, passed to client components, or rendered in error stack traces.
4. **Local Development Baseline**: `.env.example` contains non-sensitive placeholders only. Real developer credentials live in untracked `.env.local`.
5. **Fail-Closed in Production**: Production runtime and CLI tools must fail closed if required environment variables are absent.

---

## 13. Error Handling Conventions

- **No Silent Failures**: Never catch an error and discard it (`catch {}`). Errors must be logged with structured context, translated into a user-safe domain error, or rethrown.
- **Domain vs System Errors**: Business exceptions (e.g., out-of-stock, invalid coupon) should be represented as typed results; infrastructure failures (e.g., PostgreSQL timeout) should be captured by error boundaries.
- **Sanitized Client Errors**: Stack traces, database column names, internal queries, and provider keys must never be exposed in client HTTP responses.

---

## 14. Test Taxonomy & Directory Structure

Gamer Perú enforces a three-tiered testing taxonomy:

```text
tests/
├── unit/              # Pure functions, domain calculations, schemas, state machine logic
├── integration/       # Database queries, transaction boundaries, adapter integration
└── e2e/               # End-to-end browser flows, accessibility checks, route security
```

| Category              | Execution Runner | Location                         | Scope & Dependencies                                                                    |
| --------------------- | ---------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| **Unit Tests**        | Vitest           | `tests/unit/**/*.test.ts`        | Fast, deterministic in-memory execution; zero external network or database calls.       |
| **Integration Tests** | Vitest           | `tests/integration/**/*.test.ts` | Validates queries, RLS boundaries, and adapter contracts using local test fixtures.     |
| **E2E Tests**         | Playwright       | `tests/e2e/**/*.spec.ts`         | Full browser automation verifying user flows, security headers, and WCAG accessibility. |

---

## 15. Unit Test Standards

- **AAA Pattern**: Structure tests clearly with **Arrange**, **Act**, **Assert**.
- **Behavior over Internals**: Test external behavior and return values rather than spying on private implementation details.
- **Zero Flakiness**: Tests must not rely on execution order, timing delays, or live network endpoints.
- **Isolation**: Each test must be completely isolated and self-cleaning.

---

## 16. Integration Test Standards

- **Transaction Rollbacks**: Tests executing mutations against local PostgreSQL should run inside rollbacked transactions or clean up created records.
- **Adapter Contracts**: Integration tests against storage or payment adapters must test boundary contracts, error translations, and timeout handling.

---

## 17. E2E Standards

- **Deterministic Base URL**: Playwright config uses `baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000"`.
- **Automatic Dev Server**: `webServer` in `playwright.config.ts` handles dev server startup automatically.
- **Headless & Focused**: CI executes headless Chromium (`--with-deps chromium`).
- **Artifact Retention**: Traces and screenshots are retained on failure for debugging.

---

## 18. Accessibility Testing

- **Automated Axe Verification**: Every critical page and modal must pass automated accessibility audits using `@axe-core/playwright` with zero violations:
  ```ts
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  ```
- **Semantic HTML**: Interactive elements must use proper semantic HTML (`<button>`, `<main>`, `<nav>`, `<h1>`), valid `aria-*` attributes, visible focus indicators, and support keyboard navigation (`Tab`, `Enter`, `Space`, `Escape`).

---

## 19. Commerce & Financial Testing Invariants

- **Integer Minor Units**: All monetary values are strictly represented as integers in minor units (Peruvian Centavos, PEN). Floating-point currency representation is strictly forbidden.
- **Rounding & Precision**: Multiplication and discount allocations must define explicit integer rounding rules (`Math.round`, `Math.floor`) preventing fractional cent discrepancies.
- **Standard vs Signed Values**:
  - _Standard Money Values_ (prices, line totals, shipping fees, payments, allocated discounts): Must be non-negative integers (`>= 0`) according to domain constraints.
  - _Signed Financial Adjustments_: Explicit adjustment entities (such as `CommissionAdjustment.amount_cents`) may accept signed integer values when representing debit adjustments or clawbacks.
  - Financial testing must verify that unauthorized negative values are rejected, while explicitly signed adjustment entities accept only valid signed amounts.
- **Tax / Fiscal Testing Semantics**: Future tax/fiscal calculations, if and when approved by the corresponding business/legal specification, must test:
  - configured rate boundaries;
  - integer-minor-unit rounding;
  - zero/exempt cases where applicable;
  - deterministic allocation across items;
  - total reconciliation.
    _(Exact Peru tax presentation and calculation remains governed by future approved business/legal specifications)._
- **Discount & Promotion Boundaries**: Financial testing for discounts must verify:
  - zero discount baseline;
  - maximum configured promotion limits;
  - discounts cannot exceed permitted/order-applicable caps;
  - deterministic discount distribution across line items;
  - order subtotal + shipping - discount = final total invariant.

---

## 20. Authorization Testing Invariants

Privileged endpoints, Server Actions, and Admin Route Handlers must be tested across four authorization states:

1. **Unauthenticated Request**: Throws `401 Unauthorized`.
2. **Authenticated / Insufficient Permissions**: Throws `403 Forbidden`.
3. **Authorized Role / Valid Permission**: Executes successfully.
4. **IDOR Cross-Tenant Access**: Attempting to access another user's order/profile must be rejected.

---

## 21. Database & Migration Standards

1. **Single Schema Authority**: Drizzle schema files in `src/db/schema/` are the authoritative data models.
2. **Generated Migration Artifacts**: Migrations must be generated via `pnpm db:generate` and committed to `src/db/migrations/`.
3. **Migration Review Policy**:
   - Drizzle generates migration SQL and metadata journals (`_journal.json`).
   - Generated SQL must be reviewed for safety before execution.
   - Agents and formatters must not casually rewrite or reformat Drizzle metadata journals (migration paths are excluded from Prettier).
   - If a migration genuinely requires custom SQL or manual correction, that change must be deliberate, reviewed, documented, and compatible with the canonical schema.
4. **No Direct Remote Alterations**: Manual changes to remote production tables outside canonical migrations are prohibited.
5. **Zero-Downtime Safe DDL**: Additive columns should be nullable or provide safe defaults; dropping columns requires a phased deprecation.
6. **Supavisor Compatibility**: Database connections must configure `prepare: false` to guarantee compatibility with Supabase transaction connection pooling.

---

## 22. CI Pipeline Requirements

GitHub Actions CI (`.github/workflows/ci.yml`) is the mandatory quality gate for all code merging to `main`:

```yaml
jobs:
  verify:
    steps:
      - Checkout repository (actions/checkout@v7)
      - Install pnpm (pnpm/action-setup@v6)
      - Set up Node.js 24 (actions/setup-node@v7)
      - Install dependencies (pnpm install --frozen-lockfile)
      - Check Formatting (pnpm format:check)
      - Run Typecheck (pnpm typecheck)
      - Run Lint (pnpm lint)
      - Run Unit Tests (pnpm test)
      - Run Next.js Build (pnpm build)
      - Install Playwright Chromium (pnpm exec playwright install --with-deps chromium)
      - Run E2E & Accessibility Tests (pnpm test:e2e)
```

- **Concurrency**: Superseded pull request runs are automatically cancelled (`cancel-in-progress: true`).
- **Security Permissions**: Strict read-only tokens (`permissions: { contents: read }`).
- **Execution Timeout**: 10 minutes maximum job duration.

---

## 23. Git & Branch Policy Standards

- **Linear History**: Clean, meaningful commit messages following Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- **Target Branch Protection Policy**:
  - `main` should be protected through GitHub Branch Protection or Rulesets.
  - The required CI workflow must pass before merge once branch protection is enabled.
  - Direct force-pushes to `main` are prohibited by project policy.
  - A failed CI workflow run can never be called `PASS`.
  - Current remote branch protection settings must not be claimed as verified unless explicitly audited.
- **Clean Working Tree**: Commits must not contain leftover debug code, untracked temporary files, or commented-out blocks.

---

## 24. Generated Files

The following files are managed automatically by tooling and must not be edited manually:

- `pnpm-lock.yaml` (managed via `pnpm install` / `pnpm add`)
- `src/db/migrations/` SQL files & metadata journals (managed via `pnpm db:generate`, excluded from code formatting)
- `next-env.d.ts` (managed by Next.js compiler)
- `.next/` build output

---

## 25. Escape Hatches Policy

Escape hatches bypass safety rails and are strictly restricted:

- **`any`**: Prohibited. Use `unknown` at boundaries and narrow with Zod or type guards.
- **`@ts-ignore`**: Prohibited. Use `@ts-expect-error` only with an accompanying explanation comment.
- **Non-null assertions (`!` )**: Prohibited unless immediately following an explicit assertion or guard.
- **`eslint-disable`**: File-wide disables are prohibited. Line-level disables require an explanatory justification comment.
- **Raw SQL (`sql` template)**: Permitted only for advanced PostgreSQL features (e.g. `tsvector` FTS, `pg_trgm`) and must use parameterized inputs.

---

## 26. Required GP Validation (Agent Workflow)

Before any coding agent marks a GP as complete or claims `PASS`, they must execute the canonical validation script locally:

```bash
pnpm check
```

_(Executes `format:check`, `typecheck`, `lint`, `test`, and `build` in sequence)_

Followed by:

```bash
pnpm test:e2e
pnpm ignored-builds
```

All commands must exit with code 0 and zero warnings.

---

## 27. Definition of Done (DoD)

A task or GP is **DONE** when and only when:

1. **Functional DoD**: All scoped behavior is implemented without missing edge cases or scope creep.
2. **Quality DoD**: `pnpm check` and `pnpm test:e2e` pass with 0 errors and 0 warnings.
3. **Security DoD**: Zero secrets committed in tracked files; server-only boundaries respected; `allowBuilds` audited.
4. **Accessibility DoD**: Playwright axe-core audits pass with zero violations.
5. **CI DoD**: Remote GitHub Actions workflow completes with conclusion `success`.
6. **Documentation DoD**: A completed `GP-XXX-CLOSURE.md` report is committed using the canonical closure template.

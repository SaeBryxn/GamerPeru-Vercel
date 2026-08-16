# Gamer Perú — Development Specification & Repository v1.2

Canonical application repository and specifications for `gamerperu.com`.

## Mission

Build a premium multi-brand gaming-peripherals e-commerce platform for Peru with elite product presentation, original Gamer Perú identity, comprehensive commerce/Admin capabilities, strong SEO, configurable AI infrastructure, AI-assisted product import, and a privacy-controlled AI customer assistant.

---

## Canonical Roadmap

The project progresses sequentially through 53 gated tasks: **GP-000 → GP-052**.

- **GP-000 to GP-006**: System Initialization, Design System, Technology Architecture, Commerce Domain Model, Repository Bootstrap, and Engineering Standards (`COMPLETE`).
- **GP-007**: Core Tooling & Foundation (`NEXT / PLANNED`).
- **GP-008 to GP-052**: UI Design System, Catalog, Cart, Checkout, Payments, Admin, Affiliates, AI Assistant, and Production Launch (`PLANNED`).

---

## Technology Stack Baseline

- **Application Framework**: Next.js 16 Active LTS (App Router, Server Components, Server Actions)
- **Language & Runtime**: TypeScript 5.x on Node.js 24 LTS
- **Package Manager**: `pnpm` (v11.22.0)
- **Database & ORM**: Supabase PostgreSQL (PostgreSQL 16+) with Drizzle ORM & Drizzle Kit
- **PostgreSQL Driver**: `postgres` (postgres.js) with Supavisor transaction pooler compatibility
- **Authentication**: Supabase Auth (Email/Password + Google OAuth) with Next.js SSR session cookies (`@supabase/ssr`)
- **Authorization**: Authoritative Gamer Perú server-side RBAC (`requirePermission`)
- **Storage & Media**: Cloudflare R2 (`gamerperu-public-media`, `gamerperu-private-proofs`) + Cloudflare Image Delivery
- **Async Execution**: Inngest durable background workflows
- **Communications**: Resend (Auth SMTP + Inngest commerce emails) + React Email
- **Testing**: Vitest (Unit/Integration) + Playwright & `@axe-core/playwright` (E2E & Accessibility)
- **Code Quality**: ESLint 9 (Flat Config, zero-warning tolerance) + Prettier 3

---

## Engineering Standards & Quality Gates

All contributors and coding agents must strictly adhere to the canonical [Engineering Standards](docs/engineering/ENGINEERING_STANDARDS.md). Before submitting PRs or claiming task completion, execute the local quality validation gate:

```bash
pnpm check
pnpm test:e2e
```

---

## Local Development Setup

### Prerequisites

- **Node.js**: `v24.0.0` or higher (`node -v`)
- **pnpm**: `v11.22.0` (`pnpm -v`)
- **Docker**: (Optional, for running local Supabase CLI stack)

### 1. Installation

Clone the repository and install dependencies using `pnpm`:

```bash
pnpm install --frozen-lockfile
```

### 2. Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env.local
```

The application runs locally and builds without requiring remote production cloud credentials.

### 3. Local Supabase Stack (Optional for Offline Auth & PostgreSQL)

To start the local Supabase container stack (PostgreSQL 16, Supabase Auth, local Studio, Inbucket):

```bash
pnpm supabase:start
```

- Local API Gateway: `http://127.0.0.1:54321`
- Local PostgreSQL: `postgres://postgres:postgres@127.0.0.1:54322/postgres`
- Local Supabase Studio: `http://127.0.0.1:54323`
- Local Inbucket Email Inbox: `http://127.0.0.1:54324`

To check status or stop the stack:

```bash
pnpm supabase:status
pnpm supabase:stop
```

### 4. Running the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to view the bootstrap application.

---

## Available Scripts

| Command                | Description                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `pnpm check`           | Runs full local quality gate: `format:check`, `typecheck`, `lint`, `test`, `build`. |
| `pnpm format`          | Automatically formats all tracked code and documentation with Prettier.             |
| `pnpm format:check`    | Checks that all files conform to Prettier rules (read-only, fails in CI).           |
| `pnpm typecheck`       | Runs TypeScript static type checking without emitting files.                        |
| `pnpm lint`            | Runs ESLint verification with zero warning tolerance (`--max-warnings=0`).          |
| `pnpm test`            | Runs unit and integration smoke tests with Vitest.                                  |
| `pnpm test:watch`      | Runs Vitest in interactive watch mode.                                              |
| `pnpm test:e2e`        | Runs end-to-end browser and accessibility tests with Playwright.                    |
| `pnpm build`           | Compiles the production application bundle.                                         |
| `pnpm start`           | Starts the Next.js production server.                                               |
| `pnpm db:generate`     | Generates Drizzle SQL migrations from schema files.                                 |
| `pnpm db:migrate`      | Applies pending Drizzle database migrations.                                        |
| `pnpm db:studio`       | Launches Drizzle Studio database browser UI.                                        |
| `pnpm supabase:start`  | Starts the local Supabase Docker development stack.                                 |
| `pnpm supabase:stop`   | Stops the local Supabase Docker development stack.                                  |
| `pnpm supabase:status` | Displays connection details for the local Supabase stack.                           |

---

## Documentation Structure

Canonical architecture specifications and decision records live in [`docs/`](./docs/):

- [`AGENTS.md`](./AGENTS.md) — Operating contract, quality gates, and anti-clone rules.
- [`docs/engineering/ENGINEERING_STANDARDS.md`](./docs/engineering/ENGINEERING_STANDARDS.md) — Canonical engineering & quality standards.
- [`docs/specs/`](./docs/specs/) — Core functional and domain specifications.
- [`docs/architecture/TECHNOLOGY_ARCHITECTURE.md`](./docs/architecture/TECHNOLOGY_ARCHITECTURE.md) — Canonical technology baseline.
- [`docs/architecture/COMMERCE_DOMAIN_MODEL.md`](./docs/architecture/COMMERCE_DOMAIN_MODEL.md) — Complete 67-section commerce domain model.
- [`docs/decisions/`](./docs/decisions/) — Accepted Architecture Decision Records (ADR-001 through ADR-008).
- [`docs/roadmap/ROADMAP.md`](./docs/roadmap/ROADMAP.md) — 53-step development roadmap.

---

## Development & Execution Rules

1. Work strictly on the assigned GP.
2. Do not implement features scheduled for future GPs.
3. Every GP closes with a completed Closure Report template (`GP-XXX-CLOSURE.md`).

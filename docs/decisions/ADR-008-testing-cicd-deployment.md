# ADR-008 — Testing, CI/CD and Deployment Architecture

## Status

ACCEPTED

## Context

To ensure high reliability across multi-brand hardware commerce, automated payment verification workflows, accessibility compliance, and continuous deployment, Gamer Perú requires a comprehensive testing and deployment strategy spanning unit, integration, end-to-end, and visual/accessibility testing with automated CI/CD pipelines.

## Decision Drivers

- **Commerce Integrity**: High test confidence for cart calculations, inventory reservation, checkout, and manual Yape/Plin order state transitions.
- **Fast Developer Feedback**: Rapid test execution locally and in CI to empower autonomous AI coding agents and human developers.
- **Cross-Browser & Mobile Verification**: End-to-end testing across desktop and real mobile viewports, including WCAG 2.1 AA accessibility checks.
- **Deterministic Production Hosting**: Exactly one commercial application hosting platform with automated preview environments and zero-downtime rollouts.

## Options Considered

1. **Vitest + Playwright + GitHub Actions + Vercel Deployment**:
   - Modern, blazing-fast ESM-native test runner (Vitest) for unit/integration tests.
   - Playwright for multi-browser E2E, mobile emulation, and accessibility auditing (`axe-core`).
   - GitHub Actions for automated pull-request validation, linting, type-checking, and test execution.
   - Vercel Pro for commercial cloud deployment, atomic preview environments, and production deployments with instant rollback.
2. **Jest + Cypress + AWS Container Deployment**: Slower execution, heavier memory footprint, and higher operational complexity for a launch-scale modular monolith.

## Decision

Adopt **Vitest + Playwright + GitHub Actions + Vercel Deployment**:

1. **Testing Stack**:
   - **Unit & Domain Tests**: **Vitest** for domain entities, cart calculations, discount rules, and payment state transitions.
   - **Integration & DB Tests**: **Vitest** with isolated PostgreSQL test instances validating Drizzle ORM queries and transactional consistency.
   - **End-to-End & Storefront Tests**: **Playwright** testing critical user journeys (catalog navigation, search filtering, PDP story rendering, cart drawer, checkout submission, admin payment verification, customer login) across desktop and mobile viewports.
   - **Accessibility Validation**: Automated `@axe-core/playwright` assertions embedded into E2E test runs verifying WCAG 2.1 AA compliance.
2. **CI/CD Pipeline (GitHub Actions)**:
   - _On Pull Request_:
     1. Type checking (`tsc --noEmit`).
     2. Lint & format verification (`eslint`, `prettier`).
     3. Unit & Integration test suite execution.
     4. Build artifact verification.
     5. Ephemeral deployment preview generation via Vercel GitHub integration.
   - _On Main Merge_:
     1. Automated database migration safety check (`drizzle-kit check`).
     2. Staging deployment verification.
     3. Production deployment to Vercel with instant rollback capability.
3. **Application Hosting Platform**:
   - **Vercel** is the canonical application host for `gamerperu.com`.
   - Vercel Pro is used for cloud commercial deployments (Vercel Hobby is restricted to non-commercial personal use).
   - Application traffic routes: `Browser -> Vercel Edge Network -> Next.js Serverless Execution (Node.js 24 LTS) -> Supabase PostgreSQL (via Supavisor connection pooler)`.

## Consequences

- **Positive**: Sub-second unit test execution, robust E2E coverage of financial and checkout flows, automated prevention of accessibility and layout regressions, frictionless CI/CD previews.
- **Negative**: Requires maintaining Playwright browser binaries in CI environments and commercial Vercel subscription for hosted environments.

## Security / SEO / Performance Impact

- **Security**: Pre-deployment CI checks prevent shipping unauthenticated server actions or flawed permission guards.
- **SEO**: Automated E2E tests verify presence of meta tags, canonical links, and JSON-LD structured data.
- **Performance**: CI build step measures JavaScript bundle sizes against strict performance budgets.

## Migration / Reversal

Vitest and Playwright are standard open-source testing frameworks. GitHub Actions workflows use standard YAML specifications easily adaptable to GitLab CI, Buildkite, or AWS CodePipeline. The Next.js application can be containerized via Docker and deployed to AWS ECS, Google Cloud Run, or Coolify if required.

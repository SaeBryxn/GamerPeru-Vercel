# AGENTS.md --- Gamer Perú v1.2

## Operating contract

- Work only on the explicitly assigned GP.
- Respect all prerequisite gates and Closure Reports.
- Read canonical specs before implementation.
- Significant architecture changes require an ADR.
- Adhere strictly to the canonical [Engineering Standards](docs/engineering/ENGINEERING_STANDARDS.md).
- Never copy WLMOUSE code, copy, imagery, logo, proprietary assets or
  distinctive compositions pixel-for-pixel.
- Gamer Perú is multi-brand and Peru-first.
- Gamer Perú must remain independently operational from EC OS.
- Admin is a first-class product surface.
- Customer-submitted Yape/Plin information never equals confirmed
  payment.
- SEO, accessibility, security, responsive behavior and performance
  are cross-cutting constraints.
- Prefer structured catalog/content data over hardcoded product pages.
- Privileged authorization and validation are server-side.
- AI provider credentials never reach the browser.
- AI-generated product research is draft/review material unless
  explicitly approved.
- The customer AI assistant receives only allowlisted tools/retrieval
  and minimum necessary data.
- The customer assistant must never expose internal margins,
  supplier-private data, secrets, unpublished content, other
  customers' information or private EC OS data.
- AI never becomes the source of truth for price, stock, payments,
  orders or authorization.
- Pass all canonical validation gates (`pnpm check`, `pnpm test:e2e`) with zero warnings before claiming completion.
- Close every GP with the Closure Report template.

## Quality gates

For applicable work: Functional DoD, Visual DoD, Performance DoD, SEO
DoD, Security DoD and Accessibility DoD, as codified in [Engineering Standards](docs/engineering/ENGINEERING_STANDARDS.md).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ADR-001 — Application Framework, Runtime and Topology

## Status
ACCEPTED

## Context
Gamer Perú requires an application framework capable of delivering an ultra-fast, SEO-dominant multi-brand storefront, an expansive hardware storytelling experience (Product Story), a secure customer portal, and a high-density, real-time administrative backoffice (`/admin`). The framework must support server-side rendering (SSR), static content pre-rendering with on-demand revalidation, streaming AI responses, strict server-side authorization, and high developer and AI-agent productivity.

## Decision Drivers
- **SEO & Core Web Vitals**: First-class server-rendered HTML, streaming, dynamic metadata, JSON-LD, OpenGraph generation, and low Cumulative Layout Shift (CLS).
- **Architecture Philosophy**: Modular Monolith avoiding premature microservices.
- **Dual-Surface Requirement**: Expansive editorial Storefront and compact data-dense Admin interface sharing domain types and business logic in a unified codebase.
- **AI Streaming Integration**: Native support for streaming LLM responses to customer and admin interfaces.
- **Maintainability & Portability**: Clean module boundaries, robust TypeScript support, and low framework lock-in.

## Options Considered
1. **Next.js (App Router, React Server Components, Node.js Runtime)**: Full-stack TypeScript framework with unified routing, server components for zero-JS footprint where possible, server actions, and route groups for clean surface separation.
2. **Remix / React Router v7**: Full-stack framework with nested routing and loader/action patterns. Excellent web-standards compliance but smaller commercial ecosystem and third-party integration library surface compared to Next.js.
3. **Astro with Decoupled Backend API (NestJS / FastAPI)**: Content-focused SSG/SSR with islands architecture and separate backend. Increases architectural complexity, dual-codebase maintenance, and API contract synchronization overhead.
4. **Nuxt (Vue.js)**: Mature full-stack framework; rejected to maintain alignment with the React component ecosystem required by the approved design system.

## Decision
Adopt **Next.js (App Router) with TypeScript** running on the **Node.js LTS Runtime** (targeting **Node.js 24 LTS** and the **Next.js 16 Active LTS Line**), hosted on **Vercel** (Vercel Pro for commercial deployment) as a **Modular Monolith**.

The application is organized using Next.js route groups:
- `app/(storefront)/*`: Public catalog, product detail pages, search, and marketing.
- `app/(customer)/*`: Authenticated customer account, order tracking, and wishlist.
- `app/(admin)/*`: Protected administrative backoffice, inventory management, Yape/Plin payment verification, AI import workflows, and settings.
- `app/api/*`: Webhook endpoints (EC OS, Resend, Inngest) and specialized streaming APIs.
- `src/modules/*`: Pure TypeScript domain logic, entities, validation schemas, and service adapters independent of HTTP routing.

Hosting and Routing Topology:
- Application domain (`gamerperu.com`) routes directly through the **Vercel Edge Network** to the Next.js serverless execution runtime. (Cloudflare reverse-proxy is not placed in front of `gamerperu.com`).
- Next.js 16 routing optimizations (Proxy/routing layer) facilitate request redirection, while authoritative security and permissions are enforced server-side inside layouts, server actions, and data access functions.

## Consequences
- **Positive**: Single codebase, shared TypeScript types across frontend and backend, instant build and type verification, zero API drift between UI and server mutations, maximum SEO rendering performance.
- **Negative**: Requires careful discipline in server vs. client component boundaries (`'use client'` vs `'use server'`) to avoid leaking server code or bundling unnecessary client JavaScript.

## Security / SEO / Performance Impact
- **Security**: Route groups provide organizational separation; security is strictly enforced at layout, server action, and data access layers through authoritative session checks.
- **SEO**: Crawlers receive full server-rendered HTML for all products, categories, brands, and editorial content without client execution delays.
- **Performance**: Server components minimize client bundle size, sending only necessary interactive islands to the browser.

## Migration / Reversal
Domain logic and validation schemas are written in pure TypeScript (`src/modules/*`), decoupling core business rules from Next.js APIs. If a migration is ever required, domain services can be ported to any Node.js/TypeScript runtime with minimal rewrites.

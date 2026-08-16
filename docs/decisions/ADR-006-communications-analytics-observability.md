# ADR-006 — Communications, Analytics and Observability Architecture

## Status
ACCEPTED

## Context
Gamer Perú requires reliable transactional communications (order confirmations, payment verification status updates, shipping tracking notices, and authentication emails such as password resets and email verifications), privacy-compliant web analytics and first-party commerce event tracking, and robust production observability (structured logging, performance monitoring, exception tracking, and alerting).

## Decision Drivers
- **Transactional Deliverability**: High inbox placement for customer transactional emails in Peru.
- **Pipeline Separation**: Authentication emails (managed by Supabase Auth) and commerce notifications (managed by Gamer Perú Inngest) must use distinct, well-defined delivery pipelines.
- **First-Party Commerce Truth**: Business and affiliate conversion analytics must derive from authoritative PostgreSQL database state, not client-side third-party pixels.
- **Privacy & PII Protection**: Never expose customer passwords, full financial vouchers, or unnecessary personal data in logs, analytics, or monitoring payloads.
- **Operational Visibility**: Immediate alerting on AI provider outages, payment verification bottlenecks, and server errors.

## Options Considered
1. **Transactional Email**:
   - *Option 1A*: **Resend + React Email** (Modern developer-first API, type-safe React templates, robust webhook support, custom SMTP for auth).
   - *Option 1B*: **Postmark / AWS SES** (High deliverability; Postmark is excellent but templates are less integrated with React codebases).
2. **Analytics**:
   - *Option 2A*: **First-Party PostgreSQL Event Ledger + PostHog** (Comprehensive product analytics, funnels, session replay, cookieless option).
   - *Option 2B*: **Plausible Analytics** (Lightweight privacy analytics; less granular funnel and session insight for e-commerce conversion optimization).
   - *Option 2C*: **Google Analytics 4 alone** (Client-heavy, ad-blocker blocked, cannot serve as authoritative financial source).
3. **Observability**:
   - *Option 3A*: **Sentry + Structured Pino Logger** (Exception tracing, performance profiling, and automated PII scrubbing).
   - *Option 3B*: **Datadog / New Relic** (Enterprise-grade but expensive and overly complex for early-stage modular monolith).

## Decision
1. **Transactional Communications & Email Pipelines**:
   - Adopt **Resend** as the canonical email infrastructure with two separated delivery pipelines:
     * **Authentication Email Pipeline**: Supabase Auth routes signup confirmations, email verifications, and password recovery/reset emails directly through **Resend custom SMTP** in production. (Password resets are never dispatched via Inngest).
     * **Application Commerce Email Pipeline**: Gamer Perú Domain Events / Inngest dispatch order confirmations, payment notices, and shipping tracking updates via the **Resend API** using type-safe **React Email** components.
   - Delivery, bounce, and open webhooks are captured to maintain audit trails.
2. **Analytics Architecture**:
   - **Authoritative First-Party Commerce Ledger**: Financial metrics, order conversions, and affiliate attribution are calculated exclusively from PostgreSQL transactional records.
   - **Product & Funnel Analytics**: Adopt **PostHog** for product analytics, funnel tracking, and conversion insights.
   - **Outage Semantics**: If PostHog is temporarily unavailable, core commerce continues unimpeded. Non-critical behavioral event loss is accepted as best-effort; financial and order records remain 100% intact and derivable from PostgreSQL.
3. **Observability & Logging**:
   - Adopt **Sentry** for full-stack error tracking and performance transaction monitoring.
   - Structured logging using **Pino** formatting JSON logs with automated redaction filters for passwords, API keys, and customer voucher identifiers.

## Consequences
- **Positive**: Type-safe email templates, clear pipeline separation between Auth SMTP and commerce API, reliable transactional notifications, trustworthy financial reporting, instant bug detection with Sentry stack traces, strict PII compliance.
- **Negative**: Requires configuring webhook endpoints for email bounce/delivery events and verifying domain records (SPF/DKIM/DMARC) in Resend.

## Security / SEO / Performance Impact
- **Security**: Strict automated redaction ensures no sensitive customer data or credentials appear in Sentry or server log streams.
- **SEO**: Lightweight analytics scripts have zero impact on Core Web Vitals and LCP scores.
- **Performance**: Asynchronous email dispatch via background jobs ensures customer checkout response remains fast and non-blocking.

## Migration / Reversal
Resend uses standard SMTP/REST conventions; email templates written in React Email can be rendered to static HTML and dispatched via any provider (Postmark, SendGrid, SES). PostHog can be migrated to Plausible or Mixpanel via the analytics adapter.

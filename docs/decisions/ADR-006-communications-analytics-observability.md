# ADR-006 — Communications, Analytics and Observability Architecture

## Status
ACCEPTED

## Context
Gamer Perú requires reliable transactional communications (order confirmations, payment verification status updates, shipping tracking notices, password resets), privacy-compliant web analytics and first-party commerce event tracking, and robust production observability (structured logging, performance monitoring, exception tracking, and alerting).

## Decision Drivers
- **Transactional Deliverability**: High inbox placement for customer transactional emails in Peru.
- **First-Party Commerce Truth**: Business and affiliate conversion analytics must derive from authoritative database state, not client-side third-party pixels.
- **Privacy & PII Protection**: Never expose customer passwords, full financial vouchers, or unnecessary personal data in logs, analytics, or monitoring payloads.
- **Operational Visibility**: Immediate alerting on AI provider outages, payment verification bottlenecks, and server errors.

## Options Considered
1. **Transactional Email**:
   - *Option 1A*: **Resend + React Email** (Modern developer-first API, type-safe React templates, robust webhook support).
   - *Option 1B*: **Postmark / AWS SES** (High deliverability; Postmark is excellent but templates are less integrated with React codebases).
2. **Analytics**:
   - *Option 2A*: **First-Party PostgreSQL Event Ledger + PostHog / Plausible** for web analytics.
   - *Option 2B*: **Google Analytics 4 alone** (Client-heavy, ad-blocker blocked, cannot serve as authoritative financial source).
3. **Observability**:
   - *Option 3A*: **Sentry + Structured Pino Logger** (Exception tracing, performance profiling, and automated PII scrubbing).
   - *Option 3B*: **Datadog / New Relic** (Enterprise-grade but expensive and overly complex for early-stage modular monolith).

## Decision
1. **Transactional Communications**:
   - Adopt **Resend with React Email** as the primary transactional email infrastructure.
   - Email templates are authored as type-safe React components shared within the codebase.
   - Delivery, bounce, and open webhooks are captured to maintain audit trails.
2. **Analytics Architecture**:
   - **First-Party Commerce Truth**: Financial metrics, order conversions, and affiliate attribution are calculated exclusively from PostgreSQL transactional records.
   - **Product & Funnel Analytics**: Adopt **PostHog** (cloud or self-hosted) / **Plausible** for privacy-first, cookieless web analytics and user journey insights without shipping bloated tracking scripts.
3. **Observability & Logging**:
   - Adopt **Sentry** for full-stack error tracking and performance transaction monitoring.
   - Structured logging using **Pino** formatting JSON logs with automated redaction filters for passwords, API keys, and customer voucher identifiers.

## Consequences
- **Positive**: Type-safe email templates, reliable transactional notifications, trustworthy financial reporting, instant bug detection with Sentry stack traces, strict PII compliance.
- **Negative**: Requires configuring webhook endpoints for email bounce/delivery events.

## Security / SEO / Performance Impact
- **Security**: Strict automated redaction ensures no sensitive customer data or credentials appear in Sentry or server log streams.
- **SEO**: Lightweight analytics scripts have zero impact on Core Web Vitals and LCP scores.
- **Performance**: Asynchronous email dispatch via background jobs ensures customer checkout response is instant.

## Migration / Reversal
Resend uses standard SMTP/REST conventions; email templates written in React Email can be rendered to static HTML and dispatched via any provider (Postmark, SendGrid, SES). Analytics and logging adapters are encapsulated in `src/modules/observability`.

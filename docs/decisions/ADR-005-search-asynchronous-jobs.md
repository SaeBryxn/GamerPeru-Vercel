# ADR-005 — Search and Asynchronous Job Architecture

## Status
ACCEPTED

## Context
Gamer Perú requires two critical operational capabilities:
1. **Catalog Search & Filtering**: Multi-attribute search across brands, models, sensors, switches, polling rates, and categories with typo tolerance, instant suggestions, and low latency.
2. **Durable Asynchronous Background Processing**: Long-running AI product research workflows, multi-step LLM batch imports, transactional email retries, and reliable EC OS outbound webhook delivery.

## Decision Drivers
- **Operational Simplicity**: Avoid premature multi-service clusters during early stages while providing an architectural path for scale.
- **Search Relevance**: Accurate search results for Peruvian gaming hardware shoppers without synchronization lag.
- **Job Reliability & Non-Blocking Execution**: Long-running AI generation jobs (15–45 seconds) must never tie up browser HTTP request lifecycles and must support automatic retries, backoff, and failure observability.

## Options Considered
1. **Search**:
   - *Option 1A*: **PostgreSQL Native Full-Text Search (`tsvector`) + Trigram Indexing (`pg_trgm`)** behind a clean `SearchProvider` interface.
   - *Option 1B*: **Meilisearch / Typesense** (Dedicated search engine).
   - *Option 1C*: **Algolia** (Managed search SaaS).
2. **Background Processing**:
   - *Option 2A*: **Inngest** (Serverless durable workflow orchestrator).
   - *Option 2B*: **BullMQ + Redis**.
   - *Option 2C*: **PostgreSQL-based Queue (pg-boss / Graphile Worker)**.

## Decision
1. **Search Architecture**:
   - Adopt **PostgreSQL Full-Text Search with `pg_trgm` (Trigram similarity)** as the canonical v1 search engine, structured behind a clean TypeScript **`SearchProvider`** interface.
   - *Rationale*: For launch-scale catalogs (<1,000 SKUs), PostgreSQL FTS with GIN indexes and Trigram matching is expected to provide suitable performance, typo-tolerant matching (e.g. `beastx` $\to$ `Beast X`), Spanish stemming, and immediate transactional index updates with zero synchronization lag and zero extra infrastructure cost. (Actual latency budgets and performance benchmarks will be measured during implementation).
   - *Degradation Semantics*: Because PostgreSQL is the search engine, search availability is directly coupled to primary database health. If advanced trigram search is degraded, simplified SQL filtering (`ILIKE`) serves as an emergency fallback only while the database remains healthy. (If PostgreSQL is unavailable, all search functionality is unavailable).
   - *Migration Trigger*: When the catalog exceeds 10,000 SKUs or requires complex vector embeddings, the `SearchProvider` adapter can transition to **Meilisearch** or **Typesense** without modifying UI components or domain services.
2. **Asynchronous Processing Architecture**:
   - Adopt **Inngest** as the canonical durable background workflow execution engine.
   - *Failure & Delivery Model*: Inngest provides durable, multi-step TypeScript workflows with automatic retries, exponential backoff, concurrency controls, rate limiting (essential for AI provider quotas), step-level state persistence, and `onFailure` event handlers.
   - *EC OS Outbound Delivery*: Business-critical EC OS events are persisted authoritatively in a PostgreSQL transactional **Outbox table**; Inngest orchestrates reliable webhook dispatch, retries, and delivery tracking.
   - Long-running AI product imports run reliably in the background while streaming progress back to the admin UI.

## Consequences
- **Positive**: Zero external search infrastructure to maintain for v1, instant search consistency on catalog updates, resilient background jobs for AI and transactional emails, non-blocking HTTP endpoints.
- **Negative**: High-volume vector search will eventually require migrating the search adapter to a dedicated engine.

## Security / SEO / Performance Impact
- **Security**: Search queries are strictly parameterized; private product drafts and internal metadata are excluded from public search indexes.
- **SEO**: Search results and category filter pages render on the server with clean canonical URLs.
- **Performance**: Heavy AI jobs and email deliveries execute off the main request thread, keeping storefront and admin response times within target budgets.

## Migration / Reversal
The `SearchProvider` interface decouples the application from PostgreSQL FTS, allowing replacement with Meilisearch or Algolia. Inngest steps use standard TypeScript functions, allowing straightforward migration to alternative queues (BullMQ, Temporal) if necessary.

# GP-025 — AI Product Research & Import Contract (CHK0-BR2)

## Status

IN DISCOVERY / CONTRACT REMEDIATION PENDING EXTERNAL APPROVAL (CHK0-BR2)

---

## 1. Canonical Starting Lineage & Baseline Verification

This document establishes the canonical contract, domain reconciliation, physical schema specifications, recovery architecture, security boundaries, and implementation plan for **GP-025 (AI Product Research & Import)**, incorporating all architectural remediations and findings from CHK0, CHK0-BR1, and CHK0-BR2.

GP-025 delivers the administrative AI Product Assistant, enabling authorized Gamer Perú staff to research, enrich, and prepare gaming hardware products for the catalog from product names, SKUs, or model codes, while strictly enforcing human-in-the-loop review, source provenance, category specification schemas, and credential isolation.

### Baseline Lineage Verification

- **Repository**: `latamcreativa/GamerPeru`
- **Starting Canonical Main SHA**: `c5b8c7b72b8b809c7053a5c9bae0a4b5dce5c321`
- **Rejected CHK0 SHA**: `16d97a6ac775807a7066a38e0ba5a600b55dd589` (Preserved immutably in `audit/gp025-chk0`)
- **Rejected CHK0-BR1 SHA**: `0ea3cdf78913d2a2c8cfea022a001a05742ab721` (Preserved immutably in `audit/gp025-chk0-br1`)
- **Remediation Audit Branch**: `audit/gp025-chk0-br2`
- **GP-024 Status**: `CLOSED / EXTERNALLY APPROVED / FROZEN / PASS WITH NOTES / MAIN INTEGRATION COMPLETE`
- **GP-024 Contract Blob**: `0292679a73bd61611eac4f3464f975efb6c91a44` (`docs/roadmap/GP-024-CONTRACT.md`)
- **Migration 0012 Git Blob**: `e80c30ae9d0f86e14486b0fd5c782eb9ec3f7119` (`src/db/migrations/0012_canonical_inventory_permission.sql`)
- **Migration Sequence Rule**: At canonical base `c5b8c7b72b8b809c7053a5c9bae0a4b5dce5c321`, the next expected migration sequence number is `0013`. CHK1 must re-fetch `origin/main` immediately before implementation; if another canonical migration has landed, CHK1 must use the next valid sequential number. **CHK0-BR2 creates NO database migration.**
- **Hosted Supabase**: 100% Untouched (No hosted access or mutations).
- **Cloudflare R2**: 100% Untouched (Bucket provisioning remains deferred per GP-024 closure).
- **Real AI Providers**: 100% Untouched (Zero external API calls; zero provider SDKs installed).
- **GP-025 Roadmap Status**: `IN DISCOVERY / CONTRACT REMEDIATION PENDING EXTERNAL APPROVAL (CHK0-BR2)`
- **GP-026 Status**: `NOT BEGUN`

---

## 2. Canonical Scope & Explicit Boundaries

### In Scope (GP-025)

1. **Single-Product Research & Existing-Product Enrichment**: Progressive AI research from a product name, SKU, or model identifier into a structured, reviewable draft (`CREATE` mode), or enriching an existing catalog product (`ENRICH` mode) with strict optimistic concurrency snapshots.
2. **Batch Product-Name Import**: Asynchronous processing of multi-item product lists with resilient partial-success execution via Inngest.
3. **Product Identity Resolution**: Deterministic classification of exact, probable, ambiguous, or unsupported product inputs.
4. **Structured Specification Extraction**: Mapping extracted technical hardware attributes into authoritative category-specific schemas (`categories.current_spec_schema_id`).
5. **Normalized Source Evidence**: Storing durable source records (URL, title, retrieval method, trust tier, content hash, provider citation) independent of individual field rows.
6. **Relational Field-to-Source Provenance**: Many-to-many evidence links (`ai_proposal_field_sources`) supporting multiple supporting/conflicting sources per proposed field.
7. **Field-Level Review & Conflict Ledger**: Tracking proposed values, human selections, review decisions, trust ratings, and conflict evidence per field.
8. **Original Commerce Copy Generation**: Synthesizing original, fact-grounded Spanish product descriptions, highlights, FAQs, and SEO suggestions.
9. **Media-Candidate Discovery**: Identifying potential media references with fail-closed usage-rights classification (reference candidates only; no automatic CDN ingestion).
10. **Human-in-the-Loop Review UI**: Administrative workspace for side-by-side inspection, conflict resolution, staff price entry, field-by-field selection, and approval.
11. **Provider & Profile Abstraction**: Decoupled internal gateway supporting provider profiles (`PRODUCT_RESEARCH_FAST`, `PRODUCT_RESEARCH_DEEP`, `SEO_COPY`, `BATCH_IMPORT`).
12. **Hardened Credential Security at Rest**: AES-256-GCM encryption with hex encoding, dynamic server-side AAD computation, active partial unique indexes, and server-runtime master key separation.
13. **Durable Inngest Jobs & Deterministic Recovery**: Multi-step background workflows with worker lease-claiming, lease expiration recovery, and scheduled reconciliation scanning.
14. **Provider Invocation Attempts & Sub-Cent Telemetry**: Durable attempt tracking including `UNKNOWN` state handling and integer micro-unit (`cost_micros`) cost accounting with explicit pricing versioning and cost source classification.
15. **Crash-Safe Canonical Apply Operations**: Stable per-step mutation request identity tracking in `ai_proposal_apply_steps` with actor binding, preventing duplicate mutations across process crashes.

### Explicitly Out of Scope

1. **Automatic Product Publication**: AI output is strictly created as `DRAFT`. Transition to `PUBLISHED` requires explicit authorized human action via `catalog:publish`.
2. **Automated Price Generation**: AI research must not invent sell prices, compare-at prices, or cost prices. Staff must supply or confirm prices before canonical variant creation.
3. **Automated Inventory Movements**: AI research must not adjust stock balances, warehouse reservations, or ledger entries.
4. **Automated Payment/Order Operations**: AI must never interact with payments, orders, refunds, or verifications.
5. **Automated Affiliate Actions**: AI must never approve or adjust affiliate commissions.
6. **Unbounded Web Crawling**: Scraping entire websites or recursive link following is strictly forbidden.
7. **Direct Automatic Media Ingestion**: Remote image URLs are never downloaded and uploaded directly to the public CDN. Operators must confirm rights and provide bytes through the GP-024 upload intent pipeline.
8. **Autonomous Supplier Purchasing**: Purchasing or stock procurement automation is strictly out of scope.
9. **Product Story Builder (GP-026)**: Visual block-based editorial story authoring remains deferred to GP-026.
10. **Direct PDF Parsing in v1**: Direct binary PDF parsing is out of scope for GP-025 v1; PDF URLs are retained as reference evidence only.

---

## 3. Current-State Reconciliation & Repository Audit

An exhaustive audit of the actual repository implementation at commit `c5b8c7b72b8b809c7053a5c9bae0a4b5dce5c321` yields the following findings:

### A. Canonical RBAC Permissions & Roles

- **Actual Code & Database Truth**:
  As defined in `src/lib/auth/rbac.ts` and seeded via `src/db/migrations/0006_canonical_rbac_seed.sql` and `0012_canonical_inventory_permission.sql`, Gamer Perú possesses exactly 11 canonical permissions:
  `staff:manage`, `ai:manage_credentials`, `audit:export`, `catalog:manage`, `catalog:publish`, `catalog:ai_research`, `orders:manage`, `orders:verify`, `support:manage`, `support:review_rma`, `inventory:manage`.
- **Role Mappings**:
  - `SUPER_ADMIN`: Holds all 11 explicit permissions (including `catalog:ai_research` and `ai:manage_credentials`).
  - `ADMIN_CATALOG`: Holds 3 permissions: `catalog:manage`, `catalog:publish`, `catalog:ai_research`.
  - `ADMIN_ORDERS`: Holds 2 permissions: `orders:manage`, `orders:verify`.
  - `ADMIN_SUPPORT`: Holds 2 permissions: `support:manage`, `support:review_rma`.
  - `CUSTOMER`: Holds 0 staff permissions.
- **Conceptual Permissions Rejected**:
  The conceptual permission names listed in early architecture documents (`ai.use`, `ai.product_import`, `ai.view_usage`, `ai.manage_models`, `ai.manage_providers`) **DO NOT EXIST** in the physical schema, seeds, or codebase.
- **Conclusion**:
  **NO NEW PERMISSIONS WILL BE INTRODUCED.** The existing canonical permissions (`catalog:ai_research`, `catalog:manage`, `catalog:publish`, `ai:manage_credentials`) completely and safely express all GP-025 operational surfaces.

### B. Existing AI Security Foundation & Repository Sentinel Trap

- **Server-Only Master Key Declaration**:
  `src/config/server-env.ts` defines `AI_ENCRYPTION_KEY_V1` in `serverEnvSchema`:
  ```typescript
  AI_ENCRYPTION_KEY_V1: z
    .string()
    .length(64, "Must be exactly 64 hexadecimal characters")
    .regex(/^[0-9a-fA-F]+$/, "Must be a valid 64-character hexadecimal string")
    .optional(),
  ```
- **Pre-existing Repository Sentinel Trap**:
  `.env.example` contains a deterministic 64-hex key (`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`). In CHK1, `server-env.ts` and the credential crypto helper must reject this known insecure example sentinel (matching the pattern established for `KNOWN_INSECURE_EXAMPLE_HMAC_SECRET`).
- **Automated Logging Redaction**:
  `src/lib/logger/index.ts` already includes `AI_ENCRYPTION_KEY_V1`, `apiKey`, `api_key`, and `secret` in `CANONICAL_REDACT_PATHS`.
- **Sentry Sanitization**:
  `src/lib/observability/sentry-sanitize.ts` already sanitizes `ai_encryption_key_v1`, API keys, and 64-character hex strings (`\b[0-9a-fA-F]{64}\b`) before transmission.

### C. Existing Background-Job (Inngest) Architecture

- **Inngest Client**: Physically instantiated at `src/lib/inngest/client.ts` (`id: "gamer-peru"`).
- **Inngest Serving Endpoint**: Physically mounted and operational at `src/app/api/inngest/route.ts` via `serve({ client, functions: [...] })`.
- **Existing Function**: `inventoryReservationExpirationJob`.

### D. Authoritative GP-024 Catalog Services Truth

The GP-024 catalog authoring domain is implemented under `src/lib/admin/catalog/`:

- `createProduct(input, options)`: Creates canonical product and optional initial variant.
- `createVariant(input, options)`: Creates canonical sellable variant with mandatory `priceCents`.
- `updateProduct(input, options)`: Updates product attributes and dynamic specifications (`specValues`).
- `updateVariant(input, options)`: Updates variant attributes, price, and status.
- `transitionProductStatus(input, options)`: Authoritative lifecycle transition (`catalog:publish` strictly required for `PUBLISHED`).
- `requestCatalogMediaUploadIntent(input, options)`: Issues signed upload intent for staging.
- `finalizeCatalogMediaUpload(input, options)`: Finalizes normalized WebP media from staging.

Nonexistent names (`createProductVariant`, `updateProductSpecifications`, `attachProductMedia`) are completely removed from this contract.

---

## 4. Authorization Matrix & Boundary Contract

Authorization is strictly enforced server-side. AI models and background workers never receive ambient authority.

| Surface / Action                               | Required Permission     | Allowed Canonical Roles        | Authoritative Boundary & Enforcement                         |
| :--------------------------------------------- | :---------------------- | :----------------------------- | :----------------------------------------------------------- |
| Initiate single research or batch import job   | `catalog:ai_research`   | `SUPER_ADMIN`, `ADMIN_CATALOG` | Server Action / Route Handler guard (`requirePermission`)    |
| View AI jobs, items, proposals, provenance     | `catalog:ai_research`   | `SUPER_ADMIN`, `ADMIN_CATALOG` | Server Action / Route Handler guard (`requirePermission`)    |
| Edit proposal fields / resolve conflicts in UI | `catalog:ai_research`   | `SUPER_ADMIN`, `ADMIN_CATALOG` | Server Action guard (`requirePermission`)                    |
| Apply approved proposal to catalog (`DRAFT`)   | `catalog:manage`        | `SUPER_ADMIN`, `ADMIN_CATALOG` | Catalog Service boundary (`resolveActorAndAssertPermission`) |
| Publish AI-created or AI-enriched Product      | `catalog:publish`       | `SUPER_ADMIN`, `ADMIN_CATALOG` | Catalog Service boundary (`transitionProductStatus`)         |
| Configure/rotate AI provider credentials       | `ai:manage_credentials` | `SUPER_ADMIN` strictly         | Server Action guard (`requirePermission`)                    |
| Manage AI profiles, models, and parameters     | `ai:manage_credentials` | `SUPER_ADMIN` strictly         | Server Action guard (`requirePermission`)                    |
| Inngest background job execution               | Internal Signing Key    | Inngest Executor               | Signature verification (`INNGEST_SIGNING_KEY`)               |

---

## 5. Job Creation Idempotency Contract

The job creation boundary uses the canonical actor- and action-scoped idempotency digest pattern:

1. **Client Request Boundary**: The client provides a high-entropy string `mutationRequestId` when submitting a research job.
2. **Digest Computation**:
   $$\text{mutationRequestDigest} = \text{SHA256}(\text{actorAuthUserId} \parallel \text{":ai:research-job:create:"} \parallel \text{mutationRequestId})$$
3. **Request Fingerprinting**:
   $$\text{requestFingerprint} = \text{SHA256}(\text{normalizedPayload})$$
   Binding: `jobType`, ordered normalized items (input queries, modes, target product IDs), and selected `profileKey`.
4. **Persistence & Replay Invariants**:
   - The raw `mutationRequestId` is accepted at the request boundary only and is **NEVER** persisted in `ai_research_jobs`.
   - `mutation_request_digest varchar(64) NOT NULL UNIQUE` and `request_fingerprint varchar(64) NOT NULL` are stored in `ai_research_jobs`.
   - **Same Actor + Same Request ID + Same Fingerprint**: Returns the committed job replay.
   - **Same Actor + Same Request ID + Different Fingerprint**: Fails closed with `AI_IDEMPOTENCY_CONFLICT`.
   - **Different Request IDs + Identical Payload**: Creates two legitimate distinct jobs.
   - **Different Actors with Same Raw Request ID**: Generates distinct `mutationRequestDigest` values.
5. **Inngest Event Payload**: The Inngest event payload does not require the raw request ID; it carries only durable `jobId` and deterministic `inngestEventId`.

---

## 6. DB $\to$ Inngest Reliable Dispatch & Worker Lease Model

### Reliable Dispatch Architecture

To prevent job loss from dual-write failure between the PostgreSQL transaction commit and Inngest event emission:

1. The job row commits with `dispatch_status = 'PENDING_DISPATCH'`.
2. A deterministic Inngest event ID is computed: `gp-ai-job-${job.id}`.
3. Normal event emission occurs immediately post-commit.
4. Send success updates `dispatch_status = 'DISPATCHED'`.
5. Send failure updates `dispatch_status = 'DISPATCH_FAILED'`.
6. **CHK2 Scheduled Reconciliation Scanner**:
   A scheduled Inngest cron job periodically scans:
   `SELECT id FROM ai_research_jobs WHERE dispatch_status IN ('PENDING_DISPATCH', 'DISPATCH_FAILED') AND updated_at < NOW() - INTERVAL '2 minutes'`
   using the operational index `ai_research_jobs_dispatch_recon_idx` and re-emits the event using the exact same deterministic event ID.
7. **Send Success + Status Update Failure**: If Inngest receives the event but the database status update fails, re-emission is completely safe because the deterministic event ID and worker lease model prevent duplicate executions.

### Worker Lease & Crash Recovery Model

To prevent jobs from becoming stranded if a worker crashes after setting `status = 'PROCESSING'`:

1. Each `ai_research_job_items` record tracks:
   - `processing_lease_token uuid`
   - `processing_lease_expires_at timestamptz`
   - `last_heartbeat_at timestamptz`
2. **Item State Transitions & Claims**:
   - **Unclaimed Item** (`status = 'PENDING'` or `processing_lease_expires_at < NOW()`):
     Atomically claimed via conditional update:
     `UPDATE ai_research_job_items SET status = 'RESEARCHING', processing_lease_token = :workerToken, processing_lease_expires_at = NOW() + INTERVAL '5 minutes', last_heartbeat_at = NOW() WHERE id = :id AND (status = 'PENDING' OR processing_lease_expires_at < NOW())`
   - **Active Unexpired Lease** (`processing_lease_expires_at > NOW()`):
     Competing worker delivery skips execution (prevents concurrent duplicate processing).
   - **Expired Lease Recovery**:
     If a worker crashes mid-call, its lease expires. A subsequent at-least-once delivery or reconciliation sweep detects `processing_lease_expires_at < NOW()`, reclaims the item, and resumes processing.
   - **Durable Completed Step Reuse**:
     If structured results are already persisted in `ai_product_proposals`, resuming workers reuse the persisted record rather than calling the AI provider again.
   - **No Long-Lived DB Locks**: PostgreSQL transactions or advisory locks are **NEVER** held open across external HTTP/AI provider calls.
   - **Duplicate Event on Terminal Job**: If `job.status IN ('COMPLETED', 'PARTIALLY_FAILED', 'FAILED')`, duplicate events perform an immediate harmless no-op.

---

## 7. Resumable Canonical Apply Architecture

Applying an approved proposal into the catalog invokes authoritative GP-024 catalog services. To make this crash-safe without distributed transactions:

### Normalized Apply Step Tracking (`ai_proposal_apply_steps`)

1. **Pre-Call Step Persistence**:
   Before each GP-024 mutation, a step row is persisted in `ai_proposal_apply_steps` recording:
   - `apply_operation_id`: UUIDv7 identifying the logical apply operation.
   - `apply_actor_auth_user_id`: Auth ID of the staff member initiating apply.
   - `step_key`: Unique string identifier (e.g. `'PRODUCT_CREATE'`, `'VARIANT_CREATE:0'`, `'VARIANT_CREATE:1'`).
   - `mutation_request_id`: The exact, stable `mutationRequestId` passed to GP-024 for that step.
   - `step_status`: `'PENDING'`.
2. **Deterministic Step Execution**:
   - **Step 1 (Product Creation / Update)**: Calls `createProduct(...)` or `updateProduct(...)` with `mutationRequestId`. On success, records `target_id = productId` and `step_status = 'COMMITTED'`.
   - **Step 2 (Variant Creation)**: For each approved variant with staff-entered prices, calls `createVariant(...)` with its unique `mutationRequestId`. On success, records `target_id = variantId` and `step_status = 'COMMITTED'`.
   - **Step 3 (Proposal Finalization)**: Transitions `ai_product_proposals.status = 'APPLIED'`.
3. **Crash Recovery Semantics**:
   - If the process crashes after a GP-024 mutation commits but before GP-025 records completion, re-running the apply operation re-reads `ai_proposal_apply_steps` and replays GP-024 with the **SAME** `mutationRequestId`.
   - GP-024's idempotent mutation digest layer detects the replay and returns the existing entity cleanly without creating duplicates.
4. **Apply Actor Binding & Cross-Actor Rejection**:
   - GP-024 mutation digests are actor-scoped.
   - Resuming an apply operation is strictly bound to `apply_actor_auth_user_id`.
   - If a different actor attempts to resume an incomplete apply operation, the system fails closed with `APPLY_ACTOR_MISMATCH`.
   - Canonical apply requires verified `catalog:manage` permission on every attempt. No stale session tokens or permissions are persisted.

---

## 8. Relational Field-to-Source Provenance & Auditable Trust

### Many-to-Many Provenance Relation (`ai_proposal_field_sources`)

A single field proposal may be supported by multiple sources or contradicted by conflicting sources:

- `ai_proposal_field_sources` links `field_review_id` to `source_id`.
- `relationship`: `CHECK (relationship IN ('SUPPORTS', 'CONFLICTS', 'CONTEXT_ONLY'))`.
- `source_value`: `jsonb` capturing the exact literal value reported by that specific source.
- `ai_proposal_field_reviews` retains `preferred_source_id` as a nullable foreign key pointer for UI convenience, but the many-to-many table is the relational source of truth.

### Auditable Source Trust

1. **No LLM Self-Certification**: An LLM cannot mark its citation as `VERIFIED_OFFICIAL` by outputting JSON.
2. **Canonical Domain Matching**:
   - Automated Tier 1 verification strictly matches source URLs against the authoritative brand domain from `brands.website_url`.
   - `trust_basis`: `CHECK (trust_basis IN ('CANONICAL_BRAND_DOMAIN_MATCH', 'MANUAL_STAFF_VERIFIED', 'UNVERIFIED_DEFAULT'))`.
3. **Staff-Reviewed Trust**:
   - Alternate official domains not present in `brands.website_url` remain `UNVERIFIED_DEFAULT` unless explicitly verified by human staff.
   - When manually verified, `trust_reviewed_by_auth_user_id` and `trust_reviewed_at` are persisted.
4. **Provider-Native Citations Without URLs**:
   - In `ai_sources`, `original_url` is nullable to accommodate opaque provider citations.
   - Enforced by check constraint: `CHECK (original_url IS NOT NULL OR provider_citation_id IS NOT NULL)`.
   - If `original_url` is present, standard SSRF and URL validation applies.

---

## 9. Hardened Credential Security & AES-256-GCM Architecture

Reconciling with **ADR-007**, all provider API credentials configured via the Admin interface must be encrypted at rest.

### Cryptographic Storage & Format Constraints

- **Cipher**: `aes-256-gcm`.
- **Master Key**: `AI_ENCRYPTION_KEY_V1` (32 bytes / 64 hex characters) from server environment.
- **IV Storage**: Hex string, exactly 24 characters: `CHECK (iv ~ '^[0-9a-f]{24}$')`.
- **Auth Tag Storage**: Hex string, exactly 32 characters: `CHECK (auth_tag ~ '^[0-9a-f]{32}$')`.
- **Ciphertext Storage**: Hex string, even length, non-empty: `CHECK (ciphertext ~ '^[0-9a-f]+$' AND length(ciphertext) % 2 = 0 AND length(ciphertext) > 0)`.
- **Master Key Version**: `CHECK (key_version > 0)`.

### Dynamic Server-Side AAD Computation

To prevent ciphertext-swapping attacks between different provider records:

- Authenticated Additional Data (AAD) is **NEVER** stored in a database column.
- AAD is dynamically recomputed server-side during both encryption and decryption from canonical record columns:
  $$\text{AAD} = \text{credentialId} \parallel \text{":"} \parallel \text{providerId} \parallel \text{":"} \parallel \text{keyVersion}$$
  where `providerId` is the immutable UUID of the parent provider.
- Tampering with `providerId`, `credentialId`, or `keyVersion` causes immediate GCM authentication tag failure.

### Credential Active Uniqueness & Replacement Lifecycle

- **Active Uniqueness**: Enforced via partial unique index:
  `CREATE UNIQUE INDEX ai_provider_credentials_active_idx ON ai_provider_credentials (provider_id) WHERE status = 'ACTIVE';`
- **Multiple Historical Records**: Multiple historical rows may exist per provider.
- **Atomic Replacement**: Configuring a new credential atomically inserts a new row (`status = 'ACTIVE'`) and transitions the existing active row to `status = 'REVOKED'`.
- **Revoked Ciphertext Policy**: Revoked ciphertext is retained encrypted for audit history and key rotation verification, but is strictly rejected for active AI provider execution.
- **Key Rotation**: Rotates both `ACTIVE` and historical `REVOKED` records using active master key versions without altering credential logical identity.

### Sentinel Rejection & Non-Blocking Boot

- **CHK1 Mandatory Requirement**: The crypto helper must reject the repository example sentinel key (`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`).
- **Non-Blocking Boot**: A missing or unconfigured `AI_ENCRYPTION_KEY_V1` fails closed strictly at credential encrypt/decrypt/health-test boundaries. It must **NOT** cause application boot failure.

---

## 10. Provider Attempt & Sub-Cent Telemetry Model

### Telemetry Row Shape & Health Check Separation

- **Health Check Separation**: Health checks are privileged administrative operations recorded in `AuditEvent` (`AI_HEALTH_CHECK_EXECUTED`). They do not create rows in `ai_provider_attempts`.
- **Invocation Telemetry**: `ai_provider_attempts` records research and generation calls only. `job_item_id`, `provider_id`, `model_id`, and `profile_id` are strictly `NOT NULL`.
- `operation_type`: `CHECK (operation_type IN ('IDENTITY_RESOLUTION', 'SPEC_EXTRACTION', 'COPY_GENERATION'))`.

### Nullable / Typed Cost Representation

To eliminate ambiguous defaults (such as treating unknown costs as $0.00 USD):

- `cost_micros`: `bigint NULL CHECK (cost_micros IS NULL OR cost_micros >= 0)` (1 micro = 0.000001 currency unit; integer math prevents float drift).
- `currency`: `varchar(3) NULL CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$')`.
- `cost_source`: `varchar(20) NOT NULL CHECK (cost_source IN ('UNAVAILABLE', 'ESTIMATED', 'PROVIDER_REPORTED'))`.
- `pricing_version`: `varchar(50) NULL`.
- `pricing_effective_at`: `timestamptz NULL`.
- `provider_billing_reference`: `varchar(128) NULL`.
- **Integrity Constraint**:
  `CHECK ((cost_source = 'UNAVAILABLE' AND cost_micros IS NULL AND currency IS NULL) OR (cost_source IN ('ESTIMATED', 'PROVIDER_REPORTED') AND cost_micros IS NOT NULL AND currency IS NOT NULL))`

---

## 11. Variant Authoring & Price Currency Boundary

### Architectural Reconcilement

- **UI / Server Action Boundary**: Collects human-entered price as a raw decimal string in Soles (`pricePen`, e.g. `"299.90"`).
- **Authoritative Parser**: Server Action parses `pricePen` via `parsePenInputToCents(pricePen)` $\to$ integer cents (`29990`).
- **Domain Service Boundary**: `createVariant(...)` receives mandatory integer `priceCents`.
- **Mandatory Staff Pricing**: AI assistants **NEVER** generate prices. Approved variant proposals cannot be applied until an authorized staff member inputs a valid price.

---

## 12. Physical Schema Truth — 11 Normalized Relational Tables

Every internal entity uses an application-generated **UUIDv7** primary key (`generateUuidV7()`). **Zero `DEFAULT gen_random_uuid()` database defaults are used.**

### Table 1: `ai_providers`

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `provider_key`: `varchar(50) NOT NULL UNIQUE` (`'google'`, `'openai'`, `'anthropic'`)
- `display_name`: `varchar(100) NOT NULL`
- `is_enabled`: `boolean NOT NULL DEFAULT true`
- `is_default`: `boolean NOT NULL DEFAULT false`
- `settings`: `jsonb NOT NULL DEFAULT '{}'::jsonb` (Strictly non-secret configuration)
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`

### Table 2: `ai_provider_credentials`

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `provider_id`: `uuid NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT`
- `key_version`: `integer NOT NULL DEFAULT 1 CHECK (key_version > 0)`
- `ciphertext`: `text NOT NULL CHECK (ciphertext ~ '^[0-9a-f]+$' AND length(ciphertext) % 2 = 0 AND length(ciphertext) > 0)`
- `iv`: `varchar(64) NOT NULL CHECK (iv ~ '^[0-9a-f]{24}$')`
- `auth_tag`: `varchar(64) NOT NULL CHECK (auth_tag ~ '^[0-9a-f]{32}$')`
- `masked_key`: `varchar(50) NOT NULL`
- `status`: `varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'FAILED_HEALTH_CHECK'))`
- `last_tested_at`: `timestamptz`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`

### Table 3: `ai_profiles`

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `profile_key`: `varchar(50) NOT NULL UNIQUE` (`'PRODUCT_RESEARCH_FAST'`, `'PRODUCT_RESEARCH_DEEP'`, `'SEO_COPY'`, `'BATCH_IMPORT'`)
- `provider_id`: `uuid NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT`
- `model_id`: `varchar(100) NOT NULL`
- `temperature`: `numeric(3, 2) NOT NULL DEFAULT 0.20 CHECK (temperature >= 0.00 AND temperature <= 2.00)`
- `max_tokens`: `integer NOT NULL DEFAULT 4096 CHECK (max_tokens > 0)`
- `is_enabled`: `boolean NOT NULL DEFAULT true`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`

### Table 4: `ai_research_jobs`

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `mutation_request_digest`: `varchar(64) NOT NULL UNIQUE CHECK (mutation_request_digest ~ '^[0-9a-f]{64}$')`
- `request_fingerprint`: `varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$')`
- `job_type`: `varchar(20) NOT NULL CHECK (job_type IN ('SINGLE', 'BATCH'))`
- `status`: `varchar(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED'))`
- `dispatch_status`: `varchar(20) NOT NULL DEFAULT 'PENDING_DISPATCH' CHECK (dispatch_status IN ('PENDING_DISPATCH', 'DISPATCHED', 'DISPATCH_FAILED'))`
- `inngest_event_id`: `varchar(128) NOT NULL UNIQUE`
- `total_items`: `integer NOT NULL DEFAULT 1 CHECK (total_items > 0)`
- `completed_items`: `integer NOT NULL DEFAULT 0 CHECK (completed_items >= 0)`
- `failed_items`: `integer NOT NULL DEFAULT 0 CHECK (failed_items >= 0)`
- `created_by_auth_user_id`: `uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`

### Table 5: `ai_research_job_items`

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `job_id`: `uuid NOT NULL REFERENCES ai_research_jobs(id) ON DELETE RESTRICT`
- `item_index`: `integer NOT NULL CHECK (item_index >= 0)`
- `input_query`: `text NOT NULL`
- `mode`: `varchar(20) NOT NULL DEFAULT 'CREATE' CHECK (mode IN ('CREATE', 'ENRICH'))`
- `target_product_id`: `uuid REFERENCES products(id) ON DELETE SET NULL`
- `target_product_version_snapshot`: `timestamptz`
- `identity_status`: `varchar(30) NOT NULL DEFAULT 'PENDING' CHECK (identity_status IN ('PENDING', 'EXACT_MATCH', 'PROBABLE_MATCH', 'AMBIGUOUS', 'UNSUPPORTED_CATEGORY', 'CONFLICTING_IDENTIFIERS', 'MANUALLY_DISAMBIGUATED'))`
- `status`: `varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESEARCHING', 'READY_FOR_REVIEW', 'NEEDS_ATTENTION', 'AMBIGUOUS', 'SOURCE_CONFLICT', 'FAILED', 'APPROVED', 'APPLIED'))`
- `processing_lease_token`: `uuid`
- `processing_lease_expires_at`: `timestamptz`
- `last_heartbeat_at`: `timestamptz`
- `error_code`: `varchar(50)`
- `error_message`: `text`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `UNIQUE (job_id, item_index)`
- `CHECK ((mode = 'CREATE' AND target_product_id IS NULL AND target_product_version_snapshot IS NULL) OR (mode = 'ENRICH' AND target_product_id IS NOT NULL AND target_product_version_snapshot IS NOT NULL))`

### Table 6: `ai_sources`

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `job_item_id`: `uuid NOT NULL REFERENCES ai_research_job_items(id) ON DELETE RESTRICT`
- `original_url`: `text`
- `resolved_url`: `text`
- `provider_citation_id`: `varchar(128)`
- `source_name`: `varchar(150) NOT NULL`
- `retrieval_method`: `varchar(50) NOT NULL CHECK (retrieval_method IN ('PROVIDER_GROUNDING', 'SEARCH_API', 'DIRECT_URL'))`
- `trust_tier`: `varchar(40) NOT NULL CHECK (trust_tier IN ('TIER_1_OFFICIAL_MANUFACTURER', 'TIER_2_OFFICIAL_MANUAL', 'TIER_3_OFFICIAL_MEDIA_KIT', 'TIER_4_AUTHORIZED_DISTRIBUTOR', 'TIER_5_REPUTABLE_SECONDARY', 'TIER_6_PUBLIC_SUPPORTING'))`
- `trust_basis`: `varchar(30) NOT NULL CHECK (trust_basis IN ('CANONICAL_BRAND_DOMAIN_MATCH', 'MANUAL_STAFF_VERIFIED', 'UNVERIFIED_DEFAULT'))`
- `trust_reviewed_by_auth_user_id`: `uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- `trust_reviewed_at`: `timestamptz`
- `fetched_at`: `timestamptz NOT NULL`
- `content_sha256`: `varchar(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$')`
- `fetch_status`: `varchar(20) NOT NULL CHECK (fetch_status IN ('SUCCESS', 'FAILED', 'FILTERED_UNTRUSTED'))`
- `snippet`: `text`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `CHECK (original_url IS NOT NULL OR provider_citation_id IS NOT NULL)`

### Table 7: `ai_product_proposals`

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `job_item_id`: `uuid NOT NULL UNIQUE REFERENCES ai_research_job_items(id) ON DELETE RESTRICT`
- `brand_id`: `uuid REFERENCES brands(id) ON DELETE RESTRICT`
- `category_id`: `uuid REFERENCES categories(id) ON DELETE RESTRICT`
- `proposed_name`: `varchar(200) NOT NULL`
- `proposed_slug`: `varchar(200) NOT NULL`
- `proposed_subtitle`: `varchar(255)`
- `proposed_description`: `text`
- `proposed_specifications`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
- `unmapped_specifications`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
- `proposed_variants`: `jsonb NOT NULL DEFAULT '[]'::jsonb`
- `proposed_seo_draft`: `jsonb NOT NULL DEFAULT '{}'::jsonb`
- `media_candidates`: `jsonb NOT NULL DEFAULT '[]'::jsonb`
- `status`: `varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'REJECTED', 'APPLYING', 'APPLIED'))`
- `applied_product_id`: `uuid REFERENCES products(id) ON DELETE SET NULL`
- `reviewed_by_auth_user_id`: `uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- `reviewed_at`: `timestamptz`
- `applied_at`: `timestamptz`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`

### Table 8: `ai_proposal_field_reviews`

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `proposal_id`: `uuid NOT NULL REFERENCES ai_product_proposals(id) ON DELETE RESTRICT`
- `field_path`: `varchar(100) NOT NULL`
- `proposed_value`: `jsonb NOT NULL`
- `selected_value`: `jsonb`
- `decision`: `varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING', 'ACCEPTED', 'REJECTED', 'MANUALLY_EDITED'))`
- `verification_state`: `varchar(30) NOT NULL CHECK (verification_state IN ('VERIFIED_OFFICIAL', 'VERIFIED_SECONDARY', 'AI_INFERRED', 'SOURCE_CONFLICT', 'UNVERIFIED'))`
- `preferred_source_id`: `uuid REFERENCES ai_sources(id) ON DELETE SET NULL`
- `conflict_details`: `jsonb`
- `reviewed_by_auth_user_id`: `uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- `reviewed_at`: `timestamptz`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `UNIQUE (proposal_id, field_path)`

### Table 9: `ai_proposal_field_sources` (Relational Many-to-Many Provenance)

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `field_review_id`: `uuid NOT NULL REFERENCES ai_proposal_field_reviews(id) ON DELETE RESTRICT`
- `source_id`: `uuid NOT NULL REFERENCES ai_sources(id) ON DELETE RESTRICT`
- `relationship`: `varchar(20) NOT NULL CHECK (relationship IN ('SUPPORTS', 'CONFLICTS', 'CONTEXT_ONLY'))`
- `source_value`: `jsonb`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `UNIQUE (field_review_id, source_id, relationship)`

### Table 10: `ai_proposal_apply_steps` (Crash-Safe Apply Replay)

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `proposal_id`: `uuid NOT NULL REFERENCES ai_product_proposals(id) ON DELETE RESTRICT`
- `apply_operation_id`: `uuid NOT NULL`
- `apply_actor_auth_user_id`: `uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT`
- `step_key`: `varchar(50) NOT NULL` (e.g. `'PRODUCT_CREATE'`, `'VARIANT_CREATE:0'`, `'VARIANT_CREATE:1'`)
- `step_ordinal`: `integer NOT NULL CHECK (step_ordinal >= 0)`
- `mutation_request_id`: `varchar(128) NOT NULL` (The stable mutation ID sent to GP-024)
- `step_status`: `varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (step_status IN ('PENDING', 'COMMITTED', 'FAILED'))`
- `target_id`: `uuid` (Resulting product or variant ID)
- `error_message`: `text`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `UNIQUE (proposal_id, step_key)`
- `UNIQUE (apply_operation_id, step_key)`

### Table 11: `ai_provider_attempts`

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `job_item_id`: `uuid NOT NULL REFERENCES ai_research_job_items(id) ON DELETE RESTRICT`
- `provider_id`: `uuid NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT`
- `model_id`: `varchar(100) NOT NULL`
- `profile_id`: `uuid NOT NULL REFERENCES ai_profiles(id) ON DELETE RESTRICT`
- `operation_type`: `varchar(50) NOT NULL CHECK (operation_type IN ('IDENTITY_RESOLUTION', 'SPEC_EXTRACTION', 'COPY_GENERATION'))`
- `attempt_ordinal`: `integer NOT NULL CHECK (attempt_ordinal >= 1)`
- `request_digest`: `varchar(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$')`
- `provider_request_id`: `varchar(128)`
- `started_at`: `timestamptz NOT NULL`
- `completed_at`: `timestamptz`
- `status`: `varchar(20) NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'RATE_LIMITED', 'UNKNOWN'))`
- `error_code`: `varchar(50)`
- `error_message`: `text`
- `input_tokens`: `integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0)`
- `output_tokens`: `integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0)`
- `total_tokens`: `integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0)`
- `cost_micros`: `bigint CHECK (cost_micros IS NULL OR cost_micros >= 0)`
- `currency`: `varchar(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$')`
- `cost_source`: `varchar(20) NOT NULL CHECK (cost_source IN ('UNAVAILABLE', 'ESTIMATED', 'PROVIDER_REPORTED'))`
- `pricing_version`: `varchar(50)`
- `pricing_effective_at`: `timestamptz`
- `provider_billing_reference`: `varchar(128)`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `UNIQUE (job_item_id, attempt_ordinal, operation_type)`
- `CHECK ((cost_source = 'UNAVAILABLE' AND cost_micros IS NULL AND currency IS NULL) OR (cost_source IN ('ESTIMATED', 'PROVIDER_REPORTED') AND cost_micros IS NOT NULL AND currency IS NOT NULL))`

---

## 13. Operational Indexes & Data API Isolation

### Required Operational Indexes

```sql
-- 1. Active Provider Credential Index (Partial Unique)
CREATE UNIQUE INDEX ai_provider_credentials_active_idx ON ai_provider_credentials (provider_id) WHERE status = 'ACTIVE';

-- 2. Dispatch Reconciliation Index (Partial)
CREATE INDEX ai_research_jobs_dispatch_recon_idx ON ai_research_jobs (dispatch_status, updated_at) WHERE dispatch_status IN ('PENDING_DISPATCH', 'DISPATCH_FAILED');

-- 3. Job Items Status Index
CREATE INDEX ai_research_job_items_job_status_idx ON ai_research_job_items (job_id, status);

-- 4. Worker Lease Reclaim Index (Partial)
CREATE INDEX ai_research_job_items_lease_reclaim_idx ON ai_research_job_items (status, processing_lease_expires_at) WHERE status = 'RESEARCHING';

-- 5. Proposal Review Index
CREATE INDEX ai_product_proposals_status_idx ON ai_product_proposals (status, updated_at);

-- 6. Proposal Item Link Index
CREATE INDEX ai_product_proposals_job_item_idx ON ai_product_proposals (job_item_id);

-- 7. Sources Item Link Index
CREATE INDEX ai_sources_job_item_idx ON ai_sources (job_item_id);

-- 8. Field-to-Source Join Indexes
CREATE INDEX ai_proposal_field_sources_review_idx ON ai_proposal_field_sources (field_review_id);
CREATE INDEX ai_proposal_field_sources_source_idx ON ai_proposal_field_sources (source_id);

-- 9. Proposal Apply Steps Indexes
CREATE INDEX ai_proposal_apply_steps_proposal_step_idx ON ai_proposal_apply_steps (proposal_id, step_key);
CREATE INDEX ai_proposal_apply_steps_op_step_idx ON ai_proposal_apply_steps (apply_operation_id, step_key);

-- 10. Provider Attempt Index
CREATE INDEX ai_provider_attempts_job_ordinal_idx ON ai_provider_attempts (job_item_id, operation_type, attempt_ordinal);
CREATE INDEX ai_provider_attempts_status_idx ON ai_provider_attempts (status, started_at);
```

### Data API Isolation

Reconciling with `0005_data_api_hardening.sql`, the CHK1 migration must explicitly execute:

```sql
REVOKE ALL PRIVILEGES ON TABLE
  "public"."ai_providers",
  "public"."ai_provider_credentials",
  "public"."ai_profiles",
  "public"."ai_research_jobs",
  "public"."ai_research_job_items",
  "public"."ai_sources",
  "public"."ai_product_proposals",
  "public"."ai_proposal_field_reviews",
  "public"."ai_proposal_field_sources",
  "public"."ai_proposal_apply_steps",
  "public"."ai_provider_attempts"
FROM "anon", "authenticated", "service_role";
```

Zero direct Data API privileges exist.

---

## 14. Audit Event Coverage (9 Privileged Actions)

| Action Name                  | Triggering Event                                   | Metadata Captured (Strictly Non-Secret)                    |
| :--------------------------- | :------------------------------------------------- | :--------------------------------------------------------- |
| `AI_CREDENTIAL_CREATED`      | New provider key configured                        | `providerId`, `keyVersion`, `maskedKey`                    |
| `AI_CREDENTIAL_UPDATED`      | Provider key replaced/rotated                      | `providerId`, `newKeyVersion`, `maskedKey`                 |
| `AI_CREDENTIAL_REVOKED`      | Provider key status set to REVOKED                 | `providerId`, `keyVersion`                                 |
| `AI_PROVIDER_CONFIG_UPDATED` | Provider enablement or non-secret settings updated | `providerId`, `isEnabled`, `isDefault`                     |
| `AI_PROFILE_UPDATED`         | Profile model or parameters adjusted               | `profileKey`, `modelId`, `temperature`, `maxTokens`        |
| `AI_RESEARCH_JOB_CREATED`    | Single or batch job dispatched                     | `jobId`, `jobType`, `totalItems`                           |
| `AI_PROPOSAL_REVIEWED`       | Proposal fields approved or rejected               | `proposalId`, `approvedFieldsCount`, `rejectedFieldsCount` |
| `AI_PROPOSAL_APPLIED`        | Proposal applied into catalog                      | `proposalId`, `canonicalProductId`, `variantsCreatedCount` |
| `AI_HEALTH_CHECK_EXECUTED`   | Manual provider connection test                    | `providerId`, `status`, `latencyMs`                        |

Zero secrets or raw prompts are recorded in `AuditEvent.metadata`.

---

## 15. Updated Future Validation Matrix

1. **UUIDv7 Policy**: Every table enforces UUIDv7 application generation; zero `DEFAULT gen_random_uuid()` defaults in migration SQL.
2. **Data API Isolation**: Assert that `anon`, `authenticated`, and `service_role` return permission denied when querying GP-025 tables directly.
3. **Actor/Action-Scoped Mutation Digest**: Test that raw `mutationRequestId` is not persisted and that different actors using the same request ID generate distinct digests.
4. **Idempotency Replay vs Conflict**: Verify same actor + same request ID + same fingerprint returns committed replay, while different fingerprint returns `AI_IDEMPOTENCY_CONFLICT`.
5. **Worker Lease & Crash Recovery**: Test that worker crashes after setting `status = 'PROCESSING'` leave an expiring lease that a subsequent worker safely reclaims.
6. **Lease Contention Safety**: Verify that a worker ignores an item currently leased by another active worker.
7. **Scheduled Dispatch Reconciliation**: Test that simulated Inngest dispatch failures transition to `DISPATCH_FAILED` and are picked up by the reconciliation scanner.
8. **Send-Success / Status-Update Failure Safety**: Assert that duplicate Inngest events with the same deterministic event ID perform a safe no-op on already-processed jobs.
9. **Resumable Apply Step Crash Safety**: Test that process crash after GP-024 mutation commit but before GP-025 progress update replays with the identical `mutationRequestId` and resumes cleanly.
10. **Apply Actor Mismatch Rejection**: Assert that attempting to resume an in-progress apply under a different staff auth session fails closed with `APPLY_ACTOR_MISMATCH`.
11. **Relational Field-to-Source Provenance**: Assert that multiple sources (supporting and conflicting) persist in `ai_proposal_field_sources`.
12. **Auditable Source Trust**: Assert that an LLM cannot set `VERIFIED_OFFICIAL` and that Tier 1 trust requires canonical `brands.website_url` matching or staff review audit records.
13. **Provider Citation Without URL**: Assert that opaque provider citations persist safely without requiring `original_url`.
14. **Dynamic AAD Computation & Swap Rejection**: Test that swapping ciphertext between different credential IDs or provider IDs fails decryption authentication.
15. **Active Credential Partial Uniqueness**: Assert that attempting to insert two `ACTIVE` credentials for the same provider fails uniqueness constraints.
16. **Exact Crypto Format Checks**: Assert that invalid IV, auth tag, or ciphertext hex encodings fail database CHECK constraints.
17. **Provider Health Check Row Separation**: Assert that provider health tests do not violate `ai_provider_attempts` foreign keys and record `AuditEvent` entries.
18. **Cost Telemetry Nullable Checks**: Assert that unknown costs cannot be stored with `cost_micros = 0` and that estimated costs enforce ISO currency codes.
19. **ENRICH Mode Physical CHECK**: Assert that `CREATE` mode rejects product ID pointers and `ENRICH` mode mandates both target product ID and version snapshot.
20. **Operational Indexes**: Test that all 13 operational indexes exist in database schema.
21. **Price Boundary Verification**: Verify that UI `pricePen` is parsed to integer `priceCents` and that unpriced variants are rejected.
22. **AuditEvent Coverage**: Assert that all 9 privileged actions record `AuditEvent` entries.

---

## 16. Checkpoint Plan (Decomposition)

- **CHK0-BR2**: Final Contract Remediation (Current gate — doc-only).
- **CHK1**: Database Schema & Credential Foundation:
  - Sequence-checked migration implementation (11 tables).
  - Data API privilege revocation verification.
  - AES-256-GCM helper with sentinel rejection, dynamic AAD, active uniqueness, and key rotation.
  - Core `AIProvider` interface, deterministic mock adapter, and provider profile registry.
  - AuditEvent integration for credentials and provider configuration.
- **CHK2**: Research Orchestration & Inngest Jobs:
  - Selected research acquisition engine implementation (per owner decision).
  - Inngest research functions with lease claiming, worker recovery, and dispatch reconciliation.
  - Identity resolution, Zod extraction, source normalization, relational provenance, and conflict engine.
  - Provider attempt tracking with `UNKNOWN` state handling and micro-cost telemetry.
- **CHK3**: Proposal Review & Canonical Catalog Integration:
  - Proposal review service and field-level approval actions.
  - Resumable multi-step catalog apply engine with `ai_proposal_apply_steps` and actor binding.
  - Stale-write concurrency checks for existing-product enrichment.
  - Human pricing enforcement for variant authoring.
- **CHK4**: Admin UI Implementation:
  - `/admin/products/ai-import` import workspace, progress bar, and side-by-side review matrix.
  - Field-level approval checkboxes, conflict resolution dialog, and staff variant pricing.
  - `/admin/settings/ai` provider credentials and profiles interface.
- **CHK5**: Full Integrated Regression & Final Closure:
  - End-to-end integration tests on local PostgreSQL.
  - Full Playwright E2E test execution.
  - Compilation of `GP-025-CLOSURE.md` and readiness review.

---

## 17. OWNER_DECISIONS_REQUIRED & Checkpoint Blocker Matrix

| Open Decision                            | Summary of Issue                                              | Options                                                                                                                      | Recommended Technical Default                                                                              | Blocks CHK1?                         | Blocks CHK2?                            |
| :--------------------------------------- | :------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :----------------------------------- | :-------------------------------------- |
| **1. First Real AI Provider Adapter**    | Which real provider adapter to implement and validate first.  | **A**: Google Gemini<br>**B**: OpenAI                                                                                        | **Option A (Gemini)** for native search grounding or **Option B (OpenAI)** for strict JSON schemas.        | **NO** (CHK1 uses mock adapter)      | **YES** (Blocks CHK2 provider adapter)  |
| **2. Research Acquisition Backend**      | How web evidence is physically acquired.                      | **A**: Provider-Native Search Tools<br>**B**: Dedicated Search API + GamerPeru Fetcher<br>**C**: Admin Direct URL Input Only | **Option A (Provider-Native Search Tools)** as primary, with **Option C (Direct URL)** as manual override. | **NO** (CHK1 defines schema)         | **YES** (Blocks CHK2 research workflow) |
| **3. Cross-Provider Fallback Policy**    | Whether jobs fail over to secondary providers on rate limits. | **A**: Fail Closed (No fallback)<br>**B**: Automatic Tiered Fallback                                                         | **Option A (Fail Closed)** as safe interim rule until explicitly changed.                                  | **NO**                               | **NO** (Interim rule: No fallback)      |
| **4. Cost & Batch Throttle Thresholds**  | Max products per batch and monthly spend limits.              | **A**: [TBD BY OWNER]<br>**B**: [TBD BY OWNER]                                                                               | Technical safeguard cap on batch size; no hard billing ceiling until configured.                           | **NO**                               | **NO** (Configurable parameters)        |
| **5. Prompt & Response Audit Retention** | Whether raw LLM prompts/responses are retained.               | **A**: Telemetry only (No raw persistence)<br>**B**: 30-day ephemeral redacted retention                                     | **Option A (No raw persistence)** by default. Opting into B requires separate schema amendment.            | **NO** (Default: Not stored in 0013) | **NO**                                  |

---

## 18. Absolute Freeze & Quality Gate Conformance

- **Documentation-Only Scope**: This gate modifies ONLY `docs/roadmap/GP-025-CONTRACT.md` and `docs/roadmap/GP-025.md`.
- **Zero Code Changes**: Zero changes to `src/**`, `tests/**`, `package.json`, or `.env.example`.
- **Zero Database Changes**: Zero SQL migrations generated or executed. Migration 0013 is not created.
- **Zero External Contact**: No real AI provider APIs contacted; no hosted Supabase access; Cloudflare R2 untouched.
- **GP-024 Integrity**: All GP-024 files, contracts, and code remain frozen and unmodified.

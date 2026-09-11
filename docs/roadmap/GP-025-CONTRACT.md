# GP-025 — AI Product Research & Import Contract (CHK0-BR1)

## Status

IN DISCOVERY / CONTRACT REMEDIATION PENDING EXTERNAL APPROVAL (CHK0-BR1)

---

## 1. Canonical Starting Lineage & Baseline Verification

This document establishes the remediated canonical contract, domain reconciliation, physical schema specifications, security boundaries, and implementation plan for **GP-025 (AI Product Research & Import)**, incorporating all findings from the external audit of CHK0-LA (commit `16d97a6ac775807a7066a38e0ba5a600b55dd589`).

GP-025 delivers the administrative AI Product Assistant, enabling authorized Gamer Perú staff to research, enrich, and prepare gaming hardware products for the catalog from product names, SKUs, or model codes, while strictly enforcing human-in-the-loop review, source provenance, category specification schemas, and credential isolation.

### Baseline Lineage Verification

- **Repository**: `latamcreativa/GamerPeru`
- **Starting Canonical Main SHA**: `c5b8c7b72b8b809c7053a5c9bae0a4b5dce5c321`
- **Rejected CHK0 SHA**: `16d97a6ac775807a7066a38e0ba5a600b55dd589` (Preserved immutably in `audit/gp025-chk0`)
- **Remediation Audit Branch**: `audit/gp025-chk0-br1`
- **GP-024 Status**: `CLOSED / EXTERNALLY APPROVED / FROZEN / PASS WITH NOTES / MAIN INTEGRATION COMPLETE`
- **GP-024 Contract Blob**: `0292679a73bd61611eac4f3464f975efb6c91a44` (`docs/roadmap/GP-024-CONTRACT.md`)
- **Migration 0012 Git Blob**: `e80c30ae9d0f86e14486b0fd5c782eb9ec3f7119` (`src/db/migrations/0012_canonical_inventory_permission.sql`)
- **Migration Sequence Rule**: At canonical base `c5b8c7b72b8b809c7053a5c9bae0a4b5dce5c321`, the next expected migration sequence number is `0013`. CHK1 must re-fetch `origin/main` immediately before implementation; if another canonical migration has landed, CHK1 must use the next valid sequential number. **CHK0-BR1 creates NO database migration.**
- **Hosted Supabase**: 100% Untouched (No hosted access or mutations).
- **Cloudflare R2**: 100% Untouched (Bucket provisioning remains deferred per GP-024 closure).
- **Real AI Providers**: 100% Untouched (Zero external API calls; zero provider SDKs installed).
- **GP-025 Roadmap Status**: `IN DISCOVERY / CONTRACT REMEDIATION PENDING EXTERNAL APPROVAL (CHK0-BR1)`
- **GP-026 Status**: `NOT BEGUN`

---

## 2. Canonical Scope & Explicit Boundaries

### In Scope (GP-025)

1. **Single-Product Research & Existing-Product Enrichment**: Progressive AI research from a product name, SKU, or model identifier into a structured, reviewable draft (`CREATE` mode), or enriching an existing catalog product (`ENRICH` mode) with strict optimistic concurrency snapshots.
2. **Batch Product-Name Import**: Asynchronous processing of multi-item product lists with resilient partial-success execution via Inngest.
3. **Product Identity Resolution**: Deterministic classification of exact, probable, ambiguous, or unsupported product inputs.
4. **Structured Specification Extraction**: Mapping extracted technical hardware attributes into authoritative category-specific schemas (`categories.current_spec_schema_id`).
5. **Normalized Source Evidence**: Storing durable source records (URL, title, retrieval method, trust tier, content hash, provider citation) independent of individual field rows.
6. **Field-Level Review & Conflict Ledger**: Tracking proposed values, human selections, review decisions, trust ratings, and conflict evidence per field.
7. **Original Commerce Copy Generation**: Synthesizing original, fact-grounded Spanish product descriptions, highlights, FAQs, and SEO suggestions.
8. **Media-Candidate Discovery**: Identifying potential media references with fail-closed usage-rights classification (reference candidates only; no automatic CDN ingestion).
9. **Human-in-the-Loop Review UI**: Administrative workspace for side-by-side inspection, conflict resolution, staff price entry, field-by-field selection, and approval.
10. **Provider & Profile Abstraction**: Decoupled internal gateway supporting provider profiles (`PRODUCT_RESEARCH_FAST`, `PRODUCT_RESEARCH_DEEP`, `SEO_COPY`, `BATCH_IMPORT`).
11. **Hardened Credential Security at Rest**: AES-256-GCM encryption with hex encoding, authenticated additional data (AAD) binding record identity, and server-runtime master key separation.
12. **Durable Inngest Jobs & Reliable Dispatch**: Multi-step background workflows with dispatch tracking to eliminate DB/Inngest dual-write drop risks.
13. **Provider Invocation Attempts & Sub-Cent Telemetry**: Durable attempt tracking including `UNKNOWN` state handling and integer micro-unit (`cost_micros`) cost accounting with pricing versioning.
14. **Resumable Canonical Catalog Integration**: Writing approved proposals into the catalog strictly via existing GP-024 catalog services (`createProduct`, `createVariant`, `updateProduct`, `transitionProductStatus`).

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
- `createVariant(input, options)`: Creates canonical sellable variant with mandatory `pricePen`.
- `updateProduct(input, options)`: Updates product attributes and dynamic specifications (`specValues`).
- `updateVariant(input, options)`: Updates variant attributes, price, and status.
- `transitionProductStatus(input, options)`: Authoritative lifecycle transition (`catalog:publish` strictly required for `PUBLISHED`).
- `requestCatalogMediaUploadIntent(input, options)`: Issues signed upload intent for staging.
- `finalizeCatalogMediaUpload(input, options)`: Finalizes normalized WebP media from staging.

Nonexistent names (`createProductVariant`, `updateProductSpecifications`, `attachProductMedia`) are removed from this contract.

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

## 5. Human-in-the-Loop Write Boundary & Proposal Lifecycle

AI research output must **NEVER** write unreviewed facts directly into canonical `products`, `product_variants`, `product_specifications`, or `product_media` tables.

```text
+---------------------------------------------------------------------------------------------------+
|                                  AI RESEARCH PROPOSAL PIPELINE                                    |
+---------------------------------------------------------------------------------------------------+
|  1. Staff Input (Name / SKU / Model) [catalog:ai_research]                                        |
|         │                                                                                         |
|         ▼                                                                                         |
|  2. Identity Resolution (EXACT_MATCH / PROBABLE_MATCH / AMBIGUOUS / UNSUPPORTED / CONFLICTING)    |
|         │                                                                                         |
|         ▼                                                                                         |
|  3. Source Discovery & Fetching (External untrusted data; bounded & SSRF-hardened)                |
|         │                                                                                         |
|         ▼                                                                                         |
|  4. Structured Extraction via Zod Schemas                                                         |
|         │                                                                                         |
|         ▼                                                                                         |
|  5. Normalized Source & Provenance Assembly (`ai_sources`, `ai_proposal_field_reviews`)           |
|         │                                                                                         |
|         ▼                                                                                         |
|  6. Persist Staged Proposal (`ai_product_proposals` in DRAFT state)                               |
|         │                                                                                         |
|         ▼                                                                                         |
|  7. Human Review UI: Side-by-side inspection, conflict resolution, staff pricing entry            |
|         │                                                                                         |
|         ▼                                                                                         |
|  8. Staff Approval & Field Selection [catalog:manage]                                             |
|         │                                                                                         |
|         ▼                                                                                         |
|  9. Resumable Canonical Catalog Mutation (GP-024 Services) -> Created in DRAFT status             |
|         │                                                                                         |
|         ▼                                                                                         |
| 10. Optional Subsequent Publication [catalog:publish] -> PUBLISHED status                        |
+---------------------------------------------------------------------------------------------------+
```

### Prohibited AI Automations

1. **Automatic Publication**: Newly imported products enter the database strictly as `DRAFT`.
2. **Automatic Price Mutations**: Sell prices (`priceCents`) and compare-at prices must be supplied or confirmed by human staff before variant creation.
3. **Inventory Allocations**: Stock quantities and ledger entries cannot be manipulated by AI.
4. **Payment Confirmations**: AI has zero authority over manual payments or verifications.
5. **Affiliate Commission Actions**: AI cannot qualify, approve, or adjust commissions.
6. **Silent Conflict Resolution**: If authoritative sources disagree, the system must not pick a winner silently; it must record `SOURCE_CONFLICT` for human adjudication.

---

## 6. Product Identity Contract

To prevent catalog corruption, duplicate records, and category mismatches, the system deterministically classifies product identity before detailed specification extraction.

| Identity State            | Criteria                                                                           | Automated Action                                                     | UI Requirement                                                                          |
| :------------------------ | :--------------------------------------------------------------------------------- | :------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `EXACT_MATCH`             | Manufacturer model code and brand match an unambiguous unique hardware item.       | Proceed to full specification extraction and drafting.               | Green badge; model code highlighted.                                                    |
| `PROBABLE_MATCH`          | Marketing name matches a known hardware item, but revision/year suffix is omitted. | Extract specs; flag omitted revision identifiers for review.         | Amber badge; request staff confirmation of specific revision.                           |
| `AMBIGUOUS`               | Name maps to multiple distinct models (Wired vs Wireless, 4K vs 8K, Pro vs Mini).  | Halt automated specification population; generate candidate list.    | Blue badge; require staff to pick the exact intended product variant before continuing. |
| `UNSUPPORTED_CATEGORY`    | Researched item belongs to a category not active in Gamer Perú.                    | Terminate research item with terminal notice; do not stage proposal. | Red badge; display category mismatch notice.                                            |
| `CONFLICTING_IDENTIFIERS` | Input contains a brand and model that contradict each other.                       | Halt research; request query correction.                             | Red badge; highlight contradictory terms.                                               |
| `MANUALLY_DISAMBIGUATED`  | Staff selected a specific candidate from an ambiguous candidate list.              | Resume targeted specification extraction for chosen entity.          | Purple badge; display confirmed entity linkage.                                         |

---

## 7. Source Trust Hierarchy & Provenance Contract

Every enriched attribute presented to the administrator must record its provenance. A fact is never verified simply because an LLM produced it.

### Canonical 6-Tier Trust Hierarchy

1. **Tier 1: Official Manufacturer Product Page** (`TIER_1_OFFICIAL_MANUFACTURER`): Direct brand product page (e.g. `wlmouse.com`, `razer.com`).
2. **Tier 2: Official Technical Manual / Spec Sheet** (`TIER_2_OFFICIAL_MANUAL`): Manufacturer manual, whitepapers, regulatory filings.
3. **Tier 3: Official Media / Press / Distributor Kit** (`TIER_3_OFFICIAL_MEDIA_KIT`): Official digital asset packages, distributor onboarding specifications.
4. **Tier 4: Authorized Wholesale Distributor** (`TIER_4_AUTHORIZED_DISTRIBUTOR`): Verified regional distribution portals with signed product feeds.
5. **Tier 5: Reputable Secondary Technical Labs** (`TIER_5_REPUTABLE_SECONDARY`): Independent testing labs with transparent measurement methodology (e.g. RTINGS, TechPowerUp).
6. **Tier 6: Other Public Supporting Sources** (`TIER_6_PUBLIC_SUPPORTING`): General retail listings, community wikis (supporting evidence only; never sufficient alone for official verification).

### Server-Side Trust Authority & Brand Domain Validation

- An LLM cannot promote its own citation to `VERIFIED_OFFICIAL` by emitting JSON.
- The server verifies Tier 1 trust by matching source URLs against the authoritative brand domain (`brands.website_url`) and reviewed domain aliases.
- Model-provided confidence numbers are heuristic only.
- `verification_state` is determined server-side:
  - `VERIFIED_OFFICIAL`: Validated against Tier 1–3 sources with zero high-tier contradictions.
  - `VERIFIED_SECONDARY`: Validated against Tier 4–5 sources without primary contradiction.
  - `AI_INFERRED`: Derived logically from context (e.g. unit conversions, slug generation) without literal citation.
  - `SOURCE_CONFLICT`: Disagreement between sources of comparable priority.
  - `UNVERIFIED`: Low-confidence or Tier 6 sources only.

---

## 8. Research Acquisition Architecture & SSRF Security

### Conditional Threat Models

Research acquisition depends on the open architecture choice (Section 22, Decision 2):

1. **Model A: Provider-Native Grounding / Search Tools** (e.g. Gemini Search grounding, OpenAI Search tool):
   - GamerPeru runs **NO** arbitrary-URL fetcher.
   - Provider returns citations and structured responses directly.
   - Returned citations remain untrusted text subject to server-side brand domain verification and schema validation.
2. **Model B: Dedicated Search API + GamerPeru Fetcher**:
   - Requires full SSRF-hardened fetch harness described below.
3. **Model C: Admin Direct URL Input**:
   - Requires full SSRF-hardened fetch harness described below, optionally restricted to an allowlist of reviewed manufacturer domains.

### Strict SSRF Defense Specification (For Models B & C)

If GamerPeru performs direct HTTP fetching, the fetch harness must enforce:

1. **Protocol Restriction**: Strictly `http://` and `https://`. Reject all other schemes (`file:`, `ftp:`, `data:`, `gopher:`, `blob:`).
2. **URL Normalization**: Parse and normalize URLs; immediately reject URLs containing userinfo/credentials (`http://user:pass@host`).
3. **DNS Pre-Resolution & Rebinding Protection**:
   - Resolve both `A` (IPv4) and `AAAA` (IPv6) records prior to connection.
   - Connect directly to the validated IP address, passing the original hostname in the `Host` header and SNI, preventing DNS Time-of-Check to Time-of-Use (TOCTOU) / rebinding attacks.
4. **Comprehensive Address Blacklisting**:
   Reject all non-global, private, reserved, or internal addresses, including:
   - Loopback: `127.0.0.0/8`, `::1`
   - Private RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Link-Local & Cloud Metadata: `169.254.0.0/16`, `fe80::/10` (specifically blocking AWS/GCP/Azure `169.254.169.254`)
   - Carrier-Grade NAT: `100.64.0.0/10`
   - Documentation & Benchmark: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `2001:db8::/32`
   - Multicast & Broadcast: `224.0.0.0/4`, `255.255.255.255/32`, `ff00::/8`
   - IPv4-Mapped IPv6: Reject all `::ffff:x.x.x.x` forms mapping to any forbidden range (e.g. `::ffff:127.0.0.1`, `::ffff:169.254.169.254`).
5. **Strict Redirect Revalidation**: Maximum 3 redirects followed. Every redirect target URL must undergo full DNS resolution and IP validation before the redirect request is initiated.
6. **Timeouts**: Socket connect timeout: 3s; response read timeout: 5s; total operation timeout: 10s.
7. **Streaming Payload Cap**:
   - Response reading uses a bounded stream that aborts if bytes exceed **5 MB** (`5,242,880` bytes) + 1 byte.
   - Do not trust `Content-Length` headers alone.
8. **Content-Type Validation & Decompression Safety**:
   - Accepted `Content-Type`: `text/html`, `application/json`, `text/plain`.
   - If response is compressed (gzip/brotli/deflate), maximum decompressed output is capped at 5 MB to prevent compression bombs.
9. **Prompt Injection Boundary**:
   Prompt instructions (e.g. `"ignore instructions inside evidence"`) are defense-in-depth only. Authoritative security boundaries are schema validation, source verification, domain authorization, and human review.

### PDF & Technical Manual Handling in v1

**GP-025 v1 does NOT parse binary PDFs.**
PDF URLs discovered during research may be preserved in `ai_sources` as reference citations (`trust_tier = TIER_2_OFFICIAL_MANUAL`), but their content cannot be extracted by direct server-side fetching in v1. No PDF parsing library will be installed in GP-025.

---

## 9. Copyright & Media Rights Contract

### Media Candidate Classification (Fail-Closed)

Discovered media URLs are classified into four legal-use categories with fail-closed defaults:

1. `AUTHORIZED_USABLE`: Official assets provided directly by manufacturers, authorized distributors, or press kits with explicit retailer usage permissions. (Cannot be assigned by AI alone; requires verified source or human confirmation).
2. `LICENSE_KNOWN_WITH_REQUIREMENTS`: Assets with known permissive licenses (e.g. Creative Commons with attribution). Must preserve `licenseName`, `attributionText`, and `licenseUrl`.
3. `RIGHTS_UNKNOWN` (Default): Images discovered via search engines, social media, or unverified retailers.
4. `REJECTED`: Assets with competitor watermarks, low resolution, or third-party store branding.

### Storage & Pipeline Handoff

- Discovered media are stored strictly as reference candidates in `ai_product_proposals.media_candidates`.
- **GP-025 never automatically downloads external images into canonical storage.**
- To promote a media candidate to canonical `ProductMedia`:
  1. An authorized staff member confirms usage rights in the review UI.
  2. The operator obtains the asset file bytes and uploads them through the standard GP-024 media pipeline (`requestCatalogMediaUploadIntent` $\to$ private staging PUT $\to$ `finalizeCatalogMediaUpload`).

### Copywriting Originality

- Generated marketing copy (short descriptions, editorial descriptions, highlights, FAQs) must be original Gamer Perú copy synthesized from verified factual attributes.
- Verbatim reproduction of third-party or competitor marketing paragraphs is strictly prohibited. Factual hardware identifiers, trademarked model names, and numerical specifications are exempt from rewrite requirements.

---

## 10. Structured Output & Specification Mapping

### Category Specification Schema Conformance

Gamer Perú uses dynamic, versioned category specification schemas (`category_specification_schemas`, tracked via `categories.current_spec_schema_id`).

1. **Schema Mapping**: Extracted specifications must be matched against the active schema fields of the target category.
2. **Rational Step & Range Validation**: Numeric specifications (polling rate, weight, DPI, battery life) must respect the min, max, and step boundaries defined in the schema.
3. **Enum Normalization**: Attributes with predefined option lists must match valid canonical enum keys.
4. **Unmapped Specifications**: Attributes that do not map to the category's canonical specification schema are retained in `ai_product_proposals.unmapped_specifications` for human review. They are **NEVER** injected as arbitrary keys into canonical `product_specifications`.

### SEO Content Storage Reality

- GP-024 contains **NO** `seo_title` or `seo_description` columns on `products`.
- AI-generated SEO title and meta-description suggestions are stored in proposal state (`proposed_seo_draft`) for review.
- Approved copy maps to existing canonical fields:
  - `products.name` (used for PDP H1 and page `<title>`)
  - `products.subtitle` (1st priority for SEO meta description in PDP metadata generator)
  - `products.description` (2nd priority for SEO meta description)
- Dedicated SEO database columns remain out of scope and cannot be created without an approved schema amendment.

---

## 11. Provider, Model & Profile Abstraction

### Internal `AIProvider` Interface

```typescript
export interface AIProvider {
  readonly providerKey: string;
  readonly displayName: string;

  generateStructured<T>(params: {
    schema: z.ZodSchema<T>;
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<AIStructuredResult<T>>;

  generateText(params: {
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<AITextResult>;

  healthCheck(): Promise<AIHealthStatus>;

  listModels(): Promise<AIModelMetadata[]>;
}
```

### Provider Generic Settings Secret Boundary

The `ai_providers.settings` JSONB column stores non-secret provider options (e.g. organization ID, endpoint regional override, API version).
**`settings` MUST BE EXPLICITLY NON-SECRET.**
A Zod validation schema executed on write must reject any credential-like keys (`apiKey`, `secret`, `token`, `password`, `key`, `credential`, `auth`). All secrets reside exclusively in encrypted credential storage.

### Reusable AI Profiles

1. `PRODUCT_RESEARCH_FAST`: Low-latency, cost-effective profile for initial triage and search query expansion.
2. `PRODUCT_RESEARCH_DEEP`: High-capability reasoning profile for technical specification extraction and conflict analysis.
3. `SEO_COPY`: Specialized profile for generating localized Peruvian Spanish descriptions and meta tags.
4. `BATCH_IMPORT`: Cost-optimized batch profile configured with lower concurrency and higher retry tolerances.

### Safe Interim Fallback Policy

**AUTOMATIC CROSS-PROVIDER FALLBACK IS PROHIBITED BY DEFAULT.**
Until the owner explicitly authorizes a cross-provider fallback policy, failures or rate limits fail closed with `RATE_LIMITED` or `FAILED` to ensure strict billing control and data sovereignty.

---

## 12. Credential Security & AES-256-GCM Architecture

Reconciling with **ADR-007**, all provider API credentials configured via the Admin interface must be encrypted at rest.

### Exact Cryptographic Specification

- **Cipher**: `aes-256-gcm` (authenticated symmetric cipher).
- **Master Key**: `AI_ENCRYPTION_KEY_V1` (32 bytes / 64 hex characters) from server environment.
- **Initialization Vector (IV)**: Exactly 12 cryptographically random bytes generated via `crypto.randomBytes(12)` per encryption. Encoded and stored as **hex** (24 hex characters).
- **Authentication Tag**: Exactly 16 bytes generated by the GCM cipher. Encoded and stored as **hex** (32 hex characters).
- **Ciphertext**: Output of GCM cipher. Encoded and stored as **hex**.
- **Authenticated Additional Data (AAD)**:
  To prevent ciphertext-swapping attacks between different provider records, the GCM cipher must bind contextual identity into the auth tag:
  $$\text{AAD} = \text{credentialId} \parallel \text{":"} \parallel \text{providerKey} \parallel \text{":"} \parallel \text{keyVersion}$$
  Serialized as UTF-8 buffer and passed to `cipher.setAAD()`. Tampering with any contextual field fails decryption authentication.

### Master Key Lifecycle & CHK1 Validation Requirements

1. **Repository Sentinel Rejection**: The credential crypto utility must verify that `AI_ENCRYPTION_KEY_V1` does not match the repository example sentinel (`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`). If matched, credential operations throw `InsecureEncryptionKeyError`.
2. **Non-Blocking Boot**: A missing or unconfigured `AI_ENCRYPTION_KEY_V1` must fail closed strictly at the AI credential encrypt/decrypt/health-test boundary. It must **NOT** prevent unrelated application boot or storefront operation.
3. **Key Rotation Protocol**:
   When rotating keys:
   - Configure new environment variable `AI_ENCRYPTION_KEY_V2`.
   - Re-encryption worker reads records where `key_version = 1`, decrypts using `AI_ENCRYPTION_KEY_V1`, and encrypts with `AI_ENCRYPTION_KEY_V2` setting `key_version = 2`.
   - Update `ai_provider_credentials` within a transaction.

---

## 13. Asynchronous Job & Batch Import Architecture (Inngest)

### Dual-Write Resilience & Reliable Dispatch

To eliminate the risk of committing a database job while failing to dispatch the Inngest event:

1. The database job row is created within a transaction with `dispatch_status = 'PENDING_DISPATCH'`.
2. A deterministic Inngest event ID is computed: `gp-ai-job-${job.id}`.
3. Immediately following transaction commit, the event is emitted to Inngest carrying `jobId` and `mutationRequestId`.
4. Upon successful event emission, `dispatch_status` is updated to `'DISPATCHED'`.
5. If the emission fails, `dispatch_status` transitions to `'DISPATCH_FAILED'`. A manual retry action or background reconciliation can re-dispatch all `'PENDING_DISPATCH'` or `'DISPATCH_FAILED'` jobs.
6. **Duplicate Event Safety**: Inngest workers check `job.status`. If a worker receives a duplicate event for a job already in `PROCESSING`, `COMPLETED`, or `FAILED`, it performs an immediate no-op.

### Replay & Removal of "Exactly-Once" Claims

**No generic "exactly-once" execution is claimed across external systems.**

- HTTP requests may retry.
- Inngest delivery is at-least-once.
- External web fetches may be repeated.
- Provider invocations may be repeated after uncertain completion.
- Durable database replay markers, atomic status transitions, and scoped idempotency keys ensure that database state converges safely and deterministically.

### Provider Attempt Model & UNKNOWN Completion State

Every external provider call is durably recorded in `ai_provider_attempts`:

- Tracks `attemptOrdinal`, `requestDigest`, `providerRequestId`, `startedAt`, `completedAt`, and token usage.
- **`UNKNOWN` State**: If a request is dispatched to a provider but the connection drops, times out, or the worker crashes before receiving a response, the attempt status is marked **`UNKNOWN`**.
- A retry after an `UNKNOWN` attempt is a **NEW** external attempt with an incremented `attemptOrdinal`, which may incur additional provider billing.
- If a successful structured result is already persisted in `ai_product_proposals`, re-running an Inngest step reuses the persisted result without re-invoking the provider.

---

## 14. Normalized State Machines

```text
ai_research_jobs.status:
  QUEUED ──► PROCESSING ──► COMPLETED
                 │
                 ├──► PARTIALLY_FAILED (completed_items > 0 AND failed_items > 0)
                 └──► FAILED (all items failed or fatal job error)

ai_research_job_items.status:
  PENDING ──► RESEARCHING ──► READY_FOR_REVIEW ──► APPROVED ──► APPLIED
                   │                 │
                   │                 ├──► NEEDS_ATTENTION
                   │                 ├──► AMBIGUOUS
                   │                 └──► SOURCE_CONFLICT
                   ▼
                 FAILED

ai_product_proposals.status:
  DRAFT ──► APPROVED ──► APPLYING ──► APPLIED
    │
    └──► REJECTED

ai_provider_attempts.status:
  RUNNING ──► COMPLETED
     │
     ├──► FAILED
     ├──► RATE_LIMITED
     └──► UNKNOWN (network timeout / worker crash mid-call)
```

- **Cancellation Support**: `CANCELLATION_SUPPORTED: NO` in GP-025 v1.
- `PUBLISHED` is NOT an AI job state; publication belongs strictly to `catalog:publish`.

---

## 15. Physical Schema Truth — 9 Normalized Relational Tables

Every internal entity uses an application-generated **UUIDv7** primary key (`generateUuidV7()`). **Zero `DEFAULT gen_random_uuid()` database defaults are used.**

### Table 1: `ai_providers`

Global provider registry.

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `provider_key`: `varchar(50) NOT NULL UNIQUE` (e.g. `'openai'`, `'anthropic'`, `'google'`)
- `display_name`: `varchar(100) NOT NULL`
- `is_enabled`: `boolean NOT NULL DEFAULT true`
- `is_default`: `boolean NOT NULL DEFAULT false`
- `settings`: `jsonb NOT NULL DEFAULT '{}'::jsonb` (Strictly non-secret configuration)
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`

### Table 2: `ai_provider_credentials`

AES-256-GCM encrypted provider secrets.

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `provider_id`: `uuid NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT`
- `key_version`: `integer NOT NULL DEFAULT 1`
- `ciphertext`: `text NOT NULL` (Hex-encoded ciphertext)
- `iv`: `varchar(64) NOT NULL` (Hex-encoded 12-byte IV)
- `auth_tag`: `varchar(64) NOT NULL` (Hex-encoded 16-byte auth tag)
- `aad`: `text NOT NULL` (Hex-encoded AAD binding `id + ":" + provider_key + ":" + key_version`)
- `masked_key`: `varchar(50) NOT NULL` (e.g. `'sk-...4a9f'`)
- `status`: `varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'FAILED_HEALTH_CHECK'))`
- `last_tested_at`: `timestamptz`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `UNIQUE (provider_id, key_version)`

### Table 3: `ai_profiles`

Reusable semantic execution profiles.

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

Batch import aggregates and progress tracking.

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `mutation_request_id`: `varchar(128) NOT NULL UNIQUE` (Client idempotency key)
- `request_fingerprint`: `varchar(64) NOT NULL` (SHA-256 of normalized input payload)
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

Individual product research line items.

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `job_id`: `uuid NOT NULL REFERENCES ai_research_jobs(id) ON DELETE RESTRICT`
- `item_index`: `integer NOT NULL CHECK (item_index >= 0)`
- `input_query`: `text NOT NULL`
- `mode`: `varchar(20) NOT NULL DEFAULT 'CREATE' CHECK (mode IN ('CREATE', 'ENRICH'))`
- `target_product_id`: `uuid REFERENCES products(id) ON DELETE SET NULL`
- `target_product_version_snapshot`: `timestamptz` (Required when `mode = 'ENRICH'`)
- `identity_status`: `varchar(30) NOT NULL DEFAULT 'PENDING' CHECK (identity_status IN ('PENDING', 'EXACT_MATCH', 'PROBABLE_MATCH', 'AMBIGUOUS', 'UNSUPPORTED_CATEGORY', 'CONFLICTING_IDENTIFIERS', 'MANUALLY_DISAMBIGUATED'))`
- `status`: `varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESEARCHING', 'READY_FOR_REVIEW', 'NEEDS_ATTENTION', 'AMBIGUOUS', 'SOURCE_CONFLICT', 'FAILED', 'APPROVED', 'APPLIED'))`
- `error_code`: `varchar(50)`
- `error_message`: `text`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `UNIQUE (job_id, item_index)`

### Table 6: `ai_sources`

Normalized external web evidence records.

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `job_item_id`: `uuid NOT NULL REFERENCES ai_research_job_items(id) ON DELETE RESTRICT`
- `original_url`: `text NOT NULL`
- `resolved_url`: `text`
- `source_name`: `varchar(150) NOT NULL`
- `retrieval_method`: `varchar(50) NOT NULL CHECK (retrieval_method IN ('PROVIDER_GROUNDING', 'SEARCH_API', 'DIRECT_URL'))`
- `trust_tier`: `varchar(40) NOT NULL CHECK (trust_tier IN ('TIER_1_OFFICIAL_MANUFACTURER', 'TIER_2_OFFICIAL_MANUAL', 'TIER_3_OFFICIAL_MEDIA_KIT', 'TIER_4_AUTHORIZED_DISTRIBUTOR', 'TIER_5_REPUTABLE_SECONDARY', 'TIER_6_PUBLIC_SUPPORTING'))`
- `fetched_at`: `timestamptz NOT NULL`
- `content_sha256`: `varchar(64)`
- `provider_citation_id`: `varchar(128)`
- `fetch_status`: `varchar(20) NOT NULL CHECK (fetch_status IN ('SUCCESS', 'FAILED', 'FILTERED_UNTRUSTED'))`
- `snippet`: `text` (Bounded evidence snippet, max 2000 characters)
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`

### Table 7: `ai_product_proposals`

Staged catalog proposals awaiting review.

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
- `apply_step_progress`: `jsonb NOT NULL DEFAULT '{}'::jsonb` (Tracks multi-step apply state)
- `apply_mutation_digest`: `varchar(64)`
- `reviewed_by_auth_user_id`: `uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- `reviewed_at`: `timestamptz`
- `applied_at`: `timestamptz`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`

### Table 8: `ai_proposal_field_reviews`

Field-level provenance and human review audit trail.

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `proposal_id`: `uuid NOT NULL REFERENCES ai_product_proposals(id) ON DELETE RESTRICT`
- `field_path`: `varchar(100) NOT NULL` (e.g. `'specifications.sensor'`, `'description'`)
- `proposed_value`: `jsonb NOT NULL`
- `selected_value`: `jsonb`
- `decision`: `varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING', 'ACCEPTED', 'REJECTED', 'MANUALLY_EDITED'))`
- `verification_state`: `varchar(30) NOT NULL CHECK (verification_state IN ('VERIFIED_OFFICIAL', 'VERIFIED_SECONDARY', 'AI_INFERRED', 'SOURCE_CONFLICT', 'UNVERIFIED'))`
- `primary_source_id`: `uuid REFERENCES ai_sources(id) ON DELETE SET NULL`
- `conflict_details`: `jsonb`
- `reviewed_by_auth_user_id`: `uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- `reviewed_at`: `timestamptz`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `updated_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `UNIQUE (proposal_id, field_path)`

### Table 9: `ai_provider_attempts`

Durable invocation attempts and sub-cent telemetry.

- `id`: `uuid PRIMARY KEY` (UUIDv7 application-generated)
- `job_item_id`: `uuid NOT NULL REFERENCES ai_research_job_items(id) ON DELETE RESTRICT`
- `provider_id`: `uuid NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT`
- `model_id`: `varchar(100) NOT NULL`
- `profile_id`: `uuid NOT NULL REFERENCES ai_profiles(id) ON DELETE RESTRICT`
- `operation_type`: `varchar(50) NOT NULL CHECK (operation_type IN ('IDENTITY_RESOLUTION', 'SPEC_EXTRACTION', 'COPY_GENERATION', 'HEALTH_CHECK'))`
- `attempt_ordinal`: `integer NOT NULL CHECK (attempt_ordinal >= 1)`
- `request_digest`: `varchar(64) NOT NULL`
- `provider_request_id`: `varchar(128)`
- `started_at`: `timestamptz NOT NULL`
- `completed_at`: `timestamptz`
- `status`: `varchar(20) NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'RATE_LIMITED', 'UNKNOWN'))`
- `error_code`: `varchar(50)`
- `error_message`: `text`
- `input_tokens`: `integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0)`
- `output_tokens`: `integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0)`
- `total_tokens`: `integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0)`
- `cost_micros`: `bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0)` (1 micro = 0.000001 currency unit; integer arithmetic avoids floating-point errors)
- `currency`: `varchar(3) NOT NULL DEFAULT 'USD'`
- `pricing_version`: `varchar(50) NOT NULL`
- `is_cost_estimated`: `boolean NOT NULL DEFAULT true`
- `created_at`: `timestamptz NOT NULL DEFAULT NOW()`
- `UNIQUE (job_item_id, attempt_ordinal, operation_type)`

### Data API Isolation Contract

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
  "public"."ai_provider_attempts"
FROM "anon", "authenticated", "service_role";
```

Zero direct PostgREST / Supabase Data API access is permitted. All interactions occur strictly via server-side Node.js code utilizing Drizzle ORM under verified staff RBAC.

### Data Retention & Hard-Delete Policy

- Sensitive/auditable GP-025 records have **NO ordinary Admin hard-delete path**.
- Foreign keys strictly use `ON DELETE RESTRICT` to prevent accidental cascading destruction of historical provenance, attempts, or telemetry.
- Credential lifecycle operates via `status = 'REVOKED'` and key replacement; physical credential rows are never hard-deleted.
- Automated cleanup/retention routines remain deferred to future operational maintenance contracts.

---

## 16. Existing-Product Enrichment & Stale-Write Protection

When enriching an existing catalog product (`mode = 'ENRICH'`):

1. **Snapshot Creation**: The research job item records `target_product_id` and takes a snapshot of the product's `updated_at` timestamp: `target_product_version_snapshot`.
2. **Review Comparison**: The review UI displays a 3-way view:
   - Current database value
   - Researched AI proposal value
   - Source provenance and confidence
3. **Optimistic Concurrency at Apply Time**:
   Before applying approved fields:
   - The system re-reads the canonical product from PostgreSQL.
   - If `currentProduct.updated_at != target_product_version_snapshot`, the apply operation **FAILS CLOSED** with `STALE_WRITE_CONFLICT`.
   - The UI informs the administrator that another staff member modified the product since research began, requiring re-review before applying.
   - Newer Product Manager edits are never silently overwritten.

---

## 17. Variant Authoring & Pricing Contradiction Resolution

### Resolution

To reconcile the rule that **AI must never invent prices** with the GP-024 catalog rule that **`createVariant` requires a price**:

- **Rule**: The review UI requires **staff-entered prices** for every approved variant before canonical variant creation.
- **Behavior**:
  - The AI assistant may propose variant titles, SKU codes, weights, and attributes (e.g. Color, Finish).
  - The AI assistant **NEVER** generates `pricePen`.
  - In `/admin/products/ai-import`, each proposed variant row includes mandatory inputs for `pricePen` (and optional `compareAtPricePen`, `costPen`).
  - An approved proposal cannot transition to `APPLYING` until the authorized administrator enters a valid integer-cent PEN price for each selected variant.
  - If variants remain unpriced, the administrator may choose to apply only product-level fields (name, description, specifications) while leaving variant creation for later manual authoring.

---

## 18. Resumable Canonical Catalog Apply Model

Applying an approved proposal may require multiple distinct GP-024 mutations. To guarantee catalog integrity without claiming distributed transactions:

1. **Stable Apply Identity**: The apply operation generates an `apply_mutation_digest`.
2. **Multi-Step Execution Pipeline**:
   - **Step 1: Product Creation / Update**:
     Calls `createProduct(...)` or `updateProduct(...)` (with `specValues`). Records resulting `productId` in `apply_step_progress.productId` and marks step 1 completed.
   - **Step 2: Variant Creation**:
     Iterates through approved variants with staff-entered prices and calls `createVariant(...)` for each. Records created variant IDs in `apply_step_progress.variantIds`.
   - **Step 3: Finalization**:
     Marks `ai_product_proposals.status = 'APPLIED'` and `ai_research_job_items.status = 'APPLIED'`.
3. **Failure & Resume**:
   - If a worker crashes between Step 1 and Step 2, canonical state remains valid (the product exists as `DRAFT`).
   - Retrying the apply operation inspects `apply_step_progress`, skips Step 1, and resumes with remaining variants.

---

## 19. Audit Event Integration

Privileged GP-025 administrative actions must record an append-only `AuditEvent`:

| Action Name                | Triggering Event                     | Metadata Captured (Strictly Non-Secret)                    |
| :------------------------- | :----------------------------------- | :--------------------------------------------------------- |
| `AI_CREDENTIAL_CREATED`    | New provider key configured          | `providerId`, `keyVersion`, `maskedKey`                    |
| `AI_CREDENTIAL_UPDATED`    | Provider key replaced/rotated        | `providerId`, `newKeyVersion`, `maskedKey`                 |
| `AI_CREDENTIAL_REVOKED`    | Provider key status set to REVOKED   | `providerId`, `keyVersion`                                 |
| `AI_PROFILE_UPDATED`       | Profile model or parameters adjusted | `profileKey`, `modelId`, `temperature`, `maxTokens`        |
| `AI_RESEARCH_JOB_CREATED`  | Single or batch job dispatched       | `jobId`, `jobType`, `totalItems`                           |
| `AI_PROPOSAL_REVIEWED`     | Proposal fields approved or rejected | `proposalId`, `approvedFieldsCount`, `rejectedFieldsCount` |
| `AI_PROPOSAL_APPLIED`      | Proposal applied into catalog        | `proposalId`, `canonicalProductId`, `variantsCreatedCount` |
| `AI_HEALTH_CHECK_EXECUTED` | Manual provider connection test      | `providerId`, `status`, `latencyMs`                        |

Provider secrets, master keys, and raw prompts are **NEVER** placed in `AuditEvent.metadata`.

---

## 20. Updated Future Validation Matrix

The future implementation validation suite must explicitly test:

1. **UUIDv7 & Relational Integrity**: Every table enforces UUIDv7 application generation; zero `DEFAULT gen_random_uuid()` defaults in migration SQL.
2. **Data API Isolation**: Tests verify that `anon`, `authenticated`, and `service_role` return permission denied when querying GP-025 tables directly.
3. **Master Key Sentinel Rejection**: Unit tests prove `InsecureEncryptionKeyError` is thrown if `AI_ENCRYPTION_KEY_V1` equals the repository example sentinel.
4. **AES-256-GCM Crypto & AAD**: Tests verify successful encryption/decryption, auth tag tamper rejection, and decryption failure when ciphertext is swapped to a different record ID (AAD mismatch).
5. **Key Version Rotation**: Tests verify re-encrypting credentials from version 1 to version 2 across environment variable rotation.
6. **Provider Config Secret Rejection**: Zod validation tests assert that `ai_providers.settings` rejects objects containing `apiKey` or `token`.
7. **Job Creation Idempotency**: Submitting identical payload with the same `mutationRequestId` replays the existing job; submitting different `mutationRequestId` creates a distinct job; modifying payload with same `mutationRequestId` returns `CATALOG_IDEMPOTENCY_CONFLICT`.
8. **DB/Inngest Dual-Write Recovery**: Tests simulate Inngest dispatch failure, verify `dispatch_status = 'DISPATCH_FAILED'`, and assert safe re-dispatch.
9. **Duplicate Inngest Event Safety**: Emitting duplicate Inngest events results in a no-op without duplicate processing.
10. **Provider `UNKNOWN` Attempt Handling**: Tests verify that lost responses transition attempts to `UNKNOWN` and record a subsequent attempt with incremented ordinal.
11. **Stale Write Rejection in Enrichment**: Tests verify that updating a canonical product mid-research causes `STALE_WRITE_CONFLICT` at apply time.
12. **Field-Level Audit Persistence**: Assert that every field review decision, selected value, and source link persists in `ai_proposal_field_reviews`.
13. **Variant Mandatory Price Rejection**: Tests prove that an approved variant cannot be applied without human-supplied PEN pricing.
14. **SEO Field Non-Persistence**: Tests verify that SEO title/description remain in proposal state and do not trigger nonexistent database column queries.
15. **Media Candidate Ingestion Boundary**: Tests prove that discovered image candidates remain references and are not uploaded to Cloudflare R2 automatically.
16. **SSRF Defense Suite**: Unit tests verify rejection of IPv4 loopback (`127.0.0.1`), IPv6 loopback (`::1`), cloud metadata (`169.254.169.254`), RFC 1918 private subnets, IPv4-mapped IPv6, DNS rebinding, redirect loops, and payloads > 5 MB.
17. **Telemetry Money & Currency**: Tests verify that `cost_micros` correctly stores integer sub-cent values without float inaccuracy.
18. **AuditEvent Recording**: Assert that all 8 privileged actions record corresponding `AuditEvent` entries.

---

## 21. Checkpoint Plan (Decomposition)

- **CHK0-BR1**: Contract Remediation (Current gate — doc-only).
- **CHK1**: Database Schema & Credential Foundation:
  - Sequence-checked migration implementation (9 tables).
  - Data API privilege revocation verification.
  - AES-256-GCM helper with sentinel rejection, AAD binding, and key rotation.
  - Core `AIProvider` interface, mock adapter, and provider profile registry.
  - AuditEvent integration for credential management.
- **CHK2**: Research Orchestration & Asynchronous Inngest Workflows:
  - Selected research acquisition engine implementation (per owner decision).
  - Inngest research functions with dual-write dispatch recovery.
  - Identity resolution, Zod extraction, source normalization, and conflict engine.
  - Provider attempt tracking with `UNKNOWN` state handling and micro-cost telemetry.
- **CHK3**: Proposal Review & Canonical Catalog Integration:
  - Proposal review service and field-level approval actions.
  - Resumable multi-step catalog apply engine using existing GP-024 services.
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

## 22. OWNER_DECISIONS_REQUIRED & Checkpoint Blocker Matrix

| Open Decision                            | Summary of Issue                                              | Options                                                                                                                      | Recommended Technical Default                                                                              | Blocks CHK1?                         | Blocks CHK2?                            |
| :--------------------------------------- | :------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :----------------------------------- | :-------------------------------------- |
| **1. First Real AI Provider Adapter**    | Which real provider adapter to implement and validate first.  | **A**: Google Gemini (`gemini-2.5-flash`)<br>**B**: OpenAI (`gpt-4o-mini`)                                                   | **Option A (Gemini)** for native search grounding or **Option B (OpenAI)** for strict JSON schemas.        | **NO** (CHK1 uses mock adapter)      | **YES** (Blocks CHK2 provider adapter)  |
| **2. Research Acquisition Backend**      | How web evidence is physically acquired.                      | **A**: Provider-Native Search Tools<br>**B**: Dedicated Search API + GamerPeru Fetcher<br>**C**: Admin Direct URL Input Only | **Option A (Provider-Native Search Tools)** as primary, with **Option C (Direct URL)** as manual override. | **NO** (CHK1 defines schema)         | **YES** (Blocks CHK2 research workflow) |
| **3. Cross-Provider Fallback Policy**    | Whether jobs fail over to secondary providers on rate limits. | **A**: Fail Closed (No fallback)<br>**B**: Automatic Tiered Fallback                                                         | **Option A (Fail Closed)** as safe interim rule until explicitly changed.                                  | **NO**                               | **NO** (Interim rule: No fallback)      |
| **4. Cost & Batch Throttle Thresholds**  | Max products per batch and monthly spend limits.              | **A**: [TBD BY OWNER]<br>**B**: [TBD BY OWNER]                                                                               | Technical safeguard cap on batch size; no hard billing ceiling until configured.                           | **NO**                               | **NO** (Configurable parameters)        |
| **5. Prompt & Response Audit Retention** | Whether raw LLM prompts/responses are retained.               | **A**: Telemetry only (No raw persistence)<br>**B**: 30-day ephemeral redacted retention                                     | **Option A (No raw persistence)** by default. Opting into B requires separate schema amendment.            | **NO** (Default: Not stored in 0013) | **NO**                                  |

---

## 23. Absolute Freeze & Quality Gate Conformance

- **Documentation-Only Scope**: This gate modifies ONLY `docs/roadmap/GP-025-CONTRACT.md` and `docs/roadmap/GP-025.md`.
- **Zero Code Changes**: Zero changes to `src/**`, `tests/**`, `package.json`, or `.env.example`.
- **Zero Database Changes**: Zero SQL migrations generated or executed. Migration 0013 is not created.
- **Zero External Contact**: No real AI provider APIs contacted; no hosted Supabase access; Cloudflare R2 untouched.
- **GP-024 Integrity**: All GP-024 files, contracts, and code remain frozen and unmodified.

# GP-025 — AI Product Research & Import Contract (CHK0)

## Status

IN DISCOVERY / CONTRACT PENDING EXTERNAL APPROVAL (CHK0)

---

## 1. Canonical Starting Lineage & Baseline Verification

This document establishes the canonical contract, domain reconciliation, security boundaries, and implementation plan for **GP-025 (AI Product Research & Import)**.

GP-025 delivers the administrative AI Product Assistant, enabling authorized Gamer Perú staff to research, enrich, and prepare gaming hardware products for the catalog from product names, SKUs, or model codes, while strictly enforcing human-in-the-loop review, source provenance, category specification schemas, and credential isolation.

### Baseline Lineage Verification

- **Repository**: `latamcreativa/GamerPeru`
- **Starting Canonical Main SHA**: `c5b8c7b72b8b809c7053a5c9bae0a4b5dce5c321`
- **Audit Branch**: `audit/gp025-chk0`
- **GP-024 Status**: `CLOSED / EXTERNALLY APPROVED / FROZEN / PASS WITH NOTES / MAIN INTEGRATION COMPLETE`
- **GP-024 Contract Blob**: `0292679a73bd61611eac4f3464f975efb6c91a44` (`docs/roadmap/GP-024-CONTRACT.md`)
- **Migration 0012 Git Blob**: `e80c30ae9d0f86e14486b0fd5c782eb9ec3f7119` (`src/db/migrations/0012_canonical_inventory_permission.sql`)
- **Migration 0013 Status**: Non-existent. Reserved strictly for GP-025 CHK1 schema implementation.
- **Hosted Supabase**: 100% Untouched (No hosted mutations executed).
- **Cloudflare R2**: 100% Untouched (Bucket provisioning remains deferred per GP-024 closure).
- **Real AI Providers**: 100% Untouched (Zero external API calls; zero provider SDKs installed).
- **GP-025 Roadmap Status**: `IN DISCOVERY / CONTRACT PENDING EXTERNAL APPROVAL (CHK0)`
- **GP-026 Status**: `NOT BEGUN`

---

## 2. Canonical Scope & Explicit Boundaries

### In Scope (GP-025)

1. **Single-Product Research**: Progressive AI research from a product name, SKU, or model identifier into a structured, reviewable draft.
2. **Batch Product-Name Import**: Asynchronous processing of multi-item product lists with resilient partial-success execution.
3. **Product Identity Resolution**: Deterministic classification of exact, probable, ambiguous, or unsupported product inputs.
4. **Structured Specification Extraction**: Mapping extracted technical hardware attributes into authoritative category-specific schemas (`categories.current_spec_schema_id`).
5. **Source & Provenance Tracking**: Capturing source URLs, source trust tiers, confidence ratings, and verification states per proposed field.
6. **Conflict Flagging**: Visible detection and presentation of disagreeing source data (`SOURCE_CONFLICT`).
7. **Original Commerce Copy Generation**: Synthesizing original, fact-grounded Spanish product descriptions, highlights, FAQs, and SEO metadata.
8. **Media-Candidate Discovery**: Identifying potential media references with explicit usage-rights classification (candidates only; no automatic publishing).
9. **Human-in-the-Loop Review UI**: Administrative workspace for side-by-side inspection, conflict resolution, field-by-field selection, and approval.
10. **Provider & Profile Abstraction**: Decoupled internal gateway supporting provider profiles (`PRODUCT_RESEARCH_FAST`, `PRODUCT_RESEARCH_DEEP`, `SEO_COPY`, `BATCH_IMPORT`).
11. **Credential Security at Rest**: Versioned AES-256-GCM encryption for stored provider API keys with server-runtime master key separation.
12. **Asynchronous Background Jobs**: Multi-step durable execution using Inngest for all research and batch operations.
13. **Cost & Usage Telemetry**: Tracking token usage, latency, and estimated provider costs per job item.
14. **Canonical Catalog Integration**: Writing approved proposals into the catalog strictly via authoritative GP-024 catalog domain services.

### Explicitly Out of Scope

1. **Automatic Product Publication**: AI output is strictly created as `DRAFT`. Transition to `PUBLISHED` requires explicit authorized human action via `catalog:publish`.
2. **Automated Price Setting**: AI research must not authoritatively set sell prices, compare-at prices, or cost prices.
3. **Automated Inventory Movements**: AI research must not adjust stock balances, warehouse reservations, or ledger entries.
4. **Automated Payment/Order Operations**: AI must never interact with payments, orders, refunds, or verifications.
5. **Automated Affiliate Actions**: AI must never approve or adjust affiliate commissions.
6. **Unbounded Web Crawling**: Scraping entire websites or recursive link following is strictly forbidden.
7. **Automatic Copyrighted Media Ingestion**: Discovered third-party media must never be uploaded directly into the public CDN without explicit rights confirmation.
8. **Autonomous Supplier Purchasing**: Purchasing or stock procurement automation is strictly out of scope.
9. **Product Story Builder (GP-026)**: Visual block-based editorial story authoring remains deferred to GP-026.

---

## 3. Current-State Reconciliation & Repository Audit

An exhaustive audit of the actual repository implementation at commit `c5b8c7b72b8b809c7053a5c9bae0a4b5dce5c321` yields the following findings:

### A. Canonical RBAC Permissions & Roles

- **Actual Code & Database Truth**:
  As defined in `src/lib/auth/rbac.ts` and seeded via `src/db/migrations/0006_canonical_rbac_seed.sql` and `0012_canonical_inventory_permission.sql`, Gamer Perú possesses exactly 11 canonical permissions:
  1. `staff:manage`
  2. `ai:manage_credentials`
  3. `audit:export`
  4. `catalog:manage`
  5. `catalog:publish`
  6. `catalog:ai_research`
  7. `orders:manage`
  8. `orders:verify`
  9. `support:manage`
  10. `support:review_rma`
  11. `inventory:manage`

- **Role Mappings**:
  - `SUPER_ADMIN`: Holds all 11 explicit permissions (including `catalog:ai_research` and `ai:manage_credentials`).
  - `ADMIN_CATALOG`: Holds 3 permissions: `catalog:manage`, `catalog:publish`, `catalog:ai_research`.
  - `ADMIN_ORDERS`: Holds 2 permissions: `orders:manage`, `orders:verify`.
  - `ADMIN_SUPPORT`: Holds 2 permissions: `support:manage`, `support:review_rma`.
  - `CUSTOMER`: Holds 0 staff permissions.

- **Reconciliation with Conceptual Architecture**:
  The conceptual permission names listed in early architecture documents (`ai.use`, `ai.product_import`, `ai.view_usage`, `ai.manage_models`, `ai.manage_providers`) **DO NOT EXIST** in the physical schema, seeds, or codebase.

- **Conclusion**:
  **NO NEW PERMISSIONS WILL BE INTRODUCED.** The existing canonical permissions (`catalog:ai_research`, `catalog:manage`, `catalog:publish`, `ai:manage_credentials`) completely and safely express all GP-025 operational surfaces. Introducing redundant permissions would cause role mapping drift, migration complexity, and security divergence.

### B. Existing AI Security Foundation

- **Server-Only Master Key Declaration**:
  `src/config/server-env.ts` already defines `AI_ENCRYPTION_KEY_V1` in `serverEnvSchema`:
  ```typescript
  AI_ENCRYPTION_KEY_V1: z
    .string()
    .length(64, "Must be exactly 64 hexadecimal characters")
    .regex(/^[0-9a-fA-F]+$/, "Must be a valid 64-character hexadecimal string")
    .optional(),
  ```
- **Automated Logging Redaction**:
  `src/lib/logger/index.ts` already includes `AI_ENCRYPTION_KEY_V1`, `apiKey`, `api_key`, and `secret` in `CANONICAL_REDACT_PATHS`.
- **Sentry Sanitization**:
  `src/lib/observability/sentry-sanitize.ts` already sanitizes `ai_encryption_key_v1`, API keys, and 64-character hex strings (`\b[0-9a-fA-F]{64}\b`) before transmission.
- **Physical Cryptographic Implementation Status**:
  While the configuration and sanitization foundations are physically present, the actual AES-256-GCM encryption/decryption helper utility and database storage tables do not yet exist. They are architectural commitments from ADR-007 to be implemented in GP-025 CHK1.

### C. Existing Background-Job (Inngest) Architecture

- **Inngest Client**: Physically instantiated at `src/lib/inngest/client.ts` with application ID `"gamer-peru"`.
- **Inngest Serving Endpoint**: Physically mounted and operational at `src/app/api/inngest/route.ts` via `serve({ client, functions: [...] })`.
- **Existing Registered Functions**: `inventoryReservationExpirationJob` (serviced currently).
- **Conclusion**: The Inngest runtime harness is already fully wired into Next.js. GP-025 will add new research and batch import functions to this existing client and serving route without creating alternative background queues.

### D. Existing Catalog Authority & Domain Truth

- **GP-024 Deliverables**: The authoritative catalog management domain is implemented under `src/lib/admin/catalog/`:
  - `service.ts`: Authoritative product, variant, and lifecycle operations (`createProduct`, `updateProduct`, `transitionProductStatus`, `createProductVariant`, `updateProductVariant`).
  - `specifications.ts`: Canonical category schema validation (`validateProductSpecificationValues`, `resolveAuthoritativeCategorySpecificationSchema`).
  - `money.ts`: Authoritative integer PEN cents parsing (`parsePenInputToCents`) and formatting (`formatCentsToPen`).
  - `media-service.ts`: Presigned upload intents, WebP normalization, SHA-256 content hashing, `MediaAsset` persistence, and `ProductMedia` attachment.
  - `publish-readiness.ts`: Authoritative pre-publish validation rules.
- **Conclusion**: The AI assistant must NEVER bypass or duplicate these catalog services. AI proposals reside in dedicated staging tables until an authorized user approves them, at which point mutations execute strictly through the GP-024 catalog services.

### E. Existing Research, Search, and Fetch Infrastructure

- **Storefront Catalog Search**: `src/lib/search/` provides internal PostgreSQL catalog search (FTS + `pg_trgm`). It does NOT provide external web search.
- **HTTP/Web Fetching Infrastructure**: The repository contains **ZERO** external web search providers, **ZERO** HTTP document fetchers, **ZERO** web scraping libraries, and **ZERO** crawling utilities.
- **Dependencies**: `package.json` contains no AI provider SDKs (no OpenAI, no Anthropic, no Google GenAI) and no scraping tools.

---

## 4. Authorization Matrix & Boundary Contract

Authorization for all AI-assisted features is strictly enforced server-side. AI models and background workers never receive ambient authority.

| Surface / Action                                 | Required Permission          | Allowed Canonical Roles        | Authoritative Boundary & Enforcement                         |
| :----------------------------------------------- | :--------------------------- | :----------------------------- | :----------------------------------------------------------- |
| Initiate single-product AI research              | `catalog:ai_research`        | `SUPER_ADMIN`, `ADMIN_CATALOG` | Server Action / Route Handler guard (`requirePermission`)    |
| Initiate batch product import job                | `catalog:ai_research`        | `SUPER_ADMIN`, `ADMIN_CATALOG` | Server Action / Route Handler guard (`requirePermission`)    |
| View AI jobs, items, proposals, provenance       | `catalog:ai_research`        | `SUPER_ADMIN`, `ADMIN_CATALOG` | Server Action / Route Handler guard (`requirePermission`)    |
| Edit proposal fields / resolve conflicts in UI   | `catalog:ai_research`        | `SUPER_ADMIN`, `ADMIN_CATALOG` | Server Action guard (`requirePermission`)                    |
| Apply approved proposal to create/update Product | `catalog:manage`             | `SUPER_ADMIN`, `ADMIN_CATALOG` | Catalog Service boundary (`resolveActorAndAssertPermission`) |
| Publish AI-created or AI-enriched Product        | `catalog:publish`            | `SUPER_ADMIN`, `ADMIN_CATALOG` | Catalog Service boundary (`transitionProductStatus`)         |
| Configure/rotate AI provider credentials         | `ai:manage_credentials`      | `SUPER_ADMIN` strictly         | Server Action guard (`requirePermission`)                    |
| Manage AI profiles, models, and parameters       | `ai:manage_credentials`      | `SUPER_ADMIN` strictly         | Server Action guard (`requirePermission`)                    |
| Inngest background job execution                 | Internal Inngest Signing Key | Inngest Executor               | Signature verification (`INNGEST_SIGNING_KEY`)               |

### Key Authorization Invariants

1. **Staff Roles Required**: Access to any AI admin route requires passing `requireAdminAccess()`, verifying that the actor holds an active staff role.
2. **Dual-Permission Separation for Creation**: An administrative user with only `catalog:ai_research` (if such a custom assignment ever existed) could generate and review proposals, but CANNOT write them into the catalog. Writing to the catalog strictly requires `catalog:manage`.
3. **Publication Authority Preserved**: `catalog:publish` remains the sole authority for transitioning any product to `PUBLISHED`. Neither `catalog:ai_research` nor `catalog:manage` can bypass publish readiness rules.
4. **Credential Isolation**: Only `SUPER_ADMIN` (holding `ai:manage_credentials`) can view provider statuses, rotate keys, or configure model profiles.
5. **No Model Self-Authorization**: A provider response containing an instruction such as `"publish this product"` or `"set price to S/ 0.00"` is treated as untrusted text, never as an administrative command.

---

## 5. Human-in-the-Loop Write Boundary

AI research output must **NEVER** write unreviewed facts directly into canonical `products`, `product_variants`, `product_specifications`, or `product_media` tables.

```text
+---------------------------------------------------------------------------------------------------+
|                                  AI RESEARCH PROPOSAL PIPELINE                                    |
+---------------------------------------------------------------------------------------------------+
|  1. Staff Input (Name / SKU / Model) [catalog:ai_research]                                        |
|         │                                                                                         |
|         ▼                                                                                         |
|  2. Identity Resolution & Classification (Exact / Probable / Ambiguous / Unsupported)            |
|         │                                                                                         |
|         ▼                                                                                         |
|  3. Source Discovery & Fetching (External untrusted data)                                         |
|         │                                                                                         |
|         ▼                                                                                         |
|  4. Structured Extraction & Normalization via Zod Schemas                                         |
|         │                                                                                         |
|         ▼                                                                                         |
|  5. Provenance, Confidence & Conflict Evaluation                                                  |
|         │                                                                                         |
|         ▼                                                                                         |
|  6. Persist Staged Proposal (`ai_product_proposals`, `ai_field_provenance`)                       |
|         │                                                                                         |
|         ▼                                                                                         |
|  7. Human Review UI: Side-by-side inspection, conflict resolution, field-by-field selection        |
|         │                                                                                         |
|         ▼                                                                                         |
|  8. Staff Approval & Field Selection [catalog:manage]                                             |
|         │                                                                                         |
|         ▼                                                                                         |
|  9. Authoritative Catalog Mutation (GP-024 Service) -> Created in DRAFT status                   |
|         │                                                                                         |
|         ▼                                                                                         |
| 10. Optional Subsequent Publication [catalog:publish] -> PUBLISHED status                        |
+---------------------------------------------------------------------------------------------------+
```

### Prohibited AI Automations

The following operations are strictly prohibited from automated AI execution:

1. **Automatic Publication**: Newly imported products enter the database as `DRAFT`.
2. **Automatic Price Mutations**: Sell prices (`priceCents`) and compare-at prices must be reviewed and confirmed by human staff.
3. **Inventory Allocations**: Stock quantities and ledger entries cannot be manipulated by AI.
4. **Payment Confirmations**: AI has zero authority over manual payments or verifications.
5. **Affiliate Commission Actions**: AI cannot qualify, approve, or adjust commissions.
6. **Silent Conflict Resolution**: If authoritative sources disagree, the system must not pick a winner silently; it must flag `SOURCE_CONFLICT` for human adjudication.

---

## 6. Product Identity Contract

To prevent catalog corruption, duplicate records, and category mismatches, the system must deterministically resolve product identity before extracting detailed specifications.

### Identity Classification States

| Classification State       | Criteria                                                                                      | Allowed Action                                                            | UI Requirement                                                                          |
| :------------------------- | :-------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------- |
| `EXACT_MATCH`              | Manufacturer model code and brand match an unambiguous unique hardware item.                  | Proceed to full specification extraction and drafting.                    | Green badge; model code highlighted.                                                    |
| `PROBABLE_MATCH`           | Marketing name matches a known hardware item, but minor revision/year suffix is omitted.      | Extract specs; flag omitted revision identifiers for review.              | Amber badge; request staff confirmation of specific revision.                           |
| `AMBIGUOUS_IDENTITY`       | Name maps to multiple distinct models (e.g. Wired vs Wireless, 4K vs 8K, Pro vs Mini).        | Halt automated specification population; generate candidate list.         | Blue badge; require staff to pick the exact intended product variant before continuing. |
| `UNSUPPORTED_CATEGORY`     | Researched item belongs to a category not active in Gamer Perú (e.g. Gaming Chairs, Laptops). | Terminate research item with terminal notice; do not stage proposal.      | Red badge; display category mismatch notice.                                            |
| `CONFLICTING_IDENTIFIERS`  | Input contains a brand and model that contradict each other (e.g. "Razer Beast X").           | Halt research; request query correction.                                  | Red badge; highlight contradictory terms.                                               |
| `MULTIPLE_VARIANTS_FAMILY` | Input represents a family with multiple standard colorways or sensor iterations.              | Group under a single parent product proposal with candidate variant rows. | Purple badge; display proposed variant breakdown matrix.                                |

---

## 7. Source Trust Hierarchy & Provenance Contract

Every enriched attribute presented to the administrator must record its provenance. A fact is never verified simply because an LLM produced it.

### Canonical 6-Tier Trust Hierarchy

1. **Tier 1: Official Manufacturer Product Page** (`OFFICIAL_MANUFACTURER`): Direct official brand product page (e.g., `wlmouse.com`, `razer.com`, `lamzu.com`).
2. **Tier 2: Official Technical Manual / Spec Sheet** (`OFFICIAL_DOCUMENTATION`): Manufacturer PDF manual, regulatory filings (FCC, safety certifications), whitepapers.
3. **Tier 3: Official Media / Press / Distributor Kit** (`OFFICIAL_MEDIA_KIT`): Official digital asset packages, distributor onboarding specifications.
4. **Tier 4: Authorized Wholesale Distributor** (`AUTHORIZED_DISTRIBUTOR`): Verified regional distribution portals with signed product feeds.
5. **Tier 5: Reputable Secondary Technical Labs** (`REPUTABLE_SECONDARY`): Independent testing labs with transparent measurement methodology (e.g., RTINGS, TechPowerUp teardowns).
6. **Tier 6: Other Public Supporting Sources** (`PUBLIC_SUPPORTING`): General retail listings, community wikis. Permitted strictly as supporting discovery evidence; never sufficient alone for official verification.

### Field-Level Provenance Data Structure

```typescript
export interface FieldProvenance {
  fieldPath: string; // e.g., "specifications.sensor", "weightGrams", "description"
  proposedValue: unknown;
  sourceUrl: string | null;
  sourceName: string;
  sourceTrustTier: "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4" | "TIER_5" | "TIER_6";
  confidenceScore: number; // 0.00 to 1.00
  verificationState: VerificationState;
  researchedAt: Date;
  conflictDetails: {
    conflictingSources: Array<{
      sourceName: string;
      sourceUrl: string | null;
      value: unknown;
    }>;
  } | null;
}
```

### Canonical Verification States

- `VERIFIED_OFFICIAL`: Fact substantiated by Tier 1, Tier 2, or Tier 3 sources without contradiction.
- `VERIFIED_SECONDARY`: Fact substantiated by Tier 4 or Tier 5 sources with high confidence and no primary contradiction.
- `AI_INFERRED`: Value logically deduced by the model from context (e.g. computing weight in grams from ounces, deriving slug from name) without explicit primary citation.
- `SOURCE_CONFLICT`: Multiple credible sources report conflicting values (e.g. Tier 1 reports 39g, Tier 5 measurement reports 42g).
- `UNVERIFIED`: Data derived solely from Tier 6 sources or low-confidence extractions.

### Conflict Presentation Invariant

When `SOURCE_CONFLICT` occurs, the system must **NEVER** silently choose one value over another. Both values, their respective sources, and timestamps must be displayed side-by-side in the review UI, requiring explicit staff selection.

---

## 8. Research Acquisition Architecture & Security

### Architecture Separation

The research pipeline strictly separates:

1. **Source Discovery & Fetching** (Gathering evidence from the web)
2. **AI Inference & Generation** (Extracting structured data and generating original copy)

```text
[Research Query]
      │
      ▼
┌────────────────────────────────────────────────────────┐
│ 1. SOURCE DISCOVERY & ACQUISITION                      │
│    (Resolves web evidence, extracts text/metadata)     │
└────────────────────────────────────────────────────────┘
      │
      ▼ (Untrusted External Evidence Blocks)
┌────────────────────────────────────────────────────────┐
│ 2. AI INFERENCE & SYNTHESIS GATEWAY                    │
│    (Structured Zod schema extraction & copy synthesis) │
└────────────────────────────────────────────────────────┘
      │
      ▼
[Validated Staged Proposal]
```

### External Content Security & SSRF Defense

All external web content is treated as **UNTRUSTED DATA**. To prevent Server-Side Request Forgery (SSRF), prompt injection, and denial of service during any server-side fetching, the fetch harness must enforce:

1. **Protocol Restriction**: Strictly `http://` and `https://`. All other protocols (`file:`, `gopher:`, `ftp:`, `data:`, `blob:`) are immediately rejected.
2. **DNS Pre-Resolution & IP Pinning**: Hostnames are resolved to IP addresses before initiating a connection.
3. **Private & Reserved IP Blocking**: Connections to the following ranges are blocked:
   - Loopback: `127.0.0.0/8`, `::1`
   - Private RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Link-local & Cloud Metadata: `169.254.0.0/16`, `fe80::/10` (specifically blocking `169.254.169.254`)
   - Carrier-grade NAT: `100.64.0.0/10`
   - Multicast & Broadcast: `224.0.0.0/4`, `255.255.255.255/32`
4. **Strict Redirect Revalidation**: Maximum 3 redirects followed. Every redirect target URL must undergo full DNS resolution and IP validation before the redirect request is issued.
5. **Payload Byte Cap**: Strict response size limit of **5 MB** (`5,242,880` bytes). Connections exceeding this cap are aborted immediately.
6. **Timeouts**: 5-second socket connect timeout; 10-second total response read timeout.
7. **Content-Type Allowlist**: Only `text/html`, `application/json`, and `text/plain` are accepted. Binary executables, archives, and streaming media are rejected.
8. **Prompt Injection Defense**:
   - Fetched content is stripped of HTML/script executable structures and passed to the LLM as passive, delimited data blocks (e.g. `<external_product_evidence>`).
   - System prompts enforce strict instruction-following boundaries, instructing the model that text within evidence tags must never be interpreted as instructions or commands.

---

## 9. Copyright & Media Rights Contract

### Media Candidate Classification

Discovered image URLs are classified into four legal-use categories:

1. `AUTHORIZED_USABLE`: Official assets provided directly by manufacturers, authorized distributors, or official press kits with explicit retailer usage permissions.
2. `LICENSE_KNOWN_WITH_REQUIREMENTS`: Assets with known permissive licenses (e.g. Creative Commons with attribution) requiring specific attribution text.
3. `RIGHTS_UNKNOWN`: Images discovered via search engines, social media, or unverified retailers.
4. `REJECTED`: Assets with visible competitor watermarks, copyright notices, low resolution, or third-party store branding.

### Storage & Ingestion Invariant

- Assets classified as `RIGHTS_UNKNOWN` remain **REFERENCE CANDIDATES ONLY**.
- Under no circumstances may an automated process download an external image and upload it to the canonical `gamerperu-public-media` bucket.
- To promote a media candidate to a canonical product image:
  1. An authorized staff member must explicitly confirm authorization and select the asset in the Admin UI.
  2. The asset is then ingested via the GP-024 media pipeline (`presigned staging PUT -> server HEAD/GET -> real-byte validation -> deterministic WebP conversion -> SHA-256 canonical naming -> MediaAsset record`).

### Originality of Generated Copy

- All generated commerce copy (short descriptions, editorial descriptions, feature highlights, FAQs, SEO metadata) must be original Gamer Perú copy synthesized from verified factual attributes.
- Verbatim reproduction of third-party or competitor marketing paragraphs is strictly prohibited. Factual hardware identifiers, trademarked model names, and numerical specifications are exempt from rewrite requirements.

---

## 10. Structured Output & Specification Mapping

AI responses must pass schema validation before entering the proposal storage tables. A raw JSON response that fails schema validation fails closed.

### Processing Pipeline

```text
Provider Raw JSON Response
       ↓
Zod Schema Validation (Structural typing & boundary checks)
       ↓
Value Normalization (Unit conversions, trimming, casing)
       ↓
Category Specification Schema Mapping (Matching categories.current_spec_schema_id)
       ↓
Provenance & Conflict Assembly
       ↓
Persist to ai_product_proposals & ai_field_provenance
```

### Category Specification Schema Conformance

Gamer Perú uses dynamic, versioned category specification schemas (`category_specification_schemas`, tracked via `categories.current_spec_schema_id`).

1. **Schema Mapping**: Extracted specifications must be matched against the active schema fields of the target category.
2. **Rational Step & Range Validation**: Numeric specifications (e.g. polling rate, weight, DPI, battery life) must respect the min, max, and step boundaries defined in the schema.
3. **Enum Normalization**: Attributes with predefined option lists (e.g. switch types, sensor models, connectivity modes) must be mapped to valid enum keys.
4. **Unmapped Specifications**: Any extracted technical attributes that do not map to the category's canonical specification schema are retained in a separate `unmappedSpecifications` JSONB field within the proposal for human review. They are **NEVER** injected as arbitrary keys into the canonical `product_specifications` table.

---

## 11. Provider, Model & Profile Abstraction

To avoid vendor lock-in, business modules interact exclusively with an internal provider abstraction.

### Internal `AIProvider` Interface

```typescript
export interface AIProvider {
  readonly providerId: string;
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

### Reusable AI Profiles

Workflows reference semantic profiles rather than hardcoding vendor model identifiers:

1. `PRODUCT_RESEARCH_FAST`: Low-latency, cost-effective profile for initial name triage, category classification, and search query expansion.
2. `PRODUCT_RESEARCH_DEEP`: High-capability reasoning profile for complex technical specification extraction, multi-source reconciliation, and conflict evaluation.
3. `SEO_COPY`: Specialized profile for generating localized Peruvian Spanish descriptions, feature bullet points, and search-optimized meta tags.
4. `BATCH_IMPORT`: Cost-optimized batch profile configured with lower concurrency and higher retry tolerances for large queues.

### Profile Storage & Fallback Policy

- Profiles are stored in database table `ai_profiles`.
- Each profile defines: `profile_name`, `provider_id`, `model_id`, `temperature`, `max_tokens`, `is_enabled`.
- **Fallback Policy**: By default, **AUTOMATIC FALLBACK IS PROHIBITED**. If a configured provider fails or hits a rate limit, the job item transitions to `FAILED` or `NEEDS_ATTENTION` with a clear operational reason rather than silently routing proprietary data to an alternate vendor without authorization. (See Section 19, Open Decisions).

---

## 12. Credential Security & AES-256-GCM Architecture

Reconciling with **ADR-007**, all provider API credentials configured via the Admin interface must be encrypted at rest.

### Encrypted Record Architecture

Stored in database table `ai_provider_credentials`:

| Column           | Type          | Constraints               | Description                                                      |
| :--------------- | :------------ | :------------------------ | :--------------------------------------------------------------- |
| `id`             | `uuid`        | PK, `generateUuidV7()`    | Unique credential record identifier                              |
| `provider_id`    | `varchar(50)` | `NOT NULL, UNIQUE`        | Provider identifier (e.g. `"openai"`, `"anthropic"`, `"google"`) |
| `ciphertext`     | `text`        | `NOT NULL`                | Encrypted API key payload (hex or base64)                        |
| `iv`             | `varchar(64)` | `NOT NULL`                | Unique 12-byte initialization vector per credential              |
| `auth_tag`       | `varchar(64)` | `NOT NULL`                | 16-byte GCM authentication tag for tamper proofing               |
| `key_version`    | `integer`     | `NOT NULL, DEFAULT 1`     | Version identifier of the master encryption key used             |
| `masked_key`     | `varchar(50)` | `NOT NULL`                | Safe display representation (e.g. `"sk-...4a9f"`)                |
| `status`         | `varchar(20)` | `NOT NULL`                | `"ACTIVE"`, `"REVOKED"`, `"FAILED_HEALTH_CHECK"`                 |
| `last_tested_at` | `timestamptz` | `NULL`                    | Timestamp of last successful connection test                     |
| `created_at`     | `timestamptz` | `NOT NULL, DEFAULT NOW()` | System creation timestamp                                        |
| `updated_at`     | `timestamptz` | `NOT NULL`                | System update timestamp                                          |

### Master Key Separation & Rotation Semantics

- **Server-Only Master Key**: Decryption requires `AI_ENCRYPTION_KEY_V1` (256-bit / 64-hex string) injected strictly via server environment variables.
- **Database Isolation**: The master key is **NEVER** stored in Supabase tables, migrations, or backups.
- **Client Shielding**: Decrypted plaintext keys are restricted to server-side in-memory execution. The browser never receives plaintext secrets; the Admin UI receives only `masked_key`, `status`, and `last_tested_at`.
- **Key Rotation**: When rotating, a new environment variable `AI_ENCRYPTION_KEY_V2` is configured. A re-encryption task decrypts records where `key_version = 1` using `AI_ENCRYPTION_KEY_V1` and writes new ciphertext with `key_version = 2` using `AI_ENCRYPTION_KEY_V2`.

---

## 13. Asynchronous Job & Batch Import Architecture (Inngest)

Bulk product research operations must execute asynchronously via Inngest durable workflows. Holding browser HTTP connections open for long-running AI operations is strictly prohibited.

### Job & Item Aggregate Entities

- **`ai_research_jobs`**: Represents the overall import batch. Tracks `total_items`, `completed_items`, `failed_items`, `status`, and aggregate progress.
- **`ai_research_job_items`**: Represents an individual product line within the batch. Tracks the raw query, identity resolution, execution status, and links to the staged proposal.

### State Machines

#### Batch Job Lifecycle

```text
QUEUED ──► PROCESSING ──► COMPLETED
                 │
                 └──► PARTIALLY_FAILED (when completed_items > 0 and failed_items > 0)
                 │
                 └──► FAILED (when all items fail or fatal job crash)
```

#### Job Item Lifecycle

```text
PENDING ──► RESEARCHING ──► READY_FOR_REVIEW ──► APPROVED ──► CANONICAL_APPLIED
                  │                 │
                  │                 ├──► NEEDS_ATTENTION
                  │                 ├──► AMBIGUOUS
                  │                 └──► SOURCE_CONFLICT
                  ▼
                FAILED
```

### Partial-Batch Resilience Invariant

**One failed product item must never fail the entire batch.** If item 3 out of 10 fails due to an ambiguous name, rate limit, or unsupported category, item 3 marks its own status as `FAILED` or `AMBIGUOUS` while items 4 through 10 continue execution normally.

---

## 14. Idempotency, Concurrency & Replay Model

### Idempotency Boundaries

1. **Job Creation Idempotency**: Submitting an import job generates an `idempotency_key` based on `SHA256(authUserId + normalizedInputPayload)`. Resubmissions within a 5-minute window return the existing job record rather than dispatching duplicate Inngest events.
2. **Inngest Step Retries**: Inngest workflow steps are idempotent. Provider calls record a durable `attempt_id`. If a worker crashes mid-step, re-execution checks if a provider response was already persisted before re-calling external APIs.
3. **Canonical Write Idempotency**: Approving and writing an AI proposal into the catalog uses the GP-024 catalog mutation service, protected by PostgreSQL transaction boundaries, advisory locks, and optimistic concurrency (`updated_at` checks).
4. **No At-Least-Once Corruption**: While external web fetching and LLM calls may execute at-least-once on transient retries, database mutations into canonical `products` and `product_variants` are strictly exactly-once.

---

## 15. Data Model & Migration Plan

### Schema Decision

**`SCHEMA_CHANGE_REQUIRED: YES`**

Implementing GP-025 requires persisting encrypted credentials, provider profiles, research jobs, items, proposals, field provenance, and usage telemetry. The current repository contains zero AI tables.

### Migration Reservation

The migration sequence currently terminates at `0012_canonical_inventory_permission.sql`.
Migration **`0013`** is reserved for GP-025 and will be implemented in **CHK1**.
**CHK0 DOES NOT CREATE MIGRATION 0013.**

### Proposed Schema Structure (8 Tables)

```sql
-- 1. Encrypted Provider Credentials
CREATE TABLE ai_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id varchar(50) NOT NULL UNIQUE,
  ciphertext text NOT NULL,
  iv varchar(64) NOT NULL,
  auth_tag varchar(64) NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  masked_key varchar(50) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- 2. Global Provider Configuration
CREATE TABLE ai_provider_configs (
  provider_id varchar(50) PRIMARY KEY,
  display_name varchar(100) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- 3. AI Semantic Profiles
CREATE TABLE ai_profiles (
  profile_name varchar(50) PRIMARY KEY, -- 'PRODUCT_RESEARCH_FAST', 'PRODUCT_RESEARCH_DEEP', etc.
  provider_id varchar(50) NOT NULL REFERENCES ai_provider_configs(provider_id),
  model_id varchar(100) NOT NULL,
  temperature numeric(3, 2) NOT NULL DEFAULT 0.20,
  max_tokens integer NOT NULL DEFAULT 4096,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- 4. Research Batch Jobs
CREATE TABLE ai_research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type varchar(20) NOT NULL, -- 'SINGLE', 'BATCH'
  status varchar(20) NOT NULL DEFAULT 'QUEUED', -- 'QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED'
  total_items integer NOT NULL DEFAULT 1,
  completed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  created_by_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- 5. Research Job Items
CREATE TABLE ai_research_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES ai_research_jobs(id) ON DELETE CASCADE,
  input_query text NOT NULL,
  identity_status varchar(30) NOT NULL DEFAULT 'PENDING', -- 'EXACT_MATCH', 'AMBIGUOUS', etc.
  status varchar(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'RESEARCHING', 'READY_FOR_REVIEW', 'APPROVED', etc.
  error_message text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- 6. Staged Product Proposals
CREATE TABLE ai_product_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id uuid NOT NULL UNIQUE REFERENCES ai_research_job_items(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES brands(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES categories(id) ON DELETE RESTRICT,
  proposed_name varchar(200) NOT NULL,
  proposed_slug varchar(200) NOT NULL,
  proposed_subtitle varchar(255),
  proposed_description text,
  proposed_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  unmapped_specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'APPROVED', 'REJECTED', 'APPLIED'
  canonical_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  approved_by_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- 7. Field-Level Provenance & Conflict Ledger
CREATE TABLE ai_field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES ai_product_proposals(id) ON DELETE CASCADE,
  field_path varchar(100) NOT NULL, -- e.g. 'specifications.sensor'
  proposed_value jsonb NOT NULL,
  source_url text,
  source_name varchar(150) NOT NULL,
  source_trust_tier varchar(30) NOT NULL, -- 'TIER_1', 'TIER_2', etc.
  confidence_score numeric(3, 2) NOT NULL,
  verification_state varchar(30) NOT NULL, -- 'VERIFIED_OFFICIAL', 'SOURCE_CONFLICT', etc.
  conflict_details jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- 8. AI Usage & Telemetry Ledger
CREATE TABLE ai_usage_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES ai_research_jobs(id) ON DELETE SET NULL,
  job_item_id uuid REFERENCES ai_research_job_items(id) ON DELETE SET NULL,
  provider_id varchar(50) NOT NULL,
  model_id varchar(100) NOT NULL,
  profile_name varchar(50) NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_cents integer, -- in USD cents or PEN cents depending on config
  latency_ms integer NOT NULL,
  status varchar(20) NOT NULL, -- 'SUCCESS', 'RATE_LIMITED', 'ERROR'
  error_code varchar(50),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
```

---

## 16. Cost & Usage Telemetry Contract

### Recorded Attributes

Every external model invocation records an immutable telemetry entry:

- `providerId`, `modelId`, `profileName`
- `inputTokens`, `outputTokens`, `totalTokens`
- `latencyMs`
- `status` (`SUCCESS`, `ERROR`, `RATE_LIMITED`)
- `estimatedCostCents` (calculated dynamically via versioned pricing configuration, never hardcoded statically into legacy queries)

### Budget & Rate Limits

- **Throttle Limits**: Batches default to a maximum of **25 items** per single batch submission to prevent runaway costs.
- **Cost Controls**: Daily and monthly usage ceilings are managed as configuration settings. If the monthly soft limit is reached, a warning banner displays in the Admin UI; if the hard limit is reached, new research invocations fail closed with `AI_BUDGET_EXCEEDED`.

---

## 17. Logging, Privacy & Redaction Contract

### Strict Prohibitions

The following must **NEVER** be logged, sent to Sentry, or exposed in client bundles:

1. `AI_ENCRYPTION_KEY_V1` or any future key versions.
2. Raw decrypted provider API keys.
3. Plaintext database connection strings.
4. Customer personal identifiable information (PII).

### Data Minimization in Prompts

- Product research queries operate strictly on public hardware catalog identifiers (brand, model, category).
- Customer data, customer orders, shipping addresses, and staff identities are **NEVER** sent to external AI providers.
- Raw prompt and response payloads are redacted of potential secrets before any optional diagnostic logging.

---

## 18. Admin UX & Surfaces Contract

### 1. `/admin/products/ai-import` (Primary Workspace)

- **Input Surface**: Single product query input or bulk multi-line paste / CSV upload.
- **Profile Selector**: Dropdown to select semantic profile (e.g. `PRODUCT_RESEARCH_FAST`, `PRODUCT_RESEARCH_DEEP`).
- **Progress View**: Live progress bar showing item states (`RESEARCHING`, `COMPLETED`, `FAILED`).
- **Review & Inspection Matrix**:
  - Side-by-side comparison between existing catalog values (if enriching) and proposed values.
  - Color-coded badges for verification states (`VERIFIED_OFFICIAL`, `AI_INFERRED`, `SOURCE_CONFLICT`).
  - Interactive conflict resolver showing differing source citations and radio-button selection.
  - Field-level approval checkboxes (allow selective acceptance of title, description, individual specs).
  - Media candidate gallery with usage-rights status and confirmation dialog.
- **Action Controls**: "Aprobar y Crear Borrador" (requires `catalog:manage`), "Rechazar", "Reintentar Fallidos".
- **Accessibility**: Full keyboard navigation (focus traps in modals, keyboard selection of table rows, aria labels for status icons).

### 2. `/admin/settings/ai` (AI Provider & Key Management)

- **Access Guard**: Restricted strictly to `SUPER_ADMIN` via `ai:manage_credentials`.
- **Surfaces**:
  - Provider list with active toggle and connection health test button.
  - Credential entry modal (accepts API key, encrypts via server action, returns only masked key `sk-...4a9f`).
  - Model profile configuration table (mapping profiles to provider/model with temperature controls).
  - Usage summary widget displaying total tokens and estimated monthly cost.

---

## 19. Canonical Catalog Write Contract

When an authorized administrator clicks "Aprobar y Crear Borrador", the application executes the write strictly through the frozen **GP-024 catalog services**:

1. **Service Re-use**:
   - Products are created via `createProduct()` in `src/lib/admin/catalog/service.ts`.
   - Variants are created via `createProductVariant()`.
   - Specifications are linked and validated via `updateProductSpecifications()` using the category's authoritative `CategorySpecificationSchema`.
   - Approved media are staged and attached via `attachProductMedia()`.
2. **Invariants Preserved**:
   - Initial status is strictly `DRAFT`.
   - Prices must be valid integer PEN cents parsed via `parsePenInputToCents()`.
   - SKUs must be unique and trimmed non-empty strings.
   - Category specifications must pass `validateProductSpecificationValues()`.
   - Slug uniqueness is verified against the database.
3. **No Backdoor Inserts**: The AI module must never perform direct raw SQL inserts into `products` or `product_variants`. All writes pass through the authoritative domain service layer under active `catalog:manage` permission enforcement.

---

## 20. Future Validation Matrix (GP-025 Test Strategy)

The validation suite for GP-025 will encompass:

1. **Unit Tests**:
   - AES-256-GCM encryption/decryption round-trip and tamper detection (auth tag failure).
   - Zod schema validation of structured model outputs.
   - Category specification schema mapping and rational step enforcement.
   - Field provenance scoring and conflict detection logic.
   - Identity classification rules (exact vs ambiguous vs unsupported).
   - Server environment variable validation and secret redaction.
2. **Integration Tests (Local PostgreSQL)**:
   - Credential storage and masked retrieval.
   - Research job and item state machine transitions.
   - Staged proposal persistence and field-level update mutations.
   - Partial-batch failure resilience (ensuring batch completes despite item error).
   - Catalog service integration (asserting approved proposal produces valid `DRAFT` product in database).
3. **Asynchronous / Inngest Tests**:
   - Inngest function execution simulation using local deterministic test runners.
   - Step retry and idempotency verification.
4. **Security Tests**:
   - SSRF defense suite: rejecting localhost, 127.0.0.1, 169.254.169.254, RFC 1918 IPs, and malicious redirects.
   - Client bundle leak audit (verifying zero decrypted keys or encryption secrets reach client code).
   - Logging and Sentry leak audit (ensuring keys and master secrets are redacted).
5. **Admin E2E Tests (Playwright)**:
   - Single-product research and review flow in `/admin/products/ai-import`.
   - Batch import progress and partial failure display.
   - Side-by-side conflict resolution UI interaction.
   - Credential configuration and testing in `/admin/settings/ai`.
   - Keyboard, focus, and WCAG AA accessibility compliance.
6. **Provider Runtime Boundary**:
   - Automated tests run against deterministic mock provider adapters.
   - Real provider runtime tests execute only when explicitly authorized with valid external credentials.

---

## 21. Checkpoint Plan (Decomposition)

To maintain reviewability and mitigate risk across architectural boundaries, GP-025 is decomposed into the following checkpoints:

- **CHK0**: Contract & Discovery (Current gate — documentation and boundaries only).
- **CHK1**: Database Schema & Credential Foundation:
  - Migration 0013 implementation (8 AI tables).
  - AES-256-GCM encryption helper and credential management service.
  - Core `AIProvider` interface, mock adapter, and provider profile registry.
  - Server actions for `/admin/settings/ai`.
- **CHK2**: Research Orchestration & Asynchronous Inngest Workflows:
  - SSRF-hardened fetch/evidence acquisition engine.
  - Inngest research functions and multi-step batch workers.
  - Identity resolution and structured Zod schema extraction.
  - Provenance assembly and conflict detection algorithms.
- **CHK3**: Proposal Review & Canonical Catalog Integration:
  - Proposal review service and field-level approval actions.
  - Integration with GP-024 catalog services (`createProduct`, `updateProductSpecifications`).
  - Optimistic concurrency, advisory locking, and mutation idempotency.
- **CHK4**: Admin UI Implementation:
  - `/admin/products/ai-import` import workspace and batch progress monitor.
  - Side-by-side proposal editor, source viewer, and conflict resolution modal.
  - `/admin/settings/ai` provider credentials and profiles UI.
- **CHK5**: Full Integrated Regression & Final Closure:
  - End-to-end integration tests on local PostgreSQL.
  - Full Playwright E2E test execution.
  - Compilation of `GP-025-CLOSURE.md` and readiness review.

---

## 22. OWNER_DECISIONS_REQUIRED

The following material business and architectural decisions are unresolved in the canonical documentation and require explicit owner / external auditor resolution:

### Decision 1: First Real AI Provider Adapter Selection

- **Context**: ADR-007 lists OpenAI, Anthropic, and Google Gemini as potential adapters, but no canonical decision designates which provider must be implemented and tested first.
- **Option A**: **Google Gemini** (e.g. `gemini-2.5-flash` / `gemini-2.5-pro`).
  - _Pros_: Cost-effective, high context window, built-in Google Search grounding capability.
  - _Cons_: Different structured output syntax compared to OpenAI JSON schema standards.
- **Option B**: **OpenAI** (e.g. `gpt-4o-mini` / `gpt-4o`).
  - _Pros_: Industry-standard structured JSON output (`json_schema` strict mode), widespread tooling.
  - _Cons_: Higher API costs, separate search tool integration required.
- **Recommended Technical Default**: **Option A (Google Gemini)** for cost efficiency and native search grounding, or **Option B (OpenAI)** if standardized strict JSON schema compliance is prioritized.
- **Implementation Impact**: Does NOT block CHK0 or CHK1 (mock adapters will be built first). **Blocks CHK2 provider adapter implementation.**

### Decision 2: Web Research & Search Acquisition Backend

- **Context**: The repository contains no web search provider or scraping utility. Physical web evidence must be acquired to ground technical research.
- **Option A**: **Provider-Native Grounding / Search Tools** (e.g., Google Search grounding via Gemini API, or OpenAI Web Search tool).
  - _Pros_: Zero external search infrastructure or scraping maintenance; search and retrieval are handled securely within the provider's API.
  - _Cons_: Tied to the provider's built-in search tool capabilities; limited ability to inspect intermediate raw HTML.
- **Option B**: **Dedicated External Search API** (e.g. Tavily, Brave Search API, or Perplexity API) + Serverless Document Fetcher.
  - _Pros_: Independent of LLM vendor; returns explicit search citations and structured snippets.
  - _Cons_: Introduces an additional paid third-party SaaS dependency and API key.
- **Option C**: **Curated Domain Fetcher**: Admin provides direct product URL(s); system fetches only authorized manufacturer domains.
  - _Pros_: Zero search engine cost, maximum accuracy, lowest legal risk.
  - _Cons_: Requires the administrator to locate and paste the manufacturer URL rather than typing only a product name.
- **Recommended Technical Default**: **Option A (Provider-Native Search Tools)** as the primary automated workflow, with **Option C (Direct URL Input)** as a manual override.
- **Implementation Impact**: Does NOT block CHK0 or CHK1. **Blocks CHK2 research workflow implementation.**

### Decision 3: Provider Fallback Policy

- **Context**: When a primary provider fails (e.g. outage or rate limit), should the system automatically fail over to a secondary configured provider?
- **Option A**: **Fail Closed (No Automatic Fallback)**: The item transitions to `FAILED` or `RATE_LIMITED` with an alert. Staff can manually switch profiles or retry.
  - _Pros_: Predictable billing, zero risk of accidental runaway costs on secondary expensive providers, strict data governance.
  - _Cons_: Requires human intervention if a provider experiences a temporary outage.
- **Option B**: **Automatic Tiered Fallback**: Automatically attempt secondary provider after 2 failed retries.
  - _Pros_: Higher automated job completion rate.
  - _Cons_: Potential cost spikes if falling back from an inexpensive model to a premium model; complex multi-provider credential requirements.
- **Recommended Technical Default**: **Option A (Fail Closed)**. Recommended for launch to maintain strict financial and operational control.
- **Implementation Impact**: Does NOT block CHK0 or CHK1. Policy will be codified in CHK2.

### Decision 4: Cost & Batch Throttle Thresholds

- **Context**: Safeguards against unexpected API billing.
- **Option A**: Conservative Limits: Maximum **25 products** per batch import; monthly soft alert at **$25 USD**; monthly hard stop at **$50 USD**.
- **Option B**: High-Throughput Limits: Maximum **100 products** per batch; monthly alert at **$100 USD**; hard stop at **$200 USD**.
- **Recommended Technical Default**: **Option A (Conservative Limits)**.
- **Implementation Impact**: Does NOT block CHK0 or CHK1. Configured as parameters in CHK1/CHK2.

### Decision 5: Prompt & Response Audit Retention Policy

- **Context**: Storing full LLM prompts and raw responses aids debugging but consumes database storage and risks retaining sensitive context.
- **Option A**: **Metadata & Telemetry Only**: Persist token counts, latency, and status in `ai_usage_telemetry`; discard raw LLM prompts after structured extraction.
- **Option B**: **Ephemeral Diagnostic Retention**: Persist raw prompts/responses in an audit table with an automated **30-day retention TTL**, strictly scrubbed of secrets.
- **Recommended Technical Default**: **Option B (30-day ephemeral retention)** to assist with prompt engineering and debugging during early rollout.
- **Implementation Impact**: Does NOT block CHK0. Dictates whether a diagnostic payload column is added in CHK1 schema.

---

## 23. Absolute Freeze & Quality Gate Conformance

- **Documentation-Only Scope**: This gate is strictly limited to `docs/roadmap/GP-025-CONTRACT.md` and updating status in `docs/roadmap/GP-025.md`.
- **Zero Code Changes**: Zero changes to `src/**`, `tests/**`, `package.json`, or `.env.example`.
- **Zero Database Changes**: Zero SQL migrations generated or executed. Migration 0013 is not created.
- **Zero External Contact**: No real AI provider APIs contacted; no hosted Supabase access; Cloudflare R2 untouched.
- **GP-024 Integrity**: All GP-024 files, contracts, and code remain frozen and unmodified.
- **Prettier & Diff Compliance**: Verified with zero formatting or whitespace errors.

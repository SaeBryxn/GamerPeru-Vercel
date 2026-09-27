# GP-025 — AI Product Research & Import: Closure Report

## Status

CLOSED / EXTERNALLY APPROVED / FROZEN

## Closure Verdict

PASS WITH NOTES

## Closure Metadata

- **Canonical baseline**: `99ec5f655217484cc156d7cda1d08cbaa0a248c1`
- **Candidate branch**: `audit/gp025-chk5`
- **Candidate parent**: `99ec5f655217484cc156d7cda1d08cbaa0a248c1`
- **Validation date**: 2026-09-13
- **Schema change required**: NO
- **Migration 0014**: NOT CREATED
- **Production-code delta**: ZERO
- **Test-code delta**: ZERO
- **Expected candidate files**: `docs/roadmap/GP-025.md` and `docs/roadmap/GP-025-CLOSURE.md`

## Final External Approval Record

- **Externally approved CHK5 candidate**: `96129578d45d0dc815778073d4bb8c42ec6ebc9e`
- **Candidate baseline**: `99ec5f655217484cc156d7cda1d08cbaa0a248c1`
- **Frozen contract**: `08165cfc0e0eeccb0887d5514eeb5654413f0c52`
- **Frozen migration 0013**: `7c29de159250ef7fc043f758a966364370534cac`
- **Migration 0014**: absent.
- **Repository freeze**: AI schema unchanged; production and test code unchanged by CHK5.
- **Regression acceptance**: the full integrated regression is externally accepted, including local PostgreSQL and Playwright results as local evidence.
- **GitHub Actions for baseline `99ec5f655217484cc156d7cda1d08cbaa0a248c1`**: Zero runs exist.
- **GitHub Actions for CHK5 candidate `96129578d45d0dc815778073d4bb8c42ec6ebc9e`**: Zero runs exist.
- **Production boundary**: activation prerequisites remain UNVERIFIED and mandatory before real AI production activation.
- **Next gate**: GP-026 has not begun and is not authorized by this closure operation.

## 1. Objective & Delivered Scope

GP-025 delivers the Admin AI Product Assistant for single-product research, batch CREATE research, existing-DRAFT Product enrichment, structured extraction, normalized evidence and provenance, human proposal review, human-authored Variant pricing, and crash-safe canonical catalog apply.

The delivered system includes encrypted provider credentials, provider/profile administration, a Google Gemini execution adapter, Tavily discovery plus controlled destination fetching, durable Inngest orchestration, source-conflict preservation, and Admin interfaces at `/admin/products/ai-import`, `/admin/products/ai-import/proposals/[proposalId]`, and `/admin/settings/ai`.

AI output remains advisory and reviewable. Canonical commerce authority remains in deterministic catalog, inventory, order, payment, authorization, and publication services.

## 2. Gate Progression & Approved Checkpoints

The following lineage was derived from the repository history and the canonical GP-025 roadmap.

| Gate   | Externally approved/frozen candidate                    | Main integration/closure                   |
| ------ | ------------------------------------------------------- | ------------------------------------------ |
| CHK1   | `a9a93f628eae876ca02b7c75ccdc21859bbb3b74` (CHK1-BR2)   | `728aaff4b2c2151497e943418fbd4901d67a2910` |
| CHK2   | `ab373495cae5a3c948cc931eb8e05873d4fe9a1d` (CHK2-BR1)   | `88f9731c11729ce3d5d5712b12de902dd21833ac` |
| CHK3-A | `ea697198879806df097bad5b6324362ca0c645ae` (CHK3-A-BR1) | `28e487318b833b49de763739c48d963e492deee6` |
| CHK3-B | `ce732890bfabe25f0e6d3f79e32f673571a7d653`              | `689d1b47780072a462cbe2e8081f494e63f90645` |
| CHK3-C | `ab2f3110b43da3fdaaf480aa7a7d782725efedb0` (CHK3-C-BR1) | `ec90b1229dc69220d96bc9907db98efb45137ce7` |
| CHK4   | `a129565378785af94927d9fa2d3cd01b354e4aa2` (CHK4-BR1)   | `99ec5f655217484cc156d7cda1d08cbaa0a248c1` |

The exact integrated sequence from the first CHK1 candidate through the CHK4 closure is linear. CHK5 starts directly from `99ec5f655217484cc156d7cda1d08cbaa0a248c1`; candidate `96129578d45d0dc815778073d4bb8c42ec6ebc9e` was externally approved and fast-forwarded into `main` before this final closure.

## 3. Rejected/Remediated Checkpoints

| Gate     | Rejected/remediation-required candidate    | Final remediation                                                                                                                                                |
| -------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CHK1     | `792b1c64f03ea7a1513ce954e620510c5295d83c` | CHK1-BR1 and CHK1-BR2 hardened authorization, key lifecycle, redaction, health-check races, profile snapshots, Data API isolation, and FK evidence.              |
| CHK1-BR1 | `324ee0aeb69c9474070cbdb90bd122728999376e` | `a9a93f628eae876ca02b7c75ccdc21859bbb3b74` completed sensitive-container redaction and stale-health/FK evidence.                                                 |
| CHK2     | `896cfd6b829f1521981a49d7784fb9c1fe405527` | `ab373495cae5a3c948cc931eb8e05873d4fe9a1d` fixed server-authoritative ENRICH snapshots, immutable replay fidelity, evidence hash recovery, and settled counters. |
| CHK3-A   | `cffec08ed44118964bd8df6a298e5aa4f7366b72` | `ea697198879806df097bad5b6324362ca0c645ae` restored legacy `specValues: null` no-op semantics without weakening durable replay.                                  |
| CHK3-C   | `8cca7b98b56819c9531b4ac5d9a34c0fc43ced2e` | `ab2f3110b43da3fdaaf480aa7a7d782725efedb0` preserved immutable `COMMITTED` step evidence and `target_id` through finalization failure.                           |
| CHK4     | `6da572432836c62487d1e20c402a611edfdfd13f` | `a129565378785af94927d9fa2d3cd01b354e4aa2` added honest provider capability gating and DRAFT-only ENRICH eligibility.                                            |

CHK3-B required no remediation branch. Rejected candidates remain preserved on their audit branches and were not rewritten by CHK5.

## 4. Canonical Architecture

The canonical path is:

1. A permission-guarded Admin UI submits a research intent.
2. Server actions validate a strict input schema and derive the verified actor from the server session.
3. The research service commits a job, item rows, immutable profile snapshot, actor-scoped digest, and deterministic Inngest event identity.
4. Inngest dispatches Google execution jobs and scheduled dispatch/lease recovery.
5. Tavily discovers URLs; the Gamer Perú fetcher revalidates destinations, redirects, robots policy, size, type, and SSRF constraints.
6. Gemini receives bounded textual evidence and produces application-schema-validated structured output.
7. Sources, field-to-source provenance, conflicts, attempts, and a DRAFT proposal are persisted.
8. Authorized staff review every field, resolve conflicts, select canonical brand/category, and author Variant prices.
9. A separately authorized apply operation calls only the existing GP-024 catalog services through durable, actor-bound steps.

No provider SDK is the catalog source of truth, and no browser or model receives database authority.

## 5. Authorization & Human-Authority Boundaries

The final repository review passed.

- `catalog:ai_research` guards research submission, job/proposal reads, and proposal review.
- `catalog:manage` independently guards canonical apply.
- `ai:manage_credentials` guards provider, profile, credential, rotation, and health-check administration.
- `catalog:publish` remains separate from all GP-025 AI routes and actions.
- Verified actor identity and permissions are resolved server-side. Client inputs do not provide authoritative `actorId`, `authUserId`, roles, permissions, apply operation identity, apply actor identity, internal step mutation identity, request payload, request fingerprint, or Product version snapshot.
- No role-name hardcoding replaces canonical permission checks; RBAC fails closed for missing, unauthenticated, or unauthorized contexts.

The client-supplied high-entropy research `mutationRequestId` is the intentional idempotency exception. Its actor-scoped digest is derived on the server, and the raw value is not persisted as authority.

## 6. Credential Security

Provider credentials use AES-256-GCM with unique IV/authentication-tag material, versioned server master-key resolution, dynamically computed AAD, active credential uniqueness, encrypted historical records, and fail-closed decryption when a required key version is missing.

The final Client Component and DTO review found no browser receipt of credential ciphertext, IV, authentication tag, master key, JWT, session cookie, raw provider credential, raw provider error, full fetched evidence bodies, worker lease tokens, or internal apply-step payload/identity/fingerprint. The settings UI accepts plaintext only for the intentional credential-write request; stored reads return masked metadata only. Logger and Sentry redaction tests pass for scalar and container-shaped sensitive values.

## 7. Provider Runtime Capability Matrix

| Provider  | Configuration | Encrypted credential | GP-025 research execution  | Explicit health check      |
| --------- | ------------- | -------------------- | -------------------------- | -------------------------- |
| Google    | Supported     | Supported            | Supported                  | Supported                  |
| OpenAI    | Supported     | Supported            | Unsupported; runtime-gated | Unsupported; runtime-gated |
| Anthropic | Supported     | Supported            | Unsupported; runtime-gated | Unsupported; runtime-gated |

Google is the only current production adapter registered for GP-025 research/health execution. OpenAI and Anthropic configuration support does not imply operational execution capability and is not a CHK5 defect.

## 8. Research Acquisition Pipeline

The approved acquisition path is Tavily Search → Gamer Perú controlled destination fetcher → Google Gemini structured extraction. Gemini Google Search grounding and provider tools are not used. The Gemini interaction is stateless (`store: false`).

Search responses are projected to minimum required fields. Destination fetching is server-only, protocol/host/IP validated, redirect-revalidated, robots-aware, text-only, time-bounded, byte-bounded, and character-bounded. Direct URLs use the same controlled fetch boundary. No arbitrary crawling or direct PDF parsing occurs.

## 9. Identity / Evidence / Provenance Model

Research classifies product identity as exact, probable, ambiguous, conflicting, unsupported, or manually disambiguated. Ambiguity and source conflict remain visible rather than being silently resolved.

Evidence is normalized in `ai_sources`; field-level many-to-many relationships in `ai_proposal_field_sources` retain supporting, conflicting, and contextual sources. Trust is based on canonical brand-domain matching, explicit staff verification, or an unverified default—not model self-certification. Persisted evidence recovery re-fetches the exact resolved URL and verifies the stored SHA-256 before reuse.

Provider/profile/model execution metadata and attempt telemetry remain durable without retaining raw prompts, raw responses, secrets, or full evidence bodies.

## 10. Recovery / Lease / Dispatch Architecture

Job creation commits `PENDING_DISPATCH` before event emission. Deterministic event identity makes re-emission safe, and the scheduled reconciliation function scans stale pending/failed dispatches.

Workers claim only `PENDING` items without a lease or `RESEARCHING` items with an expired lease. UUIDv7 lease tokens, expiry checks, and fencing guard heartbeat, source/proposal publication, completion, and failure mutations. A stale worker cannot publish after losing ownership. Provider attempts remain financial/audit evidence even when their late result is fenced from proposal authority.

The `/api/inngest` route registers the research worker, dispatch reconciliation, and expired-lease recovery functions. Both GP-025 scheduled recovery functions are defined at one-minute cadence. Production scheduling and signature configuration remain environment prerequisites, not claims made by this code closure.

## 11. Proposal Review Lifecycle

Review begins with explicit idempotent initialization of canonical brand/category selection rows. The field-review ledger is authoritative for `PENDING`, `ACCEPTED`, `REJECTED`, and `MANUALLY_EDITED` decisions; proposal brand/category columns are synchronized mirrors.

Approval requires complete field disposition, resolved source conflicts, revalidated canonical selections, valid category specifications, and valid human Variant plans. Approval/rejection produces exactly one transactional `AI_PROPOSAL_REVIEWED` event and performs zero catalog mutation.

## 12. Human Variant Pricing

AI extraction cannot establish sell, compare-at, or cost prices. Staff enter raw PEN strings through a dedicated Admin path; the server parses them to bounded integer cents and rejects missing/invalid required sell price. The selected human plan is revalidated before approval and again by the apply payload schemas.

## 13. Crash-Safe Canonical Apply

Apply requires a current `catalog:manage` session. The server creates a UUIDv7 operation identity and permanently binds the operation to that actor's identity without persisting authority tokens. Cross-actor resume fails closed.

Each step freezes a normalized request payload, SHA-256 fingerprint, stable GP-024 mutation identity, key, and ordinal before catalog invocation. `PREPARED`, `IN_FLIGHT`, `COMMITTED`, `FAILED_RETRYABLE`, and `FAILED_TERMINAL` preserve exact replay behavior across lost responses and process crashes. Retries use the durable step row rather than mutable proposal state.

`COMMITTED` evidence and `target_id` are immutable across later finalization failure. Finalization verifies exact durable effects and emits `AI_PROPOSAL_APPLIED` exactly once. Partial canonical effects are durable; no unsafe compensation rollback is attempted.

## 14. CREATE Semantics

CREATE applies an approved projection through `createProduct`, an optional specification `updateProduct`, and zero or more human-priced `createVariant` calls. All created catalog entities remain DRAFT-compatible, and every mutation uses stable GP-024 replay identity.

A later step failure does not erase an already committed Product or Variant. Resume validates and reuses committed results before continuing.

## 15. ENRICH Semantics

Normal ENRICH admission exposes and accepts only an existing DRAFT Product. The authoritative Product `updated_at` snapshot is read on the server; the client cannot submit it. Apply calls the durable-idempotent `updateProduct` path with replay-before-stale ordering and may create new human-priced Variants.

A stale Product snapshot fails terminally without overwriting newer data. ENRICH never invokes existing-Variant mutation. The DRAFT guard is rechecked inside locked catalog execution, covering publication races while preserving genuine committed replay.

## 16. DRAFT / Publication Boundary

GP-025 contains no publish action. AI cannot publish, select lifecycle transitions, or bypass catalog readiness. CREATE and ENRICH canonical apply produce or retain DRAFT Products. Publication is a distinct, human-authorized `catalog:publish` operation outside the AI flow.

The final human-authority review also verified zero AI inventory, order, payment verification, refund, commission, or automatic media/R2 mutation paths.

## 17. Admin AI Product Assistant UI

`/admin/products/ai-import` provides SINGLE/BATCH CREATE research, SINGLE ENRICH, executable-profile selection, DRAFT-only Product selection, durable progress, bounded recent activity, and terminal-aware polling.

`/admin/products/ai-import/proposals/[proposalId]` provides source-aware field review, conflict resolution, canonical catalog selections, specification decisions, media-rights warnings, human PEN pricing, approval/rejection, and apply/resume/status inspection. Direct routes and all Server Actions independently fail closed.

## 18. AI Settings UI

`/admin/settings/ai` provides provider configuration, masked credential create/replace/revoke, active-key rotation, explicit health checks, and profile configuration under `ai:manage_credentials`.

Capability DTOs and action guards identify Google as executable. Unsupported OpenAI/Anthropic research profiles cannot be enabled for GP-025 execution, and manipulated health/research submissions are rejected before adapter or job invocation.

## 19. Final Database Schema / Migration State

The physical GP-025 schema remains 11 normalized `ai_*` tables with application-generated UUIDv7 identifiers and zero PostgreSQL AI enum types. Migration `0013_parched_mephistopheles.sql` remains the final GP-025 migration; no migration 0014 exists.

Local CHK5 validation rebuilt the disposable Supabase database, applied the canonical Drizzle migration journal through 0013, and verified all 11 AI tables. No hosted migration or schema operation occurred. `src/db/schema/ai/**`, `src/db/migrations/**`, and `src/db/migrations/meta/**` have zero candidate delta.

## 20. Frozen Contract & Migration Blobs

| Artifact                                            | Before CHK5                                | After CHK5                                 |
| --------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| `docs/roadmap/GP-025-CONTRACT.md`                   | `08165cfc0e0eeccb0887d5514eeb5654413f0c52` | `08165cfc0e0eeccb0887d5514eeb5654413f0c52` |
| `src/db/migrations/0013_parched_mephistopheles.sql` | `7c29de159250ef7fc043f758a966364370534cac` | `7c29de159250ef7fc043f758a966364370534cac` |

## 21. Final Local Regression Evidence

All final commands exited 0.

| Gate                                         | Result                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Focused GP-025 unit/navigation/authorization | PASS — 18 files, 189 tests                                                         |
| Focused GP-025 PostgreSQL/catalog            | PASS — 6 files, 176 tests                                                          |
| `pnpm test:cart:live`                        | PASS — 14/14                                                                       |
| `pnpm test:checkout:live`                    | PASS — 24/24                                                                       |
| `pnpm test:payment:live`                     | PASS — 27/27                                                                       |
| `pnpm test:order:live`                       | PASS — 38/38                                                                       |
| `pnpm test:inventory:live`                   | PASS — 32/32                                                                       |
| `pnpm test:admin:live`                       | PASS — 9 files, 219 tests                                                          |
| `pnpm test`                                  | PASS — 115 files, 1418 tests                                                       |
| `pnpm format:check`                          | PASS                                                                               |
| `pnpm typecheck`                             | PASS                                                                               |
| `pnpm lint`                                  | PASS — zero ESLint warnings                                                        |
| `pnpm build`                                 | PASS                                                                               |
| `pnpm check`                                 | PASS — local aggregate gate                                                        |
| `pnpm ignored-builds`                        | PASS — `@google/genai` is explicitly classified by repository `allowBuilds` policy |
| `git diff --check`                           | PASS                                                                               |

Pre-flight live validation found stale local fixtures from earlier work. The guarded `127.0.0.1:54322/postgres` database was reset, canonical migrations were applied locally, and the entire live matrix was repeated successfully. This required no repository, production, schema, test, or hosted-environment change.

Checkpoint-specific regression classification:

- **CHK2**: PASS — server-authoritative snapshots, immutable replay, evidence re-fetch/hash verification, settled counters, acquisition, leases, and dispatch/recovery.
- **CHK3-A**: PASS — durable `updateProduct` replay and legacy `specValues: null` compatibility.
- **CHK3-B**: PASS — explicit initialization, authoritative ledger, rejection convention, human pricing, and terminal approval semantics.
- **CHK3-C**: PASS — stable apply identity/payload, crash replay, DRAFT/publication race, stale ENRICH, partial CREATE, exact finalization, immutable committed evidence/target, and exactly-once applied audit.
- **CHK4**: PASS — route/action authorization, safe DTOs, research/review/apply/settings UI, provider gating, DRAFT-only ENRICH, and server-authoritative Product snapshot.

## 22. Final Playwright Evidence

- `pnpm test:admin:e2e`: PASS — 46/46, including all 4 GP-025 Admin assistant scenarios.
- `pnpm test:e2e`: PASS — 146/146 canonical Playwright scenarios.
- Tests used local Supabase/PostgreSQL and deterministic fixtures. No real provider, hosted database, or R2 call was used.

## 23. GitHub Actions Classification

- Baseline `99ec5f655217484cc156d7cda1d08cbaa0a248c1`: Zero runs exist.
- CHK5 candidate `96129578d45d0dc815778073d4bb8c42ec6ebc9e`: Zero runs exist.
- `workflow_dispatch` was not used.
- Local `pnpm check`, live suites, and Playwright results are local evidence and are not presented as GitHub CI.

## 24. External Services Untouched During CHK5

Hosted Supabase, Gemini, Tavily, OpenAI, Anthropic, production Inngest, and Cloudflare R2 were untouched. CHK5 made no production/provider requests and no hosted data, credential, bucket, or object mutations. GitHub access was read-only for Actions classification plus the authorized audit-branch push.

## 25. Production Operational Prerequisites

Code closure and production environment activation are distinct.

| Prerequisite                              | CHK5 classification                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Migration 0013 deployment                 | Repository and local application verified; production deployment UNVERIFIED / deferred environment validation.  |
| AI encryption master keys                 | Versioned resolver and fail-closed validation verified; real production active version/key presence UNVERIFIED. |
| Google provider configuration             | Supported by schema/Admin/service; real production provider row/settings UNVERIFIED.                            |
| Active Google credential                  | Encrypted lifecycle verified; real production active credential UNVERIFIED.                                     |
| Tavily configuration                      | Key and identifiable fetch user-agent are required fail-closed; real production values UNVERIFIED.              |
| Inngest runtime/signing                   | Route/client/functions are present; production event/signing configuration and reachability UNVERIFIED.         |
| Scheduled reconciliation/recovery serving | Both functions are registered in `/api/inngest`; production scheduler registration/execution UNVERIFIED.        |
| Database availability                     | Explicit production database configuration is required; production availability UNVERIFIED.                     |
| Admin RBAC provisioning                   | Canonical permissions and guards are implemented; production user/role provisioning UNVERIFIED.                 |

These deferred external checks do not block GP-025 code closure under the frozen contract, but they must pass before real production AI execution is activated.

## 26. Explicit Out-of-Scope Items

CHK5 introduced no new provider adapter, feature, endpoint, behavior, test, schema, or migration. Autonomous publication, automated pricing, existing-Variant ENRICH mutation, inventory/order/payment/refund/commission actions, direct media ingestion, unbounded crawling, direct PDF parsing, and GP-026 work remain outside GP-025.

## 27. Known Accepted Limitations

- OpenAI adapter is not implemented for GP-025 research runtime.
- Anthropic adapter is not implemented for GP-025 research runtime.
- OpenAI/Anthropic provider configuration and encrypted credential storage are supported, but execution capability is gated.
- Automatic Product publication is not supported.
- AI pricing is not supported.
- Existing Variant mutation during ENRICH is not supported.
- Direct automatic media ingestion is not supported.
- Direct PDF parsing is not supported.
- In-flight cooperative cancellation is not supported.
- GP-026 Product Story Builder is not part of GP-025.

These are frozen scope exclusions, not CHK5 defects.

## 28. GP-026 Boundary

GP-026 has not begun and is not authorized by this closure operation. Product Story suggestions may exist as draft research material, but the Product Story Builder and its implementation belong to a later, separately authorized gate.

## 29. Final Closure Readiness Assessment

Functional, security, accessibility, responsive, build, local PostgreSQL, and Playwright evidence passed on the exact externally approved CHK5 candidate. CHK5 changes documentation only; production code, test code, schema, migrations, migration metadata, and frozen GP-025 backend behavior remain unchanged.

Acceptance criteria for single/batch research, structured validation, visible provenance/conflicts, provider/profile selection, DRAFT-only human review, credential isolation, partial batch failure, and consistent canonical apply are covered by the passing regression matrix. No material code blocker remains.

**Readiness classification**: GP-025 CLOSED / EXTERNALLY APPROVED / FROZEN / MAIN INTEGRATION COMPLETE / PASS WITH NOTES / PRODUCTION ACTIVATION PREREQUISITES PENDING / GP-026 PENDING EXTERNAL AUTHORIZATION

---

## 30. Post-Closure Hosted Deployment Record

- **Superseded Historical State:** In Section 25 above, the historical statement `production deployment UNVERIFIED / deferred environment validation` accurately described the physical state at the time of initial GP-025 closure.
- **Subsequent Deployment Status:** That statement has now been superseded. Migration `0013_parched_mephistopheles.sql` has been physically deployed and verified against authorized hosted Supabase project `jpjffalmvlxpufvtvskx` as part of the externally approved canonical hosted catch-up (`0013 → 0014 → 0015`).
- **Physical Verification Evidence:**
  - 11 `ai_*` relational tables present.
  - 23/23 explicit foreign keys verified.
  - 13/13 explicit indexes verified.
  - Zero table privileges granted to `anon`, `authenticated`, or `service_role`.
  - Idempotence verified via a clean second `pnpm db:migrate` no-op execution.
- **Production Activation Boundary:** Physical migration deployment does NOT activate AI production services. AI credentials, master keys, Tavily configuration, and Inngest production worker serving remain pending external prerequisites.
- **Authoritative Closure Document:** Full deployment and physical introspection evidence is recorded in [`HOSTED-MIGRATIONS-0013-0015-CLOSURE.md`](./HOSTED-MIGRATIONS-0013-0015-CLOSURE.md).

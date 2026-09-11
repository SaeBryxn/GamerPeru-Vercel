# GP-024 — Admin Product Manager: Closure Report

## Status

CLOSED / EXTERNALLY APPROVED / FROZEN

## Closure Verdict

PASS WITH NOTES

The implementation and documentation scope is complete and externally approved. The following
operational validations remain deferred under the approved audit policy:

- `R2_BUCKET_PROVISIONING: DEFERRED`
- `R2_CORS_PROVISIONING: DEFERRED`
- `R2_RUNTIME_VALIDATION: DEFERRED`
- `HOSTED ACTIONS VALIDATION: DEFERRED`

These notes do not block GP-024 code and documentation closure, but they remain mandatory
production operational prerequisites.

---

## 1. Objective & Delivered Scope

GP-024 delivers the permission-aware Admin Product Manager and its authoritative server-side
catalog authoring workflows. The completed scope includes:

- Product creation, reading, editing, archive, restore, duplication, and status lifecycle;
- canonical Brand and Category reference-data selectors;
- Product Variant authoring;
- SKU validation and permanent immutability after inventory or order history exists;
- exact integer-cents PEN pricing across the UI and server-action boundary;
- category-schema-driven technical specification authoring;
- SEO authoring and publish-readiness evaluation;
- separation of `catalog:manage` authoring from `catalog:publish` authority;
- optimistic concurrency and mutation idempotency;
- secure Product Media authoring through private staging and signed upload intents;
- JPEG, PNG, WebP, and AVIF input validation;
- deterministic WebP normalization and SHA-256 content addressing;
- MediaAsset persistence/reuse and ProductMedia attachment;
- global and Variant media assignment, global primary designation, display ordering, and global
  MediaAsset alt text; and
- replay and concurrency protection for finalization and secondary media mutations.

GP-024 contains no Product hard-delete workflow and no permanent MediaAsset/ProductMedia deletion.
Story Builder, GP-025 AI Product Research, and GP-026 Product Stories are not part of this delivery.

---

## 2. Gate Progression & Approved Checkpoints

| Gate | Approved checkpoint           | SHA                                        | Status                                |
| :--- | :---------------------------- | :----------------------------------------- | :------------------------------------ |
| CHK0 | Final approved contract       | `7e45eff42b79499dc77ac98d48ec189d3a73a58e` | CLOSED / EXTERNALLY APPROVED / FROZEN |
| CHK1 | Closure                       | `69cb2825574976bff5b25b3b46aafe50e81ed88b` | CLOSED / EXTERNALLY APPROVED / FROZEN |
| CHK2 | Final approved implementation | `5cfe1d1c19f298667cd2a8a7d63a7db417e3a564` | EXTERNALLY APPROVED / FROZEN          |
| CHK2 | Closure                       | `0dcc5dc5205da0311e3a370886a157aaaefffdc5` | CLOSED / EXTERNALLY APPROVED / FROZEN |
| CHK3 | Final approved implementation | `37f4cf88bbdb9883d4c69fd5edec31a4911baf9f` | EXTERNALLY APPROVED / FROZEN          |
| CHK3 | Closure                       | `e8cbd052686d9ef7ebc4029923b23842f68c3908` | CLOSED / EXTERNALLY APPROVED / FROZEN |

CHK2 required multiple remediation rounds before its final serializer and implementation approval.
CHK3 likewise required the initial, BR1, and BR2 remediation rounds; BR3 closed the final fresh-intent
staging-disappearance race and passed external review. Rejected intermediate revisions are not final
approved checkpoints.

The final implementation checkpoint on `main` before this closure candidate is
`e8cbd052686d9ef7ebc4029923b23842f68c3908`.

---

## 3. Canonical Domain & Security Decisions

### Authorization

- Ordinary Product Manager authoring requires `catalog:manage`.
- Publication-authority transitions require `catalog:publish`.
- Authorization is enforced server-side through permissions, without role-name hardcoding.
- `transitionProductStatus` remains the authoritative server/domain lifecycle boundary.

### SKU

- A SKU is trimmed, non-empty, and at most 50 characters.
- GP-024 does not invent uppercase-only or alphanumeric-only constraints.
- A SKU becomes permanently immutable once either `inventory_items` or `order_items` references the
  Variant.

### Money

- The UI and server-action boundary carry raw PEN strings.
- `parsePenInputToCents` is the authoritative parser.
- No floating-point multiplication by 100 is used for persistence.

### Specifications

- `categories.current_spec_schema_id` is authoritative.
- Required-field semantics are never invented beyond the canonical schema.
- An invalid schema pointer fails closed.
- An enum Product value is one string even when its filter kind is `ENUM_MULTI`.

### Product Lifecycle and Concurrency

- GP-024 exposes no Product hard-delete mutation or UI.
- Optimistic concurrency rejects stale writes rather than overwriting newer authoritative state.
- Mutation replay requires both the scoped mutation digest and the matching request fingerprint.

### Media

- GP-024 performs no permanent MediaAsset or ProductMedia deletion.
- MediaAsset alt text is global to the asset.
- Primary media must remain valid global Product media.
- Variant reassignment cannot violate the global-primary invariant.
- `mutationRequestDigest`, `requestFingerprint`, and `mediaIntentDigest` remain separate identities
  with distinct purposes. The implementation does not claim a generic exactly-once guarantee.

---

## 4. Accepted Secure Media Pipeline

The accepted flow is:

```text
browser file selection
-> signed server intent
-> private staging presigned PUT
-> server-authoritative HEAD and bounded GET
-> real-byte image validation
-> deterministic WebP normalization
-> final-byte SHA-256
-> canonical public object key
-> MediaAsset insert or reuse
-> ProductMedia attachment
-> durable AuditEvent replay marker
-> post-commit best-effort staging cleanup
```

The canonical public key is:

```text
products/{brandSlug}/{productSlug}/{sha256}.webp
```

Accepted inputs are `image/jpeg`, `image/png`, `image/webp`, and `image/avif`. The maximum incoming
size is `10485760` bytes, and the final MIME type is `image/webp`.

The staging bucket is private by design. Presigned PUT lifetime is bounded by the remaining signed
intent lifetime. Storage authorization, network, 5xx, and malformed successful responses fail
closed. Real Cloudflare R2 runtime validation was not executed during GP-024.

---

## 5. Replay & Concurrency Semantics

Finalization preserves these outcomes:

| Input relationship                             | Accepted outcome                                                                       |
| :--------------------------------------------- | :------------------------------------------------------------------------------------- |
| Same intent + same mutation request            | Return the committed replay                                                            |
| Same intent + different mutation request       | Return the committed media-intent replay                                               |
| Same mutation request + different intent       | `CATALOG_IDEMPOTENCY_CONFLICT`                                                         |
| Different intents + identical normalized bytes | Reuse the canonical MediaAsset and create distinct legitimate ProductMedia attachments |

The finalization transaction acquires the mutation advisory lock first, the media-intent advisory
lock second, and the Product row lock where required. Secondary media mutations preserve their
transactional replay and global-primary invariants.

Fresh-intent concurrent HEAD-disappearance and GET-disappearance races were deterministically
validated against real local PostgreSQL and injected in-memory storage barriers. Both callers begin
before consumption; the winner commits and deletes staging, while the loser re-probes durable replay
evidence and converges on the same ProductMedia and MediaAsset. This evidence does not claim real
Cloudflare R2 concurrency testing.

---

## 6. Accepted Local Validation Evidence

The final approved checkpoint reports record:

| Gate               | Accepted result                                    |
| :----------------- | :------------------------------------------------- |
| Full unit suite    | 99 files / 1,245 tests passed                      |
| Admin Live         | 4 files / 91 tests passed against local PostgreSQL |
| Admin E2E          | 42 passed                                          |
| Storefront E2E     | 142 passed                                         |
| `format:check`     | PASS                                               |
| `typecheck`        | PASS                                               |
| `lint`             | PASS                                               |
| `build`            | PASS                                               |
| `git diff --check` | PASS                                               |

These are accepted local validation results. They are not an independent GitHub-hosted runner
execution; hosted Actions validation remains deferred.

---

## 7. Acceptance Criteria & Definition of Done

| Area              | Verdict        | Evidence basis                                                                                                                                                                                  |
| :---------------- | :------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional DoD    | PASS WITH NOTE | Permissioned, auditable Product/Variant/media authoring and negative, replay, and concurrency paths passed accepted local suites. Production R2 enablement remains an operational prerequisite. |
| Visual DoD        | PASS           | The permission-aware Product Manager UI and media authoring interactions passed the accepted Admin E2E suite.                                                                                   |
| Performance DoD   | PASS WITH NOTE | Production build passed and media reads are bounded; production-like R2 runtime behavior remains deferred.                                                                                      |
| SEO DoD           | PASS           | SEO authoring remained in the accepted Product Manager scope, and the accepted storefront regression suite passed.                                                                              |
| Security DoD      | PASS WITH NOTE | Server-side authorization, signed intents, real-byte validation, fail-closed storage behavior, and replay integrity passed locally; real R2 credentials and runtime remain deferred.            |
| Accessibility DoD | PASS           | Accepted Admin E2E coverage validated keyboard- and focus-aware Product Manager interactions without reopening the approved UI.                                                                 |

---

## 8. Deviations, Risks & Follow-ups

No unresolved code or contract deviation blocks GP-024 closure. The remaining items are explicit
operational and release follow-ups:

1. Provision the private catalog staging bucket before enabling production media uploads.
2. Configure staging-bucket CORS for the GamerPeru production origin and the exact required PUT
   headers.
3. Set a real high-entropy `CATALOG_MEDIA_INTENT_HMAC_SECRET`.
4. Configure real R2 credentials and bucket names.
5. Perform controlled non-production or production-like R2 runtime validation before enabling
   Product Media upload in production.
6. Execute the cumulative hosted GitHub Actions Full Gate when runner allowance returns and/or
   before production release.
7. Preserve the orphan-safe public-object cleanup policy. Do not add unsafe automatic public
   deletion without a future explicit contract.

These follow-ups do not require reopening GP-024 code, but they must be satisfied before the related
production capability is enabled or released.

---

## 9. Repository & Database Freeze Evidence

- GP-024 contract blob: `0292679a73bd61611eac4f3464f975efb6c91a44`
- Migration 0012 blob: `e80c30ae9d0f86e14486b0fd5c782eb9ec3f7119`
- Migration sequence: through 0012; no migration 0013 exists.
- `SCHEMA_CHANGE_REQUIRED: NO`
- Sharp: exactly `0.35.4`.
- Hosted Supabase: `UNTOUCHED`.
- `R2_BUCKET_PROVISIONING: DEFERRED`
- `R2_CORS_PROVISIONING: DEFERRED`
- `R2_RUNTIME_VALIDATION: DEFERRED`
- `HOSTED ACTIONS VALIDATION: DEFERRED`
- Final implementation `main` checkpoint before closure candidate:
  `e8cbd052686d9ef7ebc4029923b23842f68c3908`.
- This closure candidate is documentation-only and is limited to `docs/roadmap/GP-024.md` and this
  report.

---

## 10. Next Dependency

The next roadmap dependency is GP-025. GP-025 is not begun by this closure-candidate commit and may
begin only after the GP-024 final closure candidate receives external approval and is integrated to
`main`. GP-026 also remains not begun.

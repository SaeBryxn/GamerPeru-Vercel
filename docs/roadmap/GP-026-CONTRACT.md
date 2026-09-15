# GP-026 --- Product Story Builder Implementation Contract

## Contract Status

`CHK0 CONTRACT CANDIDATE / PENDING EXTERNAL APPROVAL`

This document is the fresh, current-main discovery candidate for GP-026. It is not frozen
implementation authority until it is externally approved and integrated. GP-026 runtime work must
not start from this candidate alone.

## 1. Canonical Baseline

- Repository: `latamcreativa/GamerPeru`.
- Exact discovery baseline: `672222b098aff8713be902ef2173f9c13e761e35`.
- Active roadmap order: GP-025 -> GP-026 -> GP-027.
- Required prerequisites: GP-014 and GP-024 are closed.
- Current `main` contains the authoritative pre-GP-026A Gamer Peru storefront, PDP, Product Story
  renderer, design language, Admin Product Manager, catalog services, and media pipeline.
- This CHK0 changes documentation only. It creates no runtime, test, schema, migration, public
  asset, package, lockfile, or hosted-service delta.

The findings below were independently revalidated from the schema, migrations, source, and tests
at this baseline. No historical GP-026 candidate was used as authority.

## 2. Owner Intent

GP-026 provides a manual, structured Product Story Builder inside Admin. An authorized catalog
operator must be able to insert, edit, duplicate where useful, delete, reorder, save, preview, and
publish the existing canonical Story blocks without editing source code.

The builder authors content for the existing public Product Story renderer. It does not redesign
the storefront or create a second presentation system. AI does not generate Product Story content
in GP-026. GP-025 remains the separate AI research and catalog-import capability.

## 3. Current-State Architecture Inventory

| Concern                | Current authoritative implementation                                                         | Discovery result                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Story schema           | `src/db/schema/catalog/product-stories.ts`                                                   | Versioned JSONB revisions and a product-level published pointer already exist.                                                   |
| Physical migration     | `src/db/migrations/0003_small_slyde.sql`                                                     | Creates `product_stories` and `product_story_revisions`; later snapshots preserve the same shape.                                |
| Data API boundary      | `src/db/migrations/0005_data_api_hardening.sql`                                              | Direct table privileges are revoked from `anon`, `authenticated`, and `service_role`.                                            |
| Runtime validation     | `src/lib/catalog/story-validation.ts`                                                        | Tolerant public-read validation recognizes 13 block types and caps a revision at 30 blocks.                                      |
| Public reader          | `src/lib/catalog/postgres-product-detail-queries.ts` and `postgres-product-detail-reader.ts` | Reads only the revision referenced by `product_stories.published_revision_id`, validates it, and fails closed.                   |
| Public page            | `src/app/(storefront)/productos/[slug]/page.tsx`                                             | Hydrates explicit related-product slugs and invokes the canonical renderer on the PDP.                                           |
| Public renderer        | `src/components/product-story/product-story-renderer.tsx`                                    | Dispatches the 13 validated discriminators to the current block components.                                                      |
| SEO                    | `src/lib/catalog/pdp-seo.ts` and `ProductJsonLd`                                             | Visible FAQ Story blocks contribute `FAQPage` JSON-LD; Story content does not replace product metadata.                          |
| Admin product route    | `src/app/admin/(protected)/products/[productId]/page.tsx`                                    | Server-authenticated, dynamic Product Manager route protected by `catalog:manage`.                                               |
| Admin actions/services | `src/lib/admin/catalog/actions.ts`, `service.ts`, and `media-service.ts`                     | Reusable server-derived identity, typed errors, transactions, optimistic concurrency, audit evidence, and replay patterns exist. |
| Admin Story support    | Admin source and action/service search                                                       | No Admin Story reader, writer, preview, action, service, DTO, or builder currently exists.                                       |
| Media model            | `media_assets`, `product_media`, Admin media services, and UI DTOs                           | Product-owned public media can be selected safely; raw object keys are intentionally omitted from the browser DTO.               |

The Admin Product Manager already proves the interaction patterns GP-026 should reuse: permission
aware controls, explicit confirmation dialogs, focus containment/restoration, field and alert
errors, 44 px shell targets, responsive layouts, stable client mutation request IDs, and stale-write
alerts. GP-026 must be a separate focused route rather than expanding the already large Product
Editor with 13 complete form systems.

## 4. Existing Story Domain and Data Model

### `product_story_revisions`

| Column                    | Current type and rule                                    | Meaning                                                      |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `id`                      | UUIDv7 primary key                                       | Revision identity.                                           |
| `product_id`              | UUID, not null, FK to `products.id`, `ON DELETE CASCADE` | Product ownership.                                           |
| `revision_number`         | Integer, positive                                        | Product-local revision sequence. Unique with `product_id`.   |
| `status`                  | `catalog_status`, default `DRAFT`                        | Current metadata state: `DRAFT`, `PUBLISHED`, or `ARCHIVED`. |
| `blocks`                  | JSONB, not null, default `[]`, JSON array check          | Entire ordered Story document snapshot.                      |
| `published_at`            | Nullable timestamptz                                     | Required by a check when status is `PUBLISHED`.              |
| `created_by_auth_user_id` | Nullable UUID FK to `auth.users`, `ON DELETE SET NULL`   | Server-derived author attribution.                           |
| `created_at`              | Timestamptz, default now                                 | Revision creation time.                                      |

The persisted block envelope is:

```ts
interface PersistedStoryBlock {
  block_id: string;
  type: string;
  order: number;
  payload: Record<string, unknown>;
}
```

### `product_stories`

| Column                  | Current type and rule                                                  | Meaning                         |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `product_id`            | UUID primary key and FK to `products.id`, `ON DELETE CASCADE`          | One aggregate root per Product. |
| `published_revision_id` | Nullable UUID FK to `product_story_revisions.id`, `ON DELETE SET NULL` | Active public revision pointer. |
| `updated_at`            | Timestamptz                                                            | Aggregate change time.          |

The public association is Product -> `product_stories.product_id` ->
`published_revision_id` -> `product_story_revisions.id`. Drafts are revisions whose status is
`DRAFT`; the current schema does not identify which one is the active draft.

No current Admin action or domain service creates a Story revision, changes Story status, or swaps
the published pointer. At the baseline the application is a safe, fail-closed Story consumer, not a
Story publisher. CHK1 therefore owns the first canonical write/publication path.

### Existing physical guarantees

- Revision rows cannot outlive their Product.
- Revision numbers are positive and unique per Product.
- `blocks` is at least a JSON array.
- A `PUBLISHED` revision must have `published_at`.
- The published pointer must refer to an existing revision ID.

### Missing physical guarantees

- The published FK does not prove that the referenced revision belongs to the same Product.
- More than one `DRAFT` or `PUBLISHED` revision can exist for a Product.
- There is no authoritative active-draft pointer.
- JSONB does not enforce block discriminators, payload shapes, unique `block_id` values, contiguous
  order, comparison row width, media ownership, or related-product existence.

The public reader currently mitigates a cross-product or non-published pointer by omitting the Story
and logging a sanitized warning. That is correct defense in depth for reads, but it is not a
sufficient write-side invariant once Admin publication is enabled.

## 5. Current Public Read and Render Flow

1. The public PDP reader first requires an eligible `PUBLISHED` Product, published Brand and
   Category, and at least one active Variant.
2. The Story query joins the Product's `product_stories.published_revision_id` to a revision.
3. The reader rejects the Story unless the revision belongs to the same Product, has status
   `PUBLISHED`, and has a non-null `published_at`.
4. `validateStoryBlocks` validates each envelope and payload. Invalid individual blocks are
   dropped; a non-array, more than 30 blocks, or zero surviving blocks omits the complete Story.
5. Valid blocks are sorted by ascending `order`.
6. The PDP collects unique explicit `productSlugs` for all `related_products` blocks and hydrates
   them once. Reader failure returns no related products instead of failing the PDP.
7. `ProductStoryRenderer` renders the validated document under one section labelled "Historia del
   producto" and delegates each discriminator to its canonical component.

Preview and publication must use this same validation and renderer path. GP-026 must not build an
Admin-only visual facsimile.

## 6. Existing Validation Contract

The current public validator provides these bounds:

- Maximum 30 stored blocks per revision.
- `block_id`: string, 1-100 characters.
- `type`: string, 1-50 characters, then restricted to the canonical registry.
- `order`: integer from 1 through 1000.
- `payload`: string-keyed object.
- Text fields have explicit lengths and reject substrings shaped like HTML tags.
- Unknown block types and invalid payloads are omitted fail-closed.

Public-read tolerance is not the Admin write policy. The builder's strict write validator must:

- validate the complete submitted document all-or-nothing;
- reject unknown envelope or payload keys instead of silently stripping them;
- trim boundary whitespace and reject required strings that become empty;
- reject duplicate block IDs;
- take array position as the authoring order and persist server-generated contiguous values
  `1..N`, ignoring any caller-authored numeric order;
- enforce exact comparison row width equal to `headers.length`;
- resolve and authorize every media and related-product selection server-side;
- allow an empty array as a saved draft, but require at least one fully renderable block to publish;
- return stable field paths and sanitized Spanish messages without persisting a partial subset.

The tolerant public reader remains in place for old or corrupted data and continues to fail closed.

## 7. Exact Supported Block Inventory and Payload Contract

All 13 expected discriminators are present in the current registry. The following shapes are the
persisted/public shapes at the baseline.

| Type               | Required payload                                                                                                                            | Optional payload and exact bounds                                                                                                 | Media reference                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `hero_media`       | `headline: string(1..200)`                                                                                                                  | `tagline: string(1..500)`; `body: string(1..1000)`; `mediaKey`, `posterKey`, `videoKey: string(1..300)`                           | `mediaKey` and `posterKey` are images; `videoKey` is video. A text-only hero is valid. |
| `full_bleed_image` | `mediaKey: string(1..300)`                                                                                                                  | `altText: string(1..200)`; `caption: string(1..300)`                                                                              | One required image.                                                                    |
| `image_text`       | `headline: string(1..200)`; `body: string(1..2000)`; `mediaKey: string(1..300)`                                                             | `imagePosition: "left" \| "right"`, default `left`                                                                                | One required image.                                                                    |
| `stat_highlight`   | `stats: 1..6` items; each has `value: string(1..50)` and `label: string(1..100)`                                                            | Block `title: string(1..200)`; item `unit: string(1..20)`                                                                         | None.                                                                                  |
| `spec_feature`     | `title: string(1..200)`; `description: string(1..2000)`                                                                                     | `mediaKey: string(1..300)`; `badge: string(1..50)`                                                                                | Optional image.                                                                        |
| `video`            | `videoKey: string(1..300)`                                                                                                                  | `posterKey: string(1..300)`; `title: string(1..200)`; `caption: string(1..500)`                                                   | Required video and optional image poster.                                              |
| `gallery`          | `items: 3..6`; each item has `mediaKey: string(1..300)`                                                                                     | Block `title: string(1..200)`; item `altText: string(1..200)` and `caption: string(1..300)`                                       | Three to six images.                                                                   |
| `comparison`       | `headers: 2..6` strings `(1..100)`; `rows: 1..20`, each currently 2..6 strings `(1..200)`                                                   | `title: string(1..200)`                                                                                                           | None. Authoring additionally requires every row width to equal header width.           |
| `dimensions`       | At least one of blueprint, a dimension, or a non-empty grip list                                                                            | `blueprintMediaKey: string(1..300)`; `lengthMm`, `widthMm`, `heightMm: number > 0 and <= 1000`; `gripTypes: 1..10 strings(1..50)` | Optional blueprint image.                                                              |
| `box_contents`     | `items: 1..12`; each item has `title: string(1..100)`                                                                                       | Block `title: string(1..200)`; item `mediaKey: string(1..300)` and `count: integer 1..100`                                        | Optional image per item.                                                               |
| `technical_specs`  | `groups: 1..10`; each has `groupName: string(1..100)` and `specs: 1..20`; each spec has `label: string(1..100)` and `value: string(1..200)` | `title: string(1..200)`                                                                                                           | None.                                                                                  |
| `faq`              | `items: 1..15`; each has `question: string(1..300)` and `answer: string(1..2000)`                                                           | `title: string(1..200)`                                                                                                           | None.                                                                                  |
| `related_products` | At least one non-empty `categorySlugs` or `productSlugs` array under current validation                                                     | `title: string(1..200)`; each slug list has 1..10 strings `(1..100)`                                                              | No media. Only explicit `productSlugs` are currently hydrated/rendered.                |

All string bounds above inherit the existing no-HTML-tag rule. Story copy is plain text; arbitrary
HTML, scripts, Markdown rendering, custom CSS, and executable content are not accepted.

## 8. Current Renderer Mapping and Structured Editability

| Type               | Canonical component and public behavior                                                                | Admin structured controls                                        | Accessibility and preview implications                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `hero_media`       | `HeroMediaBlock`; ambient video -> image -> text fallback; media is decorative and text uses `h2`      | Headline, tagline, body fields; image, poster, and video pickers | Preview must prove reduced-motion suppression and static fallback.                          |
| `full_bleed_image` | `FullBleedImageBlock`; invalid media omits block; semantic `figure`/`figcaption`                       | Image picker, alt text, caption                                  | Alt input needs guidance; preview must show the fallback-derived alt when omitted.          |
| `image_text`       | `ImageTextBlock`; left/right layout; invalid image becomes full-width text                             | Headline/body, image picker, left/right radios                   | Radio group must have a legend; derived contextual alt remains renderer-owned.              |
| `stat_highlight`   | `StatHighlightBlock`; metric cards under optional `h2`                                                 | Repeatable 1..6 value/unit/label rows and title                  | Add/remove rows remain keyboard operable and announced.                                     |
| `spec_feature`     | `SpecFeatureBlock`; optional image and badge                                                           | Title, description, badge, optional image picker                 | Preview covers image and text-only variants; derived alt remains renderer-owned.            |
| `video`            | `VideoBlock` + `StoryVideoPlayer`; poster/text fallback and explicit play/pause                        | Video picker, poster picker, title, caption                      | Preview uses real player; manual controls remain usable under reduced motion.               |
| `gallery`          | `GalleryBlock`; whole block omitted if fewer than three media URLs resolve                             | Repeatable 3..6 image, alt, caption items; row reorder           | Each image has its own accessible name; preview must validate the three-image minimum.      |
| `comparison`       | `ComparisonBlock`; scrollable labelled table; mismatched rows are dropped                              | Header and row grid, 2..6 columns, 1..20 rows                    | Authoring blocks mismatched widths; cell controls require explicit row/column labels.       |
| `dimensions`       | `DimensionsBlock`; fixed Spanish section labels and optional blueprint                                 | Numeric mm inputs, grip list, optional blueprint picker          | Numeric errors identify units; derived blueprint alt remains renderer-owned.                |
| `box_contents`     | `BoxContentsBlock`; 1..12 items with optional image/count                                              | Repeatable title/count/image rows                                | Count is numeric and labelled; add/remove/reorder controls need accessible item context.    |
| `technical_specs`  | `TechnicalSpecsBlock`; semantic grouped `dl` output                                                    | Repeatable groups and label/value pairs                          | Form hierarchy uses fieldsets/legends and preserves meaningful group order.                 |
| `faq`              | `FaqBlock`; native `details`/`summary`; contributes `FAQPage` JSON-LD                                  | Repeatable question/answer pairs                                 | Preview proves keyboard disclosure behavior and visible/structured-data parity.             |
| `related_products` | `RelatedProductsBlock`; explicit published product cards only, current Product and duplicates excluded | Searchable explicit Product multi-selector; title                | Do not expose nonfunctional category selection; preview hydrates through the public reader. |

Every block is safely expressible with structured controls. A JSON editor is neither required nor
authorized as the primary UX. A secondary read-only diagnostics export may be added only for stale
conflict recovery and must never become a write bypass.

## 9. Ordering Semantics

- The editor owns an array of at most 30 block view models.
- Each persisted block has a stable, unique opaque `block_id`. Newly inserted or duplicated blocks
  receive a fresh high-entropy UUID; duplication never reuses the source ID.
- Array position is canonical on save. The service rewrites stored `order` values to contiguous,
  one-based integers.
- Reorder is local until Save Draft. The entire document is then committed in one revision; no
  block-by-block database reorder exists.
- Move Up and Move Down buttons are the required keyboard and touch mechanism. Drag-and-drop may
  be an enhancement only; it cannot be the only control.
- The current public sort by `order` remains compatible. Strict writes remove ambiguous duplicate
  and gapped order values for all GP-026-created revisions.

## 10. Reusable Admin Infrastructure and Proposed Boundaries

GP-026 adds no parallel application, auth system, upload pipeline, or public renderer.

### New route boundary

- Entry card on `/admin/products/[productId]`: "Historia del producto" with status and an "Editar
  historia" link.
- Focused builder route: `/admin/products/[productId]/story`.
- Protected preview route:
  `/admin/products/[productId]/story/preview?revision=<revision-id>`.
- All routes are dynamic and inherit the existing Admin authentication and private/no-store cache
  behavior.

### New server/domain boundary

Names may follow repository conventions, but ownership is fixed:

- Admin reader: loads the Product, Story aggregate, active draft, published revision metadata, and
  sanitized media/related-product selector data.
- `saveProductStoryDraft`: strict validation, media/reference resolution, immutable revision
  insertion, draft pointer swap, audit marker.
- `discardProductStoryDraft`: archives the current draft and clears its pointer.
- `publishProductStory`: revalidates and atomically promotes the exact current draft.
- `unpublishProductStory`: atomically removes public exposure while retaining revision history.
- Thin Server Actions derive auth, map safe errors, call the services, and revalidate Admin/PDP
  paths after durable success.

CRUD for individual blocks remains client document editing. Separate block insert/update/delete
database actions are forbidden because they would permit partially persisted order and multiply
concurrency boundaries.

## 11. Admin Builder UX Contract

The builder is a compact operational surface consistent with the current Gamer Peru Admin.

1. The page header identifies Product name and slug and links back to Product Manager.
2. A status region distinguishes: no Story, unpublished draft, published revision, and newer draft
   over a published revision. It shows revision numbers and the public publication timestamp in
   text, not color alone.
3. Empty state explains Story purpose and offers one primary "Agregar bloque" action.
4. The block library lists all 13 block types with a short outcome description. Choosing one adds
   a structured card, focuses its first field, and marks the document unsaved.
5. Block cards have a visible type/title, position, collapse/expand, Move Up, Move Down, Duplicate,
   and Delete controls. Delete of a populated block requires confirmation. Duplicate creates a
   new block identity and remains local until save.
6. Each payload uses labelled inputs, textareas, radios/selects, numeric controls, repeatable item
   groups, and authorized media/Product pickers. There is no unrestricted HTML, code, or JSON
   editor.
7. Save Draft is explicit rather than per-keystroke autosave. This bounds revision creation and
   gives each durable document a clear audit event.
8. Preview is enabled only for a durably saved current draft. If local edits exist, the UI saves
   successfully first or asks the operator to save; it never previews a different unpublished
   payload than the one identified by the route.
9. Publish is disabled while local changes are unsaved or the document has validation blockers.
   Missing `catalog:publish` authority is explained without weakening the server check.
10. Navigation with dirty local state triggers an accessible confirmation. Browser unload is also
    guarded. A stale response preserves local field values and never automatically overwrites the
    newer server revision.
11. Validation summary links to the first invalid control and every error is also attached to its
    field. Success is announced politely; blocking errors and stale conflicts use assertive status.
12. Mobile and tablet use one column, full-width actions, 44 by 44 px minimum targets, no horizontal
    page overflow, and no drag-only operation. The comparison form may use a labelled internal
    horizontal scroll region.

The existing Product Manager's tested dialog focus and error patterns are the implementation
reference. The generic readiness-card side accent reported by the design detector is not copied as
a new decorative motif; Story status must remain textual and operational.

## 12. Draft Lifecycle

```text
No aggregate/revision
  -> local empty or published clone
  -> Save Draft
  -> active DRAFT revision
  -> Save Draft again
  -> new active DRAFT revision; prior DRAFT becomes ARCHIVED
  -> Publish exact active DRAFT
  -> PUBLISHED revision; draft pointer becomes null
  -> edit published Story
  -> new local clone; first Save creates a new DRAFT
```

- Opening the editor is read-only. It must not create a revision merely by visiting the page.
- With no active draft, the editor initializes locally from the published revision if one exists,
  otherwise from an empty document.
- Empty drafts are allowed so an operator can save work after removing all blocks. Empty drafts
  cannot be published.
- Discard Draft archives the active draft after confirmation and clears only the draft pointer.
  The published Story is unchanged.
- Publishing consumes the active draft identity. Subsequent edits create a new draft from the
  published snapshot.
- Unpublish clears the public pointer and archives the prior published revision. It does not delete
  content or an independent current draft.
- No hard-delete Story action exists. Revision history is retained for audit/recovery.

## 13. Revision and Version Model

Story block content is immutable once a revision row is inserted. Status and publication metadata
may change as lifecycle metadata; the `blocks` document, revision number, author, and creation time
must not be updated in place.

Every successful Save Draft:

1. acquires the mutation-digest advisory lock;
2. locks the Product row;
3. creates the Story aggregate deterministically when absent and locks the aggregate row;
4. locks the currently referenced draft and published revisions, when present;
5. checks for a durable replay marker under the advisory lock and returns or rejects the replay
   before optimistic-pointer validation or any lifecycle mutation;
6. for a fresh request, proves the caller's expected draft and published identities still match;
7. validates and canonicalizes the complete document;
8. allocates `max(revision_number) + 1` under the transaction lock;
9. transitions the exact previously active revision from `DRAFT` to `ARCHIVED`, when one exists;
10. inserts the replacement revision with status `DRAFT`;
11. sets `product_stories.draft_revision_id` to the new revision and updates aggregate `updated_at`;
12. appends one durable audit/idempotency event;
13. commits the complete transaction.

Archiving the prior draft before inserting its replacement is mandatory while
`product_story_revisions_one_draft_per_product_idx` is active. Both operations remain in the same
transaction. PostgreSQL rollback restores the prior revision to `DRAFT` and preserves the original
pointer if validation, insertion, pointer update, audit insertion, or any later step fails. There
is therefore no committed or externally visible state with two `DRAFT` revisions, and no committed
state where `draft_revision_id` targets an `ARCHIVED` revision.

The browser receives only the identities and revision numbers required for optimistic concurrency.
Revision IDs are opaque concurrency tokens, not authorization evidence. The server re-derives
Product ownership for every use.

## 14. Publication Model

Publication targets one exact current draft; "publish latest" without an expected identity is
forbidden.

Inside one PostgreSQL transaction the service must:

1. acquire the mutation replay lock;
2. lock Product -> Story aggregate -> relevant revisions in that order;
3. derive and assert `catalog:publish` from the verified server session;
4. prove `draft_revision_id` equals the requested draft and belongs to the Product;
5. prove the expected published pointer still matches;
6. run strict document, media, related-product, and renderability validation again;
7. archive the old published revision if one exists;
8. set the target draft status to `PUBLISHED` and `published_at = NOW()`;
9. set the published pointer to that revision and clear the draft pointer;
10. update aggregate `updated_at` and append the audit replay marker.

The transaction either commits all lifecycle rows, the pointer, and the audit event or none. The
public reader therefore never observes a partially written document or a published pointer to a
not-yet-promoted draft.

Unpublish follows the same locking, expected-pointer, replay, and audit rules: archive the pointed
revision, set `published_revision_id = NULL`, and leave any independent draft pointer unchanged.

After commit, the Server Action revalidates the exact Admin Product/Story paths and the Product PDP
path derived from the authoritative Product slug. Cache invalidation is repeatable and does not
participate in the database transaction. If the response is lost after commit, replay of the same
operation ID returns the committed result and can repeat path revalidation safely.

## 15. Concurrency and Stale-Editor Protection

Every mutating input includes:

- `productId`;
- `expectedDraftRevisionId: string | null`;
- `expectedPublishedRevisionId: string | null` where relevant;
- complete normalized document for Save Draft;
- mandatory high-entropy `mutationRequestId`.

The service compares expected pointer identities under row lock with exact equality. This covers
the first-draft race because two editors may both load `null`, but only the first save can install a
draft pointer; the second sees a mismatch and receives `STORY_STALE_WRITE` (HTTP 409). It also
prevents an older draft from being published after a newer save.

For the first-draft path, `expectedDraftRevisionId` must be `null`. After locking the Product, the
service creates the missing aggregate with an idempotent insert and then locks/reads the canonical
aggregate row. The first fresh request inserts the first `DRAFT`, sets `draft_revision_id`, writes
the audit marker, and commits. A concurrent request that also began from `null` waits on the same
Product/aggregate serialization boundary, then observes the installed pointer and returns
`STORY_STALE_WRITE` without creating another revision. A committed retry of the winner is instead
resolved by the replay fast path before this pointer comparison.

Rules:

- no tolerance windows and no client clock comparisons;
- no last-write-wins behavior;
- no automatic merge of block arrays;
- no overwrite or publish after a stale conflict;
- local edits remain visible until the operator explicitly reloads/discards or reconciles them;
- the conflict response contains safe current revision metadata, never another actor's identity;
- the UI must disable repeat submission while a request is pending, but server correctness never
  depends on that client behavior.

## 16. Transaction, Crash-Safety, and Recovery Boundaries

- Save, discard, publish, and unpublish each use one direct PostgreSQL transaction.
- Lock order is deterministic: request-digest advisory lock, Product row, Story aggregate row, then
  revision rows. Initial aggregate creation is serialized by the Product row lock and uses
  insert-if-absent followed by a canonical `FOR UPDATE` read.
- For a replacement save, the exact active draft is archived before the new `DRAFT` insert so the
  partial unique index remains enforceable. The archive, insert, pointer swap, aggregate timestamp,
  and audit marker are one atomic unit.
- Block order and payload are one JSONB document insert; no partial block commit exists.
- Media is referenced only after relational validation; Story save performs no R2 write or network
  side effect.
- On validation, authorization, stale, FK, or audit failure, the complete transaction rolls back.
- Inserted revisions are never exposed by a pointer before commit.
- Process death before commit leaves no mutation. Process death or transport loss after commit is
  an ambiguous client result resolved by idempotent replay.
- Recovery never rewrites an old revision. The operator creates a new draft from retained history.
- Application rollback leaves additive schema and already written revisions intact; disable the
  writer rather than destructively reversing editorial data.

## 17. Idempotency, Retry, and Audit Contract

GP-026 reuses the catalog triage already established by GP-024:

- `mutationRequestId`: generated once per logical client operation and reused only for transport
  retry of the identical payload;
- `mutationRequestDigest`: SHA-256 of server actor identity, exact operation type, and request ID;
- `requestFingerprint`: SHA-256 of the strictly validated, canonical normalized business payload;
- PostgreSQL transaction advisory lock derived from the mutation digest;
- durable `audit_events` replay marker written with the domain mutation.

The raw request ID is not persisted or displayed. Story block copy may participate in the hash but
is not duplicated into audit metadata. Suggested actions are:

- `catalog:story:draft_save`;
- `catalog:story:draft_discard`;
- `catalog:story:publish`;
- `catalog:story:unpublish`.

Replay rules:

| Attempt                                           | Required result                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Same actor + operation + request ID + fingerprint | Return the exact committed target after integrity checks; zero new revision and zero new audit event. |
| Same digest + different fingerprint               | `CATALOG_IDEMPOTENCY_CONFLICT` (409); zero mutation.                                                  |
| Marker target missing or owned by another Product | `CATALOG_REPLAY_INTEGRITY_ERROR`; fail closed and alert operations.                                   |
| Different request ID against stale pointers       | `STORY_STALE_WRITE` (409); zero mutation.                                                             |
| Concurrent identical submissions                  | Advisory lock serializes them; exactly one mutation and audit event.                                  |

After the advisory lock and authoritative row locks are acquired, the replay lookup precedes the
fresh-request expected-pointer check and every archive, insert, pointer, or status mutation. A
committed same-digest/same-fingerprint Save Draft therefore returns its exact committed revision
even though the aggregate pointer has advanced beyond the request's original expected draft. It
performs zero archive operations, zero inserts, zero pointer/status changes, and zero new audit
events. A same-digest/different-fingerprint attempt returns `CATALOG_IDEMPOTENCY_CONFLICT` before
any mutation.

Audit metadata includes sanitized Product ID, revision numbers/IDs needed for integrity, prior and
new lifecycle state, block count, mutation digest, and fingerprint. It excludes auth/session data,
raw request IDs, storage credentials, signed URLs, and complete Story payloads.

## 18. Auth and RBAC Contract

Authorization remains permission based and fail closed.

| Capability                                                          | Required existing permission | Default canonical roles currently carrying it |
| ------------------------------------------------------------------- | ---------------------------- | --------------------------------------------- |
| Read draft/history metadata and open builder                        | `catalog:manage`             | `ADMIN_CATALOG`, `SUPER_ADMIN`                |
| Insert/edit/duplicate/delete/reorder locally and save/discard draft | `catalog:manage`             | `ADMIN_CATALOG`, `SUPER_ADMIN`                |
| Preview an unpublished draft                                        | `catalog:manage`             | `ADMIN_CATALOG`, `SUPER_ADMIN`                |
| Publish or unpublish Story                                          | `catalog:publish`            | `ADMIN_CATALOG`, `SUPER_ADMIN`                |

Roles are descriptive defaults, not service checks. Each Server Component, reader, action, and
domain service derives the verified identity and permission set through the canonical server-only
auth/RBAC path. It never accepts caller-supplied actor ID, auth user ID, role, permission, Product
ownership, or revision ownership as authority.

The standard four-state negative matrix applies: unauthenticated, authenticated without permission,
authorized, and cross-Product/IDOR attempt. Auth/RBAC resolution errors deny access. Browser-hidden
buttons are convenience only; the service is authoritative.

## 19. Media-Reference Contract

### Selection and storage decision

The owner-facing picker submits an existing `ProductMedia.id`, because that association proves which
Product currently owns the selectable asset. The server joins it to `MediaAsset`, revalidates
Product/Variant ownership, security class, media type, MIME, and public URL resolvability, then
persists the immutable `MediaAsset.objectKey` in the existing `mediaKey`, `posterKey`,
`videoKey`, or `blueprintMediaKey` payload field.

This split is intentional:

- the browser continues to receive only the already sanitized ProductMedia DTO and public URL, not
  a raw storage key;
- ProductMedia ID is never treated as authorization and is always resolved server-side;
- the persisted object key remains compatible with the current public validator and renderer;
- current canonical object keys are unique and content hashed, so a revision remains a presentation
  snapshot even if a ProductMedia association is later reordered;
- storing a MediaAsset UUID directly inside JSONB would not create a real FK and would require a new
  public resolution contract, while storing ProductMedia identity would make a historical revision
  depend on a mutable association.

### Allowed classes and types

| Story field                                                       | Required class | Media type and MIME                                                                                                          |
| ----------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `mediaKey`, `posterKey`, `blueprintMediaKey`, gallery/item images | `PUBLIC_MEDIA` | `IMAGE`; canonical WebP, PNG, or JPEG.                                                                                       |
| `videoKey`                                                        | `PUBLIC_MEDIA` | `VIDEO`; MP4 is the currently proven format. Additional formats require explicit renderer/browser tests before allowlisting. |
| Any Story field                                                   | Never private  | `DOCUMENT` and all private payment/instruction/backup classes are forbidden.                                                 |

Both global and variant-associated ProductMedia may be selected when they belong to the same
Product; the picker must visibly identify the variant because Story rendering itself is not
variant-reactive. Cross-Product media is rejected. Preview resolves the saved key only through
`resolvePublicMediaUrl`, exactly like the public renderer.

The GP-024 uploader is reused for images and remains the only upload system. It accepts JPEG, PNG,
WebP, and AVIF input and commits canonical public WebP. It does not currently upload video; GP-026
may select an already attached valid public MP4 but must not invent a second video uploader. Video
upload expansion requires separate storage/security scope.

No Story or ProductMedia hard-delete is added. Current `product_media.media_asset_id` uses
`ON DELETE RESTRICT`, and current operations retain the MediaAsset/R2 object when associations
change. Because Story object keys are unconstrained JSON references, any future physical media purge
must account for every draft, published, and archived Story before deletion.

## 20. Related-Product Reference Contract

- The primary Admin control is an explicit searchable Product selector, not free-form slug entry.
- The browser submits Product identity; the server rejects the current Product, duplicates, missing
  Products, and inaccessible values and persists the current canonical Product slugs required by
  the existing renderer.
- Publication requires every selected related Product to be publicly eligible. Preview uses the
  same public related-products reader and authored order.
- `categorySlugs` are accepted by the current payload validator but are deliberately not exposed in
  GP-026 because the current PDP does not hydrate them and the renderer omits category-only blocks.
  This is a verified current-contract discrepancy, not an Admin feature.
- A later Product slug change can make a stored related reference unresolved. The public renderer
  already omits it fail-closed. Identifier-stable related references are a documented follow-up and
  must not be silently introduced as a second schema in GP-026.

## 21. Preview Architecture

The chosen mechanism is an Admin-session-protected, server-rendered preview route using the actual
`ProductStoryRenderer`.

1. Preview targets a saved `revision` ID supplied only as an opaque selector.
2. The server derives the session, requires `catalog:manage`, loads the Product and exact revision,
   and verifies that it is the aggregate's current draft for the same Product.
3. It applies the strict authoring validator and then the existing public validated projection.
4. It hydrates related Products with the same public reader.
5. It renders the canonical Product Story component inside a labelled preview canvas and identifies
   the Product and revision as unpublished Admin preview.
6. The route is dynamic, private/no-store, `noindex,nofollow`, and covered by the existing
   same-origin framing policy. It may open in a named new tab; if embedded later, it must remain a
   same-origin titled iframe and offer a full-window link.
7. It accepts no Story payload in the URL, cookie, or browser storage and does not mutate any
   pointer.

A signed public token is unnecessary and less safe while the canonical Admin session is available.
An unsaved in-memory fake preview is rejected because it would create a second rendering path. The
type adapter needed to pass draft blocks to the renderer may narrow renderer props to the fields it
actually consumes, but it cannot change public markup, styling, behavior, or block semantics.

## 22. Validation and Error Presentation

### Save-time blockers

- malformed or unknown block/envelope/payload field;
- more than 30 blocks;
- duplicate block IDs;
- missing required copy or out-of-bound text/array/numeric values;
- non-contiguous order after server canonicalization failure;
- comparison row/header mismatch;
- missing, cross-Product, private, unsupported, or unresolvable media;
- missing or duplicate related Products.

### Publish-time additional blockers

- empty document;
- stale draft or published pointer;
- draft not current, not `DRAFT`, or owned by another Product;
- any reference that ceased to satisfy publication requirements;
- related Product no longer publicly eligible;
- any block that would be non-renderable under the canonical renderer.

Errors use typed codes and HTTP-equivalent semantics: authentication 401, authorization 403, not
found 404, stale/idempotency conflict 409, semantic validation 422, replay-integrity/infrastructure
failure 500. Server Actions return sanitized Spanish summaries plus structured field paths. They do
not expose SQL, table names, stack traces, object keys, storage configuration, or actor data.

## 23. Accessibility Requirements

- Preserve one PDP `h1`; Story content continues with the renderer's existing `h2`/`h3` hierarchy.
- Use semantic buttons, links, labels, fieldsets, legends, tables, lists, `details`, and status
  regions. Do not simulate controls with generic elements.
- Every form control has a visible label, help/error association, and non-color state indication.
- Block and nested-item controls include type, position, and item context in accessible names.
- All add, edit, reorder, duplicate, delete, save, preview, discard, publish, and unpublish flows are
  complete by keyboard. Dialogs trap focus, close with Escape where cancellation is safe, and
  restore focus to their triggers.
- Reorder announcements state the new position. Focus moves predictably after insertion/deletion.
- Touch targets are at least 44 by 44 px. At 360 px the page has no horizontal document overflow.
- Zoom/text resizing must not hide controls; comparison overflow remains within its labelled region.
- Validation summary and inline errors are programmatically associated and do not rely on toast
  disappearance.
- The canonical renderer's reduced-motion behavior, explicit video controls, alt fallbacks, native
  FAQ disclosure, and scrollable comparison region remain unchanged and are exercised in preview.
- Builder, dialogs, preview, and a published PDP pass the canonical axe WCAG 2.1 A/AA suite with
  zero violations.

## 24. SEO Implications

- Draft and preview routes are private, no-store, and `noindex,nofollow`; draft content cannot enter
  sitemap, canonical metadata, Open Graph, or public structured data.
- Only the committed published pointer affects the public PDP.
- The public Story renderer emits semantic text without an extra `h1` or raw HTML.
- Published FAQ blocks already feed `FAQPage` JSON-LD in authored document order through
  `buildProductStructuredData`; preview must not emit indexable structured data.
- Product title, description, canonical URL, Open Graph image, Product data, offers, and breadcrumb
  remain owned by the existing Product/PDP SEO path. GP-026 does not repurpose Story copy as product
  metadata.
- Publish/unpublish revalidates the exact PDP so visible FAQ content and JSON-LD change together.
- Related Products use valid internal product routes and public eligibility filters.

## 25. Performance Implications

- Public Story query and renderer behavior remain unchanged; GP-026 adds no public client bundle or
  per-block public query.
- Related Products remain one deduplicated hydration query per page.
- Admin loads only one active draft, published metadata, selector data, and bounded revision
  summaries; it does not transfer all historical JSON documents by default.
- The 30-block cap bounds form and mutation size. Repeatable nested arrays retain existing limits.
- No per-keystroke network autosave, R2 call, or preview rendering occurs.
- Block editors use stable IDs and localized state updates to avoid remounting the whole document.
- Media previews use sanitized public URLs and appropriately sized image delivery; the builder does
  not download source binaries.
- Preview reuses server rendering and current media behavior. Video remains metadata-preload and
  viewport/reduced-motion governed by the canonical component.
- CHK5 compares public PDP query count, bundle/build output, mobile overflow, and Web Vitals/LCP
  behavior against the baseline before closure.

## 26. Security Requirements

- All identity and authorization are derived server-side from verified canonical auth/session data.
- Direct Data API access remains revoked; privileged writes use the direct server database adapter.
- Product, revision, ProductMedia, MediaAsset, and related-Product ownership/existence are rechecked
  in the transaction; opaque IDs never convey authority.
- Only allowlisted discriminators and strict structured payloads are accepted. React-rendered plain
  text remains the only copy path; HTML/script/custom-code injection is rejected.
- Private media classes, signed upload tokens, raw storage keys, R2 credentials, DB details,
  request IDs, and other actor data never enter the browser Story DTO or error response.
- Mutation sizes and all nested arrays are bounded before expensive work.
- Publish revalidates the complete draft under lock; preview cannot alter public state.
- Audit metadata is minimal and sanitized. Logs carry operational codes and opaque IDs only.
- No AI provider, GP-025 research job, supplier-private data, EC OS data, price, stock, order,
  payment, or authorization source enters Story generation or persistence.

## 27. Schema and Migration Assessment

### Decision

An additive CHK1 migration is required before activating the writer. The current tables contain the
right revisioned document foundation, so no new domain table or mutable block table is justified.
However, application locks alone cannot make the active draft unambiguous or physically prevent a
cross-Product published pointer. Those are critical publication invariants.

### Exact proposed additive changes

1. Add nullable UUID `draft_revision_id` to `product_stories`.
2. Add `product_stories_draft_revision_fk` from `draft_revision_id` to
   `product_story_revisions.id` with `ON DELETE SET NULL`, matching current pointer retention
   behavior.
3. Add `product_story_revisions_product_id_id_unique` on
   `product_story_revisions(product_id, id)` to support ownership FKs.
4. Add `product_stories_published_revision_product_fk` from
   `(product_id, published_revision_id)` and `product_stories_draft_revision_product_fk` from
   `(product_id, draft_revision_id)` to `product_story_revisions(product_id, id)`, both with
   `ON DELETE NO ACTION`. Keep the current single-ID published FK and the new single-ID draft FK so a
   direct revision deletion clears the applicable nullable pointer; the composite constraints add
   same-Product ownership.
5. Add `product_stories_distinct_revision_pointers` checking that non-null draft and published
   pointers are different.
6. Add partial unique indexes `product_story_revisions_one_draft_per_product_idx` and
   `product_story_revisions_one_published_per_product_idx` on `product_id` where status is `DRAFT`
   and `PUBLISHED`, respectively.
7. Keep the existing `(product_id, revision_number)` unique constraint and
   `(product_id, status)` index. The unique revision index supports backward max/ordered scans.

Pointer target status is still asserted by services and readers because a standard SQL check cannot
reference another row. The public reader's same-Product/status/timestamp guards remain defense in
depth.

### Preflight and backfill

The CHK1 migration must abort with an explicit diagnostic before DDL if any of these exist:

- cross-Product published pointer;
- published pointer to non-`PUBLISHED` revision or null `published_at`;
- more than one `DRAFT` or more than one `PUBLISHED` revision for a Product.

No automatic guess may choose among conflicting revisions. After a clean audit, create a
`product_stories` aggregate for any Product that has revisions but lacks one, and backfill
`draft_revision_id` only where exactly one DRAFT exists. Existing blocks, revision numbers,
publication timestamps, and published pointers are not rewritten.

### Deployment and rollback

1. Change the Drizzle schema and generate the next canonical migration during CHK1 only.
2. Review generated SQL and snapshot/journal changes; custom partial indexes or preflight SQL must
   be deliberate and tested.
3. Apply only with `pnpm db:migrate` before deploying Story write actions.
4. Old runtime safely ignores the nullable column, so schema-first deployment is compatible.
5. On application rollback, retain the additive schema and editorial rows; disable the new writer.
   Destructive down migration is not the recovery plan.
6. Verify Product cascade deletion, pointer constraints, clean-database migration, and upgraded-data
   migration in integration tests.

No migration, schema file, SQL, snapshot, journal, or hosted database is changed in CHK0. The next
filename is assigned only when CHK1 is authorized; CHK0 does not create or reserve migration 0014.

## 28. Current Test Protection and GP-026 Test Strategy

### Existing protection discovered

| Suite                                                                     | Current evidence                                                                                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog-product-detail-migration.test.ts` and `catalog-schema.test.ts`   | Current tables, columns, checks, FK names, unique revision number, and indexes.                                                                                 |
| `data-api-hardening-migration.test.ts`                                    | Story tables are not directly available through Supabase Data API roles.                                                                                        |
| `catalog-product-detail-reader.test.ts`                                   | Published-only participation, no draft fallback, cross-Product omission, all 13 types, bounds, HTML rejection, malformed/oversized failure.                     |
| `product-story-blocks.test.tsx`                                           | Every block component, media fallbacks, exact comparison width behavior, related-product fail-closed behavior, alt helpers, and reduced-motion/video decisions. |
| `product-story-renderer.test.tsx`                                         | Empty omission, canonical order, all 13 dispatches, no Story `h1`, media fallback, and related-reader isolation.                                                |
| `product-seo.test.ts`                                                     | `FAQPage` omission and exact visible Story FAQ projection into JSON-LD.                                                                                         |
| `product-story.spec.ts`                                                   | Complete public Story, one `h1`, FAQ, video keyboard/control and motion behavior, related products, 360 px overflow, axe, and Product Hero coexistence.         |
| `product-visual-qa.spec.ts`                                               | Desktop/mobile Story compositions and reduced-motion visual evidence.                                                                                           |
| `admin-product-manager.spec.ts` and Admin catalog unit/integration suites | Reusable auth, stale conflict, idempotency, dialog focus, media security, reorder, mobile, and lifecycle patterns.                                              |

There are no current tests for Admin Story authoring, draft selection, Story writes, or publication.

### Required new tests

**Unit**

- strict write schemas for every block and every boundary;
- unknown keys, whitespace-only required copy, duplicate IDs, 30/31 blocks, canonical order;
- exact comparison widths, empty draft versus publish, media field/type matrix;
- authoring-to-persisted canonicalization and sanitized DTO/error mapping;
- request digest/fingerprint stability and payload-change conflict.

**Database integration**

- clean and upgrade migration, draft/published uniqueness, same-Product composite pointers, and
  Product cascade behavior;
- first save, successive immutable saves, discard, publish, republish, and unpublish;
- replacement save with the partial unique index active: the exact old `DRAFT` becomes `ARCHIVED`,
  exactly one new `DRAFT` commits, and `draft_revision_id` targets that new revision;
- fault after old-draft archival but before commit: rollback restores the old `DRAFT`, preserves the
  prior pointer, and persists no replacement revision or audit marker;
- two-editor concurrent first save and concurrent saves from the same expected draft: exactly one
  winner and one replacement revision; the loser returns `STORY_STALE_WRITE`;
- idempotent retry of the winning save: no additional revision, lifecycle transition, pointer
  mutation, or audit event;
- every replacement, rollback, concurrency, and replay scenario must execute with
  `product_story_revisions_one_draft_per_product_idx` physically present and verified, not mocked;
- stale draft publish after a newer save: zero lifecycle change;
- same-request sequential/concurrent replay: one revision and one audit event;
- same ID/different payload conflict and broken replay marker integrity failure;
- fault injection before each pointer/audit step proves full rollback;
- unauthenticated, insufficient permission, authorized, cross-Product revision, and cross-Product
  media matrices;
- private/wrong-type/unattached media, related-product eligibility, and no R2 operations during
  Story save/publish.

**E2E and visual**

- Product-level entry, empty state, add/edit/duplicate/delete/reorder/save flows;
- structured editors for all 13 types and exact validation focus behavior;
- protected saved-draft preview with the canonical renderer and public-inaccessible negative case;
- publish/unpublish permission UX and durable public PDP change;
- stale conflict across two browser contexts without overwrite;
- dirty-navigation confirmation and retry after an ambiguous response;
- keyboard-only block/nested-item ordering and all dialog focus contracts;
- 360 px and tablet layouts, zero overflow, axe zero violations, reduced motion;
- published PDP regression, FAQ JSON-LD parity, related products, and existing visual baselines.

Each implementation checkpoint runs its focused tests plus `pnpm format:check`,
`git diff --check`, and the applicable static gates. Final closure requires the full canonical
`pnpm check`, `pnpm test:e2e`, `pnpm ignored-builds`, and actual successful CI evidence with zero
warnings.

## 29. Explicit Out of Scope

- AI-generated or autonomous Story creation, suggestions, or publication.
- GP-025 research orchestration, proposals, acquisition, Gemini/Tavily/Inngest, or import logic.
- Arbitrary HTML, Markdown rendering, JavaScript, CSS, code, or unrestricted JSON authoring.
- Storefront, PDP, ProductCard, homepage, navigation, or WLMOUSE visual redesign.
- A duplicate Admin/public Story renderer.
- A new media upload system, video transcoding pipeline, or private-media exposure.
- Story-aware variant switching in the public renderer.
- Product price, stock, order, payment, authorization, or supplier data changes.
- Product hard delete, Story hard delete, revision purge, MediaAsset purge, or R2 garbage collection.
- Automatic Story copy on Product duplication; GP-024's duplicate remains Story-free.
- `categorySlugs` authoring while that current public path remains nonfunctional.
- Schema push, manual hosted SQL, hosted configuration, deployment, or production mutation in CHK0.
- GP-026 closure or GP-027 work.

## 30. Linear Implementation Checkpoint Plan

| Gate | Exclusive ownership                                                                                                                                                                                | Exit evidence                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| CHK0 | Fresh discovery and this contract candidate only                                                                                                                                                   | Documentation-only candidate externally reviewed and frozen before code.                                    |
| CHK1 | Additive Story aggregate migration; strict write validators; Admin Story reader/DTO; transactional save/discard/publish/unpublish services and actions; audit/replay/concurrency integration tests | Physical invariants and all service safety matrices pass. No builder UI ownership.                          |
| CHK2 | Product-level entry; focused builder shell; status/dirty/conflict state; add/delete/duplicate/reorder document controls; draft save/discard UX                                                     | Bounded structured document shell and draft lifecycle work accessibly. No preview or public publication UX. |
| CHK3 | All 13 block-specific structured editors; repeatable nested controls; ProductMedia and explicit related-Product selectors                                                                          | Every canonical payload is authorable without JSON/code and strict validation/media tests pass.             |
| CHK4 | Protected saved-draft preview; publish/unpublish controls; exact permission UX; publish-time validation; Admin/PDP revalidation and SEO parity                                                     | Preview uses the real renderer, stale publish is impossible, and public pointer changes atomically.         |
| CHK5 | Full unit/integration/E2E/visual/security/accessibility/performance regression, operational evidence, final documentation, and closure candidate                                                   | Canonical gates and actual CI pass; closure is externally reviewed before main integration.                 |

Later gates reuse CHK1 services and CHK2 document state; they must not introduce alternative
persistence, auth, preview, media, or renderer systems. Every gate stops at its own candidate and
external approval boundary.

## 31. Acceptance Criteria

- [ ] An authorized operator reaches a focused Product-level Story Builder from Product Manager.
- [ ] All 13 canonical blocks are authorable through structured controls with current exact bounds.
- [ ] Blocks can be inserted, duplicated with a new identity, deleted, and ordered accessibly.
- [ ] One explicit save commits one complete immutable draft revision and contiguous order.
- [ ] Empty drafts are retained but cannot be published.
- [ ] Draft and published identities are explicit and same-Product constrained.
- [ ] Two editors cannot silently overwrite or publish stale work.
- [ ] Retry/duplicate submission produces one revision/lifecycle change and one audit event.
- [ ] Publication/unpublication is atomic, audited, recoverable, and uses the exact expected pointer.
- [ ] `catalog:manage` and `catalog:publish` are enforced server-side at their defined boundaries.
- [ ] Only authorized same-Product `PUBLIC_MEDIA` reaches persisted Story keys and preview/public URLs.
- [ ] Preview is private, no-store/noindex, non-mutating, and uses the canonical renderer.
- [ ] Public presentation, SEO semantics, accessibility, reduced motion, and related-product behavior
      remain compatible with the current storefront.
- [ ] No arbitrary HTML/code/JSON authoring, AI Story generation, or parallel upload/auth/rendering
      system exists.
- [ ] Focused and full canonical tests pass with zero warnings, and closure evidence is complete.

## 32. Known Data Gaps and Material Risks

1. **No current draft identity:** status alone permits multiple drafts. CHK1's pointer and uniqueness
   constraints are a writer activation prerequisite.
2. **Cross-Product published FK gap:** the current reader detects it, but the database permits it.
   Composite ownership FKs are required before publication writes.
3. **Tolerant validator:** unknown payload keys are stripped and invalid blocks are dropped; strict
   authoring validation must reject the complete write instead.
4. **Order ambiguity:** duplicate IDs/orders and gaps currently validate. GP-026 writes canonical
   IDs/order and never depends on tolerant sort stability.
5. **Comparison mismatch:** payload validation allows row width different from header width while
   the renderer silently drops such rows. The builder blocks this before save.
6. **Category-related discrepancy:** `categorySlugs` validate but are not hydrated/rendered. GP-026
   exposes only explicit Product selection.
7. **Slug-based related identity:** later slug edits can break a reference. Current fail-closed
   omission remains; identifier-stable redesign is a follow-up requiring separate approval.
8. **Unconstrained media JSON:** stored object keys have no relational FK. Current no-hard-delete and
   retention rules protect them; future purge must be Story-aware.
9. **Video acquisition gap:** schema/renderer support VIDEO and MP4 fixtures, but the current Admin
   uploader is image-only. GP-026 can reuse existing attached MP4 only.
10. **Preview type coupling:** current renderer props use `ProductStoryDetail` with published
    metadata even though rendering consumes blocks. A nonvisual type narrowing may be required; no
    renderer presentation change is authorized.
11. **No existing Admin Story implementation:** every write/preview behavior in this contract is new
    future work and must earn its own checkpoint evidence.

None of these gaps is repaired in CHK0.

## 33. Historical-Candidate Authority Boundary

- `audit/gp026-chk0` is historical exploration with zero implementation authority.
- `audit/gp026-chk0-br1` is historical exploration with zero implementation authority.
- Candidate `e239298b01e6b0eb409118dc6b5e31c1ce75b9ae` is not frozen and has zero
  implementation authority.
- No branch, commit, assumption, contract, or code from those candidates may be merged,
  cherry-picked, copied blindly, or used to bypass current-main verification.
- This fresh candidate was derived directly from baseline
  `672222b098aff8713be902ef2173f9c13e761e35` and must itself receive external approval before
  becoming binding.

## 34. GP-026A Supersession Boundary

GP-026A is `CANCELLED / SUPERSEDED BY OWNER DECISION / HISTORICAL ONLY`.

GP-026A-CONTRACT is `SUPERSEDED / HISTORICAL ONLY / NOT IMPLEMENTATION AUTHORITY`. GP-026A CHK1
through CHK6, WLMOUSE high-fidelity convergence, and its rejected/unmerged runtime candidate do not
guide this implementation. The existing Gamer Peru storefront and current Product Story public
presentation remain authoritative.

GP-026 stays a manual Admin Product Story Builder. AI Story generation remains out of scope unless
the owner authorizes it in a future independent gate.

## 35. Contract Freeze Conditions

This candidate can be frozen only after external review confirms:

- the exact baseline and current-code evidence;
- the 13-block payload and renderer matrices;
- the active-draft and same-Product pointer migration decision;
- immutable document revisions, exact expected-pointer concurrency, and replay model;
- permission, media, preview, SEO, accessibility, and checkpoint boundaries;
- every risk and explicit exclusion above.

External approval freezes decisions, not completion. It authorizes only the next separately assigned
checkpoint and does not close GP-026.

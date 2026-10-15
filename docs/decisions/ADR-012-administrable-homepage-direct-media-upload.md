# ADR-012 — Administrable Homepage and Direct-to-R2 Media Upload

## Status

ACCEPTED — 2026-10-15 (approved by the owner, including the `home_sections` and
`home_section_media` table design). Extends [ADR-004](ADR-004-storage-media-pipeline.md) (media pipeline) and
operates within [ADR-010](ADR-010-storefront-catalog-caching.md) (caching) and
[ADR-011](ADR-011-cloudflare-workers-hosting.md) (Workers hosting). Implemented by
[GP-053](../roadmap/GP-053.md).

## Context

The storefront home (`src/app/(storefront)/page.tsx`) is hardcoded:

- Two YouTube embeds with fixed video ids (`VideoHero`, `FeatureVideo`). Besides being
  unchangeable without a deploy, the embeds pull Google Fonts and player assets from third-party
  origins on every home view.
- Every eyebrow, title, description, feature list and CTA is a literal in the page.
- Seven images are expected under `public/images/home/` and are missing, so those requests
  return 400 and the blocks render empty backgrounds.
- Changing the order of the blocks or hiding one requires a code change and a deploy.

Admin is a first-class product surface (`AGENTS.md`): the operator must be able to run the home
the same way they already run products, stories and the menu (`storefront_menu_entries`).

The media constraints come from the hosting decision:

- Workers Free allows 10 ms CPU per request. Reading, hashing and transforming multi-megabyte
  bodies inside the Worker has already produced `Error 1102` / 503 on heavy uploads.
- Story images already avoid the Worker: the browser `PUT`s to a presigned URL at the final key
  and the server confirms with a `HEAD` (`src/lib/admin/catalog/story-media-service.ts`).
- Gallery photos still use the ADR-004 staging pipeline: presigned `PUT` to
  `CATALOG_STAGING`, then `finalizeCatalogMediaUpload` reads the bytes in the Worker, normalizes
  to WebP through the `IMAGES` binding, hashes them and writes a content-addressed key. Since
  2026-10-15 the browser compresses gallery photos to 2000 px WebP before uploading
  (`src/lib/media/compress-image.ts`), which reduces but does not remove that CPU cost.
- `media_assets.media_type` already supports `VIDEO`; nothing uploads videos yet.

## Decision Drivers

- The operator edits text, images, videos, order and visibility of the home without a deploy.
- No byte of an upload is read inside the Worker (CPU budget).
- Only validated, typed content reaches the storefront; an invalid section can never break the
  home.
- The home keeps its current visual language and its sections; this is not a redesign.
- Every privileged write is authorized and validated server-side and audited.
- No new unbounded cost: Cloudflare Images transformations (5,000/month free) and page weight.

## Options Considered

### Home content storage

1. **Section rows with a typed JSONB payload (chosen).** One row per section: type, order,
   visibility, `content` JSONB validated by a Zod schema per type. Mirrors Product Story blocks,
   which already validate per-type payloads (`src/lib/catalog/story-validation.ts`).
2. **One normalized table per section type.** Strong column typing, but nine tables and
   migrations for every new field; order and visibility would live in a tenth table.
3. **A single JSON document for the whole home.** Simplest to store, but every edit rewrites
   everything, concurrent edits to different sections conflict, and per-section audit is lost.
4. **External headless CMS.** Adds a vendor, credentials and a second source of truth; violates
   the independence goal for a single page.

### Editing lifecycle

1. **Live sections with optimistic concurrency, confirmation and audit (chosen).** Each save
   is validated and published immediately; destructive or visibility changes require a
   confirmation that previews the result; every write records the previous content in the audit
   event so it can be restored.
2. **Draft / publish revisions per home (Product Story model).** Safest, but doubles the data
   model and UI for a page with nine sections edited by one operator. Can be added later
   without changing the section table (a `draft_content` column or a revisions table).

### Media upload

1. **Direct-to-R2 upload with `HEAD` confirmation for home images and videos (chosen), and the
   same mechanism extracted into a shared service.**
2. **Route home media through the gallery staging pipeline.** Rejected: the Worker would read
   video bodies, which is impossible within 10 ms CPU.
3. **Keep YouTube as the only video source.** Rejected as the default: third-party requests on
   the most visited page and no control over the asset. Retained only as an optional source so
   the current videos keep playing until the operator uploads replacements.

### Gallery pipeline (evaluated as requested)

1. **Migrate gallery photos to direct upload + `HEAD` (chosen as target, separate checkpoint).**
2. **Keep the staging + Worker normalization pipeline.** Keeps server-side guarantees but keeps
   the CPU risk on every gallery upload.

## Decision

### 1. `home_sections` table

```sql
CREATE TYPE home_section_type AS ENUM (
  'video_hero', 'product_carousel', 'feature_video', 'split_showcase', 'compare_slider',
  'catalog_rail', 'bento_showcase', 'community_banner', 'trust_strip'
);

CREATE TABLE home_sections (
  id                      uuid PRIMARY KEY,                  -- UUIDv7 from the app
  section_type            home_section_type NOT NULL,
  display_order           integer NOT NULL,
  is_visible              boolean NOT NULL DEFAULT true,
  content                 jsonb NOT NULL,
  content_schema_version  smallint NOT NULL DEFAULT 1,
  version                 integer NOT NULL DEFAULT 1,        -- optimistic concurrency
  updated_by_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_sections_display_order_check CHECK (display_order >= 0),
  CONSTRAINT home_sections_version_positive CHECK (version > 0),
  CONSTRAINT home_sections_content_object CHECK (jsonb_typeof(content) = 'object')
);

CREATE INDEX home_sections_order_idx ON home_sections (display_order, id);
-- The hero is a full-viewport stage pinned under the store layer: at most one may exist.
CREATE UNIQUE INDEX home_sections_single_hero_idx ON home_sections (section_type)
  WHERE section_type = 'video_hero';
```

Invariants (enforced by the service; the database enforces what it can):

- `content` must parse with the Zod schema for `section_type` at `content_schema_version`. The
  storefront re-parses on read and **skips** (and logs) a section that fails, so one bad row
  never breaks the home.
- Order is dense (`0..n-1`) after every write; reorders run in one transaction under an
  advisory lock, the same pattern used for `product_media`. `display_order` is not unique so a
  reorder does not need deferred constraints.
- The `video_hero` section, when present, always renders first; its `display_order` is fixed
  at `0`.
- Every mutation carries `expectedVersion`; a mismatch returns a conflict instead of
  overwriting another session's edit, and a successful write increments `version`.
- Multiple sections of the same type are allowed (for example two catalog rails), except the
  hero.

### 2. `home_section_media` table (media references)

```sql
CREATE TABLE home_section_media (
  section_id     uuid NOT NULL REFERENCES home_sections(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  slot           varchar(64) NOT NULL,   -- path inside content, e.g. 'image', 'images.2', 'poster'
  PRIMARY KEY (section_id, slot)
);
CREATE INDEX home_section_media_asset_idx ON home_section_media (media_asset_id);
```

Payloads reference media by `media_asset_id`, never by raw URL or object key. On every save the
service validates that each referenced asset exists, is `PUBLIC_MEDIA`, has the media type the
slot requires, and rewrites this table to match the payload in the same transaction. This gives
referential integrity (an asset used on the home cannot be deleted) and an exact list of home
media for orphan cleanup.

### 3. Section payloads (v1)

| Type               | Editable content                                                                     | Media                          |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------ |
| `video_hero`       | H1 heading (SEO), scroll hint label, video source                                    | video + poster (or YouTube id) |
| `product_carousel` | eyebrow, title, product source (showcase / category slug), max items                 | none (catalog)                 |
| `feature_video`    | eyebrow, title, subtitle, CTA label + internal href, video source                    | video + poster (or YouTube id) |
| `split_showcase`   | eyebrow, title, 1–4 features (title + description)                                   | 1 image + alt                  |
| `compare_slider`   | eyebrow, title, left/right kicker + name                                             | 2 images + alt                 |
| `catalog_rail`     | eyebrow, title, category slug, "see all" label                                       | none (catalog)                 |
| `bento_showcase`   | two-line title, description                                                          | 3 images + alt                 |
| `community_banner` | eyebrow, two-line title, description, CTA label, CTA href (https, allowlisted hosts) | 1 background image + alt       |
| `trust_strip`      | 1–4 items: icon (enum), title, description                                           | none                           |

Text fields reuse the Product Story `SafeString` rules (length bounds, no HTML). Internal links
must be relative paths; external links must be `https` on an allowlist (Discord, WhatsApp,
social profiles). Catalog-driven sections only store a source; products, prices and stock are
always read from the catalog at render time (AI and editors are never the source of truth for
price or stock). Every image slot requires alt text; decorative images are marked explicitly.

### 4. Shared direct upload (`direct-media-upload`)

The story flow is extracted into one service used by Product Stories, the home and (later) the
gallery:

1. **Request** (`catalog:manage`): the server checks MIME type and declared size against the
   purpose's policy, creates the final key, and returns a presigned `PUT` (expiry ≤ 15 min,
   `Content-Type` signed) plus an HMAC upload token binding actor, purpose, key, MIME and expiry.
2. **Upload**: the browser `PUT`s directly to the public bucket. No bytes pass through the
   Worker.
3. **Confirm**: the server verifies the token and actor, then issues a `HEAD`. If the object is
   missing, larger than the policy allows, or its `Content-Type` differs from the signed one,
   the object is deleted and the upload rejected. Otherwise one `media_assets` row is inserted
   (idempotent on `object_key`) and an audit event recorded.

Upload policies:

| Purpose             | MIME                  | Max size | Key                                    | Client preparation      |
| ------------------- | --------------------- | -------- | -------------------------------------- | ----------------------- |
| `story_image`       | JPEG, PNG, WebP       | 10 MB    | `products/{brand}/{slug}/story/{uuid}` | WebP, 2560 px           |
| `home_image`        | JPEG, PNG, WebP       | 10 MB    | `home/images/{uuid}`                   | WebP, 2560 px           |
| `home_video`        | MP4 (H.264/AAC), WebM | 25 MB    | `home/videos/{uuid}`                   | none (operator exports) |
| `home_video_poster` | JPEG, WebP            | 2 MB     | `home/posters/{uuid}`                  | WebP, 1920 px           |

Keys are UUIDv7 rather than content hashes because the Worker never sees the bytes. Objects are
written with `Cache-Control: public, max-age=31536000, immutable`; replacing media always
creates a new key, so caches never serve stale content. Videos are served directly from
`cdn.gamerperu.com` (R2 public bucket, HTTP range requests) and never go through image
transformations. The browser measures width, height and duration before uploading; they are
stored as advisory metadata only.

Video rendering rules: `muted`, `playsinline`, `loop`, `preload="metadata"`, the poster is the
LCP candidate, and the video does not autoplay under `prefers-reduced-motion` or on
`Save-Data`, where only the poster is shown with a play control.

### 5. Admin `/admin/home`

Protected by `catalog:manage` (no new permission; the same operators already run catalog,
stories and menu). The editor:

- lists sections in order with a wireframe thumbnail per type (same visual language as the
  Product Story builder wireframes), drag and keyboard reorder, and a visibility toggle;
- edits a section in a form generated from its schema, with inline validation that mirrors the
  server schema;
- requires a confirmation dialog that previews the resulting home outline before hiding or
  deleting a section; deleting keeps the media assets (they become orphans eligible for
  explicit cleanup, never deleted automatically);
- shows a rendered preview of the edited section before saving.

### 6. Storefront read path and caching

The home reads visible sections ordered by `display_order` through `unstable_cache` with a new
tag `storefront-home` (ADR-010 pattern) and keeps `revalidate = 300`. Every admin write calls
`revalidateTag("storefront-home")`. If the table is empty or unreachable, the home renders the
declared default sections from configuration (fail-soft, as the navigation already does), so a
database outage never produces an empty home. In `e2e-fixture` mode the home uses those
defaults and never reads the connected database.

### 7. Seed

A migration seeds the nine current sections with today's literal content, preserving order. The
two video sections are seeded with their current YouTube ids, so the home is visually unchanged
on the day of the migration. The seven missing images are seeded as empty slots; sections with
an empty required image render their existing empty background until the operator uploads
one.

### 8. Gallery migration to direct upload (separate checkpoint)

Target: gallery photos use `direct-media-upload` with purpose `gallery_image`, removing the
Worker read/transform step. Required safeguards before switching:

- the client always re-encodes (no "keep original if smaller" shortcut), which strips EXIF and
  GPS metadata and applies orientation in the browser;
- WebP only, 2000 px max, 4 MB max for the uploaded object;
- `checksum_sha256` stays `NULL` for new rows (the column is already nullable) and dedupe by
  content hash is dropped;
- the existing gallery services (alt text, reorder, primary, variant assignment, detach) are
  unchanged; only intent/finalize are replaced;
- the staging bucket and `finalizeCatalogMediaUpload` remain until all callers are migrated,
  then are removed in the same checkpoint.

This keeps ADR-004's decisions on buckets, public domain and immutable keys, and supersedes
only its "server-side normalization" step for catalog images.

## Consequences

- **Positive:** the operator runs the home without deploys; no upload bytes touch the Worker;
  one upload mechanism for stories, home and gallery; the home stops depending on YouTube once
  videos are uploaded; missing images become an admin task instead of 400s.
- **Negative:** content correctness moves from code review to schema validation; uploaded
  images are no longer normalized server-side (the client is trusted to prepare them, and only
  type and size are verified); without content hashes identical uploads are stored twice;
  self-hosted video adds page weight that must be capped (25 MB, poster-first loading).
- **Operational:** orphaned home media accumulate when sections are deleted or media replaced;
  cleanup is an explicit, operator-confirmed action (never automatic) planned with the existing
  orphan backlog.

## Security / SEO / Performance Impact

- **Security:** all writes require `catalog:manage` server-side; upload tokens are HMAC-signed,
  actor-bound and short-lived; the `HEAD` check rejects objects whose size or type differ from
  what was signed; payloads are schema-validated and text is HTML-free; external links are
  allowlisted; no new secrets reach the browser (presigned URLs are single-object, single-verb
  and expire).
- **SEO:** the page keeps one H1, now editable but required and bounded; alt text is required
  for every non-decorative image; removing third-party embeds from the default path improves
  crawlability and Core Web Vitals.
- **Performance:** one cached read per 300 s for the whole home; poster-first video with
  `preload="metadata"`; images keep going through `next/image` presets (ADR-004 transformation
  budget unchanged); videos bypass transformations.

## Migration / Reversal

- **Forward:** migration creates the enum, both tables and the seed; the page switches to the
  section reader; old literals move into the seed and default configuration.
- **Reversal:** the default configuration is the previous page content, so dropping the
  section reader restores today's home without data loss; uploaded media stay in R2 and
  `media_assets`. Reverting the gallery checkpoint restores the staging pipeline, which is kept
  until that checkpoint closes.

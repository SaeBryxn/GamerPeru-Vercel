# ADR-013 — Product Gallery Direct Upload

## Status

ACCEPTED — 2026-10-15 (approved by the owner). Details the gallery migration accepted as a target in
[ADR-012 §8](ADR-012-administrable-homepage-direct-media-upload.md). Supersedes only the
server-side normalization step of [ADR-004](ADR-004-storage-media-pipeline.md) for catalog
gallery photos; buckets, public domain and immutable keys from ADR-004 stay as they are.
Implemented by GP-055.

## Context

Gallery photos still use the ADR-004 staging pipeline:

1. `requestCatalogMediaUploadIntent` signs a PUT to the **staging** bucket (`CATALOG_STAGING`).
2. The browser uploads (since 2026-10-15, compressed to 2000 px WebP first).
3. `finalizeCatalogMediaUpload` runs in the Worker: reads the object (bounded), decodes and
   re-encodes it to WebP through the `IMAGES` binding (`image-normalizer.ts`), hashes it, writes
   `products/{brand}/{slug}/{sha256}.webp` with `putObjectIfNotExists`, re-reads on collision to
   compare hashes, then inserts `media_assets` + `product_media` + audit under two advisory locks,
   with replay detection by `mutation_request_digest` and `media_intent_digest`.

Step 3 moves the whole image through the Worker (read, hash, transform, write). On Workers
Free (10 ms CPU) this is the path that produced `Error 1102`. Story images (GP-026) and home media
(GP-053) already avoid it with the shared direct upload (`direct-upload-service.ts`): presigned
PUT to the final key with signed `Content-Type`, `Cache-Control` and exact `Content-Length`, then
a `HEAD` check before registering.

## Decision Drivers

- No image byte is read, hashed or transformed inside the Worker.
- Photos published to the storefront carry no EXIF/GPS metadata and are upright.
- Existing gallery behavior (variant assignment, ordering, primary photo, alt text, detach,
  publish readiness, storefront cache invalidation) is unchanged for the operator.
- One upload mechanism for stories, home and gallery.

## Options Considered

1. **Shared direct upload with mandatory browser re-encode (chosen).**
2. **Keep staging, move normalization to a queue/consumer Worker.** Still pays CPU (on Workers
   Paid or a separate budget), adds a queue and asynchronous "processing" states to the editor.
3. **Keep the current pipeline.** Keeps server-side guarantees, keeps the CPU risk on every upload.

## Decision

- **Purpose `gallery_image`** in `direct-upload-policy.ts`: WebP or JPEG, at most **4 MB** after
  preparation, longest side **2000 px**, final key `products/{brand}/{slug}/{uuidv7}.{ext}`.
- **Mandatory re-encode in the browser.** `compressImageForUpload` gets an option to always
  re-encode (never return the original file). Drawing through a canvas drops EXIF/GPS and other
  metadata, and `createImageBitmap` applies EXIF orientation, so the result is upright. WebP is
  preferred; a browser without a WebP encoder gets JPEG, painted over a white background so PNG
  transparency does not turn black.
- **Token binds the variant.** The direct-upload token gains an optional `variantId`, checked
  against the product when signing; the confirm step attaches the photo to that variant or as
  global.
- **Confirm = shared verification + gallery attach.** `verifyDirectUpload` (signature, purpose,
  actor, `HEAD` type and exact length; mismatches deleted) and `registerDirectUploadAsset`, then in
  one transaction under the existing product advisory lock: insert `product_media`
  (`GALLERY`, next display order, variant), audit `catalog:media:attach` (with
  `upload: "direct"` and the operator's `mutation_request_id`), and the same storefront cache
  invalidation as today. Retries are idempotent on the object key: a repeated confirm returns the
  existing attachment.
- **Data.** `checksum_sha256` is `NULL` for new rows (the column is nullable); existing assets and
  their content-hashed keys are untouched. No migration.
- **Removal, once the editor uses the new flow:** `requestCatalogMediaUploadIntent`,
  `finalizeCatalogMediaUpload`, `image-normalizer.ts`, the catalog use of the `IMAGES` binding, the
  finalization retry state in the editor, and staging-bucket code paths. The staging bucket
  itself is emptied and deleted by the owner afterwards (not automated).

## Consequences

- **Positive:** gallery uploads stop being the CPU risk on Workers Free; one upload path for every
  admin media; simpler editor (no finalize/retry state machine).
- **Negative:** the server no longer decodes the image, so it cannot prove the bytes are a valid
  image beyond the signed type and length (uploaders are trusted `catalog:manage` staff, objects
  are served with their signed image type); identical photos uploaded twice are stored twice;
  output quality depends on the browser encoder.
- **Unchanged:** storefront delivery and `next/image` transformations, publish readiness,
  primary/variant/alt/order/detach services.

## Security / SEO / Performance Impact

- **Security:** server-side `catalog:manage` on sign and confirm; actor-, purpose- and
  variant-bound HMAC tokens; signed exact length and type; `HEAD` verification with deletion on
  mismatch; metadata stripped before upload.
- **SEO:** none (same public URLs pattern, alt text flow unchanged).
- **Performance:** confirm does one `HEAD` and a few small writes; upload time bounded by the
  4 MB limit; display unchanged.

## Migration / Reversal

Code-only. The old services stay until the new flow is verified in production, then are removed
in the same GP. Reverting restores the staging pipeline from version control; assets uploaded
with the new flow remain valid (`media_assets` rows with `NULL` checksum).

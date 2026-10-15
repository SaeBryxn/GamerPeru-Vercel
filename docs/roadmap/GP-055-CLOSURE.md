# GP-055 — Closure Report

## Base Checkpoint

`09b77c6` on `feat/cloudflare-workers` (ADR-013 accepted, GP-055 opened).

## Closure Checkpoint

The GP-055 commit that adds this report on `feat/cloudflare-workers` (not pushed).

## Summary

Product gallery photos now use the shared direct upload (ADR-013). The browser always
re-encodes the photo (no EXIF/GPS, upright, at most 2000 px, WebP or a JPEG fallback over
white), the server signs a PUT to `products/{brand}/{slug}/{uuidv7}.{ext}` binding product,
variant, type, caching and exact length, and the confirm step checks the stored object with a
`HEAD` and attaches it to the gallery. The staging pipeline (Worker read, Cloudflare Images
normalization, hashing, content-addressed write, finalization retries) is removed.

## Files Changed

- `src/lib/media/direct-upload-policy.ts` — `gallery_image` (WebP/JPEG, 4 MB, 2000 px,
  `alwaysReencode`).
- `src/lib/media/compress-image.ts` — `alwaysReencode`: decodes with EXIF orientation, never
  returns the original, JPEG fallback painted over white, `ImagePreparationError` when the
  browser cannot decode or encode.
- `src/lib/media/direct-upload-client.ts` — re-encoded purposes check the prepared output and
  surface preparation errors.
- `src/lib/admin/media/direct-upload-service.ts` — optional `variantId` in the token.
- `src/lib/admin/catalog/gallery-media-service.ts` (new) — `requestGalleryImageUpload`,
  `confirmGalleryImageUpload` (product row lock, variant ownership re-check, idempotent attach,
  audit `catalog:media:attach` with `upload: "direct"` and the operator's request id).
- `src/lib/admin/catalog/actions.ts` — `requestGalleryImageUploadAction`,
  `confirmGalleryImageUploadAction` (with the same admin and storefront revalidation as before)
  replace the intent/finalize actions.
- `src/app/admin/(protected)/products/[productId]/product-editor.tsx` — uploads through
  `uploadDirect`; finalization retry state and button removed; stage labels updated.
- Removed: `image-normalizer.ts`, `image-processor.ts`, `cloudflare-image-processor.ts`,
  `media-crypto.ts`, `media-finalization-retry.ts`, `requestCatalogMediaUploadIntent` and
  `finalizeCatalogMediaUpload` with their replay helpers, the adapter's read/write/conditional
  write methods, `R2_BUCKETS.CATALOG_STAGING` and `R2_CATALOG_STAGING_BUCKET`.
- Tests: `gallery-direct-upload.test.ts`, `compress-image-reencode.test.ts`,
  `admin-media-config.test.ts` (new); `admin-media-storage.test.ts`, `direct-media-upload.test.ts`
  updated; `admin-media-pipeline.test.ts`, `admin-media-client-state.test.ts` and the sharp
  fixture removed; `tests/admin-integration/admin-catalog-media.test.ts` rewritten for the new
  flow (staging races, hash integrity and staging cleanup cases removed; alt text, reorder,
  primary, variant reassignment, RBAC and audit safety kept).
- `.env.example`, `docs/development/CLOUDFLARE_R2_PRODUCTION_SETUP.md` (public-media CORS,
  staging bucket retired, checksum blocker marked resolved), `docs/roadmap/GP-055.md`, this
  report.

## Decisions

- **The `IMAGES` binding stays** in `wrangler.jsonc`: OpenNext uses it for `next/image`
  optimization (ADR-011). Only the catalog normalization use is removed.
- **`sharp` stays a dev dependency**: `next dev` uses it for local image optimization; no test
  imports it anymore.
- **Idempotency by object key** replaces the mutation/intent digest replay markers: a repeated
  confirm finds the asset by key and the existing link, and returns it with `replayed: true`.
- **No automatic primary photo**, as before: the operator chooses it.
- **Input accepted by the editor is unchanged** (JPEG, PNG, WebP, AVIF up to 10 MB); what is
  uploaded is always the browser's re-encoded WebP/JPEG of at most 4 MB.

## Validation Performed

- `pnpm check`: Prettier, `tsc`, ESLint `--max-warnings=0`, 1766 unit tests (155 files), build —
  PASS. (The total is lower than before because the staging-pipeline tests were removed.)
- `pnpm test:e2e`: 143/143 PASS in fixture mode.
- Unit: gallery policy; signing (key, signed length, unknown product, variant of another
  product); confirm (attach after the last gallery photo, variant, no checksum, audit metadata),
  idempotent replay, purpose mismatch, size mismatch deletion; re-encode (EXIF orientation
  option, WebP output even when not smaller, JPEG fallback over white, decode failure raises,
  legacy behavior without the option).
- `test:admin:live` (needs the local Supabase database) was type-checked and linted but **not
  executed** in this environment.

## Acceptance Criteria

- No Worker read of upload bytes — met by construction (sign, browser PUT, `HEAD`, small
  writes).
- Mismatched object rejected and deleted; repeated confirm not duplicated — met (unit).
- Existing gallery operations unchanged — met (services untouched; live test kept).
- Production upload without `Error 1102`, stored object ≤ 4 MB / 2000 px without EXIF — pending
  the push and a real upload by the owner.

## Deviations / Notes

- The live integration suite was reduced: the cases specific to staging (concurrent
  finalization races, content-hash reuse and tampering, staging cleanup, consumed-intent
  markers) no longer apply.
- `scripts/check-storage.mjs` (manual diagnostics) still reads `R2_CATALOG_STAGING_BUCKET` for
  its private-bucket probe; it is not part of the runtime.

## Risks / Follow-ups

- Production verification (scope item 4) after the push: upload a phone photo, confirm 200 on
  the PUT and no `Error 1102`, download the stored object and check it has no EXIF and is
  upright, assign it to a variant, set it as primary and detach it.
- Owner task: empty and delete `gamerperu-catalog-staging-private` and remove
  `R2_CATALOG_STAGING_BUCKET` from the Worker environment.
- Run `pnpm test:admin:live` against the local database when available.

## Repository Status

Clean after the GP-055 commit; not pushed.

## Final Status

PASS WITH NOTES (production upload verification and the live integration run pending).

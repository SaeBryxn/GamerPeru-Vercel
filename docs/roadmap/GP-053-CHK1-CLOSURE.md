# GP-053 CHK1 — Closure Report

## Base Checkpoint

`90ff8b1` on `feat/cloudflare-workers` (CHK0 closed).

## Closure Checkpoint

The CHK1 commit that adds this report on `feat/cloudflare-workers` (not pushed).

## Summary

Direct-to-R2 upload is now one shared mechanism (ADR-012 §4). The browser prepares the file
(images scaled and re-encoded to WebP; videos untouched), the server signs a presigned `PUT`
that binds `Content-Type`, `Cache-Control` **and the exact `Content-Length`**, the browser uploads
straight to the public bucket, and the server confirms with a `HEAD` before registering one
`media_assets` row. No upload body passes through the Worker. Product Story images use it with
unchanged behavior, and home images, MP4/WebM videos and posters have their service and server
actions ready for the CHK2 editor and CHK3 rendering.

## Files Changed

- `src/lib/media/direct-upload-policy.ts` — purposes and limits shared by browser and server:
  `story_image` and `home_image` (JPEG/PNG/WebP, 10 MB, 2560 px), `home_video` (MP4/WebM,
  25 MB, never re-encoded), `home_video_poster` (JPEG/WebP, 2 MB, 1920 px).
- `src/lib/admin/media/direct-upload-service.ts` — signing (token v2: purpose, actor, subject,
  key, MIME, exact size, expiry), verification (signature, expiry, purpose, actor, `HEAD` type
  and exact length; mismatches deleted), idempotent asset registration.
- `src/lib/media/direct-upload-client.ts` — browser flow: policy check, image compression,
  image/video dimension measurement, signed `PUT`, confirm.
- `src/lib/admin/catalog/media-storage.ts` — optional signed `Content-Length` on presigned PUTs.
- `src/lib/admin/catalog/story-media-service.ts`,
  `src/app/admin/(protected)/products/[productId]/story/story-image-upload.ts` — stories moved
  onto the shared service and client.
- `src/lib/home/home-media-service.ts`, `src/lib/home/home-media-actions.ts` — home uploads
  (`home/images`, `home/videos`, `home/posters`), `catalog:manage`, audit `home:media:upload`.
- `tests/unit/direct-media-upload.test.ts` (new), `tests/unit/story-media-direct-upload.test.ts`
  (error codes), `tests/e2e/design-system.spec.ts` (G: polls the computed transition instead
  of a single read taken during hydration).

## Decisions

- **Exact length instead of a ceiling.** The declared size is signed into the URL and must equal
  the `HEAD` length. R2 refuses a different body at upload time, so an oversized file never
  lands in the bucket; the `HEAD` check remains as a second line.
- **Purpose-bound tokens.** A token for a poster cannot confirm a video, and a story token cannot
  register home media.
- **Error codes generalized** from `STORY_UPLOAD_*` to `DIRECT_UPLOAD_*`; no UI mapped the old
  codes.
- **Home uploads only register the asset.** Linking to a section and `home_section_media` sync
  happen when the section is saved (CHK2).

## Validation Performed

- `pnpm check`: Prettier, `tsc`, ESLint `--max-warnings=0`, 1739 unit tests (149 files), build —
  PASS.
- `pnpm test:e2e`: 142/142 PASS in fixture mode (no hosted database or R2 writes). One run
  showed design-system G reading an empty computed style during hydration (8/8 isolated); the
  test now polls and the full suite passed.
- Unit coverage: video/poster type and size limits, no compression for video, signed headers
  (including a real SDK presign asserting `content-length` in `X-Amz-SignedHeaders`), key
  prefix traversal rejection, exact-length mismatch deletion, purpose mismatch, forged payload,
  VIDEO registration, idempotent confirm, home folder per purpose, permission and purpose
  refusal, single audit event.

## Acceptance Criteria

- Shared flow supports compressed images and MP4/WebM videos with strict MIME and size limits
  and posters — met.
- No binary passes through the Worker — met (sign, browser `PUT`, `HEAD` only).
- Story uploads unchanged for the operator — met (same stages, accept list and messages
  semantics).

## Deviations / Notes

- Video and poster policies, the home media service and its server actions were planned for
  CHK3; the owner asked for them in CHK1. Self-hosted video **rendering** and the admin UI
  remain in CHK3 and CHK2.
- Tokens moved to version 2; story upload tokens issued before deployment (15-minute window)
  are rejected and the operator retries.

## Risks / Follow-ups

- **Not yet verified against real R2:** the signed `Content-Length` presign and a `video/*` PUT.
  Verify on the deployed Worker with a real story image and, after CHK2/CHK3, a home video. If
  R2 rejected signed `content-length`, dropping it falls back to the `HEAD` check alone.
- R2 CORS must allow `PUT` with `Content-Type` and `Cache-Control` from the storefront origins
  (already true for story images); document it in `CLOUDFLARE_R2_PRODUCTION_SETUP.md`.
- Migration `0021` and the push of `5ae993e`/`90ff8b1` are pending owner execution (the
  session's permission policy blocked production deploy actions).

## Repository Status

Clean after the CHK1 commit; not pushed (the owner runs `pnpm db:migrate` and the push).

## Final Status

PASS WITH NOTES (real-R2 verification pending).

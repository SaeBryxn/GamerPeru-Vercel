# GP-053 CHK2 — Closure Report

## Base Checkpoint

`5f1bfbe` on `feat/cloudflare-workers` (CHK1 closed).

## Closure Checkpoint

The CHK2 commit that adds this report on `feat/cloudflare-workers` (not pushed).

## Summary

`/admin/home` lets the operator run the storefront home: reorder sections, show or hide them
after a confirmation that previews the resulting home, and edit text, images and videos per
section. Uploads use the CHK1 direct-to-R2 client (images compressed in the browser; MP4/WebM
video plus poster sent as-is). Every section card shows a wireframe of its storefront layout, a
description and a "Necesitas:" line, following the Product Story builder's guidance pattern.
Saving validates on the client with the server's schema, then the server validates again,
checks every referenced asset, syncs `home_section_media`, bumps the version and audits the
previous content. Self-hosted video now renders on the storefront (poster-first, muted, inline,
looping; poster only under reduced motion or Save-Data).

## Files Changed

- `src/app/admin/(protected)/home/` — `page.tsx`, `loading.tsx`, `home-editor.tsx` (list,
  reorder, visibility dialog with outline preview, live announcements), `section-form.tsx`
  (schema-driven form, Spanish validation messages), `media-fields.tsx` (image slot, video
  source with upload or YouTube link), `section-fields.ts` (form layout per type),
  `section-guide.ts` (labels, needs, wireframes), `content-path.ts`, `home-editor.module.css`.
- `src/lib/home/home-sections-service.ts`, `home-sections-actions.ts` — read state, update
  content, visibility, reorder; advisory lock, version checks, media validation, audit.
- `src/lib/home/read-home-sections.ts` — `revalidateStorefrontHome()`.
- `src/lib/home/section-schemas.ts` — `upload` video source (file and poster required),
  `video.file`/`video.poster` slots, `homeSlotMediaType`.
- `src/components/home/home-video.ts`, `video-hero/*`, `feature-video/*`, `home-sections.tsx` —
  self-hosted video rendering.
- `src/components/admin/wireframe/` — wireframe renderer shared with the Product Story builder
  (styles moved from the story folder); `block-wireframe.tsx` now uses it.
- `src/components/admin/confirmation-dialog.tsx` — optional `children` for extra context.
- `src/lib/admin/navigation.ts`, `types.ts`, `admin-sidebar.tsx`, `admin-mobile-nav.tsx` —
  "Home de la tienda" entry.
- `src/lib/admin/catalog/error-mapping.ts` — `DIRECT_UPLOAD_*` and `HOME_SECTION_*` errors show
  their own Spanish message instead of the generic fallback.
- `src/lib/media/direct-upload-policy.ts` — policy rejections use `DIRECT_UPLOAD_*` codes.
- `src/lib/validation/safe-string.ts` — `SafeString` moved out of `story-validation.ts`, which
  imports the server logger, so the admin form can validate in the browser.
- Tests: `home-sections-service.test.ts`, `admin-home-editor.test.tsx`,
  `home-upload-video.test.tsx` (new); `admin-navigation.test.ts`, `direct-media-upload.test.ts`,
  `story-media-direct-upload.test.ts`, `home-video-hero-floating-ui.test.tsx` (updated);
  `tests/e2e/homepage.spec.ts` (L2: no `/images/home/*` requests).

## Decisions

- **Live editing** per ADR-012: "Guardar y publicar" publishes immediately; hide/show always
  goes through a confirmation that lists the resulting home with the change marked.
- **Reorder with buttons**, keyboard-operable and announced through a live region; drag and
  drop was not added. The hero shows "Primera" and cannot be moved; nothing can move above it.
- **Reorder concurrency** compares the whole order the operator saw; content and visibility
  compare the section version. A conflict refreshes the page and explains why.
- **Media validation on save**: each referenced asset must exist, be `PUBLIC_MEDIA` and match
  the slot (`video.file` needs VIDEO, every other slot IMAGE).
- **YouTube input** accepts a bare id or common links (watch, youtu.be, shorts) and stores only
  the id.
- **Error mapping fix**: until now any `STORY_UPLOAD_*`/`DIRECT_UPLOAD_*` error reached the
  operator as "Ocurrió un error inesperado"; they now show their specific message.

## Validation Performed

- `pnpm check`: Prettier, `tsc`, ESLint `--max-warnings=0`, 1768 unit tests (152 files), build
  (`/admin/home` dynamic route) — PASS.
- `pnpm test:e2e`: 143/143 PASS in fixture mode, including the new L2 check.
- Unit: service conflict, invalid content, wrong media type, private asset, slot sync and audit
  payload, permission refusal, visibility no-op, reorder conflict/hero-first/duplicates/minimal
  updates; editor rendering, hero pinning, visibility preview and confirm, reorder payload,
  client validation blocking an HTML heading, upload-without-poster blocked, conflict refresh;
  form paths and schema coverage for every type; wireframes inside the canvas; uploaded video
  attributes and reduced-motion poster-only.
- No hosted database or R2 write was performed.

## Acceptance Criteria

- Reorder, show/hide with preview, and edit text, images and video from `/admin/home` — met.
- Upload of MP4/WebM with poster through the direct client — met (client and service; real
  R2 pending, see risks).
- Wireframe guidance per section type — met.
- Optimistic concurrency and audit on every write — met.

## Deviations / Notes

- Self-hosted video **rendering** (planned for CHK3) was implemented here, because the editor
  can now save uploaded videos and the storefront must render them. CHK3 is reduced to
  verification on the deployed Worker and any adjustments it shows.
- Adding and deleting sections is not included: the ten seeded sections cover every type, and
  hiding replaces deletion for now. Tracked as a follow-up.
- The section preview is the wireframe plus the edited content; "Ver la tienda" opens the live
  home in a new tab. A full in-admin render of the storefront components was not built.

## Risks / Follow-ups

- **Visual QA of `/admin/home` on real data is pending**: the page needs migration `0021` and an
  admin session. After the owner applies `0021` and deploys, check the editor in light and dark
  admin themes at desktop and mobile widths, and run one real image, video and poster upload.
- Real-R2 verification of signed `Content-Length` (from CHK1) still applies.
- Follow-ups: add/delete sections; explicit cleanup of orphaned home media.

## Repository Status

Clean after the CHK2 commit; not pushed.

## Final Status

PASS WITH NOTES (visual QA and real uploads pending migration `0021` and deployment).

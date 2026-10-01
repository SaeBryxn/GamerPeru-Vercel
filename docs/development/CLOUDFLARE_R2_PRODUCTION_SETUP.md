# Cloudflare R2 — Production Setup (gamerperu.com)

Runbook for moving all object storage from the local Supabase S3 endpoint to native Cloudflare R2.
Verified against the code at commit `4ce72de` (`@aws-sdk/client-s3` 3.1111.0).

---

## 0. Blocker to resolve before go-live: SDK checksum on presigned uploads

Since v3.729 the AWS SDK adds a CRC32 checksum to every signed `PutObject`. With the current
client config, a presigned upload URL generated for R2 contains:

```
...&x-amz-checksum-crc32=AAAAAA==&x-amz-sdk-checksum-algorithm=CRC32&...
```

That checksum is computed at signing time over an **empty body**, not over the file the browser
later uploads. Supabase Storage ignored it (which is why local uploads work), but R2 validates
checksums it receives, so a real image upload will be rejected (typically `400 BadDigest` /
checksum mismatch). This affects both browser upload flows (payment proofs and admin catalog
media).

Fix (one line in `buildStorageClient`, `src/lib/storage/r2.ts`), to be applied as a code change
before deploying:

```ts
new S3Client({
  // ...
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
```

Do the smoke test in section 6 after deploying either way.

---

## 1. Code verification — does removing `S3_ENDPOINT` switch to native R2?

**Yes**, provided the variables are set exactly as below.

`buildStorageClient` (`src/lib/storage/r2.ts`), used by both catalog media and payment storage:

| Condition            | Endpoint                                           | Region                  | Addressing                                                     |
| -------------------- | -------------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `S3_ENDPOINT` set    | `S3_ENDPOINT`                                      | `S3_REGION` (or `auto`) | path-style                                                     |
| `S3_ENDPOINT` absent | `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` | `auto` (forced)         | virtual-hosted (`<bucket>.<account>.r2.cloudflarestorage.com`) |

Rules for production variables:

- **Delete `S3_ENDPOINT` and `S3_REGION` entirely.** Do not leave `S3_ENDPOINT=""`:
  `server-env.ts` validates it with `z.string().url()` and an empty string fails validation at
  boot. `S3_REGION` is ignored without an endpoint, but remove it to avoid confusion.
- `R2_ACCOUNT_ID` must be the real 32-character account id (Cloudflare dashboard → R2 → right
  sidebar "Account ID"). Any value starting with `placeholder_` is treated as missing.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` come from an **R2 API token** (R2 → Manage R2 API
  Tokens), not from a global Cloudflare API token. The Supabase S3 keys stop working.
- `NEXT_PUBLIC_CDN_URL` must point at the public bucket's custom domain (section 2).

Full production storage block:

```dotenv
# Remove: S3_ENDPOINT, S3_REGION
R2_ACCOUNT_ID=<32-char account id>
R2_ACCESS_KEY_ID=<R2 token access key id>
R2_SECRET_ACCESS_KEY=<R2 token secret>

R2_PUBLIC_MEDIA_BUCKET=gamerperu-public-media
R2_CATALOG_STAGING_BUCKET=gamerperu-catalog-staging-private
R2_PRIVATE_PROOFS_BUCKET=gamerperu-private-proofs
R2_PRIVATE_PAYMENT_MEDIA_BUCKET=gamerperu-private-payment-media
R2_DB_BACKUPS_BUCKET=gamerperu-db-backups-private

NEXT_PUBLIC_SITE_URL=https://gamerperu.com
NEXT_PUBLIC_CDN_URL=https://media.gamerperu.com
CATALOG_MEDIA_INTENT_HMAC_SECRET=<64 hex chars, unique to production>
```

The bucket names above are the code defaults (`src/config/server-env.ts`); setting them
explicitly makes the deployment self-documenting. `R2_PRIVATE_PAYMENT_MEDIA_BUCKET` is missing
from `.env.example`, so it is easy to overlook.

`NEXT_PUBLIC_*` values are inlined at build time: after changing them, trigger a new build, not
just a restart.

---

## 2. Buckets to create

Create all buckets in the same account, location hint **South America (SAM)** or automatic.

| #   | Bucket                              | Access                     | Written by                                                                                                     | Read by                                                     | CORS         |
| --- | ----------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------ |
| 1   | `gamerperu-public-media`            | **Public** (custom domain) | Server (finalize step copies from staging)                                                                     | Everyone, via `https://media.gamerperu.com/<key>`           | Not needed   |
| 2   | `gamerperu-catalog-staging-private` | **Private**                | **Browser** (admin, presigned PUT to `temp/catalog/…`)                                                         | Server (validation)                                         | **Required** |
| 3   | `gamerperu-private-proofs`          | **Private**                | **Browser** (customer, presigned PUT to `payment-proofs/staging/…`); server copies to `payment-proofs/final/…` | Server; admins via 5-minute presigned GET                   | **Required** |
| 4   | `gamerperu-private-payment-media`   | **Private**                | Operator (Yape/Plin QR images registered as media assets)                                                      | Customers via short-lived presigned GET rendered in `<img>` | Not needed   |
| 5   | `gamerperu-db-backups-private`      | **Private**                | Backup tooling (not referenced by app code today)                                                              | Operators only                                              | Not needed   |

### Making bucket 1 public

Use a **custom domain**, not the `r2.dev` URL (r2.dev is rate-limited and not meant for
production):

1. R2 → `gamerperu-public-media` → Settings → Public access → **Custom Domains → Connect Domain**.
2. Enter `media.gamerperu.com`. `gamerperu.com` must be a zone in the same Cloudflare account;
   Cloudflare creates the DNS record and certificate.
3. Leave **R2.dev subdomain disabled**.
4. `next.config.ts` already allows `media.gamerperu.com` in `images.remotePatterns`, and
   `resolvePublicMediaUrl` builds `https://media.gamerperu.com/<objectKey>`.

Optional: a Cache Rule on `media.gamerperu.com` with a long edge TTL; the server already writes
`CacheControl` on finalized objects.

### Private buckets (2–5)

Leave public access, custom domains and r2.dev **all disabled**. Every read goes through
server-issued presigned URLs.

### Lifecycle rules (recommended)

Staging objects that are never finalized (abandoned uploads) accumulate otherwise.

| Bucket                              | Prefix                    | Rule                                           |
| ----------------------------------- | ------------------------- | ---------------------------------------------- |
| `gamerperu-catalog-staging-private` | `temp/catalog/`           | Delete objects after 1 day                     |
| `gamerperu-private-proofs`          | `payment-proofs/staging/` | Delete objects after 1 day                     |
| all                                 | (none)                    | Abort incomplete multipart uploads after 1 day |

Never add an expiry rule on `payment-proofs/final/` — those are the evidence behind approved
payments.

### API token scope

R2 → Manage R2 API Tokens → Create API token:

- Permission: **Object Read & Write**.
- Specify buckets: `gamerperu-public-media`, `gamerperu-catalog-staging-private`,
  `gamerperu-private-proofs`, `gamerperu-private-payment-media` (add the backups bucket only if
  the app will ever write backups; otherwise give backup tooling its own token).
- TTL: forever (rotate manually), optional client IP filtering is not practical on serverless.

---

## 3. CORS rules

Only the two buckets that receive **direct browser uploads** need CORS. Uploads are a single
`PUT` to a presigned URL with a `Content-Type` header; there is no multipart and no response
header the page needs to read.

R2 → bucket → Settings → **CORS Policy** → Edit, paste JSON.

### `gamerperu-private-proofs` (customer checkout)

```json
[
  {
    "AllowedOrigins": ["https://gamerperu.com", "https://www.gamerperu.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

### `gamerperu-catalog-staging-private` (admin product editor)

```json
[
  {
    "AllowedOrigins": ["https://gamerperu.com", "https://www.gamerperu.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Notes:

- Origins must match exactly: scheme + host, no trailing slash, no path.
- Keep only the origin(s) that actually serve the site. If `www` redirects to the apex, the
  `www` entry is harmless but unnecessary.
- If the admin ever moves to a subdomain (e.g. `admin.gamerperu.com`), add it to the staging
  bucket's list.
- Preview deployments (e.g. `*.vercel.app`) are **not** covered. Give previews their own buckets
  and token rather than widening production CORS to wildcard origins.
- Do not add `GET`: presigned reads are rendered as `<img src>`, which does not need CORS.
- If section 0 is _not_ fixed, the browser would also need to send checksum headers; fix the
  client instead of adding `x-amz-*` headers here.

---

## 4. Order of operations

1. Create the five buckets (section 2).
2. Connect `media.gamerperu.com` to `gamerperu-public-media`.
3. Apply CORS on the proofs and catalog-staging buckets.
4. Add lifecycle rules.
5. Create the scoped R2 API token; copy the Access Key ID and Secret (the secret is shown once).
6. Apply the section 0 client change and deploy it.
7. Set the production variables (section 1), removing `S3_ENDPOINT` / `S3_REGION`.
8. Rebuild and deploy.
9. Migrate existing media (section 5).
10. Smoke test (section 6).

---

## 5. Migrating existing objects from Supabase Storage

Object keys are stored in the database (`media_assets.object_key`, payment proof keys), so
objects must keep **the same keys** in the matching R2 bucket:

| Supabase bucket                                       | R2 bucket                         |
| ----------------------------------------------------- | --------------------------------- |
| public media bucket                                   | `gamerperu-public-media`          |
| payment proofs bucket (`payment-proofs/final/…` only) | `gamerperu-private-proofs`        |
| QR images                                             | `gamerperu-private-payment-media` |

Staging prefixes (`temp/catalog/`, `payment-proofs/staging/`) do not need migrating.

Options: Cloudflare **Super Slurper** (R2 → Data Migration) pointed at the Supabase S3 endpoint
with the Supabase S3 keys, or `rclone copy` between two S3 remotes. Spot-check a few keys after
the copy.

---

## 6. Smoke test after deploy

1. Open a product page: images load from `https://media.gamerperu.com/...`.
2. Place a test order with Yape/Plin: the QR renders (private bucket 4 via presigned GET).
3. Upload a proof image on the confirmation page. In the browser DevTools Network tab the
   `PUT` to `gamerperu-private-proofs.<account>.r2.cloudflarestorage.com` must return **200**,
   preceded by a successful `OPTIONS` preflight.
4. In admin, upload a product image: `PUT` to the catalog staging bucket returns 200 and the
   finalized image appears.
5. In the server logs, there must be no `payment_proof_*` error events.

### Reading failures

Storage failures are logged as JSON with an `event`, `errorCode` and `httpStatus`:

| Symptom                                                                              | Likely cause                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `payment_proof_storage_unavailable`, `reason` names `R2_ACCOUNT_ID (or S3_ENDPOINT)` | Account id missing/placeholder                               |
| Browser console: `blocked by CORS policy` on the `PUT`                               | Origin missing from the bucket's CORS list, or wrong bucket  |
| `PUT` returns 400 with `BadDigest` / checksum error                                  | Section 0 not applied                                        |
| `errorCode=InvalidAccessKeyId` or `SignatureDoesNotMatch`                            | Wrong token, or still using Supabase keys                    |
| `errorCode=NoSuchBucket` / HeadBucket 404                                            | Bucket name typo or created in another account               |
| `httpStatus=403`, `AccessDenied`                                                     | Token not scoped to that bucket                              |
| `payment_proof_staging_head_failed` right after upload                               | The browser upload never landed; check the Network tab first |

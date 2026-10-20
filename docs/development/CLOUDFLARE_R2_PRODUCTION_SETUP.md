# Cloudflare R2 — Production Setup (gamerperu.com)

Runbook for moving all object storage from the local Supabase S3 endpoint to native Cloudflare R2.
Verified against the code at commit `4ce72de` (`@aws-sdk/client-s3` 3.1111.0).

---

## 0. SDK checksum on presigned uploads (resolved)

Since v3.729 the AWS SDK adds a CRC32 checksum, computed over an empty body, to every signed
`PutObject`; R2 validates it and rejects the real upload (`400 BadDigest`). The storage client
in `src/lib/storage/r2.ts` sets `requestChecksumCalculation` and `responseChecksumValidation`
to `"WHEN_REQUIRED"`, so presigned URLs no longer carry that checksum. Keep it that way.

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
R2_PRIVATE_PROOFS_BUCKET=gamerperu-private-proofs
R2_PRIVATE_PAYMENT_MEDIA_BUCKET=gamerperu-private-payment-media
R2_DB_BACKUPS_BUCKET=gamerperu-db-backups-private

NEXT_PUBLIC_SITE_URL=https://gamerperu.com
NEXT_PUBLIC_CDN_URL=https://media.gamerperu.com
```

The bucket names above are the code defaults (`src/config/server-env.ts`); setting them
explicitly makes the deployment self-documenting. `R2_PRIVATE_PAYMENT_MEDIA_BUCKET` is missing
from `.env.example`, so it is easy to overlook.

`NEXT_PUBLIC_*` values are inlined at build time: after changing them, trigger a new build, not
just a restart.

---

## 2. Buckets to create

Create all buckets in the same account, location hint **South America (SAM)** or automatic.

| #   | Bucket                            | Access                     | Written by                                                                                                     | Read by                                                     | CORS         |
| --- | --------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------ |
| 1   | `gamerperu-public-media`          | **Public** (custom domain) | **Browser** (admin, presigned PUT straight to the final key: gallery, story and home media)                    | Everyone, via `https://media.gamerperu.com/<key>`           | **Required** |
| 3   | `gamerperu-private-proofs`        | **Private**                | **Browser** (customer, presigned PUT to `payment-proofs/staging/…`); server copies to `payment-proofs/final/…` | Server; admins via 5-minute presigned GET                   | **Required** |
| 4   | `gamerperu-private-payment-media` | **Private**                | Operator (Yape/Plin QR images registered as media assets)                                                      | Customers via short-lived presigned GET rendered in `<img>` | Not needed   |
| 5   | `gamerperu-db-backups-private`    | **Private**                | Backup tooling (not referenced by app code today)                                                              | Operators only                                              | Not needed   |

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

### Private buckets

Leave public access, custom domains and r2.dev **all disabled**. Every read goes through
server-issued presigned URLs.

### Lifecycle rules (recommended)

Staging objects that are never finalized (abandoned uploads) accumulate otherwise.

| Bucket                     | Prefix                    | Rule                                           |
| -------------------------- | ------------------------- | ---------------------------------------------- |
| `gamerperu-private-proofs` | `payment-proofs/staging/` | Delete objects after 1 day                     |
| all                        | (none)                    | Abort incomplete multipart uploads after 1 day |

Never add an expiry rule on `payment-proofs/final/` — those are the evidence behind approved
payments.

### API token scope

R2 → Manage R2 API Tokens → Create API token:

- Permission: **Object Read & Write**.
- Specify buckets: `gamerperu-public-media`,
  `gamerperu-private-proofs`, `gamerperu-private-payment-media` (add the backups bucket only if
  the app will ever write backups; otherwise give backup tooling its own token).
- TTL: forever (rotate manually), optional client IP filtering is not practical on serverless.

---

## 3. CORS rules

Only the two buckets that receive **direct browser uploads** need CORS: proofs and public media. Uploads are a single
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

### `gamerperu-public-media` (admin: gallery, story and home media)

Admin uploads go from the browser straight to their final key (ADR-012, ADR-013). The presigned
URL signs `Content-Type`, `Cache-Control` and the exact `Content-Length`; the browser sets the
length itself, so only the first two need to be allowed.

```json
[
  {
    "AllowedOrigins": ["https://gamerperu.com", "https://www.gamerperu.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type", "cache-control"],
    "MaxAgeSeconds": 3600
  }
]
```

Notes:

- Origins must match exactly: scheme + host, no trailing slash, no path.
- Keep only the origin(s) that actually serve the site. If `www` redirects to the apex, the
  `www` entry is harmless but unnecessary.
- If the admin ever moves to a subdomain (e.g. `admin.gamerperu.com`), add it to the public
  media bucket's list.
- Preview deployments (e.g. `*.vercel.app`) are **not** covered. Give previews their own buckets
  and token rather than widening production CORS to wildcard origins.
- Do not add `GET`: presigned reads are rendered as `<img src>`, which does not need CORS.
- If section 0 is _not_ fixed, the browser would also need to send checksum headers; fix the
  client instead of adding `x-amz-*` headers here.

---

## 4. Order of operations

1. Create the four active buckets (section 2).
2. Connect `media.gamerperu.com` to `gamerperu-public-media`.
3. Apply CORS on the proofs and public-media buckets.
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
4. In admin, upload a product photo: the `PUT` to the public-media bucket returns 200 (after an
   `OPTIONS` preflight), the photo appears in the gallery, and Workers Logs show no
   `Error 1102` for the confirm request.
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

## GP-059: control de medios y presupuesto

Galería, historia y home usan Route Handlers con `aws4fetch` y PUT directo al bucket público.
El SDK permanece para comprobantes privados y diagnósticos; su configuración de checksum
sigue siendo necesaria en esos dominios. No se usa Supabase Storage para medios.

Aplicar la migración Drizzle `0022_media_uploads` antes de desplegar el código que usa el ledger.
La fila `media_storage_budget` se siembra con 8 GiB, el tamaño declarado de los assets públicos
y reserva 0. El UPDATE condicional impide que reservas concurrentes superen ese presupuesto.
El uso es un libro contable del servidor, no una medición independiente del contenido del bucket.

Complete inspecciona HEAD y hasta 4096 bytes; un JPEG cuyo SOF no cabe se rechaza. Las dimensiones
persistidas vienen del encabezado. Abortar borra solo objetos PENDING y libera su reserva bajo
bloqueo; READY nunca se borra por aborto. Pagehide intenta avisar con sendBeacon, sin garantía
de entrega. Inngest `media-uploads-sweep`, cron `17 * * * *`, reintenta la limpieza de hasta cien
PENDING vencidas desde hace más de una hora. Un DELETE fallido conserva la reserva para reintentar.

El contador de huérfanos considera assets públicos sin referencias en galería, historia, home ni
principal de producto, mayores de 30 días. No borra objetos ni assets.

El dueño puede retirar el secreto `CATALOG_MEDIA_INTENT_HMAC_SECRET` y la variable antigua
`R2_CATALOG_STAGING_BUCKET`: ya no tienen consumidores de runtime ni del script de diagnóstico.
El bucket de staging retirado lo elimina el dueño tras verificar su contenido; Codex no lo toca.
Las URLs HMAC emitidas antes del cambio no tienen ledger y no pueden confirmarse con el código nuevo.

El gate compara gzip de Wrangler dry-run en Linux con **5869,50 KiB**, sin optimizar Next/OpenNext.
Documentar antes/después y justificar un aumento mayor de 20 KiB. Los avisos preexistentes del
emulador y OpenNext son BASELINE; no se relaja seguridad para silenciarlos.

# Deploying to Cloudflare Workers

Runbook for [ADR-011](../decisions/ADR-011-cloudflare-workers-hosting.md). The app is built by
OpenNext (`@opennextjs/cloudflare`) and runs as the `gamerperu-vercel` Worker.

> OpenNext does not build reliably on Windows. Build and deploy from Linux: Cloudflare Workers
> Builds (recommended), WSL, or CI.

## 1. One-time Cloudflare setup

```bash
npx wrangler login
npx wrangler r2 bucket create gamerperu-next-cache
```

- **Images:** the `IMAGES` binding needs Cloudflare Images enabled on the account (Images →
  Transformations). Free tier: 5,000 unique transformations per month.
- **Durable Objects:** created on the first deploy from the `migrations` block in
  `wrangler.jsonc`; nothing to do by hand.
- **Hyperdrive (optional, recommended):** pools database connections instead of opening one per
  request. Point it at the Supabase **session pooler (5432) or direct connection**, not the
  transaction pooler:

  ```bash
  npx wrangler hyperdrive create gamerperu-db --connection-string="postgresql://..."
  ```

  Put the returned id in the `hyperdrive` block of `wrangler.jsonc` (already done for
  `gamerperu-db`). For `next dev`, `.env.local` needs
  `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=$DATABASE_URL` (see `.env.example`).

## 2. Environment variables

### Build time (inlined into the bundle)

Must be present in the environment of the machine or Workers Builds job that runs the build.
Values without quotes, with `https://`:

| Variable                               | Example                           |
| -------------------------------------- | --------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                 | `https://gamerperu.com`           |
| `NEXT_PUBLIC_CDN_URL`                  | the public media URL in use today |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project>.supabase.co`   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...`              |
| `NEXT_PUBLIC_WHATSAPP_NUMBER`          | digits only, e.g. `51XXXXXXXXX`   |
| `NEXT_PUBLIC_SENTRY_DSN`               | optional, browser error reporting |

The build fails with the list of missing names if a required one is not set
(`src/config/public-env.ts`), and with a ZodError if a value is not a valid URL.

### Build secret

`next build` prerenders the ISR pages (home, ADR-010), so it reads the database. Add
`DATABASE_URL` (transaction pooler, port 6543) as a **Secret** under Settings → Builds →
Variables and secrets as well. It is not a `NEXT_PUBLIC_*` name, so it is never inlined into
the bundle.

### Runtime secrets (Worker)

Set each one with `npx wrangler secret put <NAME>` (the value is prompted, not echoed) or in the
dashboard under the Worker → Settings → Variables and Secrets:

- Database: `DATABASE_URL` (transaction pooler, port 6543; unused when Hyperdrive is bound),
  optional `DATABASE_POOL_MAX`.
- Supabase: `SUPABASE_SECRET_KEY`.
- Storage: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_MEDIA_BUCKET`,
  `R2_PRIVATE_PROOFS_BUCKET`, `R2_PRIVATE_PAYMENT_MEDIA_BUCKET`,
  `R2_DB_BACKUPS_BUCKET`. Do not set `S3_ENDPOINT` / `S3_REGION`.
- Signing: `CHECKOUT_HMAC_SECRET`, `INVENTORY_HMAC_SECRET`
  (same values as the current production, since the database is shared).
- Business rules: `CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE`, `CHECKOUT_RESERVATION_TTL_MINUTES`,
  `CHECKOUT_IDEMPOTENCY_TTL_MINUTES`, `PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES`,
  `PAYMENT_RESUBMISSION_GRACE_HOURS`, `ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES`,
  `INVENTORY_IDEMPOTENCY_TTL_MINUTES`, `INVENTORY_QUARANTINE_LOCATION_CODE`.
- Email and jobs: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `CONTACT_INBOX_EMAIL` (inbox
  for the contact and distributor forms), `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.
- Optional: `LOG_LEVEL`, AI settings (`TAVILY_API_KEY`, `AI_ENCRYPTION_ACTIVE_KEY_VERSION`,
  `AI_ENCRYPTION_KEY_V1`, `AI_RESEARCH_FETCH_USER_AGENT`).

Not needed on the Worker: `DATABASE_MIGRATION_URL` (migrations run from a workstation),
`SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` (source-map upload at build only).

## 3. Build and deploy

With Workers Builds (Workers & Pages → Create → Import a repository):

| Setting        | Value                                                    |
| -------------- | -------------------------------------------------------- |
| Branch         | `feat/cloudflare-workers` until it is merged into `main` |
| Build command  | `npx opennextjs-cloudflare build`                        |
| Deploy command | `npx opennextjs-cloudflare deploy`                       |
| `NODE_VERSION` | `24`                                                     |

From WSL or CI:

```bash
pnpm install --frozen-lockfile
pnpm cf:deploy
```

`pnpm cf:preview` builds and serves the Worker locally with Wrangler before deploying.

## 4. Switch traffic

1. Worker → Settings → Domains & Routes → add `gamerperu.com` (and `www`) as custom domains.
2. Remove the domain from the Vercel project so both do not answer.
3. Supabase → Authentication → URL Configuration: Site URL and redirect URLs on the final domain.
4. R2 → `gamerperu-private-proofs` y `gamerperu-public-media` → CORS con los orígenes finales.
   El público admite Content-Type y Cache-Control; Content-Length lo fija el navegador.
5. Inngest: sync the app at `https://gamerperu.com/api/inngest`.

## 5. After the first deploy

- Workers Logs: no `Error 1102: Worker exceeded CPU time limit`. The Free plan allows 10 ms CPU
  per request; if dynamic pages (category filters, account, checkout, admin) exceed it, they
  need Workers Paid.
- Upload a portrait phone photo in the admin; it must come out upright.
- Place a test order, upload a payment proof, approve it in the admin.
- Rollback: `npx wrangler rollback` restores the previous Worker version.

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

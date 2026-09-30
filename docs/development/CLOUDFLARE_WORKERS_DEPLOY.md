# Deploying to Cloudflare Workers

Runbook for [ADR-011](../decisions/ADR-011-cloudflare-workers-hosting.md). The app is built by
OpenNext (`@opennextjs/cloudflare`) and runs as the `gamerperu` Worker.

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

  Then uncomment the `hyperdrive` block in `wrangler.jsonc` with the returned id.

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

The build-time guard in `src/config/public-env.ts` only fails fast on Vercel (`VERCEL=1`). On
Cloudflare, check these are set before building, or the site builds against `localhost`.

### Runtime secrets (Worker)

Set each one with `npx wrangler secret put <NAME>` (the value is prompted, not echoed) or in the
dashboard under the Worker → Settings → Variables and Secrets:

- Database: `DATABASE_URL` (transaction pooler, port 6543; unused when Hyperdrive is bound),
  optional `DATABASE_POOL_MAX`.
- Supabase: `SUPABASE_SECRET_KEY`.
- Storage: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_MEDIA_BUCKET`,
  `R2_CATALOG_STAGING_BUCKET`, `R2_PRIVATE_PROOFS_BUCKET`, `R2_PRIVATE_PAYMENT_MEDIA_BUCKET`,
  `R2_DB_BACKUPS_BUCKET`. Do not set `S3_ENDPOINT` / `S3_REGION`.
- Signing: `CHECKOUT_HMAC_SECRET`, `INVENTORY_HMAC_SECRET`, `CATALOG_MEDIA_INTENT_HMAC_SECRET`
  (same values as the current production, since the database is shared).
- Business rules: `CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE`, `CHECKOUT_RESERVATION_TTL_MINUTES`,
  `CHECKOUT_IDEMPOTENCY_TTL_MINUTES`, `PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES`,
  `PAYMENT_RESUBMISSION_GRACE_HOURS`, `ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES`,
  `INVENTORY_IDEMPOTENCY_TTL_MINUTES`, `INVENTORY_QUARANTINE_LOCATION_CODE`.
- Email and jobs: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `INNGEST_EVENT_KEY`,
  `INNGEST_SIGNING_KEY`.
- Optional: `LOG_LEVEL`, AI settings (`TAVILY_API_KEY`, `AI_ENCRYPTION_ACTIVE_KEY_VERSION`,
  `AI_ENCRYPTION_KEY_V1`, `AI_RESEARCH_FETCH_USER_AGENT`).

Not needed on the Worker: `DATABASE_MIGRATION_URL` (migrations run from a workstation),
`SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` (source-map upload at build only).

## 3. Build and deploy

With Workers Builds (Workers & Pages → Create → Import a repository):

| Setting        | Value                              |
| -------------- | ---------------------------------- |
| Branch         | the branch that should go live     |
| Build command  | `npx opennextjs-cloudflare build`  |
| Deploy command | `npx opennextjs-cloudflare deploy` |
| `NODE_VERSION` | `24`                               |

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
4. R2 → `gamerperu-private-proofs` and `gamerperu-catalog-staging-private` → CORS: the final
   domain in `AllowedOrigins`.
5. Inngest: sync the app at `https://gamerperu.com/api/inngest`.

## 5. After the first deploy

- Workers Logs: no `Error 1102: Worker exceeded CPU time limit`. The Free plan allows 10 ms CPU
  per request; if dynamic pages (category filters, account, checkout, admin) exceed it, they
  need Workers Paid.
- Upload a portrait phone photo in the admin; it must come out upright.
- Place a test order, upload a payment proof, approve it in the admin.
- Rollback: `npx wrangler rollback` restores the previous Worker version.

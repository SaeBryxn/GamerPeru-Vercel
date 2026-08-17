# Local Catalog Preview

## Purpose

Inspect Category and Brand discovery pages locally before real commercial
catalog data exists in the authoritative Supabase PostgreSQL database.

When enabled, all `/categorias/[slug]` and `/marcas/[slug]` routes serve
**synthetic preview data only**. The PostgreSQL catalog is **not** queried
for discovery during this mode.

## Enable

Add to `.env.local`:

```env
DEV_CATALOG_PREVIEW=1
```

Then restart the dev server:

```sh
pnpm dev
```

A one-time console notice confirms activation:

```
[Gamer Perú] Development Catalog Preview enabled — synthetic data only; PostgreSQL catalog is not being used for discovery.
```

## Disable

Set the variable to `0` or remove it entirely:

```env
DEV_CATALOG_PREVIEW=0
```

Then restart `pnpm dev`. Normal runtime resumes reading from PostgreSQL.

## Example Routes

### Categories

- <http://localhost:3000/categorias/mouses> — 14 synthetic products (pagination visible)
- <http://localhost:3000/categorias/teclados> — 4 synthetic products
- <http://localhost:3000/categorias/mousepads> — 4 synthetic products
- <http://localhost:3000/categorias/audio> — 4 synthetic products
- <http://localhost:3000/categorias/accesorios> — 4 synthetic products

### Brands

- <http://localhost:3000/marcas/marca-qa> — Shows all 30 synthetic products (Marca QA)
- <http://localhost:3000/marcas/wlmouse> — Resolves as valid brand, 0 products (empty state)
- <http://localhost:3000/marcas/pulsar> — Resolves as valid brand, 0 products (empty state)

All navigation brand slugs (`wlmouse`, `pulsar`, `lamzu`, `atk`,
`ninjutso`, `wooting`, `drunkdeer`, `melgeek`, `artisan`, `lgg`,
`moondrop`, `tangzu`, `truthear`, `sennheiser`) resolve as valid
published entities with zero products and the accepted GP-011 empty
state.

## Important

- **Synthetic preview data is NOT stored in Supabase.** No database
  writes occur.
- **Normal storefront behavior with preview disabled reads authoritative
  PostgreSQL.** The preview reader is never a database fallback.
- **Never enable this flag in production.** Activation outside
  `NODE_ENV=development` throws a configuration error at startup.
- **Never enable in CI.** Activation when `process.env.CI` is truthy
  throws a configuration error.
- **Synthetic products use the neutral "Marca QA" brand.** No real
  commercial product models, SKUs, or inventory claims are made.

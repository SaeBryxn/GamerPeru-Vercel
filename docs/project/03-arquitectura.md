# 03 · Arquitectura actual

Monolito modular Next.js 16 / React 19 / TypeScript, con OpenNext en Cloudflare Workers. La topología se contrasta con `wrangler.jsonc`, `open-next.config.ts`, `src/db/index.ts` y `src/lib/storage/`. [ADR-011](../decisions/ADR-011-cloudflare-workers-hosting.md) conserva su estado PROPOSED; no se reetiqueta aquí como aprobación de producción. [ADR-014](../decisions/ADR-014-media-upload-control-plane.md) describe el plano de control actual.

## C4 · Nivel 1: contexto

```mermaid
flowchart LR
  Cliente[Comprador en Perú] --> GP[Gamer Perú]
  Staff[Equipo con RBAC] --> GP
  GP --> Auth[Supabase Auth]
  GP --> PG[Supabase PostgreSQL]
  GP --> CF[Cloudflare: cómputo y objetos]
  GP --> Jobs[Inngest]
  GP --> Mail[Resend]
  GP --> AI[Proveedores de IA autorizados]
  GP -. integración externa opcional .-> EC[EC OS]
```

EC OS no es requisito para navegar, comprar ni operar. Las flechas describen dependencias lógicas del código; no certifican credenciales activas ni tráfico de producción.

## C4 · Nivel 2: contenedores

```mermaid
flowchart TB
  B[Navegador: React y compresión Canvas] --> W[Worker OpenNext: RSC, APIs y dominio]
  B --> Assets[ASSETS: JS, CSS y estáticos]
  B --> Auth[Supabase Auth]
  W --> Auth
  W --> H[Hyperdrive]
  H --> DB[Supabase PostgreSQL]
  B -->|PUT firmado| Public[R2 PUBLIC_MEDIA]
  Public --> CDN[media.gamerperu.com]
  CDN --> B
  W -->|firma, HEAD, rango acotado y DELETE| Public
  W --> Proof[R2 PRIVATE_PROOFS]
  W --> Payment[R2 PRIVATE_PAYMENT_MEDIA]
  Backup[Proceso de respaldo] --> Backups[R2 DB_BACKUPS]
  W --> Cache[R2 gamerperu-next-cache]
  W --> Queue[DOQueueHandler]
  W --> Tags[DOShardedTagCache]
  Queue -->|WORKER_SELF_REFERENCE| W
  W --> Images[Cloudflare Images IMAGES: next/image]
  W --> Inngest[Inngest: outbox, expiración y sweep]
  Inngest --> W
  W --> Resend[Resend]
  B --> Sentry[Sentry cliente bajo demanda]
```

Los cuatro buckets lógicos de negocio se resuelven por configuración S3; solo `NEXT_INC_CACHE_R2_BUCKET` está vinculado directamente como binding R2 de OpenNext. Las pruebas locales usan loopback. El bucket retirado de staging no forma parte de este diseño.

**GP-060 no se implementó.** La subida nueva no envía el archivo por Worker; `next/image` todavía puede usar Worker/IMAGES. La normalización de galería ocurre en el navegador, con salida hasta 2400 px y 4 MiB. El servidor comprueba metadatos y hasta 4096 bytes del objeto.

## C4 · Nivel 3: componentes

```mermaid
flowchart LR
  UI[app y components] --> Control[Route Handlers y Server Actions restantes]
  Control --> Auth[lib/auth: identidad y RBAC]
  Control --> Services[lib/admin, checkout, orders, payments, inventory]
  Services --> Schema[db: Drizzle, transacciones y locks]
  Services --> Ledger[admin/media/upload-ledger]
  Services --> Upload[admin/media/direct-upload-service]
  Upload --> Signer[storage/s3-signer: aws4fetch singleton]
  Upload --> Sniff[media/image-sniff: función pura]
  Services --> Cache[catalog-cache y home cache]
  Services --> Audit[audit y outbox]
  Audit --> Jobs[lib/inngest/functions]
  UI --> Client[media: API JSON, Canvas y XHR]
  Client --> Control
  Client -->|PUT directo| R2[R2]
```

`upload-route-guard` verifica método, JSON, origen, sesión y permiso. `upload-route-handlers` comparte dispatch entre rutas. `r2-buckets` evita cargar el SDK para resolver nombres. El ledger mantiene reservas y estados bajo bloqueo. Los servicios adjuntan assets y auditan en la misma transacción. Completar un producto PUBLISHED invalida el tag del catálogo; DRAFT no provoca esa invalidación.

## Despliegue y límites

```mermaid
flowchart TB
  Git[Commit aprobado] --> Linux[Build Linux: pnpm y OpenNext]
  Linux --> Dry[Wrangler dry-run: revisar artefacto]
  Dry --> Owner[Despliegue autorizado por el dueño]
  Owner --> CF[Cloudflare Workers]
  CF --> Static[ASSETS]
  CF --> Bindings[Hyperdrive, IMAGES, R2 cache y DO]
  CF --> External[Auth, PostgreSQL, Inngest y Resend]
```

El contexto de diseño del repositorio usa los límites consignados en ADR-011: 10 ms de CPU, 50 subrequests y 100 000 peticiones/día para Free. Antes de cambiar de plan, el dueño debe verificar las condiciones vigentes del proveedor. El gate del dueño compara bundle con **5869,50 KiB gzip**, con justificación sobre +20 KiB; no aplica el antiguo objetivo de 3 MB.

Reducir procesamiento de archivos y regeneraciones no demuestra que toda ruta Next/RSC cumpla el límite de CPU en producción. Se necesita Observability y tail tras el deploy. Los clientes PostgreSQL de Workers son por petición; el pool Node de desarrollo pertenece a su módulo. Los errores de servidor Workers se observan en Cloudflare; no se presupone Sentry servidor activo.

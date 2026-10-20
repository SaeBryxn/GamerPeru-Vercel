# GP-059 — Closure Report

## Base Checkpoint

`bcfd413` en `feat/cloudflare-workers`. Entrada desde GP-058: **5860,17 KiB gzip**;
base original aprobada por el dueño: **5869,50 KiB gzip**.

## Closure Checkpoint

Commit `feat(media): registro de subidas con presupuesto, cancelación y validación de firma (GP-059)`.
Sin push ni despliegue.

## Summary

Cada init reserva presupuesto atómicamente y crea PENDING; el uploadId ahora es su UUID.
Complete usa HEAD y hasta 4096 bytes para validar firma y dimensiones, y consume la reserva
con asset, referencia y audit en una transacción idempotente. Abort y sweep borran solo objetos
pendientes bajo bloqueo antes de liberar la reserva. El navegador intenta abortar al cancelar
y mediante sendBeacon al cerrar la página. El dashboard informa huérfanos sin borrar nada.

## Files Changed

- Esquema `catalog/media-uploads.ts`, registro de esquema, SQL 0022 y snapshot/journal generados.
- `upload-ledger.ts`, direct-upload-service.ts, servicios de galería, historia y home.
- `upload-route-handlers.ts` compartido y `r2-buckets.ts` separado del SDK; pruebas focalizadas aprobadas.
- `image-sniff.ts`, fixture WebP con/sin alfa, JPEG normal/progresivo y PNG.
- Ruta abort, esquemas y cliente de control, seguimiento de subidas activas en pagehide.
- Inngest media-uploads-sweep y registro del cron en `/api/inngest`.
- Reporte `orphans.ts`, tipo y contador de salud del catálogo.
- Configuración sin HMAC de medios; env.example, scripts de diagnóstico/rotación y runbooks.
- Pool Node de desarrollo: cada módulo conserva su pool sin cerrar el de otra ruta activa.
- Tests unitarios, integración local de presupuesto/concurrencia, pruebas de medios actualizadas
  y E2E de cancelación con presupuesto. Fixture S3 HTTP exclusivamente en loopback para E2E.

## Decisions

- ADR-014. Se conserva el PUT directo y las URLs R2 inmutables; no hay proxy de archivos en Worker.
- Presupuesto de 8 GiB y uso inicial SUM de assets públicos; no se consulta la cuenta de R2.
- UPDATE de reserva, INSERT y firma se ejecutan dentro de la misma transacción: una firma fallida
  revierte la reserva. Completar bloquea el upload y mueve reservado a usado una sola vez.
- DELETE se espera bajo row lock. Si falla, el rollback conserva reserva y estado para reintentar.
  Abort sobre READY no borra nada. Sweep usa skipLocked y como máximo cien filas.
- Las dimensiones del navegador son solo entrada compatible; las persistidas vienen del header.
  Un JPEG cuyo marcador SOF no cabe en 4 KB se rechaza de forma segura.
- Se añade al reporte de huérfanos la protección del principal de producto además de las referencias
  de product_media y home_section_media; solo cuenta PUBLIC_MEDIA mayores de 30 días.
- El test S3 local no verifica SigV4: firma/cabeceras se verifican en unit tests; el fixture solo
  permite comprobar PUT/HEAD/range/DELETE sin red de producción.

## Validation Performed

- `pnpm check`: código 0, formato, typecheck y lint sin warnings nuevos, **1922 pruebas / 168 archivos**,
  build Next aprobado. La consolidación posterior de handlers/buckets pasó **60/60** focalizadas;
  el build Linux final vuelve a validar TypeScript y compilación de esos módulos.
- `pnpm test:e2e` en puerto 3001: **161/161**, código 0, usando la configuración canónica importada.
- `pnpm test:admin:live`, Supabase local: **272/272 en 14 archivos**, código 0. Incluye reserva
  exactamente en el límite, dos reservas concurrentes incompatibles y doble complete/abort.
- E2E admin focalizadas: **4/4**, código 0. Incluye init real, PUT pausado, cancelación,
  estado ABORTED, presupuesto restaurado y ausencia de nueva referencia.
- Verificación SQL local: RLS `true` en ambas tablas; privilegios anon/select, authenticated/update
  y service_role/insert comprobados `false`. Migración aplicada exclusivamente con guard local.
- `pnpm ignored-builds` en Linux: código 0, ninguno automático; @google/genai y sharp explícitos,
  sin cambiar allowBuilds.
- `pnpm cf:build` y `wrangler deploy --dry-run` en Linux: código 0, sin despliegue.
- Bundle **antes del GP 5860,17; después 5864,57 KiB gzip**, delta **+4,40 KiB**. Respecto
  de la base original **5869,50**, delta **−4,93 KiB**. La primera medición fue 5874,18
  (+4,68 sobre base), también aceptada expresamente por el dueño; la consolidación probada
  se conserva. No se requiere justificación por superar 20 KiB ni se modifica Next/OpenNext.
- BASELINE comparable: jsdom scrollTo **7 → 7**, OpenNext experimental **1 → 1**;
  código nuevo/modificado con **0 warnings** de lint, tipos y build. Se conservan las categorías
  preexistentes del emulador/terminal/fixtures, sin relajar seguridad.
- Evidencias locales: `C:/Users/bryan/AppData/Local/Temp/gamerperu-gp059-{check,focused,live,admin,e2e,cfbuild}.log`.
  El fixture S3 local permite repetir las pruebas sin cuenta ni objetos R2 de producción.

## Acceptance Criteria

- Reserva exactamente en el límite, 409 al exceder y carrera real entre dos reservas: live local.
- Doble complete consume una vez; abort libera reserva y conserva READY: live local.
- Otro actor 403, estados terminales 409; fallo de DELETE sin liberar: unit.
- Magic bytes WebP VP8/VP8L/VP8X, JPEG SOF0/SOF2, PNG y tipos de video: fixtures/unit.
- Firma incompatible produce 422 y elimina/rechaza; dimensiones del browser no sobrescriben header.
- Cancelar durante PUT no adjunta imagen y devuelve el presupuesto a su valor previo: E2E local.
- Cron, límite 100 y skipLocked: unit. Tablas con RLS y roles de API sin permisos: verificación SQL local.
- Source/scripts sin consumidores del antiguo HMAC ni staging. El dueño puede retirar ambos valores.

## Deviations / Notes

Se detectó un problema previo del pool Node al ejecutar rutas distintas en desarrollo:
la inicialización de un nuevo bundle cerraba el pool de otra petición, causando CONNECTION_ENDED.
Se eliminó ese cierre global, conservando el retiro automático por idle_timeout=20. La rama
Workers mantiene sus clientes por petición. La e2e reprodujo el fallo y pasó tras el cambio;
una prueba de ciclo de módulos evita que vuelva a cerrarse una conexión ajena.

La migración se generó con Drizzle. Se revisó y se añadió deliberadamente al SQL generado
el REVOKE y la semilla contable, como en 0021; no se reescribieron snapshots manualmente.
Se respaldó la base local en `/tmp/gp059-before-media-uploads.dump` dentro del contenedor
Supabase antes de aplicar. El migration guard se ejecutó en local, con autorización hosted falsa.

BASELINE de herramientas según la corrección del dueño: OpenNext experimental, jsdom scrollTo,
colores de terminal, hidratación/DO del emulador e imágenes de localhost. No se relajó seguridad.
Los logs del dev server también conservan incidencias de cierre de stream durante teardown;
no se atribuyen a CPU de producción. Ningún dato de producción se usó en los fixtures.

## Risks / Follow-ups

La migración debe aplicarse por el dueño antes del deploy. Retirar HMAC de medios y variable de
staging, y borrar el bucket antiguo tras revisión. Las autorizaciones HMAC anteriores al cambio
no tienen ledger y no pueden confirmarse con GP-059. Los objetos previos no se reprocesan.

El beacon es de mejor esfuerzo; sweep recupera PENDING caducadas con una hora de margen. El
presupuesto es contabilidad del servidor y no un inventario independiente del bucket. Las
comprobaciones reales de CPU, CORS y objeto publicado quedan exclusivamente al dueño.

### QA funcional pendiente del hotfix y del ledger

- JPG, PNG con transparencia, WebP y AVIF; rechazo claro de HEIC.
- Original de 20 MB aceptado y optimizado; 25 MB rechazado.
- Cancelación a mitad: sin imagen y reserva liberada (GP-059).
- Red interrumpida: reintento limitado y finalización.
- Doble confirmación: sin duplicación; dos pestañas: orden sin posiciones repetidas.
- Presupuesto excedido: 409 claro (GP-059).
- Sesión caducada: 401 sin reintentos; URL caducada: 403 y mensaje para volver a subir.
- Variante, principal, reordenación, desvinculación y publicación reflejadas en PDP.
- Subida DRAFT sin invalidación del storefront.
- Home: imagen, video y póster, guardar y publicar.
- Pago Yape/Plin enviado sin pasar a pagado antes de verificación administrativa.

### QA visual y accesibilidad pendiente

- Barra de progreso accesible y Cancelar operable por teclado.
- Errores anunciados por aria-live; estados vacío, cargando, error y éxito.
- Editor y admin home a 360, 768 y 1280 px.
- Foco visible y contraste AA en los chips de la cola.
- LCP de PDP con imágenes de 2400 px mediante Lighthouse local.

### Producción: exclusivamente el dueño después del despliegue

- `wrangler tail` y Observability sin `exceededCpu` tras subir cinco fotos, publicar y abrir PDP.
- Descarga sin EXIF, orientación correcta, máximo 2400 px y Cache-Control immutable.
- Dominio propio R2 `media.gamerperu.com` activo y `NEXT_PUBLIC_CDN_URL` correcto, sin ruta
  `/media` del Worker.
- CORS público con PUT desde el dominio principal y www.
- Borrado del bucket de staging retirado y eliminación de `R2_CATALOG_STAGING_BUCKET`.

## Repository Status

Un commit de GP-059 en la misma rama, sin push. Handoff preexistente sin seguimiento conservado.
Solo se aplicó la migración al Supabase local. Fixture HTTP S3 escucha en 127.0.0.1.

## Final Status

PASS WITH NOTES. Registro, presupuesto, validación, cancelación y limpieza implementados y
validados localmente. Las comprobaciones de producción siguen pendientes del dueño; GP-060
no se ejecuta. GP-061 continúa con el gate documental abreviado autorizado.

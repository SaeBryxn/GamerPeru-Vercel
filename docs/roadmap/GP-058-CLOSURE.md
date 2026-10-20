# GP-058 — Closure Report

## Base Checkpoint

`05b4e02`, rama `feat/cloudflare-workers`. Base de tamaño medida en Linux: **5869,50 KiB gzip**.

## Closure Checkpoint

Commit `fix(media): plano de control de subida sin Server Actions ni SDK para evitar Error 1102 (GP-058)`.
Sin push ni despliegue. Criterios de gate corregidos por el dueño al reanudar este checkpoint.

## Summary

Galería, historia y home solicitan y confirman subidas mediante Route Handlers JSON. El PUT
sigue directamente del navegador a R2. El adaptador predeterminado firma con aws4fetch por
isolate, evitando construir S3Client por petición. Complete solo expira el tag del catálogo
cuando el producto bloqueado está PUBLISHED; no revalida rutas ni renderiza el editor.

El cliente usa XHR con progreso monótono y AbortSignal, dos reintentos adicionales acotados y
un refresh por lote. Galería acepta originales JPEG, PNG, WebP y AVIF hasta 20 MiB y genera
WebP/JPEG hasta 2400 px y 4 MiB. HEIC recibe un mensaje explícito.

## Files Changed

- `src/lib/storage/s3-signer.ts`, adaptadores `media-storage.ts` y `media-storage-sdk.ts`.
- `src/lib/admin/media/upload-route-guard.ts`, rutas init y complete en `/api/admin/media/uploads`.
- `src/lib/media/upload-api-schema.ts`, `upload-api-client.ts`, `direct-upload-client.ts`, política.
- Servicios de galería e historia: estado del producto bajo row lock, metadatos y URL pública.
- `catalog-cache.ts`: invalidación de datos independiente de la invalidación de publicación.
- Editor de producto, uploader de historia y campos de home migrados al cliente HTTP.
- Server Actions de subida retiradas de actions.ts; eliminados story-media-actions.ts y home-media-actions.ts.
- aws4fetch 1.0.20 exacta y lockfile; tests de firma, rutas, reintentos, almacenamiento y consumidores.
- E2E admin de cancelación, límite de origen y control JSON de historia; documentación del gate corregido.

## Decisions

- ADR-014 amplía ADR-012/013. El token HMAC se conserva como uploadId opaco solo en GP-058;
  GP-059 lo sustituye por el ledger persistente.
- El SDK de catálogo queda en un módulo separado usado únicamente por sus tests, evitando
  importarlo desde el adaptador predeterminado. Otros dominios conservan sus adaptadores.
- Los guards de servicio se mantienen además del guard HTTP. No cambia proxy.ts.
- El estado de galería e historia procede del SELECT FOR UPDATE; el cliente no decide qué invalidar.
- Un 403 HTML del control conserva su estado: no se convierte en un 5xx reintentable por fallar JSON.
- En GP-058 cancelar detiene el PUT y evita complete; eliminar objetos y liberar reservas
  persistentemente corresponde a GP-059. Desvincular medios no elimina objetos.
- El requisito absoluto de 3 MB se sustituyó por comparación con base; no se optimizó Next/OpenNext.

## Validation Performed

- `pnpm check`: código 0; formato, typecheck, lint, **1905 pruebas / 164 archivos** y build.
- Regresión posterior de respuesta HTML 403: suite focalizada **29/29**; ESLint de los archivos
  finales modificados, cero warnings. Incluye el caso adicional posterior al check completo.
- `pnpm test:e2e` con config canónica importada en temporal para puerto 3001: **161/161**, código 0.
- `pnpm test:admin:e2e` focalizado GP-058/S8, con Supabase local y semilla oficial: **3/3**, código 0.
- `pnpm ignored-builds`: código 0. En Linux: ninguno automático, solo @google/genai y sharp
  explícitos como en la base; sin cambios de allowBuilds. En Windows la herramienta informa
  que no identifica el manifiesto local; la auditoría reproducible se hizo en Linux.
- `pnpm cf:build` en Linux con lockfile congelado y dry-run, sin desplegar: código 0.
- Bundle: **antes 5869,50 KiB gzip; después 5860,17 KiB gzip; delta −9,33 KiB**. No aumenta;
  no requiere excepción de más de 20 KiB. No se cambió Next/OpenNext.
- BASELINE comparable: jsdom scrollTo **7 → 7**, OpenNext experimental **1 → 1**. Lint,
  typecheck y build del código modificado: **0 warnings nuevos**. E2E conserva los tipos
  preexistentes de colores, hidratación, DO e imágenes fixture de localhost.
- Logs locales: `C:/Users/bryan/AppData/Local/Temp/gamerperu-gp058-{check,e2e,admin,cfbuild}.log`.
- No se necesita `test:admin:live` de migración en este paso; se ejecuta en GP-059.

## Acceptance Criteria

- Firma de Content-Type, Cache-Control y Content-Length, caducidad y path-style: pruebas unitarias.
- HEAD 404 devuelve ausencia; 500 y longitud ausente fallan cerrado; range acotado aun si R2 ignora Range.
- Origin ajeno 403, sesión ausente 401, permiso ausente 403, Zod inválido 400; despacho de cinco propósitos.
- DRAFT y ARCHIVED sin invalidación; PUBLISHED solo revalidateTag, sin revalidatePath.
- PUT reintenta red, 5xx, 408 y 429 como máximo dos veces; 400/401/403/409/422 no se reintentan.
- Complete reintenta red/5xx, conserva 403 incluso si el body no es JSON. Cancelar no confirma.
- Progreso monótono y control Cancelar operable por teclado, probado en Chromium local.
- `rg` confirma ausencia de consumidores de las seis Server Actions eliminadas.
- CPU real menor de 10 ms: pendiente de medición del dueño; las pruebas locales no lo demuestran.

## Deviations / Notes

Paso 1 reclasificado **PASS WITH NOTES** por instrucción del dueño. **BASELINE** de tooling:
OpenNext experimental, jsdom scrollTo, NO_COLOR/FORCE_COLOR, hidratación y DO del emulador,
y optimizador con localhost. No se relajó configuración de seguridad.

En las ejecuciones admin se observó además `The destination stream closed early` durante
el cierre de página en desarrollo, con las tres aserciones aprobadas; se conserva el log
como incidencia de teardown y no se atribuye al PUT ni a producción. No se suprimió el mensaje.

Las suites unitarias canónicas esperan NEXT_PUBLIC_SITE_URL=http://localhost:3000. Solo E2E
usa servidor 3001, puesto que 3000 pertenece a Docker. Las pruebas generales mantienen su
origen canónico de SEO, con medios fixture relativos al servidor local. Las pruebas admin
usan SITE/CDN localhost:3001 y Supabase localhost:54321. Ninguna usa producción.

## Risks / Follow-ups

Ejecutar GP-059 y después GP-061. GP-060 queda excluido. El dueño debe medir con tail cinco
subidas reales después del despliegue. Las pruebas focalizadas admin no sustituyen la suite
admin completa ni la QA visual manual en todos los tamaños.

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

Un commit del paso 2 en la misma rama, sin push. `docs/handoff/` preexistente continúa sin
seguimiento. No se generan migraciones en este GP ni se contactan servicios de producción.

## Final Status

PASS WITH NOTES. Hotfix implementado y validado localmente. Quedan pendientes la medición
real de CPU y la QA del dueño tras el despliegue; GP-059 añade el registro, la liberación
persistente y la validación de firma del archivo.

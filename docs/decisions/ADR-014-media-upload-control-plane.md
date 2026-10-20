# ADR-014 — Plano de control mínimo para subidas de medios

## Status

ACCEPTED — 2026-10-20, por encargo del dueño. Amplía
[ADR-012](ADR-012-administrable-homepage-direct-media-upload.md) y
[ADR-013](ADR-013-gallery-direct-upload.md), dentro del despliegue de
[ADR-011](ADR-011-cloudflare-workers-hosting.md). Se implementa por etapas en
[GP-058](../roadmap/GP-058.md) y GP-059.

## Context

La subida ya transfiere el archivo del navegador directamente a R2, pero autoriza y confirma
mediante Server Actions. La confirmación de galería invalida el editor y el layout raíz; Next
puede renderizar de nuevo el editor dentro de esa invocación. Además, el adaptador construye un
S3Client en cada autorización y confirmación. Ambas operaciones añaden CPU al Worker Free,
cuyo presupuesto operativo es 10 ms por invocación. La invalidación raíz por cada foto también
provoca regeneraciones de páginas ajenas al producto, incluso cuando sigue en borrador.

El HEAD actual comprueba tipo y tamaño declarados, pero no la firma del archivo ni sus
dimensiones reales. Los tokens HMAC no permiten contabilizar reservas, cancelar de forma
persistente ni limpiar subidas abandonadas con trazabilidad.

## Decision Drivers

- Reducir CPU de autorización y confirmación sin transportar el archivo por el Worker.
- Mantener autorización, validación, auditoría e idempotencia en el servidor.
- Reservar capacidad de almacenamiento antes de firmar y evitar sobrepasarla bajo concurrencia.
- Conservar referencias y objetos ya publicados; quitar una referencia no borra el objeto.
- Verificar localmente con fixtures, sin peticiones a producción ni cambios del plan.

## Options Considered

1. Route Handlers, firma ligera y registro transaccional de subidas: elegido.
2. Mantener Server Actions y el SDK por invocación: conserva el coste que motiva el cambio.
3. Multipart a través del Worker: rechazado por CPU, memoria y tránsito de archivos.
4. Servir `/media` a través del Worker: rechazado; añade invocaciones a cada entrega.
5. Snapshots JSON en R2 como fuente de verdad: rechazado; duplica estado y complica consistencia,
   autorización e invalidación del catálogo relacional.

## Decision

1. `POST /api/admin/media/uploads`, `/complete` y `/abort` son Route Handlers. Exigen JSON,
   mismo origen, sesión verificada y el permiso existente `catalog:manage`. Responden sin caché
   y sin detalles internos de errores. No revalidan rutas del admin.
2. El firmante de medios usa `AwsClient` de `aws4fetch`, memoizado por isolate. Firma PUT con
   tipo, longitud exacta y Cache-Control. El SDK sigue disponible para otros dominios y sus
   pruebas. Un endpoint S3 explícito usa path-style; R2 nativo usa región `auto`.
3. GP-058 conserva temporalmente el token HMAC como `uploadId` opaco, sin migración. GP-059 lo
   sustituye por el UUID de `media_uploads`, ligado a actor, propósito, producto, variante,
   objeto, tamaño y caducidad.
4. GP-059 reserva bytes con un UPDATE condicional atómico del presupuesto antes del INSERT
   PENDING. El presupuesto inicial es 8 GiB; el uso inicial procede de los assets públicos.
   READY, ABORTED, EXPIRED y REJECTED son estados terminales. READY permite replay idempotente.
   La confirmación registra asset, referencia, auditoría y consumo en una transacción.
5. El navegador prepara imágenes con bitmap y canvas: WebP, calidad 0.86, lado mayor de galería
   hasta 2400 px, sin ampliar, sin EXIF y conservando alfa. Si no hay codificador WebP, usa
   JPEG sobre blanco. La galería admite originales JPEG, PNG, WebP y AVIF de hasta 20 MB y
   exige salida de hasta 4 MB; HEIC recibe un rechazo explícito.
6. El PUT va directo a R2 con XMLHttpRequest, progreso y cancelación. Tiene como máximo dos
   reintentos adicionales para red, 5xx, 408 o 429. Complete solo reintenta red o 5xx. Los
   errores 400, 401, 403, 409 y 422 no se reintentan. El editor refresca una vez por lote.
7. En GP-059, complete hace HEAD y una lectura acotada de los bytes 0–4095. Un módulo puro
   verifica WebP, JPEG, PNG, MP4 o WebM; las dimensiones de imagen proceden del encabezado.
   Una firma incompatible elimina el objeto y marca REJECTED. Esto no es una decodificación
   completa del archivo ni una transformación en el Worker.
8. Abort elimina el objeto de una subida pendiente y libera su reserva; pagehide intenta
   notificar con sendBeacon. Inngest limpia como máximo 100 PENDING caducadas, con una hora
   de margen, a los 17 minutos de cada hora. Los fallos de almacenamiento deben ser visibles
   y reintentables sin liberar dos veces los mismos bytes.
9. DRAFT y ARCHIVED no invalidan el storefront. PUBLISHED expira exclusivamente
   `CATALOG_CACHE_TAG` mediante `revalidateTag(tag, { expire: 0 })`. Publicar y despublicar
   mantienen su invalidación actual. No se llama a `revalidatePath("/", "layout")` por subida.
10. Los objetos públicos usan claves UUID nuevas y `public, max-age=31536000, immutable`;
    se entregan desde el dominio propio R2 `media.gamerperu.com`, sin ruta de medios del Worker.
    Quitar una imagen solo desvincula; el informe de huérfanos es de solo lectura.

## Consequences

La subida evita el render del editor en su invocación y reduce el coste del firmante. El
registro permite contabilidad concurrente, cancelación y limpieza auditables. Se añaden una
migración y estados de fallo que deben probarse bajo concurrencia. Un range de 4 KB puede no
contener el marcador de dimensiones de un JPEG: ese archivo se rechaza de forma segura.

Reducir trabajo no demuestra por sí solo que cada invocación quede por debajo de 10 ms. El
dueño debe medir cinco subidas reales con Workers Logs después del despliegue. GP-060 y
ADR-015 quedan como mejora opcional posterior para evitar transformaciones responsive.

## Security / SEO / Performance Impact

- Seguridad: control de origen y RBAC antes del servicio; firma de cabeceras; registro ligado
  al actor; presupuesto transaccional; magic bytes y dimensiones del servidor en GP-059.
- SEO: conserva URLs inmutables y metadatos de accesibilidad; cambia la invalidación de datos.
- Rendimiento: sin archivo completo en el Worker; hasta 4 KB de inspección en GP-059; un
  firmante por isolate; sin invalidación de borradores. El límite de bundle comprimido
  exigido por este encargo es menor de 3 MB y se mide en Linux, sin desplegar.

## Migration / Reversal

GP-058 cambia transportes y cliente sin esquema. GP-059 genera una migración Drizzle aditiva
con RLS y revocación a roles de API, inicializa el presupuesto y elimina el secreto HMAC
cuando no tenga consumidores. Cada paso tiene su commit y gates antes del siguiente.

Un rollback del código de GP-059 requiere coordinar las reservas pendientes; no se borran las
tablas ni los objetos publicados. El staging ya retirado no se restaura. La verificación en
producción y la eliminación física del bucket antiguo corresponden al dueño.

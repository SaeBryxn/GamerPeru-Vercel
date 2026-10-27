# Publicar el catálogo extraído

La extracción y la publicación son pasos separados. Todos los productos de esta carga deben quedar
`PUBLISHED`, con variantes activas y existencias propias en cero. El dueño puede ocultarlos después
desde Productos. Los scripts nunca copian existencias ni reseñas del proveedor.

Desde la raíz del repositorio, con `.env.local` configurado y un directorio de extracción existente:

```powershell
node scripts/catalog/snapshot-extracted-publication.mjs scratch/catalogo-20261027
node scripts/catalog/prepare-extracted-publication.mjs scratch/catalogo-20261027
node scripts/catalog/prepare-extracted-media.mjs scratch/catalogo-20261027 --upload
node scripts/catalog/reconcile-extracted-media.mjs scratch/catalogo-20261027/publication
node scripts/catalog/validate-extracted-publication.mjs scratch/catalogo-20261027/publication
node scripts/catalog/ensure-extracted-taxonomy.mjs scratch/catalogo-20261027/publication --apply
node scripts/catalog/apply-supplier-catalog.mjs scratch/catalogo-20261027/publication --apply
node scripts/catalog/verify-supplier-catalog.mjs scratch/catalogo-20261027/publication
```

La copia inicial se conserva sin sobrescribir. Las imágenes locales se comprueban por SHA-256,
se convierten a WebP y se suben a R2 verificando tamaño y hash. El proceso se puede reanudar.
La conciliación reutiliza los assets ya registrados y evita contabilizarlos dos veces. Las imágenes
de historia conservan su ubicación `STORY`, y las fotos de cada opción conservan la relación con su
variante. La validación usa los mismos validadores de publicación, configuración e historia del
administrador; el compilador proviene de la dependencia existente y fijada de Drizzle Kit.

Los precios de Memory Kings usan la referencia PEN más 3% y redondeo comercial. Attack Shark usa
el PVP PEN regional, una reserva de 18%, logística y margen estimado de 15%. Son precios sugeridos,
no costos confirmados. Cuando JINMS no publica un precio, se usa una estimación del mismo modelo
existente o de la mediana de la categoría del catálogo actual. El detalle queda en
`publication/precios-provisionales.json`; la referencia original se conserva sin inventar ofertas.

Después de publicar, invalidar la caché del catálogo mediante el flujo habitual del administrador
o desplegar una compilación limpia de Cloudflare. Comprobar los enlaces públicos antes de dar la
carga por terminada. No ejecutar de nuevo la importación antigua de ATK/MCHOSE para esta carga.

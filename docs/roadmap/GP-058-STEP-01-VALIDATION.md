# GP-058 — Validación del paso 1 (ADR-014)

## Base Checkpoint

`48eafd2` en `feat/cloudflare-workers`, GP-057. Fecha de ejecución: 2026-10-20.

## Closure Checkpoint

Commit documental `docs(adr): aceptar ADR-014 y abrir GP-058`. Este informe sigue la
plantilla de closure para registrar el checkpoint; GP-058 continúa abierto y su hotfix
todavía no está implementado. No constituye el closure funcional de GP-058.

## Summary

Se aceptó ADR-014, se añadió al índice y se abrió GP-058 con alcance, criterios y DoD.
La verificación inicial quedó FAIL por dos criterios del plan que el dueño corrigió al
reanudar: el máximo absoluto de 3 MB y el cómputo de advertencias preexistentes. Con los
criterios corregidos, este checkpoint se reclasifica PASS WITH NOTES.
Los pasos 2, 3, 4 opcional y 5 no se iniciaron.

## Files Changed

- `docs/decisions/ADR-014-media-upload-control-plane.md`.
- `docs/decisions/README.md`, una fila nueva.
- `docs/roadmap/GP-058.md`.
- Este informe de validación del paso documental.

No hay cambios en código de aplicación, dependencias ni migraciones versionadas.

## Decisions

- Documentar por separado el hotfix sin migración (GP-058) y el registro transaccional
  (GP-059); no atribuir presupuesto, aborto persistente o validación de firma al hotfix.
- Aplicar la corrección del dueño: no aumentar frente a 5869,50 KiB gzip; justificar cambios
  mayores de 20 KiB. No reducir Next/OpenNext en este GP ni modificar seguridad o plan.
- El contenedor Linux contiene el árbol versionado de `48eafd2`, sin `.env.local` ni
  `.dev.vars`; los únicos cambios del paso son documentos y no afectan al bundle medido.
- El puerto 3000 está ocupado por Docker. E2E usa una configuración temporal que importa
  la canónica, cambia al puerto 3001 y limita los workers a cuatro. No detiene otros servicios.

## Validation Performed

### Comprobación canónica

`pnpm check`: código 0. Prettier, TypeScript y ESLint pasan; Vitest registra 161 archivos y
1876 pruebas aprobadas; el build Next compila y genera las páginas.

La primera ejecución de formato falló por el documento preexistente sin seguimiento
`docs/handoff/PLAN-1102-SUBIDA-MEDIOS-CODEX.md`. Se guardó su original en
`C:/Users/bryan/AppData/Local/Temp/gamerperu-gp058-handoff-original-20261020.md` y se aplicó solo
Prettier; ese archivo no forma parte del commit.

El primer build encontró el Supabase local atrasado (`product_media.placement` y
`home_sections` ausentes), aunque Next terminó con código 0 por sus fallbacks. Se respaldó
esa base dentro de `supabase_db_gamerperu-local` en
`/tmp/gp058-before-existing-migrations.dump` y se ejecutó `pnpm db:migrate`, con
`GAMERPERU_MIGRATION_ENV=local`, `AUTHORIZED_HOSTED_DEPLOYMENT=false` y ambas URLs de base
apuntando a `127.0.0.1:54322/postgres`. No se generó ninguna migración nueva. Se verificaron
el último timestamp del journal `1792044999427` y las diez secciones de home. Después se
repitió `pnpm check`: ya no aparecen aquellos errores de consultas durante el build.

La suite unitaria aún emite diagnósticos de sus casos negativos y mensajes de jsdom
`Not implemented: Window's scrollTo() method`. Código 0 no equivale a demostrar el requisito
literal de salida sin advertencias.

### E2E

`pnpm test:e2e --config C:/Users/bryan/AppData/Local/Temp/gamerperu-gp058-playwright.config.ts`:
código 0, **161 pruebas aprobadas**, duración 1,3 minutos. Se ejecutaron los tests de la
configuración canónica, incluidas sus exclusiones de las suites admin/live; esto no demuestra
los nuevos flujos admin todavía pendientes de implementación.

La salida incluye avisos `NO_COLOR`/`FORCE_COLOR`, de reduced-motion, diferencias de atributos
durante la hidratación de React y bindings Durable Objects sin clases exportadas en el
emulador de desarrollo. También registra errores del optimizador al resolver imágenes fixture
con origen localhost como IP privada. No se habilitó
`dangerouslyAllowLocalIP` ni se relajó la seguridad para ocultarlos. Se registra el resultado
aprobado de las aserciones, sin atribuirle una salida libre de advertencias o imágenes sin errores.

### Dependencias

`pnpm ignored-builds`: código 0. Ningún build ignorado automáticamente; `@google/genai` y
`sharp` están ignorados explícitamente por el allowlist existente. No se alteró esa política.

### Cloudflare en Linux

`pnpm cf:build`: código 0 en Docker, imagen `node:24-bookworm`, Node 24 y pnpm 11.22.0,
con dependencias del lockfile congelado. La segunda ejecución, tras actualizar el esquema
local, termina sin los fallbacks de base observados en la primera.

Sigue apareciendo la advertencia de OpenNext:

```text
WARN Node.js middleware support is experimental in cloudflare, and not officially maintained by OpenNext maintainers. Use at your own risk.
```

Medición con `pnpm exec wrangler deploy --dry-run --outdir /tmp/gp058-dry-run` dentro de
Linux, sin despliegue ni autenticación en la cuenta:

```text
Total Upload: 27504.24 KiB / gzip: 5869.50 KiB
--dry-run: exiting now.
```

5869,50 KiB gzip son aproximadamente 5,73 MiB: supera tanto 3 MB decimales como 3 MiB.
El máximo de 3 MB quedó sustituido: antes = después = 5869,50 KiB gzip, delta 0 KiB.
El criterio corregido de tamaño pasa.

### Evidencias locales

Logs sin credenciales en `C:/Users/bryan/AppData/Local/Temp/`:

- `gamerperu-gp058-step1-check.log`.
- `gamerperu-gp058-step1-e2e.log`.
- `gamerperu-gp058-step1-cfbuild.log`.

## Acceptance Criteria

| Criterio del paso 1                                      | Resultado                                         |
| -------------------------------------------------------- | ------------------------------------------------- |
| ADR-014 basado en plantilla, ampliando ADR-012 y ADR-013 | Redactado y aceptado                              |
| Fila de índice y GP-058 con alcance y criterios          | Redactados                                        |
| `pnpm check` con código 0                                | Cumplido tras preparar el esquema local           |
| Cero advertencias nuevas del código modificado           | Cumplido; tooling preexistente BASELINE           |
| No aumentar bundle respecto a base                       | Cumplido: antes/después 5869,50 KiB gzip; delta 0 |
| Hotfix, ledger y documentación integral del MVP          | Pendientes; no implementados                      |

## Deviations / Notes

Las comprobaciones de preparación de base son locales. Se aplicaron migraciones existentes,
sin cambiar su SQL ni metadatos, y sin contactar la cuenta de Cloudflare ni la base alojada.
La configuración pública del sitio durante E2E conserva el origen canónico que esperan
las aserciones de SEO; el servidor visitado es `http://localhost:3001`, el CDN y Supabase
apuntan a localhost. Chromium bloquea la resolución DNS de `gamerperu.com` y sus subdominios.
No se verificó CPU real ni se desplegó.

Las advertencias ya observadas de OpenNext experimental, jsdom scrollTo, colores de terminal,
hidratación, DO del emulador e imágenes localhost se clasifican **BASELINE** por instrucción del
dueño. No bloquean; su número y tipo no deben aumentar. No se relajó seguridad.

## Risks / Follow-ups

Implementar GP-058, GP-059 y GP-061 en orden, con un commit y closure por paso. GP-060 no se
implementa. Medir bundle antes/después y distinguir las advertencias BASELINE de nuevas.

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

Rama `feat/cloudflare-workers`. Commit exclusivamente documental, sin push. Se conserva el
handoff previo sin seguimiento; su original está respaldado y solo se ajustó el formato.
El volumen y contenedor detenidos `gamerperu-gp058-linux-build` conservan el build Linux
para inspección; no son recursos de producción.

## Final Status

PASS WITH NOTES del paso documental, reclasificado por los criterios corregidos del dueño.
`pnpm check`, 1876 pruebas unitarias y 161 E2E aprobadas; bundle antes/después 5869,50 KiB gzip
(delta 0 KiB); advertencias de tooling **BASELINE**. Hotfix y pasos posteriores pendientes de
su propia implementación y cierre.

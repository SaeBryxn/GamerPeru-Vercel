# Gamer Perú — Lo que falta

Actualizado: 2026-10-20.

Este documento reemplaza el roadmap v1.2 en inglés y las especificaciones individuales
`GP-XXX.md`. Los GPs cumplidos se eliminaron del repositorio; su detalle sigue disponible en el
historial de git (por ejemplo `git log --oneline -- docs/roadmap/GP-024.md`).

## Ya cumplidos (eliminados)

| GP                     | Contenido                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GP-000 a GP-009        | Definición de producto, referencia visual, lenguaje de diseño, arquitectura, modelo de dominio, repositorio, estándares, base de la app, design system y navegación |
| GP-010 a GP-017        | Home, categorías y marcas, búsqueda, filtros, ficha de producto, autenticación, cuenta de cliente y carrito                                                         |
| GP-018 a GP-021        | Checkout, pagos manuales Yape/Plin, dominio de pedidos e inventario                                                                                                 |
| GP-022 a GP-027        | Base del admin, dashboard, gestor de productos, importación con IA, constructor de historias y pedidos en admin                                                     |
| GP-053, GP-054         | Home administrable y dashboard accionable                                                                                                                           |
| GP-058, GP-059, GP-061 | Plano de control de subidas (fix del Error 1102), registro/presupuesto de subidas y documentación del MVP (`docs/project/`)                                         |
| GP-026A                | Cancelado por decisión del dueño                                                                                                                                    |
| GP-060                 | Excluido: variantes responsive y loader propio de imágenes. Solo se retoma con alcance nuevo                                                                        |

## 1. Implementados, pero falta cerrarlos

### GP-028 — Verificación de pagos en admin

Integrado en `70188e1` (cola de verificación, aprobación, rechazo, reembolso externo registrado).

- [ ] Correr los gates finales (`pnpm check`, E2E) y confirmar CI en verde.
- [ ] No existe plantilla de correo para `RefundIssued`: hoy el operador avisa al cliente por otro canal.
- [ ] Revisar RLS: las tablas públicas tienen RLS desactivado (sin grants a `anon`/`authenticated`, pero conviene decidir la política).

### GP-055 — Subida directa a la galería de producto

- [ ] Verificar en producción: foto de celular, PUT 200 sin Error 1102, archivo sin EXIF y bien orientado, asignarla a una variante, marcarla principal y desvincularla.
- [ ] Vaciar y borrar el bucket `gamerperu-catalog-staging-private` y quitar `R2_CATALOG_STAGING_BUCKET` del Worker.
- [ ] Correr `pnpm test:admin:live` contra la base local.

### GP-056 — Destinos del mega-menú

- [ ] Verificar en producción las diez rutas nuevas, `sitemap.xml` y `robots.txt`.
- [ ] Agregar las URLs oficiales de software de MCHOSE y JINMS cuando las marcas las confirmen.
- [ ] Subir las imágenes de `public/media/mega-menu/software/` o cambiar esas tarjetas a íconos.

### GP-057 — Equipo y roles del admin

- [ ] El nivel Administrador no puede ajustar inventario: `inventory:manage` solo lo tiene `SUPER_ADMIN`. Requiere una migración aditiva de `role_permissions`.
- [ ] Correr `admin-team.spec.ts` contra Supabase local.
- [ ] Verificar `/admin/equipo` en producción con la sesión del dueño.

## 2. Tareas abiertas de GPs ya cerrados

### Producción (solo el dueño)

- [ ] Aplicar la migración `0022` en Supabase alojado antes del deploy.
- [ ] Medir con `wrangler tail` / Observability: subir cinco fotos, publicar y abrir la PDP sin `exceededCpu`.
- [ ] Comprobar el objeto publicado: sin EXIF, máximo 2400 px y `Cache-Control` immutable.
- [ ] Dominio R2 `media.gamerperu.com` activo y `NEXT_PUBLIC_CDN_URL` correcto.
- [ ] CORS del bucket con PUT desde el dominio principal y `www`.
- [ ] Retirar la configuración HMAC de medios y la variable de staging.
- [ ] Confirmar que llegaron a producción el arreglo de acciones rápidas en móvil y el filtro `pending=issues` del dashboard (GP-054).

### Home administrable (GP-053)

- [ ] Subida real de imagen, video y póster desde `/admin/home`, guardar y publicar.
- [ ] Agregar y eliminar secciones de la home.
- [ ] Limpieza explícita de medios huérfanos.

### QA funcional de subidas

- [ ] JPG, PNG con transparencia, WebP y AVIF; HEIC rechazado con mensaje claro.
- [ ] Original de 20 MB aceptado y optimizado; 25 MB rechazado.
- [ ] Cancelar a mitad: sin imagen y con la reserva liberada.
- [ ] Red interrumpida: reintento limitado y finalización.
- [ ] Doble confirmación sin duplicados; dos pestañas sin posiciones repetidas.
- [ ] Presupuesto excedido devuelve 409; sesión caducada 401; URL caducada 403.
- [ ] Subir en un producto DRAFT no invalida el storefront.
- [ ] Un pago Yape/Plin enviado no pasa a pagado sin verificación del admin.

### QA visual y accesibilidad

- [ ] Barra de progreso accesible y botón Cancelar operable por teclado.
- [ ] Errores anunciados con `aria-live`; estados vacío, cargando, error y éxito.
- [ ] Editor y admin de home a 360, 768 y 1280 px.
- [ ] Foco visible y contraste AA en los chips de la cola.
- [ ] LCP de la PDP con imágenes de 2400 px (Lighthouse local).

### Documentación (GP-061)

- [ ] Capturas pendientes: listado de productos (PLP) y pago manual.
- [ ] Confirmar que los diagramas Mermaid se ven bien en GitHub.

## 3. No implementados

El orden sigue las dependencias. "Estado actual" indica lo que ya existe en el código.

| GP     | Qué es                          | Alcance                                                                                       | Fuera de alcance             | Listo cuando                                                  | Depende de                     | Estado actual                                                                                                                                                      |
| ------ | ------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GP-029 | Inventario en admin             | Stock, ajustes, movimientos y filtro de stock bajo                                            | Automatización de almacén    | Los ajustes quedan validados, auditados y cuadran             | GP-021, GP-022                 | Parcial: el servicio de inventario (recepción, ajuste, transferencia, conciliación) existe y el editor muestra stock por variante. Falta la pantalla de inventario |
| GP-030 | Clientes en admin               | Búsqueda, perfil, pedidos, direcciones y resumen de referidos                                 | Automatización CRM           | Mínimo privilegio e historial útil                            | GP-016, GP-022                 | No existe `/admin/clientes`                                                                                                                                        |
| GP-031 | Motor de referidos              | Códigos/enlaces, ventana de atribución, conversión y base antiabuso                           | Comisiones de afiliados      | Atribución determinista y respetuosa de la privacidad         | GP-016, GP-020                 | Sin tablas ni código                                                                                                                                               |
| GP-032 | Programa de afiliados           | Estados, enlaces/códigos, reglas configurables y aprobación en admin                          | Panel del afiliado           | Reglas configurables y ciclo de vida auditado                 | GP-031                         | Sin tablas ni código                                                                                                                                               |
| GP-033 | Panel del afiliado              | Enlaces, clics, conversiones, ventas y resumen de comisiones                                  | Pagos automáticos            | Cada afiliado ve solo sus datos; métricas claras              | GP-032                         | No existe                                                                                                                                                          |
| GP-034 | Motor de comisiones             | Pendiente/aprobada/anulada/pagada, devoluciones y registro de pagos                           | Proveedor de pagos externo   | Cálculos e historial deterministas y probados                 | GP-020, GP-032                 | No existe                                                                                                                                                          |
| GP-035 | Asistente IA para clientes      | Ver detalle abajo                                                                             | Ver detalle abajo            | Ver detalle abajo                                             | GP-025, GP-036                 | No existe; solo hay IA interna para importar productos                                                                                                             |
| GP-036 | SEO técnico base                | Metadatos, canonicals, sitemap, robots, datos estructurados, redirecciones y códigos HTTP     | Campañas de contenido        | Sin duplicados sistémicos ni bloqueos de rastreo              | GP-014                         | Parcial: `sitemap.ts`, `robots.ts` y JSON-LD en PDP, guías y FAQ. Falta revisar canonicals, redirecciones y estados                                                |
| GP-037 | SEO de producto                 | Títulos, descripciones, slugs, canonicals, indexación y schema Product automáticos            | Programa de keywords         | Datos estructurados válidos y redirecciones seguras           | GP-024, GP-036                 | Parcial: `pdp-seo.ts` genera metadatos de PDP. Falta edición/automatización desde admin y redirecciones al cambiar slug                                            |
| GP-038 | SEO de categorías y marcas      | Metadatos, contenido, enlaces internos, canonicals y reglas de facetas                        | Guías editoriales            | Landings únicas e indexables con breadcrumbs                  | GP-011, GP-036                 | No iniciado                                                                                                                                                        |
| GP-039 | Arquitectura de contenido SEO   | Guías, comparativas, modelo de contenido, enlazado interno y campos SEO editoriales           | Contenido masivo con IA      | Plantillas útiles e indexables, sin páginas vacías o puerta   | GP-036, GP-038                 | Parcial: guías de compra en código (`src/content/guides`). Falta modelo administrable                                                                              |
| GP-040 | Analítica de comercio           | Eventos de comercio y crecimiento, compra confirmada en servidor y controles de privacidad    | Presentación BI              | Eventos documentados y probados; sin compras duplicadas       | GP-020, GP-031                 | No iniciado                                                                                                                                                        |
| GP-041 | Dashboard de analítica          | Embudos, conversión, ingresos, productos/categorías, afiliados y operación                    | Analítica de EC OS           | Métricas cuadran con la fuente de verdad y cargan rápido      | GP-023, GP-040                 | No iniciado                                                                                                                                                        |
| GP-042 | Contrato de integración EC OS   | Contrato versionado de eventos/API, auth, reintentos/idempotencia y minimización de datos     | Depender de EC OS en runtime | La tienda sobrevive a una caída de EC OS; contrato probado    | GP-020, GP-021, GP-034, GP-040 | No iniciado                                                                                                                                                        |
| GP-043 | Endurecimiento de seguridad     | Autorización, entradas y subidas, secretos, headers, sesión/CSRF, rate limits, dependencias   | Funcionalidades nuevas       | Hallazgos de riesgo alto resueltos y registrados              | GP-042                         | Parcial: headers de seguridad en `next.config.ts`. Falta auditoría integral (incluye RLS)                                                                          |
| GP-044 | Endurecimiento de rendimiento   | Bundle, medios, caché, base de datos, consultas, LCP/CLS/INP                                  | Funcionalidades nuevas       | Presupuestos medidos y cumplidos en páginas clave             | GP-043                         | No iniciado (bundle base aceptado: 5869,50 KiB gzip)                                                                                                               |
| GP-045 | Endurecimiento de accesibilidad | Teclado, foco, semántica, formularios, diálogos, contraste, alt y movimiento reducido         | Funcionalidades nuevas       | Flujos críticos accesibles y revisiones documentadas          | GP-044                         | No iniciado                                                                                                                                                        |
| GP-046 | QA responsive                   | Breakpoints, dispositivos, orientación, táctil, medios, desbordes, checkout y admin           | Nuevo design system          | Sin defectos responsive críticos; matriz de evidencia         | GP-045                         | No iniciado                                                                                                                                                        |
| GP-047 | Auditoría SEO                   | Rastreo, metadatos, schema, canonicals, sitemap, robots, redirecciones, enlaces y rendimiento | Garantía de ranking          | Cero bloqueos críticos e informe de corrección                | GP-039, GP-046                 | No iniciado                                                                                                                                                        |
| GP-048 | QA de comercio                  | Catálogo → carrito → checkout → pago → aprobación admin → despacho, con casos borde           | Pruebas de escala            | Rutas E2E críticas y consistencia de datos pasan              | GP-047                         | No iniciado (existen suites E2E por módulo)                                                                                                                        |
| GP-049 | Preparación para producción     | Backups y recuperación, entornos y secretos, monitoreo, runbooks, políticas y rollback        | El despliegue en sí          | Checklist go/no-go completo; recuperación y rollback probados | GP-043 a GP-048                | No iniciado                                                                                                                                                        |
| GP-050 | Despliegue a producción         | Infraestructura, configuración, dominio, TLS, deploy y smoke tests de monitoreo               | Campañas de búsqueda         | Producción sana y con camino de rollback                      | GP-049                         | De hecho la tienda ya corre en Cloudflare Workers (gamerperu.com). Falta formalizar smoke tests y rollback                                                         |
| GP-051 | Lanzamiento en buscadores       | Search Console, sitemap, robots, medición de búsqueda e integraciones de merchant             | Garantía de ranking          | Requisitos de indexación y medición operativos                | GP-050                         | No iniciado                                                                                                                                                        |
| GP-052 | Lanzamiento v1                  | Checklist de lanzamiento, smoke, responsables, KPIs base, problemas conocidos y monitoreo     | Funcionalidades v2           | Todos los gates pasan; release v1 y línea base documentados   | GP-051                         | No iniciado                                                                                                                                                        |

### GP-035 — Asistente IA para clientes (detalle)

Chatbot público para descubrir productos, recomendar, resolver dudas de la tienda y consultar
pedidos propios.

**Incluye:** interfaz de chat, perfil de IA independiente del proveedor, búsqueda en conocimiento
público, herramientas de búsqueda/recomendación y comparación de productos, tarjetas y enlaces a
productos, preguntas sobre políticas de la tienda, consulta del estado de pedidos del cliente
autenticado, límites de privacidad, defensas contra prompt injection, rate limits, escalamiento a
humano, modelo de conversación, analítica de uso y ajustes en admin.

**No incluye:** aprobar pagos, ejecutar reembolsos, cambiar precios o stock, publicar productos,
consultas libres a la base de datos, acceso directo a EC OS ni compras autónomas.

**Listo cuando:**

- Responde sobre productos con datos del catálogo y recomienda con enlaces/tarjetas válidos.
- Compara productos y responde políticas de la tienda con fuentes.
- La herramienta de pedidos solo muestra pedidos del dueño de la sesión (verificado en servidor).
- Preguntas sobre márgenes, proveedores o EC OS no exponen datos internos.
- Pasa la batería de pruebas de prompt injection.
- Se puede cambiar proveedor/modelo desde el perfil de IA sin reescribir el chatbot.
- Escala cuando no sabe, en vez de inventar; el admin puede apagarlo globalmente.
- Registra uso, costo y resolución; es responsive y accesible y no afecta la carga inicial.

## 4. Propuestos sin número

Surgieron del cierre del MVP (`docs/project/10-limitaciones-y-futuro.md`):

- Reconciliación contable de subidas contra el contenido real del bucket.
- Métricas de CPU por ruta en Workers.
- Cobertura de estados de error en storefront y admin.
- Auditoría visual y de accesibilidad completa.
- Nueva entrega de imágenes (lo que era GP-060), si la medición de CPU lo justifica.

### Idea guardada el 23 de octubre de 2026

- [Armador público de PC y setup con comunidad](../plans/idea-armador-pc-setup-comunidad.md): configuración visual animada, presupuesto, orientación de compatibilidad y experiencias reales. Idea confirmada por el dueño para una incorporación futura; alcance técnico y prioridad pendientes. Por ahora solo se documenta.

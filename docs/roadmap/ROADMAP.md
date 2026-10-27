# Gamer Perú — Lo que falta

Actualizado: 2026-10-26.

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

### Catálogo ATK / MCHOSE e inventario visual

Carga solicitada por el dueño el 26 de octubre: 141 fichas publicadas (94 ATK y 47 MCHOSE),
702 variantes y 141 historias con fotos y características oficiales. Incluye los combos y los
colores hermanos de las variantes ya mantenidas por el dueño. Se conservaron las 11 fichas
anteriores y sus existencias. Las 589 URLs de imagen descargadas corresponden a 586 archivos
WebP únicos verificados en R2 y contabilizados en el presupuesto de medios sin duplicarlo al
reanudar. Precios sugeridos en PEN: 113 variantes con referencia minorista peruana y 589
estimadas desde el PVP oficial en USD. Costos sin completar y stock nuevo en cero.
La preparación, validación y carga reanudable están en `scripts/catalog/`; el manifiesto,
las fuentes y las comprobaciones de esta carga se conservan localmente en
`scratch/catalogo-20261026/`. No requiere migraciones nuevas.

Inventario incorpora foto y un único panel lateral con existencias, conteo e historial por
variante, conservando borradores y los controles de concurrencia del conteo. QA con fixtures
locales a 1440, 768, 390 y 320 px, sin modificar existencias reales.

- [ ] Recibir costos, fletes definitivos y cantidades del proveedor para validar márgenes y
      registrar las existencias físicas. El PVP oficial y la referencia minorista no son costos.
- [ ] Completar las características que el fabricante solo publica como imagen o no detalla
      en su ficha, especialmente accesorios. No se inventaron prestaciones faltantes.
- [ ] Desplegar el panel de inventario y comprobarlo con la sesión del dueño. Las fichas públicas
      nuevas se verificaron en localhost; la caché de producción puede conservar el catálogo
      anterior hasta su revalidación (máximo configurado: una hora).

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
- [ ] Decidir el paso a Workers Paid. Medido el 2026-10-23: el plan Free corta a 10 ms de CPU (716 Error 1102 ese día) y Next.js en Workers cuesta 6-8 ms por petición vacía, 12-26 ms por página caliente y 70-430 ms en frío. El código ya se recortó (prefetch por intención, SDKs diferidos, ISR de 1 h, carrito sin lectura en cada página); por debajo de 10 ms no hay margen.

### Home administrable (GP-053)

- [ ] La portada `/` nunca se regenera en Workers: `x-opennext-cache: STALE` permanente y el Durable Object de la cola registra `TimeoutError` y "failed after 6 retries". La tienda muestra los datos del último deploy y los cambios hechos en `/admin/home` no aparecen hasta desplegar. Las fichas de producto (ISR dinámico) sí se regeneran. Reproducir en Linux con `opennextjs-cloudflare preview` (el build falla en Windows por los symlinks de pnpm).
- [ ] Subida real de imagen, video y póster desde `/admin/home`, guardar y publicar.
- [ ] Agregar y eliminar secciones de otros tipos de la home. El carrusel de marcas ya se agrega desde el editor; las secciones existentes se ordenan u ocultan.
- [ ] Limpieza explícita de medios huérfanos.

### Pruebas

- [ ] `tests/unit/inventory-count-ui.test.tsx` ("conserva el motivo ante un error…") falla de forma intermitente en la suite completa y pasa sola; ya ocurría antes del 2026-10-23. Ajustar los `waitFor` o aislarla.

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

### Pedidos de la revisión del 26 de octubre de 2026

Hechos en `feat/cloudflare-workers`: página `/productos`, tope de stock en ficha y carrito,
orden de versiones en el admin, foto de la variante sin atributo de color, bolitas de color en
las tarjetas, redes sociales, interruptor del 5%, "Ver más" en los menús, guías de compra,
medidas sin repetir, franja de marcas y el botón flotante de WhatsApp con el
975 231 129 (`STORE_WHATSAPP`).

También implementado: selección manual y orden de productos en home y menú (incluye selección
vacía, sin rellenar con otros productos); carrusel de marcas con imágenes y enlaces internos
editables en `/admin/home`, ordenable y ocultable; cuatro tarjetas completas por vista en los
carruseles de escritorio; retirada de «Completa tu setup»; orden y visibilidad de historia y
opiniones desde el paso «Página del producto»; hasta tres fotos por reseña, con subida directa,
validación de compra/propiedad/producto, límite diario y moderación de texto y fotos en
`/admin/resenas`.

Revisión visual posterior: `/admin/menu` representa la barra y el desplegable. Los destacados del
menú y del home se eligen en un panel lateral como el de Pedidos, con fotos, búsqueda y posiciones
numeradas. Otro panel permite cambiar el nombre, destino, orden y visibilidad de los enlaces.
Soporte queda con Preguntas frecuentes, Contacto, Distribuidores y Tienda oficial; las guías salen
del navbar. Inicio prioriza una acción y tres cifras; colas, inventario y mantenimiento quedan
plegados. La migración `0027` añade `home_section_products` y `storefront_menu_products` (FK al
producto y al contenedor, posición única) y `storefront_menu_links` (FK al menú, grupo, destino,
orden y visibilidad), convierte los slugs anteriores a relaciones y habilita RLS con acceso solo
desde el servidor autorizado. Las secciones conservan sus textos en JSON, y las fotos siguen
usando `media_assets`/`home_section_media`.

Ampliación del mismo patrón: el home representa sus secciones con textos, imágenes y productos,
con edición lateral y vista previa del borrador. El catálogo permite abrir una vista rápida y
editar precio/oferta por versión con foto, control de concurrencia e idempotencia. El editor de
colores/tallas también usa un panel con vista previa. Categorías y marcas muestran la colección y
su URL; reseñas muestra las fotos y la opinión completa antes de moderar; Equipo permite revisar
la persona y el efecto del nivel de acceso antes de confirmarlo. No requiere nuevas tablas.

El menú de catálogo ahora limita los modelos por marca, distribuye una sola marca en dos columnas
y ofrece destinos filtrados por marca y categoría. Los límites y nombres cortos se editan en el
panel lateral y se guardan en el JSON existente; elegir productos conserva esos ajustes. Las
pestañas de Productos usan los enlaces editables del administrador. La selección, las fotos y
las marcas vienen del catálogo, sin listas de modelos fijas. Se corrigió la clasificación de
«Mouse Gaming Pad» del importador y la ficha G640, conservando variantes, precios y existencias.
Las tarjetas del menú tienen un formato más vertical, con altura adaptada a la pantalla. Los
subrayados usan `SweepUnderline`, compartido por enlaces, pestañas y títulos de tarjetas: se
dibujan y se retiran de izquierda a derecha sobre las letras de cada línea. En las tarjetas se
activan sobre el título. Las flechas conservan su giro CSS reversible y se respeta la preferencia
de movimiento reducido.

Los nombres principales del catálogo se redujeron al modelo: 95 títulos perdieron frases como
«Wireless Gaming Mouse», «High-Performance» y «Mechanical Keyboard». Se conservan versiones,
frecuencias y diferencias entre fichas; los nombres siguen siendo editables desde el catálogo.
`scripts/catalog/compact-product-names.mjs` genera una vista previa y solo la aplica si no cambió
el catálogo, con auditoría por producto y comprobación de que precios, inventario, enlaces,
imágenes, especificaciones, historias y reseñas no cambian. El importador prepara los próximos
nombres con el mismo criterio y conserva la identidad y el slug derivados del título original.
No requiere migraciones nuevas.

El agente no aplicó migraciones alojadas ni hizo escrituras de prueba. El dueño informó que
aplicó la `0027` el 26 de octubre. Seguimiento:

- [x] **Aplicar `0027_navegacion_visual_relaciones.sql`.** Informado por el dueño; pendiente la
      comprobación funcional con datos reales indicada en QA.
- [ ] **Revisión adicional de Inicio/dashboard:** pospuesta por indicación del dueño; esta
      ampliación trabaja los editores de contenido, catálogo y equipo.

- [ ] **Aplicar `0026_contenido_editable_fotos_resenas.sql` después de `0025`.** Agrega el tipo
      de sección de marcas, la selección de productos del menú y las fotos de opiniones.
- [ ] **QA real después de migrar:** guardar productos elegidos y ordenarlos en `/admin/home` y
      `/admin/menu`; agregar el carrusel de marcas, subir logos, elegir enlaces y verificar su
      visibilidad; cambiar el orden de historia/opiniones; enviar fotos con un comprador entregado
      y moderarlas. Las pruebas automáticas usan dobles de base de datos y el QA visual usa
      fixtures locales, sin conexión a la base alojada. La regeneración de home en Workers sigue
      siendo el pendiente de GP-053 descrito arriba.

- [ ] **Reseñas: aplicar la migración `0025_product_reviews` en Supabase** (el código ya está y
      funciona sin la tabla: la ficha no muestra opiniones y el admin avisa que falta). Después:
      probar con un pedido en estado `FULFILLED` que el comprador vea "Escribir una opinión", que
      la reseña llegue a `/admin/resenas` y que al publicarla salgan las estrellas en la ficha.
- [ ] **Foto de perfil del cliente.** Requiere columna de avatar en `customer_profiles` con
      migración, subida a R2 con el mismo plano de control de GP-058 (recorte cuadrado, sin EXIF) y
      mostrarla en la cuenta y en sus reseñas.
- [ ] **Interruptor del 5% desde el admin.** Hoy es `PROMO_PILL_ENABLED` en
      `src/config/social-links.ts`; moverlo al panel requiere guardar el ajuste en la base.
- [ ] **Datos que corrige el dueño en el admin:** nombrar los productos por modelo sin el color
      (por ejemplo "ATK Sky XSoft (Large Size)" en vez de "… Black …"), subir el negro como
      primera versión con las flechas, cargar los logos de las marcas y corregir los textos de
      especificaciones del mousepad.
- [ ] **Más adelante (decidido así):** rangos de Discord en el perfil y sus logos; efecto del video
      que crece al hacer scroll. Descartados: cambiar los destacados del menú al pasar el cursor y el
      minijuego.

### Editor de producto, Twitch y nuevas fuentes (27 de octubre de 2026)

- El editor de producto parte de una vista de la ficha: fotos, nombre y descripción, versiones y
  precios, ficha técnica y contenido. Cada zona abre su edición en un panel derecho con el mismo
  patrón del home; conserva validación, permisos, control de concurrencia y aviso de cambios
  pendientes. La publicación conserva su resumen al lado de la vista previa.
- Opiniones e historia tienen controles independientes de visibilidad por producto en el JSON
  existente. Ocultar opiniones conserva textos, fotos y moderación. La historia necesita estar
  publicada además de activada. Sus títulos, incluido el de las especificaciones de familia, se
  editan desde el constructor de historia; su acceso permanece en la misma pestaña.
- Portada con Twitch opcional, editable en `/admin/home`: canal `maxkillgg`, reproductor de video
  sin chat, indicación de directo y enlace al canal. El directo aparece en una ventana de
  400–560 px en la esquina superior derecha, centrada en pantallas verticales. El video habitual
  se conserva de fondo incluso durante el directo; al desconectarse queda solo el enlace.
  Pantallas sin espacio para el mínimo de 400 px del reproductor conservan el video y el enlace
  a Twitch. No usa claves de API
  del canal ni agrega tablas.
- Teclados y audio ya estaban habilitados en la configuración alojada al revisar este pedido;
  se conserva esa decisión. WLMouse queda fuera de esta extracción por indicación del dueño.
- Extracción de las cuatro colecciones indicadas de Attack Shark, las fichas oficiales de JINMS
  y todas las páginas del listado de monitores gaming de Memory Kings: 207 fichas (95, 8 y 104),
  con versiones, especificaciones, procedencia y galerías; incluye imágenes de las descripciones.
  `scripts/catalog/extract-source-catalog.mjs` produce JSON, CSV y un manifiesto de imágenes
  descargadas. Estos archivos preparan la importación; esta extracción no publica fichas nuevas.
  Conserva precios de referencia con la moneda comprobada de la fuente (Attack Shark está
  entregando PEN), sin confundirlos con costos. JINMS no publica precios: quedan nulos. No copia
  stock ni reseñas del proveedor, y excluye cables y receptores vendidos por separado.

### Publicación del catálogo extraído (27 de octubre de 2026)

- Por indicación del dueño, las 207 fichas extraídas se importan completas y visibles, para que
  después pueda ocultar las que no quiera. La carga incluye 95 Attack Shark, 8 JINMS y 104
  monitores, 766 variantes, especificaciones e imágenes alojadas en R2. Se incorporan las marcas
  nuevas y la categoría Monitores sin migraciones ni cambios a los productos anteriores.
- Las variantes nuevas tienen stock cero; no se copian existencias del proveedor. Las referencias
  minoristas se convierten en precios sugeridos con margen; los ocho JINMS sin importe público
  usan estimaciones del catálogo actual, con su base registrada en el manifiesto de publicación.
- El proceso de `scripts/catalog/README.md` conserva una copia inicial, valida con las reglas
  canónicas del administrador y verifica después la publicación, el stock anterior y las
  asociaciones de todas las imágenes. Distingue galería, fotos por variante e historia; comprueba
  los objetos subidos y contabiliza únicamente medios nuevos en el presupuesto existente.

### Directo persistente y colecciones reales (27 de octubre de 2026)

- El directo se monta fuera de la portada, en una ventana fija que sigue visible al hacer scroll.
  Ampliar abre el mismo reproductor en un diálogo modal nativo; reducir o pulsar Escape
  devuelve la ventana a su estado normal sin crear otra instancia de Twitch. El enlace
  sin directo se oculta al dejar atrás la portada. Se mantiene el límite mínimo de ancho de Twitch.
- Ocultar pausa el directo y deja una pestaña pequeña en el borde derecho para recuperarlo,
  incluso después de hacer scroll. Conserva el mismo reproductor y la elección de ocultarlo si
  el canal se desconecta y vuelve. Ocultar desde la vista ampliada libera el scroll y devuelve
  el foco a la pestaña; al abrirlo se mantiene disponible la acción de ampliar.
- El acceso a Twitch permanece oculto hasta que el canal emita en vivo. Entrada, salida y
  pestaña lateral usan transiciones de opacidad y desplazamiento de 250 ms; con movimiento
  reducido se elimina el desplazamiento y se respeta la duración mínima global. El diálogo ampliado espera a terminar su
  salida antes de liberar la capa modal, sin reconstruir el reproductor.
- Productos obtiene sus colecciones de categorías publicadas con variantes activas. Incluye
  Monitores, Audio y Accesorios, y genera los tipos de accesorios únicamente cuando existen
  productos clasificados. El menú y el editor usan la misma lista; una configuración manual del
  dueño conserva su orden y enlaces. Los filtros de las vitrinas usan el mismo esquema que las
  páginas de categoría, en lugar de ignorar los parámetros y mezclar todos los accesorios.
- Se configuró el campo editable `accessory_type` de Accesorios en las tablas existentes:
  3 skates, 4 juegos de keycaps, 1 funda, 1 mando, 1 placa y 1 reposamuñecas. No hay grip tapes
  publicados. Se conservaron nombres, precios, imágenes e inventario. No se requiere migración.
- Los tipos filtrados se agrupan dentro de su categoría en Productos, tanto en escritorio como
  en móvil: skates, keycaps, fundas, mandos, placas y reposamuñecas quedan dentro de Accesorios.
  La relación se obtiene del destino del enlace, sin listas de nombres o productos en código.
  El administrador muestra la misma agrupación y permite editar nombres, destinos, orden y
  visibilidad; ocultar una categoría oculta sus tipos juntos. Utiliza las tablas existentes.

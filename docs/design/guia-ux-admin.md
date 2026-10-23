# Guía UX y de textos del admin de Gamer Perú

Reglas para diseñar y escribir cada pantalla del panel de administración. Cada regla sale de una
fuente pública y verificable (lista al final). Cuando dos fuentes chocan, manda la consistencia
con lo que ya existe en el admin.

Para quién escribimos: el equipo de la tienda, que no es experto en tecnología y usa el panel
todos los días, muchas veces desde el celular. Objetivo: que entienda qué pasa y qué hacer en
segundos, sin leer párrafos.

---

## 1. Textos (UX writing)

### Tono y forma

- **Tutea siempre** («Sube la foto», no «Suba la foto»). Es lo que usan las guías de interfaces en
  español para Latinoamérica.
- **Solo la primera letra en mayúscula** en títulos, botones, etiquetas y columnas: «Nuevo
  producto», no «Nuevo Producto». Las mayúsculas van en nombres propios y marcas. (GitLab Pajamas,
  Carbon, Polaris)
- **Sin punto final** en títulos, botones, etiquetas ni textos de una sola oración. El punto va
  solo cuando hay dos oraciones o más. (Polaris)
- **Palabras del negocio, no del sistema**: «variante» se dice «color o talla», «slug» se dice
  «dirección en la tienda», «SKU» se explica como «código». Si hace falta el término técnico,
  va plegado en «Más opciones».
- **Lectura fácil**: oraciones cortas, una idea por oración. Polaris apunta a un nivel de lectura
  de 7.º grado.
- **Nada de relleno**: fuera «Por favor», «Lo sentimos», «Para poder», «Usted puede».
  «Sube la foto principal» es mejor que «Usted puede subir una foto principal».

### Botones y enlaces

- **Verbo + objeto**: «Guardar producto», «Aprobar pago», «Ver pedido». Si el contexto ya dice el
  objeto, basta el verbo: «Guardar». (Polaris, GitLab)
- **El botón dice lo que pasará**: nunca «Sí», «Aceptar» u «OK» en una confirmación. Escribe
  «Eliminar foto» y «Cancelar».
- **Un solo botón principal por pantalla o tarjeta.** Lo demás va como secundario o enlace.
  (Atlassian, Polaris)
- **Estado en curso dentro del botón**: «Guardando…», «Subiendo 2 de 5…», con el botón
  deshabilitado para evitar doble clic.

### Mensajes de error

Estructura: **qué pasó, por qué, y qué hacer ahora** (GitLab, GOV.UK, NN/g).

- **Específicos y con los datos del usuario**: «El precio debe ser mayor que S/ 0», no «Precio
  inválido». Nunca uses «inválido», «error», «fallo» o «excepción» solos. (Polaris)
- **Junto al campo que hay que corregir**, en rojo **y** con ícono o texto, nunca solo con color.
  (NN/g, WCAG 1.4.1)
- **Varios errores**: un resumen arriba con la lista de lo que falta, y cada ítem lleva al campo.
  - Bien: «Para guardar, falta: título, peso».
  - Mal: «Hay 2 errores en esta página». (Polaris, GOV.UK)
- **No culpes a la persona** ni hables de «nosotros», salvo que el problema sea del sistema: «No
  pudimos guardar. Revisa tu conexión y vuelve a intentarlo».
- **Rojo para lo que bloquea**; **ámbar para avisos** de flujo diario o riesgos. (Polaris)
- **Códigos técnicos** (por ejemplo `STALE_WRITE_CONFLICT`) solo en registros, no en pantalla.

### Confirmaciones y acciones irreversibles

- **Prefiere «deshacer» a preguntar**: actúa y muestra «Foto quitada · Deshacer» durante unos
  segundos. (NN/g)
- **Confirma solo lo grave o irreversible**: borrar, archivar, cancelar un pedido o rechazar un
  pago. «¿Estás seguro?» no sirve: la gente lo acepta sin leer. (NN/g, Primer)
- **El diálogo repite lo que pidió la persona y su efecto**: «¿Archivar “Viper V3 Pro”? Dejará
  de verse en la tienda. Puedes restaurarlo desde Archivados».
- **Botones del diálogo**: «Archivar producto» (rojo si destruye) y «Cancelar». Sin opción
  preseleccionada en lo peligroso.

### Estados vacíos

Responden dos preguntas: **por qué está vacío** y **cuál es el siguiente paso**, con un solo
botón (NN/g, Atlassian).

- Primera vez: «Todavía no hay productos. Crea el primero» + botón «Nuevo producto».
- Sin resultados de filtro: «Ningún pedido coincide con estos filtros» + «Limpiar filtros».
- Todo resuelto: «No hay pagos por validar», en tono de logro, sin botón.

### Ayudas y descripciones

- **Una línea** bajo el campo, solo si evita un error real. Si la etiqueta se explica sola, no
  pongas ayuda.
- **Ejemplos reales** en el marcador del campo: «Ej. Logitech G Pro X Superlight 2».
- **Lo avanzado se pliega**: SKU, peso, costo y ajustes técnicos van en «Más opciones»
  (divulgación progresiva, NN/g).

### Badges de estado

- **Siempre texto + color**, nunca solo un punto de color. (WCAG 1.4.1)
- **Mismos tonos en todo el admin**, con `StatusBadge` de `src/components/admin/ui/admin-ui.tsx`
  (tonos `success`, `warning`, `danger`, `info`, `neutral`): verde para
  confirmado/pagado/entregado; ámbar para pendiente/por validar; rojo para cancelado/rechazado;
  azul para en camino; gris para borrador/sin preparar.
- **Pocas palabras y en el idioma del equipo**: «Por validar», no «SUBMITTED».

---

## 2. Patrones de pantalla

### Listados y tablas (pedidos, productos, pagos)

Una tabla sirve a 4 tareas (NN/g): **buscar**, **comparar**, **ver una fila** y **actuar**.

- **Arriba, la búsqueda y los filtros más usados** como pestañas rápidas («Por validar», «Listos
  para preparar»). El resto de filtros va plegado en móvil.
- **Columnas con títulos de 1–2 palabras**, solo la primera letra en mayúscula, y números
  alineados a la derecha. (Carbon)
- **La columna que identifica la fila va primero** (n.º de pedido, foto y nombre del producto).
  Lo que se compara va al lado.
- **Clic en la fila abre una vista rápida lateral**; el enlace lleva a la página completa.
- **Acciones masivas** solo al seleccionar filas.
- **Tablas solo en el área principal**, nunca dentro de modales. (Carbon)

### Inicio (panel)

- **Es para mirar de un vistazo, no para explorar** (NN/g, «dashboards preattentive»). Lo urgente
  arriba: pagos por validar, pedidos por preparar, stock bajo, cada uno con su número y un
  enlace directo.
- **Separa lo operativo** (qué hago hoy) de **lo analítico** (cómo vamos este mes): ya está en
  las pestañas «Resumen operativo» y «Métricas».
- **Un solo número destacado por tarjeta**. El color fuerte se reserva para lo que exige acción.

### Formularios largos (editor de producto)

- **Pasos en el orden en que se llena**, cada uno con su estado («Falta 1 cosa» o ✓), y un panel
  fijo «Para publicar» que lleva al campo que falta. (Ya aplicado en el editor.)
- **Guardar sin perder lo escrito**: si otra persona cambió el producto, ofrece recargar sin
  borrar lo que se estaba editando.
- **Validar al salir del campo o al guardar**, no mientras se escribe.

### Tiempos y movimiento

- **Respuesta visible en menos de 100 ms** al pulsar: el botón cambia a «Guardando…».
- **Si algo tarda más de 1 s**, muestra progreso; si tarda más de 10 s, di qué está pasando
  («Buscando en la web…»). (NN/g, tiempos de respuesta)
- **Animaciones de 150–250 ms**, solo con transform/opacity, y respetando «reducir movimiento».

### Accesibilidad mínima (WCAG 2.2 AA)

- **Contraste**: 4.5:1 en texto y 3:1 en íconos y bordes de controles.
- **Objetivos táctiles** de 44×44 px y **foco visible** en todo lo que se pulsa.
- **Cada campo tiene etiqueta visible**, no solo el texto de ejemplo.
- **Avisos de guardado y error con `role="status"` o `role="alert"`**, para lectores de pantalla.

---

## 3. Checklist antes de dar por terminada una pantalla

- [ ] ¿Se entiende qué es y qué hacer en 5 segundos, sin leer párrafos?
- [ ] ¿Hay un solo botón principal y dice verbo + objeto?
- [ ] ¿Títulos, etiquetas y columnas tienen solo la primera letra en mayúscula y van sin punto?
- [ ] ¿Algún término técnico (SKU, slug, variante, ID, códigos de error) se podría decir en
      palabras del negocio?
- [ ] ¿Cada error dice qué pasó y cómo arreglarlo, junto al campo?
- [ ] ¿Las acciones destructivas tienen deshacer, o una confirmación que repite qué se borra?
- [ ] ¿El estado vacío explica por qué y ofrece el siguiente paso?
- [ ] ¿Los badges tienen texto y usan los tonos comunes?
- [ ] ¿Funciona a 360 px sin scroll horizontal y con teclado?
- [ ] ¿Las cargas largas dicen qué está pasando?

---

## 4. Fuentes y repositorios

Ordenados por utilidad para este admin.

| Fuente                                                                                                                                                    | Qué tomar de ahí                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Shopify Polaris, guías de contenido (GitHub)](https://github.com/Shopify/polaris/tree/main/polaris.shopify.com/content/content)                          | Fundamentos, errores, nombres y gramática para un admin de comercio. Repo archivado en 2026 (Shopify pasó a web components), pero el contenido sigue siendo la referencia. Patrones de listado y detalle en [`/content/patterns`](https://github.com/Shopify/polaris/tree/main/polaris.shopify.com/content/patterns). |
| [GitLab Pajamas, cómo escribir texto de interfaz](https://design.gitlab.com/content/ui-text)                                                              | Reglas cortas para botones, etiquetas y errores; mayúsculas solo al inicio; consistencia primero.                                                                                                                                                                                                                     |
| [Medusa UI](https://docs.medusajs.com/ui) · [código](https://github.com/medusajs/medusa/tree/develop/packages/design-system)                              | Admin de e-commerce moderno de referencia visual: densidad, tablas, drawers y estados.                                                                                                                                                                                                                                |
| [Carbon, tabla de datos](https://carbondesignsystem.com/components/data-table/usage/) · [GitHub](https://github.com/carbon-design-system/carbon)          | Cuándo usar tabla, títulos de columna y accesibilidad con teclado.                                                                                                                                                                                                                                                    |
| [Atlassian, estados vacíos](https://atlassian.design/content/designing-messages/empty-state)                                                              | Título, motivo, siguiente paso y un solo CTA.                                                                                                                                                                                                                                                                         |
| [NN/g, mensajes de error](https://www.nngroup.com/articles/error-message-guidelines/)                                                                     | Visibles, junto al origen, sin depender del color, constructivos.                                                                                                                                                                                                                                                     |
| [NN/g, tablas: 4 tareas](https://www.nngroup.com/articles/data-tables/)                                                                                   | Buscar, comparar, ver una fila y actuar.                                                                                                                                                                                                                                                                              |
| [NN/g, estados vacíos](https://www.nngroup.com/articles/empty-state-interface-design/)                                                                    | Estado del sistema, aprendizaje y acceso directo a la tarea.                                                                                                                                                                                                                                                          |
| [NN/g, diálogos de confirmación](https://www.nngroup.com/articles/confirmation-dialog/)                                                                   | Confirmar solo lo grave y preferir deshacer.                                                                                                                                                                                                                                                                          |
| [NN/g, paneles de un vistazo](https://www.nngroup.com/articles/dashboards-preattentive/)                                                                  | Operativo vs. analítico; leer en segundos.                                                                                                                                                                                                                                                                            |
| [GOV.UK, mensaje de error](https://design-system.service.gov.uk/components/error-message)                                                                 | Resumen de errores arriba y mensaje en cada campo.                                                                                                                                                                                                                                                                    |
| [Primer, diálogo de confirmación](https://primer.style/product/components/confirmation-dialog/guidelines)                                                 | No confirmar acciones de bajo riesgo ni frecuentes.                                                                                                                                                                                                                                                                   |
| [Laws of UX](https://lawsofux.com)                                                                                                                        | Hick, Fitts, Jakob, carga cognitiva: heurísticas, no leyes.                                                                                                                                                                                                                                                           |
| [Guías de localización de Microsoft (español)](https://download.microsoft.com/download/4/3/1/431d9836-40dc-4f2b-aafc-def5c7b5d0f3/spa-neu-StyleGuide.pdf) | Mayúsculas, puntuación y tratamiento en interfaces en español.                                                                                                                                                                                                                                                        |
| [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)                                                                                                             | Contraste, foco, tamaño de objetivos y mensajes accesibles.                                                                                                                                                                                                                                                           |
| [awesome-design-systems](https://github.com/alexpate/awesome-design-systems)                                                                              | Índice de más de 200 sistemas de diseño para consultar casos puntuales.                                                                                                                                                                                                                                               |
| [content-designer/ux-writing-skill](https://github.com/content-designer/ux-writing-skill)                                                                 | Skill para Claude Code y Codex que revisa textos de interfaz (de terceros: revisar antes de instalar).                                                                                                                                                                                                                |

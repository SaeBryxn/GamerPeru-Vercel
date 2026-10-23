# Plan integral: flujo de trabajo y rediseño del admin

Fecha: 23 de octubre de 2026. Rama: `feat/cloudflare-workers`. Base funcional revisada: `1505dcd`.

## 1. Objetivo y orden acordado

Hacer que una persona sepa dónde está, qué debe atender y cómo terminar cada tarea sin información duplicada ni espacio desperdiciado.

Orden de esta entrega:

1. Investigar y recomendar repositorios compatibles con el proyecto.
2. Crear el manual operativo en Markdown y PDF.
3. Revisarlo mediante contraejemplos y corregir afirmaciones.
4. Establecer este plan de rediseño por secciones.
5. Ejecutar después cada pieza visual en orden, con revisión del dueño.

La documentación y la primera pieza de cabecera y cuenta están implementadas. Las herramientas recomendadas y las demás piezas siguen pendientes; no se ha creado una pantalla administrativa nueva de perfil.

Entregables relacionados:

- [Selección de repositorios](repositorios-para-mejorar-el-flujo.md).
- [Manual editable](../manuals/manual-de-uso-gamer-peru.md).
- [Manual PDF](../../output/pdf/manual-de-uso-gamer-peru.pdf).
- [Registro de revisión](../manuals/revision-del-manual-y-del-plan.md).

## 2. Evidencia y límites

### Observaciones del dueño

- Hay demasiado espacio y contenido que no siempre ayuda a operar.
- La relación entre Inicio, cabecera, Ir a la tienda y cuenta necesita orden.
- Falta un punto reconocible para las acciones de perfil administrativo.
- Se solicita trabajar sección por sección, conservando una línea visual limpia.

Son observaciones del mismo dueño, no resultados de entrevistas con varios usuarios. No se ha realizado un estudio de usabilidad ni una medición de tiempos en producción.

### Hechos verificados en el código

- La cabecera actual conserva la ruta y agrupa identidad, datos de cuenta, tema, Ir a la tienda y Cerrar sesión en Mi cuenta.
- Existe perfil de cliente en `/cuenta/perfil`; no equivale a un perfil administrativo nuevo.
- El menú tiene cuatro grupos: Operaciones, Catálogo, Tienda y contenido, IA y sistema. Equipo pertenece al último.
- Inicio separa operación y métricas por período.
- Hay componentes reutilizables de tarjetas, estados, panel lateral, avisos y esqueletos de carga.
- Inventario ya tiene el rediseño `4f9a814`; se utilizará como referencia parcial, sin imponer sus métricas a todas las pantallas.

### Qué falta medir

Tiempo para encontrar una tarea, pasos necesarios para completarla, errores de interpretación, necesidad de desplazamiento y resultado por rol/dispositivo. Un espacio visible en una captura no es por sí mismo un fallo: puede servir para legibilidad y adaptación.

## 3. Repositorios: adopción selectiva

La evaluación detallada está en el documento de selección. El orden recomendado es continuidad y revisión con ECC seleccionado, escaneo estático de secretos y uso de las herramientas existentes. Storybook y Lighthouse CI quedan para cuando aporten una mejora concreta.

Antes de incorporar una herramienta:

1. Definir el problema y un ejemplo que lo reproduzca.
2. Confirmar que una dependencia actual no lo resuelve.
3. Revisar licencia, compatibilidad Windows/Next.js y coste de ejecución.
4. Preparar una incorporación pequeña y reversible.
5. Comprobar su beneficio y documentar cómo retirarla.

No se activan hooks generales, memoria automática, accesos externos o nuevas cuotas por el hecho de recomendar un repositorio. Se mantienen las restricciones de producción y la validación por archivos afectados.

## 4. Reglas visuales compartidas

### Jerarquía y densidad

- Un título principal por pantalla de contenido; evitar subtítulos que repitan su significado.
- Una acción principal clara por tarea. Las acciones secundarias usan menos peso visual.
- La parte superior debe ayudar a elegir o continuar una tarea; cada métrica debe influir en una decisión.
- Ayudas de una línea cuando basten; detalles técnicos y excepciones se despliegan cuando se necesitan.
- Formularios largos divididos por decisiones, con guardado y resultado fáciles de encontrar.
- Preferir una superficie dividida por separadores a encadenar tarjetas dentro de tarjetas.
- Espaciado basado en los tokens existentes, normalmente 8, 12, 16, 20 y 24 px según la relación entre elementos.
- Texto operativo de 13-14 px y ayudas legibles de al menos 12 px como objetivo; revisar los usos actuales de 10-11 px antes de reutilizarlos.

### Color

Usar `src/styles/admin-theme.css`. Texto principal oscuro, secundarios grises, superficies neutras y color para estados. Verde confirma una situación correcta; ámbar requiere atención; rojo identifica una incidencia o acción destructiva; azul puede informar sin urgencia.

El color siempre lleva texto o símbolo comprensible. No colorear filas completas por decoración. Revisar contraste en cada fondo, incluido hover y modo oscuro: objetivo AA de 4,5:1 para texto normal y 3:1 para texto grande. [Referencia W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### Interacción

Foco visible, orden de tabulación lógico, cierre predecible y devolución del foco al control de apertura. Cargas, vacíos, errores, éxito y conflictos deben estar definidos. Objetivo táctil de 44 px en móvil. La animación debe explicar una transición y respetar movimiento reducido.

## 5. Primera pieza: cabecera, cuenta y navegación

### Resultado buscado

Una cabecera que ubique al operador y un menú de cuenta que reúna acciones personales. El menú lateral mantiene las áreas de trabajo.

### Composición implementada

| Zona                     | Contenido                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Izquierda de la cabecera | Abrir navegación en móvil y ruta breve de la sección.                                                             |
| Derecha                  | Control Mi cuenta con inicial del correo verificado o icono de persona.                                           |
| Menú de cuenta           | Resumen de identidad y nivel, acceso a datos de cuenta cuando exista, Ir a la tienda, apariencia y Cerrar sesión. |
| Lateral                  | Áreas operativas, elemento activo y carpetas actuales; posibilidad de contraer.                                   |

Se reutilizan el correo y nivel verificados y la página `/cuenta/perfil`. Una pantalla administrativa nueva de edición de perfil necesitaría un alcance propio.

Mover Ir a la tienda al menú añade un paso. Comprobar con el dueño su frecuencia de uso y, si es una acción diaria constante, conservar un acceso discreto sin saturar la cabecera. Es una decisión a validar, no una conclusión asumida.

### Estados y aceptación

- El operador identifica la sección y abre su cuenta con teclado.
- El desplegable conserva acciones visibles en móvil, claro y oscuro; Escape y el cierre devuelven el foco.
- El cambio de tema sigue funcionando y no cambia de forma inesperada al navegar.
- Los permisos continúan comprobándose en servidor.
- La salida respeta la protección de cambios sin guardar de los editores.
- No aparecen enlaces a funciones inexistentes ni se modifica autenticación por estética.

Implementado en `1505dcd`: cabecera, shell y `admin-account-menu.*`. El editor escucha un evento cancelable para proteger también el cierre de sesión; se reutiliza la acción de autenticación existente.

Validación: formato, TypeScript, lint y 20 pruebas afectadas correctos. Capturas estáticas de componentes reales con datos ficticios a 360, 768 y 1440 px, en claro y oscuro, sin desbordamiento. No se inició servidor ni se realizaron E2E o accesos a producción. Pendiente: comprobación funcional del dueño tras el despliegue y frecuencia de uso de Ir a la tienda.

## 6. Operaciones: una pantalla cada vez

### O1. Inicio

**Tarea:** elegir qué atender primero. Mantener operación y métricas separadas. Reducir introducciones y cifras repetidas; priorizar pendientes accionables, antigüedad y siguiente acción.

**Aceptar cuando:** un operador encuentra un pendiente y llega al caso correcto; cada cifra indica período o alcance; vacío, carga y error son comprensibles. No añadir indicadores ficticios ni convertir Inicio en otra lista completa de pedidos.

Archivos candidatos: página de `/admin` y `src/components/admin/dashboard/`.

**Implementación local del 23 de octubre:** Inicio muestra los pendientes en una sola lista, con una siguiente tarea identificada y accesos a los filtros originales. La identidad queda en Mi cuenta. Los accesos rápidos usan filas compactas con iconos y acentos suaves; el resumen de catálogo y existencias queda disponible en un bloque plegable. Se conservan la vista de métricas, sus períodos, los permisos y las consultas existentes. Las cuentas de pedidos no reciben una columna vacía de catálogo.

Validación: formato, TypeScript, lint y 38 pruebas dirigidas correctos. Por indicación del dueño no se hicieron capturas ni pruebas visuales; la revisión de la composición y el funcionamiento con sus datos queda a su cargo en el servidor local. El dueño autorizó ejecutar la web local contra el Supabase de producción y pidió dejar de hacer pushes automáticos. No se cambiaron datos ni se probó el sitio de producción durante este rediseño.

**Segunda revisión, tras la devolución del dueño:** la primera pasada se consideró insuficiente en composición y color. Inicio pasa a un Centro de operaciones con cabecera propia, hora de actualización y botón para volver a leer los datos; tarjetas de pagos por revisar, pedidos por preparar, pedidos sin pagar y faltantes de stock, o productos publicados según el acceso disponible. La tarea prioritaria se distingue con un panel azul y las acciones rápidas tienen superficies de color. Las métricas indican las fechas reales del período y de la comparación; se retira la etiqueta «Tiempo real» de datos que solo se leen al cargar. Se conserva el lector existente y sus importes exactos: un importe por revisar nunca se presenta como dinero confirmado ni se sustituye un importe no disponible por cero.

Esta revisión permanece local y sin push. Se prueban la actualización, los filtros de cada cola, el acceso por permisos y la separación entre métricas y pendientes. El contraste de los colores nuevos se calcula sobre sus fondos; la composición visual sigue pendiente de revisión del dueño porque pidió trabajar sin capturas.

**Tercera revisión: aprovechar el alto de pantalla.** Se compactan cabecera, tarjetas y accesos; en escritorio se distribuyen pendientes, catálogo y herramientas en columnas. El catálogo tiene su propia región desplazable y accesible por teclado. La vista de métricas dispone finanzas arriba y pedidos/pagos lado a lado; las fechas de comparación se consultan al desplegarlas. Se conservan los datos, filtros, precisión de importes y permisos. En pantallas estrechas, bajas o ampliadas se permite lectura vertical; las columnas tienen desplazamiento de respaldo para no recortar información.

Comprobación de dimensiones offline, con componentes reales y datos ficticios: a 1280×720, 1366×768, 1440×900 y 1920×1080 ambas vistas quedan dentro del alto de la página y solo la lista del catálogo tiene desbordamiento vertical. PageDown desplaza esa lista con el foco dentro y mantiene fija la página. A 360 y 768 px se comprobó ausencia de desbordamiento horizontal, conservando lectura vertical. Sin capturas, servidor nuevo ni acceso a producción. Esta medición no sustituye la revisión visual del dueño con sus fuentes, zoom y datos reales.

### O2. Pagos

**Tarea:** decidir con evidencia. Compactar filtros y resumen; el panel mantiene importe, pedido, comprobante, asignación y decisiones en orden de lectura.

**Aceptar cuando:** se distinguen enviado, en revisión y confirmado; se puede revisar con teclado; ninguna reducción de texto elimina las consecuencias de rechazar, reabrir o registrar una devolución externa. No automatizar la aprobación por una imagen.

Archivos candidatos: `src/app/admin/(protected)/pagos/`.

### O3. Pedidos

**Tarea:** localizar y continuar una venta. Conservar filtros, miniaturas y vista rápida. Dar protagonismo al número, estado y próxima acción; mostrar los detalles secundarios al solicitarlos.

**Aceptar cuando:** se conserva la búsqueda al navegar; pago y envío se distinguen; se prepara, despacha y registra entrega con los datos necesarios y sin transiciones incompatibles.

Archivos candidatos: `src/app/admin/(protected)/orders/`.

### O4. Inventario

**Tarea:** consolidar lo implementado. Revisar tamaños de ayudas, alcance del resumen, estados negativos, comparación del conteo y posición de sus acciones en el contexto real del admin.

**Aceptar cuando:** no hay desbordamiento de página, el responsable entiende físico/reservado/asignado y un conflicto conserva lo escrito. No añadir un total global calculando solo la página ni prometer historial ilimitado.

Archivos candidatos: `src/app/admin/(protected)/inventario/`. No repetir todo el rediseño sin un problema observado.

## 7. Catálogo

### C1. Categorías y marcas

Facilitar localizar, crear y mantener las referencias que necesita Productos. Unificar formularios y mensajes. Explicar las relaciones y restricciones junto a la acción correspondiente.

**Aceptar cuando:** se encuentra una referencia sin una pantalla saturada y sus cambios mantienen los destinos y la integridad del catálogo.

### C2. Lista y creación de productos

Producto, estado, variante o dato operativo relevante y siguiente acción deben leerse sin competir. La creación sigue siendo mínima y abre un borrador.

**Aceptar cuando:** se crea el borrador y se continúa en el editor; los filtros y el estado publicado/borrador se distinguen; no se duplican datos del detalle en la lista.

### C3. Editor de cinco pasos

Mantener los pasos aprobados. Reducir ayudas repetidas, unificar guardados y señalar lo obligatorio frente a lo opcional. Las sugerencias de IA deben seguir vinculadas a evidencia y aceptación humana.

**Aceptar cuando:** una persona recorre creación, fotos, variantes, ficha técnica y página del producto; conserva lo escrito ante errores o versiones nuevas; publicar sigue siendo explícito. La tienda pública y su animación de añadir al carrito se conservan.

Archivos candidatos: `taxonomia/`, `products/` y componentes administrativos de productos. Cada subpieza tiene su propio alcance y commit.

## 8. Tienda y contenido

### T1. Home de la tienda

La pantalla debe ayudar a responder qué sección se edita y qué verá el cliente. Orden, visibilidad y contenido se agrupan por sección. La vista previa necesita indicar si representa datos guardados o cambios pendientes.

**Aceptar cuando:** se cambia una sección sin editar otras por error; Guardar y publicar comunica su efecto público; una subida fallida conserva los textos y deja un mensaje útil.

### T2. Menú de la tienda

Compactar entradas y acciones sin ocultar avisos de páginas inexistentes o catálogo vacío. Mantener reordenamiento accesible por botones y distinguir ocultar un enlace de borrar su destino.

**Aceptar cuando:** orden y visibilidad se entienden antes de actuar, hay respuesta al guardar y los errores no dejan una apariencia de éxito.

Archivos candidatos: `/admin/home` y `/admin/menu`. Este trabajo cambia editores del admin; un rediseño de la tienda pública se definiría aparte.

## 9. IA y sistema

### S1. Asistente IA

Ordenar investigación, cola, resultados y revisión por campo. Mostrar modelo consultado, etapa real, última actividad y siguiente acción disponible. La información de diagnóstico extensa se despliega.

**Aceptar cuando:** se explica un trabajo en cola sin crear duplicados; una sugerencia muestra su evidencia; aceptar un dato no autoriza inventar precio, stock o publicación.

### S2. Configuración IA

Organizar proveedor, credencial, perfil y ejecución como etapas distintas. Evitar bloques JSON en la ruta habitual cuando un campo legible resuelva la decisión. Las opciones avanzadas siguen accesibles.

**Aceptar cuando:** se detecta qué falta, se guarda un perfil y se distingue disponibilidad de configuración de una ejecución comprobada. No se devuelven claves al navegador.

### S3. Diagnóstico existente

Revisar la trazabilidad de Inngest y la configuración de Sentry antes de añadir otra cola o plataforma. Documentar el identificador que relaciona acción, trabajo y fallo.

**Aceptar cuando:** un caso de prueba se puede seguir sin exponer información personal ni elevar el consumo del Worker sin medición.

Archivos candidatos: workspaces de `products/ai-import/`, `settings/ai/` y diagnóstico acotado de las integraciones existentes.

## 10. Equipo

Agrupar Dar acceso, lista de miembros y cambios de nivel. Mostrar de forma breve qué permite cada nivel y explicar por qué el propio usuario o el último superadministrador tienen restricciones.

**Aceptar cuando:** se concede acceso a una cuenta existente, se revisa la confirmación y se diferencia revocar acceso de borrar una cuenta. No se amplían permisos para simplificar el diseño.

Archivos candidatos: `/admin/equipo`. Los servicios de permisos solo se tocan si existe un defecto funcional demostrado y se define su pieza por separado.

## 11. Bucle de revisión por cada pieza

1. **Situación actual:** registrar una tarea concreta y la evidencia disponible. Señalar lo no medido.
2. **Propuesta:** definir una sola mejora y sus archivos; indicar qué se elimina, agrupa o despliega y por qué ayuda.
3. **Contraejemplos:** revisar vacío, muchos registros, dato ausente, error, sesión vencida, permiso insuficiente, cambios de otro operador y móvil.
4. **Corrección:** documentar la decisión que cambió y el comportamiento final esperado. Si la simplificación oculta una consecuencia crítica, restaurarla.
5. **Validación:** formato, TypeScript, lint y pruebas afectadas; revisión visual con datos ficticios cuando sea viable.
6. **Uso real:** el dueño revisa la pieza desplegada y registra si la tarea se completa y qué fricción permanece.
7. **Cierre:** actualizar manual, evidencia y próximo paso. Un commit por pieza; push a `mi-repo feat/cloudflare-workers`.

Este registro comunica decisiones y resultados, no una transcripción de razonamiento interno. El objetivo es hacer detectables los errores y demostrar la corrección.

## 12. Criterios de cierre comunes

- [ ] Se entiende qué hacer en la pantalla sin leer una introducción larga.
- [ ] La información primaria tiene más peso que las ayudas.
- [ ] Cada contador declara el alcance y cada acción comunica su consecuencia.
- [ ] Se conserva teclado, foco, contraste y movimiento reducido.
- [ ] Hay estados de carga, vacío, error, éxito y conflicto cuando correspondan.
- [ ] La interfaz se revisa a 360, 768 y 1440 px, claro y oscuro.
- [ ] No se pierde información necesaria al compactar.
- [ ] Las restricciones de dinero, inventario, autorización y publicación se mantienen.
- [ ] Pasan las comprobaciones de los archivos afectados.
- [ ] El manual refleja lo implementado y no da por realizada una propuesta.

Mantener la prohibición de peticiones a `gamerperu.com`, acceso a la base de producción, servidor y E2E locales durante el trabajo actual. Las pruebas funcionales alojadas las realiza el dueño. Una futura habilitación de entorno de pruebas se tratará explícitamente.

## 13. Siguiente cambio propuesto

La cabecera y el menú de cuenta están implementados. **Inicio** tiene una primera versión implementada en local, pendiente de revisión visual del dueño. Después de esa revisión, el siguiente cambio propuesto es Pagos; luego Pedidos y la consolidación de Inventario.

La cantidad de pasos y el tiempo actual se medirán antes de prometer una reducción. Como guía, el dueño debería poder ubicar una sección y completar su tarea con menos dudas, manteniendo los controles críticos.

## Fuentes

- Código local: navegación, cabecera, niveles de personal y pantallas indicadas en cada pieza.
- [Heurísticas de Nielsen](https://www.nngroup.com/articles/ten-usability-heuristics/): estado visible, consistencia, prevención de errores, control y ayuda contextual.
- [W3C: contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- [Selección de repositorios y sus fuentes oficiales](repositorios-para-mejorar-el-flujo.md).

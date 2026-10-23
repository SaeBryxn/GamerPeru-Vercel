# Gamer Perú

Manual de uso y operación

Edición 1.0 - 23 de octubre de 2026

Para el dueño de la tienda, su equipo y quienes atienden pedidos. Incluye el recorrido del cliente para que la atención sea coherente con lo que ve el comprador.

Base revisada: código de la rama `feat/cloudflare-workers`, commit `4f9a814`. Las instrucciones describen funciones implementadas. La disponibilidad real de correo, IA y otros servicios necesita comprobarse en el entorno alojado.

> Regla principal: un comprobante enviado por el cliente no equivale a un pago confirmado. Comprueba la recepción real del dinero antes de aprobarlo.

## 01. Empezar y organizar el día

### Para entrar en operación

1. Inicia sesión con tu cuenta habitual de Gamer Perú.
2. Abre `/admin`. Tu cuenta necesita acceso administrativo; registrarse como cliente no lo concede.
3. En Inicio, revisa los pendientes y abre la tarea que necesita atención.
4. Comprueba los pagos recibidos, continúa los pedidos y revisa el inventario antes de actualizar el catálogo.

### Tres tareas frecuentes

| Quiero...            | Dónde entrar                  | Resultado esperado                                                    |
| -------------------- | ----------------------------- | --------------------------------------------------------------------- |
| Atender una venta    | Operaciones / Pagos y Pedidos | Pago revisado y siguiente acción del pedido identificada.             |
| Crear un producto    | Catálogo / Productos          | Borrador completo, revisado y publicado de forma explícita.           |
| Corregir existencias | Operaciones / Inventario      | Conteo físico guardado con motivo y movimiento cuando hay diferencia. |

### Antes de guardar

Confirma el producto, la variante o el número de pedido. Lee el resultado de la acción; un clic o un indicador de carga no acredita que los datos se guardaron.

Si hay un error de conexión, conserva lo escrito y comprueba el estado antes de repetir una operación. Si se informa de cambios de otro operador, revisa la versión nueva.

> El menú se adapta a tus permisos. Si no ves una sección, pide al superadministrador que revise tu acceso; no uses otra cuenta compartida para evitar esa restricción.

## 02. Acceso, cuentas y permisos

### Entrar y salir

Usa el inicio de sesión de la tienda. Si olvidaste la contraseña, utiliza la recuperación que ofrece esa pantalla. Para terminar tu sesión administrativa, pulsa Cerrar sesión en la cabecera actual.

Una sesión puede vencer mientras trabajas. Vuelve a identificarte si el sistema lo solicita. Una pantalla abierta no garantiza que conserve autorización para guardar.

### Niveles que ofrece Equipo

| Nivel              | Alcance descrito por el sistema                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Superadministrador | Operación completa, equipo, inventario y credenciales de IA.                                     |
| Administrador      | Catálogo, tienda, pedidos, pagos y soporte; no incluye inventario, equipo ni credenciales de IA. |
| Catálogo           | Productos, categorías, marcas, home, menú e investigación IA de productos.                       |
| Pedidos y pagos    | Pedidos, envíos y verificación de pagos.                                                         |
| Soporte            | Permisos de atención, devoluciones y garantías según las funciones disponibles.                  |

Los niveles no crean páginas por sí mismos. Solo aparecen los destinos implementados y autorizados. El servidor vuelve a comprobar el permiso al ejecutar cada acción.

> Administrador y Superadministrador son niveles diferentes. Si necesitas registrar inventario y el destino no aparece, revisa el nivel con el dueño.

## 03. Encontrar cada sección

### Navegación actual

| Grupo              | Destinos                                                   |
| ------------------ | ---------------------------------------------------------- |
| Operaciones        | Inicio, Pedidos, Pagos e Inventario.                       |
| Catálogo           | Productos y Categorías y marcas.                           |
| Tienda y contenido | Diseño de tienda: Home de la tienda y Menú de la tienda.   |
| IA y sistema       | Motor IA: Asistente IA y Configuración IA; también Equipo. |

Abre las carpetas Diseño de tienda y Motor IA para encontrar sus pantallas. Puedes contraer el menú lateral; en móvil utiliza el botón de navegación de la cabecera.

### Cabecera actual

- La ruta Administración / sección indica dónde estás.
- El control de tema cambia entre claro y oscuro.
- Ir a la tienda abre la tienda pública en otra pestaña.
- Cerrar sesión termina la sesión.

### Perfil: distinguir presente y propuesta

El cliente tiene una página de perfil en `/cuenta/perfil`. La cabecera administrativa revisada todavía no reúne sus acciones en un menú de perfil.

El plan de rediseño propone crear ese menú y agrupar allí las acciones de cuenta. Esa propuesta no es una instrucción de uso de la interfaz actual.

> Si una acción no aparece, primero revisa los permisos y la sección abierta. No asumas que el menú lateral muestra todas las funciones a todos los usuarios.

## 04. Inicio: decidir qué atender

### Resumen operativo

Al entrar en `/admin`, utiliza los pendientes para decidir la siguiente tarea: revisar pagos, continuar pedidos o corregir datos del catálogo. Los accesos llevan a las áreas donde se realiza el trabajo.

1. Revisa la antigüedad y el impacto del pendiente.
2. Abre el pago, pedido o producto correspondiente.
3. Completa la acción en su pantalla y comprueba su resultado.
4. Vuelve al resumen cuando necesites elegir la siguiente tarea.

### Métricas del período

La vista de métricas se abre desde Inicio y utiliza `/admin?vista=metricas`. Sirve para analizar el período mostrado, mientras el resumen operativo ayuda con el trabajo inmediato.

Lee siempre el período, el estado y el alcance de una cifra. Un conteo filtrado o parcial no representa necesariamente toda la tienda.

### Qué no debe deducirse del panel

- Un pedido pendiente no demuestra que el dinero haya llegado.
- Una investigación registrada no demuestra que la IA ya esté ejecutándose.
- Un producto creado no está necesariamente publicado.

> Usa el panel para localizar el trabajo; usa el detalle del registro para tomar decisiones sobre dinero, stock o publicación.

## 05. Pedidos y despacho

### Localizar un pedido

1. Abre Operaciones / Pedidos, en `/admin/orders`.
2. Usa la búsqueda y los filtros. Los accesos rápidos incluyen pedidos por validar pago, listos para preparar y completados.
3. Identifica el número de pedido y los productos. Usa la vista rápida para consultar el resumen.
4. Abre el detalle cuando necesites actuar o comprobar datos completos.

### Continuar la operación

El detalle muestra el estado y la siguiente acción permitida. Revisa productos, cantidades, contacto y dirección antes de preparar o despachar. Completa los datos de envío que solicite el formulario y confirma solo una operación que realmente ocurrió.

No marques una entrega realizada únicamente porque se creó un envío. No despaches basándote solo en una captura de pago; primero debe completarse su verificación.

### Cancelaciones y bloqueos

Lee el motivo de bloqueo y las condiciones de la cancelación. Si el pedido ya tiene dinero recibido o un despacho, la operación necesita revisar su situación real. La aplicación puede impedir transiciones incompatibles.

| Situación                          | Qué hacer                                                     |
| ---------------------------------- | ------------------------------------------------------------- |
| Datos inconsistentes               | Revisar el detalle y corregir por el procedimiento permitido. |
| Falta pago confirmado              | Abrir Pagos y completar la verificación.                      |
| Cambio realizado por otro operador | Actualizar y comprobar el estado antes de actuar.             |

> Pago, pedido y envío son estados relacionados, pero diferentes. Comprueba los tres cuando atiendas una consulta.

## 06. Pagos Yape y Plin

### Revisar una operación

1. Entra en Operaciones / Pagos, en `/admin/pagos`.
2. Localiza el caso en Todos, Por revisar o Mis casos.
3. Pulsa Revisar o Continuar según su estado. Si otra persona lo está revisando, respeta esa asignación.
4. Consulta importe, referencia, pedido y comprobante. El enlace del comprobante se prepara al abrirlo y puede caducar.
5. Comprueba por un medio autorizado que el dinero llegó realmente a la cuenta de la tienda.

### Elegir la decisión correcta

| Decisión                                | Cuándo corresponde                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Aprobar                                 | Recepción real de fondos verificada y datos coherentes. Confirma la aprobación.       |
| Rechazar y pedir otro comprobante       | El caso permite corregir o reenviar; lee el plazo y las condiciones.                  |
| Rechazo definitivo                      | Confirmaste que no llegaron fondos y corresponde cerrar el caso. Revisa sus efectos.  |
| Registrar devolución externa completada | Solo si el dinero se recibió y la devolución total ya se realizó fuera de Gamer Perú. |

### Qué cambia en inventario

La confirmación del pago y la preparación del pedido no equivalen al mismo movimiento que un despacho. Comprueba reservado, asignado y físico en Inventario; no restes manualmente las unidades por aprobar un pago.

> Subir un comprobante no confirma el pago. Registrar una devolución externa tampoco realiza una transferencia bancaria automática.

## 07. Inventario: consultar existencias

Abre Operaciones / Inventario, en `/admin/inventario`. La pantalla muestra variantes activas del catálogo en el almacén principal.

### Leer los números

| Dato       | Significado                                                         |
| ---------- | ------------------------------------------------------------------- |
| Físico     | Unidades registradas en el almacén.                                 |
| Reservado  | Unidades separadas para pedidos pendientes.                         |
| Asignado   | Unidades comprometidas con pedidos pagados, pendientes de despacho. |
| Disponible | Físico menos reservado y asignado.                                  |
| Reponer en | Umbral configurado para avisar de stock bajo.                       |

Ejemplo: físico 10, reservado 3 y asignado 2 dejan 5 disponibles. No vuelvas a descontar las reservas al ingresar un conteo físico.

### Localizar una variante

Usa Todas, Stock bajo o Sin disponibilidad. Busca por producto, variante o SKU y pulsa Buscar. Las etiquetas de filtros permiten quitar una condición o limpiar todo. Al cambiar un filtro se vuelve a la primera página.

El resumen Un vistazo a esta página cuenta solo las variantes de la página mostrada, según sus filtros. No es un total global.

### Interpretar los estados

- Stock suficiente: disponible por encima de reposición.
- Stock bajo: disponible positivo dentro del umbral de reposición.
- Agotado: disponible igual a cero.
- Revisar inventario: disponible negativo; las unidades comprometidas superan el físico registrado.

> Un número negativo requiere revisar movimientos y pedidos. No lo conviertas en cero sin investigar su causa.

## 08. Inventario: registrar un conteo

### Contar y comparar

1. Localiza la variante correcta y pulsa Registrar conteo.
2. Comprueba nombre, color o talla y SKU en el panel.
3. Cuenta todas las unidades físicas de esa variante, incluidas las reservadas y asignadas que todavía estén en el almacén.
4. Escribe el total contado en Unidades físicas. Se admite cero; no se admiten decimales ni cantidades negativas.
5. Escribe el motivo. Puedes elegir un motivo frecuente y ajustarlo.
6. Revisa Físico anterior, Tu conteo, Diferencia y Disponible previsto.
7. Pulsa Guardar conteo y espera el resultado. Cuando termina correctamente, pulsa Listo.

Ejemplo: físico anterior 8 y conteo 11 producen una diferencia de +3 unidades. El formulario envía el total 11, no el incremento 3.

### Errores y cambios concurrentes

Si el inventario cambia mientras editas, el formulario conserva el conteo y el motivo. Revisa los datos y utiliza Usar valores actualizados cuando corresponda. Un conflicto detectado al guardar puede pedir Actualizar inventario antes de revisar la referencia nueva.

Si cierras con cambios pendientes, elige Seguir editando o Descartar cambios. Durante el guardado se bloquean envíos repetidos.

### Consultar la trazabilidad

Ver movimientos abre el historial de la variante. La pestaña Movimientos permite consultar el almacén completo. Se muestran hasta los 50 más recientes; el motivo queda visible y Ver autor despliega el identificador del responsable.

> Un conteo igual al físico actual no genera una diferencia ni un nuevo movimiento de stock. Las reservas y asignaciones se mantienen separadas.

## 09. Crear un producto y subir sus fotos

### Crear el borrador

1. Entra en Catálogo / Productos, en `/admin/products`.
2. Abre la creación de producto.
3. Escribe Nombre o modelo y selecciona Marca y Categoría. Revisa que correspondan al producto real.
4. Comprueba el identificador de la dirección si lo modificaste.
5. Pulsa Crear y continuar. El producto se crea como borrador y se abre el editor.

### Completar los cinco pasos

| Paso                      | Qué completar                                       |
| ------------------------- | --------------------------------------------------- |
| Lo básico                 | Nombre, marca, categoría y descripción.             |
| Fotos                     | Imagen principal y galería.                         |
| Colores, tallas y precios | Variantes, precio, estado y existencias reales.     |
| Especificaciones          | Ficha técnica de la categoría.                      |
| Página del producto       | Historia y bloques adicionales de la ficha pública. |

### Gestionar imágenes

Selecciona archivos del producto correcto y respeta los formatos y tamaños indicados. Espera la confirmación de la subida. Marca una imagen principal general y comprueba las fotos de cada variante.

El progreso de subida no basta para confirmar que una foto quedó registrada. Si la subida falla, lee el error y reintenta de forma controlada; no borres archivos de almacenamiento por fuera del editor.

> Guardar un borrador no lo publica. Mantén el producto en borrador mientras revisas sus datos, fotos, precio y stock.

## 10. Variantes, ficha técnica y publicación

### Colores, tallas y precios

1. Abre el tercer paso del editor.
2. Selecciona una ficha para editarla o pulsa Agregar color o talla.
3. Usa un nombre que identifique la versión real: color, talla o edición.
4. Completa Precio y, si corresponde, Precio antes (tachado).
5. Comprueba las unidades físicas y el estado de la variante.
6. Asigna una foto de galería cuando corresponda. Conserva la principal como imagen general del producto.
7. Guarda y comprueba el resultado. SKU, peso y costo se encuentran en Más opciones.

No inventes variantes porque una foto parezca de otro color. Confirma el modelo exacto y las versiones que realmente venderá la tienda. El precio, el stock y la publicación los decide la operación, no la IA.

### Especificaciones y requisitos

Completa la ficha técnica de la categoría. Revisa unidades de medida y fuentes del fabricante. El panel Para publicar distingue requisitos obligatorios y recomendaciones; utiliza sus accesos para ir al campo pendiente.

### Publicar

Corrige lo obligatorio, revisa el contenido y utiliza la acción explícita de publicación con una cuenta autorizada. Después verifica la ficha pública por el procedimiento del dueño.

> Si otro operador guardó cambios, revisa la nueva versión antes de continuar. No ignores los avisos de salida con datos pendientes de guardar.

## 11. Página del producto e historia

El quinto paso del editor reúne el contenido adicional que puede ver el comprador. Abre un bloque para editarlo y consultar su vista previa.

### Bloques disponibles

Historia, Regalo, Accesorios, Guía de tallas, Dimensiones, Especificaciones de la tienda, Contenido de caja y Soporte.

1. Decide si ese bloque aporta información útil al comprador.
2. Completa sus datos con información confirmada.
3. Activa Mostrar en la tienda cuando corresponda.
4. Guarda y comprueba el resumen del bloque.

### Activar no es lo mismo que completar

Un bloque activado pero vacío no aparece en la tienda. El resumen lo advierte: Activado, pero vacío: no se verá en la tienda.

Para tallas y dimensiones, comprueba largo, ancho, alto, peso y unidades de medida. Solo utiliza rangos de mano si una fuente oficial los proporciona. Para caja, distingue edición y cantidades. Para soporte, verifica garantía, manual y software del modelo exacto.

### Editar la historia

Utiliza Editar historia para abrir su editor. Revisa el estado de publicación y los medios de cada bloque; guardar contenido y publicarlo son operaciones que deben comprobarse según el estado mostrado.

> La vista previa del editor ayuda a componer un bloque. No demuestra por sí sola que esté guardado, publicado y visible en la ficha pública.

## 12. Autocompletar desde la web

El autocompletado del editor está disponible para productos en borrador y requiere permisos, un perfil de investigación habilitado y un proveedor activo.

### Investigar y revisar

1. Abre el borrador del producto.
2. En Autocompletar desde la web escribe el modelo exacto o pega un enlace del fabricante.
3. Inicia la investigación y observa su estado y última actividad.
4. Cuando termine, pulsa Revisar sugerencias.
5. Comprueba cada dato, su fuente y si corresponde a la variante o edición correcta.
6. Acepta o descarta los campos y aplica lo aceptado.
7. Vuelve al producto para revisar los pasos afectados y completar lo que falte.

### Qué puede sugerirse

Descripción, especificaciones y datos de página del producto cuando exista evidencia: dimensiones y peso por talla, guía, caja, soporte y filas de especificaciones. Las imágenes sugeridas también necesitan revisión y aceptación dentro del flujo disponible.

Que un campo sea compatible con el autocompletado no garantiza que aparezca en cada búsqueda. Si una fuente no confirma un dato, déjalo pendiente. Comprueba el origen y los derechos de uso de los medios.

### Qué sigue siendo una decisión humana

Precio, stock, publicación y confirmación de pagos. Aplicar sugerencias no sustituye la revisión del producto ni lo publica automáticamente.

> Si hay modelos ambiguos o fuentes contradictorias, precisa la búsqueda o revisa los campos con especial cuidado. No rellenes con suposiciones para completar una ficha.

## 13. Configuración IA y trabajos en cola

Entra en IA y sistema / Motor IA / Configuración IA, en `/admin/settings/ai`. Esta pantalla necesita un permiso distinto del utilizado para investigar productos.

### Preparar el autocompletado

1. Elige un proveedor disponible y guarda su configuración.
2. Si necesita una clave, regístrala mediante el formulario autorizado. No la incluyas en mensajes o capturas.
3. En el perfil de investigación, elige proveedor y modelo, habilita el perfil y guárdalo. La indicación del editor puede dirigir a PRODUCT RESEARCH FAST.
4. Usa el asistente o comprobación de disponibilidad para identificar configuración faltante.
5. Comprueba una ejecución real de prueba cuando el dueño lo autorice.

### Entender la cola

| Situación                              | Interpretación y acción                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Proveedor habilitado                   | La conexión está habilitada; todavía falta comprobar perfil y ejecución. |
| En cola, sin envío confirmado          | Revisa el diagnóstico y utiliza Reintentar envío si aparece.             |
| Enviado, esperando ejecución           | No crees trabajos repetidos; solicita revisar la ejecución de la cola.   |
| Buscando o investigando                | Espera y observa la última actividad.                                    |
| Listo para revisión                    | Abre las sugerencias antes de aplicarlas.                                |
| Cuota agotada o servicio no disponible | Lee el error y espera o revisa el proveedor autorizado.                  |

Reintentar envío reenvía el trabajo existente cuando el estado lo permite. No es un botón universal para reiniciar cualquier trabajo terminado o enviado.

> Cloudflare Workers AI utiliza el binding del Worker según su configuración. Habilitarlo no demuestra que búsqueda, modelo, perfil y cola estén funcionando juntos.

## 14. Tienda y contenido

### Cambiar la portada

Abre Tienda y contenido / Diseño de tienda / Home de la tienda, en `/admin/home`.

1. Identifica la sección que quieres cambiar y su función.
2. Modifica únicamente el texto, enlace o medio necesario.
3. Revisa los campos marcados y los destinos de los enlaces.
4. Pulsa Guardar y publicar cuando estés listo para hacer visible el contenido.
5. Revisa el resultado y el orden de las secciones por el procedimiento del dueño.

La acción Guardar y publicar indica efecto público; no debe tratarse como un guardado privado. No rellenes todas las secciones solo porque existan: utiliza contenido útil para comprar.

### Cambiar el menú público

En Menú de la tienda, en `/admin/menu`, usa Subir y Bajar para ordenar las entradas y el interruptor para mostrarlas u ocultarlas. Comprueba que cada cambio termine sin error.

El editor avisa si una entrada no tiene productos publicados o si sus páginas de destino no están construidas. Oculta las entradas que lleven a páginas inexistentes hasta resolverlas.

> Ocultar una entrada quita su acceso del menú; no equivale a borrar una categoría ni a establecer una protección de acceso para su URL.

## 15. Equipo y acceso administrativo

Esta sección requiere permisos de gestión de personal. Entra en IA y sistema / Equipo, en `/admin/equipo`.

### Dar acceso

1. La persona debe crear primero una cuenta en la tienda con su propio correo.
2. En Dar acceso, ingresa el Correo de la cuenta.
3. Elige el nivel y lee su descripción. Concede solo lo necesario.
4. Pulsa Dar acceso y revisa la confirmación antes de aprobar el cambio.
5. Comprueba el resultado en la lista de personas con acceso.

Este formulario concede permisos a una cuenta existente; no debe describirse como una invitación que necesariamente envía un correo y crea la cuenta.

### Cambiar o revocar

Utiliza el control de nivel del miembro correspondiente y revisa la confirmación. Revocar acceso retira los permisos administrativos; no debe confundirse con borrar todos los datos de la persona.

No puedes cambiar tu propio acceso desde esta operación. Tampoco se permite retirar el último superadministrador: antes debe existir otra persona con ese nivel.

### Datos personales

Evita capturas con correos y datos reales cuando solicites ayuda. Usa un identificador de caso o una captura censurada. Las acciones quedan registradas; no uses una cuenta compartida para varias personas.

> Administrador no incluye inventario, equipo ni credenciales de IA. Lee la descripción del nivel y comprueba los permisos efectivos.

## 16. El recorrido del cliente

### Comprar

1. El comprador busca un producto y abre su ficha.
2. Selecciona una variante y comprueba precio, disponibilidad y datos útiles.
3. Añade al carrito y revisa cantidades y total.
4. En checkout completa los datos y pulsa Revisar pedido.
5. Comprueba el resumen y pulsa Confirmar pedido para registrarlo.
6. Sigue las instrucciones de pago, copia los datos necesarios y envía la información de la operación.
7. Espera la verificación de la tienda y consulta la línea de tiempo del pedido.

Si el servidor detecta cambios de precio, cantidad o envío, el cliente debe revisar el nuevo resumen antes de confirmar otra vez. Los datos del formulario pueden recuperarse en la misma pestaña dentro de su período de conservación; no se debe prometer recuperación indefinida.

### Reserva y acceso al pedido

El aviso de reserva muestra su vencimiento. Cuando vence, la disponibilidad deja de estar garantizada; el servidor debe comprobarla. El tiempo mostrado no debe sustituirse por una promesa manual de stock.

Con sesión, el comprador utiliza Mi cuenta y sus pedidos. Como invitado, puede usar Recuperar acceso por correo, en `/checkout/recuperar`, con el pedido y correo de compra. El enlace es temporal y tiene límites de reenvío.

La entrega del correo depende del servicio y la cola configurados. Si no llega, revisa spam y solicita atención sin compartir enlaces privados.

> El perfil del cliente está en `/cuenta/perfil`. Es distinto del menú de perfil administrativo propuesto para una próxima mejora.

## 17. Resolver problemas y cerrar el día

### Problemas frecuentes

| Problema                               | Primera comprobación                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| No aparece Inventario o Equipo         | Nivel y permisos de la cuenta.                                   |
| Autocompletar no está disponible       | Producto en borrador, permiso, proveedor y perfil habilitados.   |
| La investigación queda en cola         | Estado de envío, última actividad e identificador del trabajo.   |
| Un bloque público no aparece           | Tiene datos, está habilitado y se guardó correctamente.          |
| Un conteo no se guarda                 | Entero válido, motivo y referencia de inventario actualizada.    |
| Un pago no se confirma                 | Revisión asignada, recepción real de fondos y decisión guardada. |
| Un enlace de comprobante dejó de abrir | Vuelve al caso autorizado y ábrelo de nuevo.                     |
| Un correo no llega                     | Datos de la solicitud, carpeta spam y diagnóstico de entrega.    |

### Información útil para pedir ayuda

Indica sección, acción, hora aproximada de Lima, mensaje exacto e identificador del pedido, producto o trabajo. No envíes contraseñas, claves, comprobantes abiertos ni datos personales innecesarios.

### Rutina de cierre

1. Revisar pagos y pedidos pendientes.
2. Atender reservas vencidas y casos bloqueados por el procedimiento permitido.
3. Revisar stock bajo y cantidades negativas.
4. Comprobar que los conteos y cambios de catálogo quedaron guardados.
5. Cerrar sesión al dejar el equipo.

> Un error de CPU o un servicio externo no se resuelve duplicando clics o modificando valores de producción sin diagnóstico. Conserva el identificador del caso y solicita revisión técnica.

## 18. Versión, fuentes y autocorrecciones

### Alcance de la revisión

Este manual se contrastó con el código local y con las decisiones vigentes. No se accedió al sitio público, a la base de producción ni a servicios privados. Las instrucciones no acreditan una prueba funcional completa del despliegue.

### Correcciones incorporadas durante la revisión

| Borrador que podía confundir                         | Regla final                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Cualquier administrador gestiona inventario          | Depende del permiso; el nivel Administrador no lo incluye.       |
| Habilitar el proveedor inicia las investigaciones    | También hacen falta perfil y ejecución de la cola.               |
| Activar un bloque lo hace visible                    | Necesita datos y un guardado correcto.                           |
| Enviar un comprobante confirma el dinero             | Una persona debe comprobar los fondos y aprobar.                 |
| Aprobar el pago equivale a restar físico manualmente | Revisar reservado, asignado y despacho; no duplicar movimientos. |
| Dar acceso crea una cuenta e invita por correo       | La persona debe tener previamente una cuenta.                    |
| El menú de perfil del admin ya existe                | Es una propuesta; el perfil del cliente sí tiene ruta propia.    |
| El historial contiene todos los movimientos          | Muestra como máximo los 50 más recientes.                        |

### Fuentes de implementación

- Navegación y cabecera: `src/lib/admin/navigation.ts`, `src/components/admin/admin-header.tsx`.
- Roles: `src/lib/admin/staff/levels.ts`; Equipo: `src/app/admin/(protected)/equipo/team-workspace.tsx`.
- Inventario: `src/app/admin/(protected)/inventario/` y `src/lib/admin/inventory/page-reader.ts`.
- Productos: creación y editor en `src/app/admin/(protected)/products/`; bloques en `src/components/admin/products/`.
- IA: `src/lib/ai/research/schemas.ts`, `src/lib/ai/proposals/apply-service.ts` y `src/components/admin/products/autofill-bar.tsx`.
- Pagos y pedidos: `src/app/admin/(protected)/pagos/` y `src/app/admin/(protected)/orders/`.
- Contenido: `src/app/admin/(protected)/home/section-form.tsx` y `src/app/admin/(protected)/menu/menu-workspace.tsx`.
- Cliente: `src/components/checkout/`, `src/app/(storefront)/checkout/` y `src/app/(storefront)/cuenta/`.

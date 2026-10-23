# Gamer Perú: flujos del cliente y del administrador

Fecha: 22 de octubre de 2026. Referencia del código: `f8a5ea2`, rama `feat/cloudflare-workers`.

Este documento describe el recorrido implementado y propone mejoras para discutir antes de
desarrollarlas. Se revisó el código; no se accedió a la tienda ni a la base de producción.
Los diagramas no certifican que los servicios externos estén funcionando en este momento.

Los bloques `mermaid` se pueden ver como diagramas en la vista previa compatible de Markdown y en
GitHub. Los rombos son decisiones; las flechas indican el siguiente paso.

## 1. Cliente: flujo actual de compra

```mermaid
flowchart TD
    C0["Inicio, búsqueda, categoría o marca"] --> C1["Abrir ficha del producto"]
    C1 --> C2["Revisar fotos, historia y datos disponibles"]
    C2 --> C3["Elegir color o talla y cantidad"]
    C3 --> C4{"¿Variante disponible?"}
    C4 -->|No| C3
    C4 -->|Sí| C5["Añadir al carrito con la animación actual"]
    C5 --> C6["Revisar carrito, cantidades y accesorios"]
    C6 --> C7["Ir al checkout"]
    C7 --> C8{"¿Compra con cuenta?"}
    C8 -->|Sí| C9["Usar dirección guardada o ingresar otra"]
    C8 -->|Invitado| C10["Ingresar correo y datos de entrega"]
    C9 --> C11["Elegir envío y método de pago; revisar total"]
    C10 --> C11
    C11 --> C12{"Servidor valida datos, precio y stock"}
    C12 -->|Corregir o revisar cambios| C11
    C12 -->|Válido| C13["Crear pedido pendiente y reservar stock"]
    C13 --> C14["Ver número de pedido e instrucciones de pago"]
    C14 --> C15["Realizar pago Yape o Plin por fuera de la tienda"]
    C15 --> C16["Enviar código de operación y foto opcional"]
    C16 --> C17["Comprobante recibido: pago en revisión"]
    C17 --> C18{"Administrador verifica el pago"}
    C18 -->|Solicita corrección y el pedido sigue vigente| C16
    C18 -->|Rechazo definitivo| C19["Pedido cancelado; liberar reserva"]
    C18 -->|Aprueba| C20["Pago confirmado; preparar pedido"]
    C20 --> C21["Despacho y seguimiento"]
    C21 --> C22["Entrega registrada"]
    C14 -. "Cancela sin pagar o vence la reserva" .-> C23["Cerrar pedido y liberar reserva según sus reglas"]
```

### Cómo leerlo

- **Carrito no equivale a compra:** el servidor vuelve a comprobar precios y disponibilidad.
- **Pedido registrado no equivale a pago confirmado:** Yape/Plin se verifica manualmente.
- El código de operación es obligatorio; la imagen del comprobante es opcional en el formulario
  actual. Los errores de carga permiten reintentar o continuar solo con el código.
- Un cliente con cuenta puede consultar sus pedidos desde `/cuenta/pedidos` y abrir el detalle.
  Un invitado consulta la confirmación con el acceso de su sesión; conocer el número de pedido no
  da acceso por sí solo.
- La preparación y el despacho requieren pago confirmado. La entrega se registra desde la
  operación; no se presupone una integración automática con el courier.
- Si una cuenta necesita completar su perfil, el checkout la deriva a ese paso.

### Mejoras propuestas para el cliente

Todas se pueden desarrollar con el proyecto actual, sin contratar otro servicio.

| Prioridad | Mejora                             | Cambio concreto                                                                                       | Cómo comprobar que ayuda                                                    |
| --------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Alta      | Explicar los pasos de compra       | Mostrar «Datos → Revisar pedido → Pagar → Verificación» con el estado actual                          | El cliente distingue cuándo registró el pedido y cuándo terminó de pagar    |
| Alta      | Recuperar datos tras un error      | Conservar datos no sensibles del formulario por sesión, sin guardar comprobantes ni secretos          | Un error de red no obliga a escribir toda la dirección otra vez             |
| Alta      | Explicar los cambios de total      | Señalar qué precio, cantidad o envío cambió antes de pedir nueva confirmación                         | El total nunca cambia silenciosamente                                       |
| Alta      | Facilitar el pago manual           | Botones para copiar monto, destinatario y número de pedido, con confirmación visual                   | Se puede completar el pago desde el teléfono sin transcribir cada dato      |
| Alta      | Mostrar vigencia real              | Si existe una reserva vigente, enseñar su vencimiento leído del servidor                              | El contador coincide con el estado real y no promete stock tras vencer      |
| Media     | Actualizar el estado del pedido    | Consultar el estado mientras la pestaña está visible; aumentar el intervalo si no cambia              | «Pago en revisión» cambia tras la aprobación sin recargar manualmente       |
| Media     | Comparar tallas con datos          | Presentar dimensiones y peso respaldados; recomendar rangos de mano solo si existen fuentes oficiales | Se puede comparar Mini y otras tallas sin recomendaciones inventadas        |
| Media     | Retirar distracciones del checkout | Ocultar el campo de cupón mientras no haya códigos activos                                            | No aparece una función que actualmente solo responde que no está disponible |
| Media     | Continuidad para invitados         | Diseñar una recuperación de acceso con un enlace temporal seguro y el canal ya disponible             | El invitado puede volver a su pedido sin exponerlo a terceros               |

La recuperación de acceso es una propuesta, no una función ya disponible. Si requiere enviar
mensajes, hay que verificar la configuración y cuota del canal existente antes de implementarla.

### Recorrido del cliente después de esas mejoras

```mermaid
flowchart TD
    M0["Ficha actual con fotos, datos y tallas claras"] --> M1["Elegir variante y añadir al carrito"]
    M1 --> M2["Carrito con total y disponibilidad claros"]
    M2 --> M3["Checkout breve; invitado o cuenta"]
    M3 --> M4["Validar datos y mostrar cualquier cambio"]
    M4 --> M5{"¿Cliente confirma el resumen?"}
    M5 -->|Necesita corregir| M3
    M5 -->|Sí| M6["Pedido creado; mostrar vigencia e instrucciones"]
    M6 --> M7["Copiar datos y pagar en Yape o Plin"]
    M7 --> M8["Enviar operación y comprobante opcional"]
    M8 --> M9["Ver estado real y próxima acción"]
    M9 --> M10{"Resultado de la revisión"}
    M10 -->|Corregir| M8
    M10 -->|Confirmado| M11["Preparación, envío y entrega con seguimiento"]
    M10 -->|Cerrado| M12["Motivo claro y opción para volver al catálogo"]
```

Se conserva el diseño público aprobado y la animación de añadir al carrito. Las mejoras se
concentran en claridad, recuperación y seguimiento.

## 2. Administrador: flujo actual desde Inicio

```mermaid
flowchart TD
    A0["Iniciar sesión"] --> A1{"¿Tiene acceso administrativo?"}
    A1 -->|No| A2["Acceso restringido"]
    A1 -->|Sí| A3["Inicio: resumen operativo"]
    A3 --> A4{"¿Qué necesita atender?"}
    A4 -->|Comprobantes pendientes| A5["Pagos: abrir cola y tomar un pago"]
    A5 --> A6["Revisar importe, operación y evidencia del pago"]
    A6 --> A7{"Decisión del operador"}
    A7 -->|Corregir| A8["Rechazo corregible; cliente puede reenviar si sigue vigente"]
    A7 -->|Rechazar definitivamente| A9["Cancelar pedido y liberar reserva"]
    A7 -->|Aprobar| A10["Pago confirmado y pedido confirmado"]
    A10 --> A11["Pedidos: iniciar preparación"]
    A11 --> A12["Registrar courier y seguimiento; despachar"]
    A12 --> A13["Registrar entrega"]
    A4 -->|Pedidos en curso| A14["Pedidos: filtrar, abrir vista rápida o detalle"]
    A14 --> A11
    A4 -->|Catálogo| A15["Productos: crear borrador o editar"]
    A15 --> A16["Lo básico; fotos; variantes y precios; especificaciones; página"]
    A16 --> A17{"¿Cumple los requisitos y tiene permiso?"}
    A17 -->|No| A18["Para publicar: corregir faltantes"]
    A18 --> A16
    A17 -->|Sí| A19["Publicar producto"]
    A4 -->|Contenido| A20["Diseño de tienda: Home y Menú"]
    A4 -->|IA| A21["Motor IA: asistente y configuración"]
    A4 -->|Resultados| A22["Inicio: métricas del período"]
    A4 -->|Accesos| A23["Equipo: gestionar según permisos"]
```

### Qué representa cada recorrido

| Área             | Ruta                          | Uso actual                                                       |
| ---------------- | ----------------------------- | ---------------------------------------------------------------- |
| Inicio           | `/admin`                      | Trabajo pendiente y accesos rápidos según permisos               |
| Métricas         | `/admin?vista=metricas`       | Resultados del período seleccionado                              |
| Pagos            | `/admin/pagos`                | Tomar una revisión, aprobar o rechazar con las reglas del pedido |
| Pedidos          | `/admin/orders`               | Filtrar, revisar, preparar, despachar y registrar entrega        |
| Productos        | `/admin/products`             | Crear borradores, completar los cinco pasos y publicar           |
| Historia         | `/admin/products/[id]/story`  | Editar y publicar la historia mediante su propio flujo           |
| Asistente IA     | `/admin/products/ai-import`   | Consultar investigaciones y revisar propuestas                   |
| Configuración IA | `/admin/settings/ai`          | Configurar proveedor, modelo y perfiles de investigación         |
| Diseño de tienda | `/admin/home` y `/admin/menu` | Administrar portada y navegación                                 |

Las opciones y las acciones dependen del rol. Abrir un pedido no habilita su preparación si
todavía no está pagado. Un reembolso registrado en el sistema tampoco ejecuta una transferencia
bancaria: la devolución de dinero se realiza por el canal correspondiente.

### Mejoras propuestas para el administrador

| Prioridad | Mejora                            | Cambio concreto                                                                                     | Cómo comprobar que ayuda                                                     |
| --------- | --------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Alta      | Inicio con siguiente acción       | Ordenar pendientes por antigüedad e impacto, con enlaces al filtro correspondiente                  | Se puede identificar qué atender primero sin recorrer cada sección           |
| Alta      | Cola IA comprensible              | Diferenciar guardado, envío fallido, espera y ejecución; mostrar última actividad                   | Un trabajo detenido deja de parecer una búsqueda que sigue avanzando         |
| Alta      | Configuración IA guiada           | Reunir proveedor, perfil y comprobación de disponibilidad en un recorrido corto                     | La interfaz indica qué falta sin confundir proveedor con perfil              |
| Alta      | Recuperación controlada           | Permitir reintentar un envío fallido del trabajo existente, sin crear otro                          | Pulsar dos veces no duplica la investigación                                 |
| Alta      | Acciones claras en pedidos        | Mostrar la siguiente acción permitida y el motivo cuando está bloqueada                             | No se intenta despachar un pedido sin pago confirmado                        |
| Media     | Conservar el trabajo del catálogo | Guardar el paso actual y avisar de cambios sin guardar al salir                                     | Se vuelve al punto de edición sin perder contenido                           |
| Media     | Resumen de lo que falta           | En cada paso, distinguir obligatorio para publicar, opcional y oculto por estar vacío               | Un paso completo no hace creer que todos sus bloques aparecerán en la tienda |
| Media     | Inventario utilizable             | Crear pantalla de existencias y movimientos sobre los servicios existentes                          | El operador puede localizar stock bajo y entender por qué cambió             |
| Media     | Consistencia entre pestañas       | Avisar de una versión nueva antes de guardar y ofrecer recargar sin pisar cambios                   | Dos operadores no sobrescriben cambios silenciosamente                       |
| Media     | Menos trabajo por petición        | Revisar acciones restantes que invalidan rutas inmediatamente; usar la estrategia de caché acordada | Las operaciones no provocan regeneraciones innecesarias en Workers           |

La pantalla de inventario es una ampliación pendiente, no una sección actualmente disponible.
La configuración guiada debe respetar los permisos y conservar perfiles personalizados.

### Recorrido del administrador después de esas mejoras

```mermaid
flowchart TD
    N0["Inicio: pendientes ordenados y estado del sistema"] --> N1{"Siguiente tarea"}
    N1 -->|Operación| N2["Abrir pago o pedido con su contexto"]
    N2 --> N3["Ver siguiente acción permitida y su motivo"]
    N3 --> N4["Ejecutar acción y confirmar resultado"]
    N4 --> N5["Volver a pendientes actualizados"]
    N1 -->|Catálogo| N6["Abrir borrador en el último paso utilizado"]
    N6 --> N7{"¿Quiere ayuda para completar datos?"}
    N7 -->|Sí| N8["Comprobar configuración e iniciar investigación"]
    N8 --> N9["Ver etapa real, última actividad o fallo accionable"]
    N9 --> N10["Revisar sugerencias y aceptar campos respaldados"]
    N10 --> N11["Completar precio, stock y medios autorizados"]
    N7 -->|No| N11
    N11 --> N12["Revisar faltantes y vista previa"]
    N12 --> N13{"¿Listo para publicar?"}
    N13 -->|Falta algo| N6
    N13 -->|Sí y tiene permiso| N14["Publicar y verificar el resultado"]
```

## 3. Autocompletado: dónde puede quedarse en cola

La aplicación separa crear el trabajo de ejecutarlo. Cloudflare Workers AI es el proveedor que
genera datos; **Inngest es quien coordina la ejecución en segundo plano**. Habilitar el proveedor
no demuestra que el evento de ejecución esté llegando al procesador.

```mermaid
flowchart TD
    Q0["Administrador pulsa Buscar datos"] --> Q1["Validar permisos, perfil y producto borrador"]
    Q1 --> Q2["Guardar trabajo y elementos pendientes"]
    Q2 --> Q3["Enviar evento a Inngest"]
    Q3 --> Q4{"¿El evento se envía?"}
    Q4 -->|No| Q5["Registrar fallo de envío"]
    Q5 --> Q6["Conciliador programado intenta reenviar"]
    Q6 --> Q3
    Q4 -->|Sí| Q7["Esperar turno del procesador"]
    Q7 --> Q8{"¿El procesador recibe y reclama el trabajo?"}
    Q8 -->|Todavía no| Q9["El elemento sigue pendiente: el panel dice En cola"]
    Q9 -. "Cuando el procesador esté disponible" .-> Q8
    Q8 -->|Sí| Q10["Buscar fuentes y resolver identidad del producto"]
    Q10 --> Q11["Extraer datos y validar fuentes y URLs"]
    Q11 --> Q12["Guardar propuesta revisable"]
    Q12 --> Q13["Administrador acepta, rechaza o corrige campos"]
    Q13 --> Q14["Aplicar lo aceptado al borrador"]
    Q14 --> Q15["Revisar paso 5; publicar de forma manual"]
    Q10 -. "Fallo o ambigüedad" .-> Q16["Fallo o necesita atención"]
    Q11 -. "Respuesta inválida o cuota agotada" .-> Q16
```

### Qué está confirmado y qué falta comprobar

- **Confirmado en el código:** hay envío de eventos, conciliación de envíos fallidos y recuperación
  de trabajos abandonados. La función de investigación limita la concurrencia a uno; otro trabajo
  activo puede hacer esperar al siguiente.
- **Confirmado en la interfaz:** «En cola» se muestra por el estado pendiente del elemento. No
  distingue por sí solo entre fallo de envío, espera de turno y procesador que no está recibiendo
  eventos.
- **No confirmado:** por qué está detenido el trabajo observado. No se revisaron sus registros en
  producción, el estado del evento ni la sincronización de Inngest.
- **Dependencia importante:** los conciliadores también requieren que el sistema de ejecución en
  segundo plano funcione; no corrigen por sí solos una integración desconectada.

### Comprobación propuesta para ese caso

1. Identificar el trabajo ya creado desde el Asistente IA; conservar su identificador.
2. Revisar si el envío figura pendiente, fallido o enviado, y si tiene una ejecución asociada en
   Inngest. Esto es una comprobación pendiente del entorno, no realizada para este documento.
3. Si no hay ejecución, comprobar la aplicación sincronizada, el registro de `/api/inngest` y los
   errores de envío. No mostrar claves en el panel ni copiarlas a registros.
4. Si hay ejecución, comprobar si espera a otro trabajo o si falló antes de comenzar la búsqueda.
5. Reintentar de forma controlada el trabajo existente cuando su estado lo permita; no crear
   repetidamente productos o investigaciones nuevas para intentar desbloquearlo.

La mejora de interfaz debe mostrar, por ejemplo, «No se pudo enviar el trabajo» o «Esperando turno;
última actividad hace…». Una espera larga debe ofrecer diagnóstico y una acción segura. No debe
ejecutarse toda la investigación dentro de la acción del botón para ocultar la cola.

La IA propone datos respaldados y el revisor decide qué aplicar. Precio, stock y publicación
siguen siendo decisiones humanas. Los enlaces de imágenes encontrados son referencias: no
equivalen a imágenes descargadas, autorizadas ni publicadas automáticamente.

## 4. Orden recomendado de mejoras sin nuevas suscripciones

| Orden | Pieza                             | Motivo                                                   | Criterio de cierre                                                         |
| ----- | --------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1     | Diagnóstico de la cola IA         | El bloqueo observado impide aprovechar el autocompletado | Un trabajo termina o muestra un motivo concreto y una recuperación segura  |
| 2     | Configuración IA guiada           | Reduce la confusión entre conexión y perfil              | Desde el editor se entiende qué falta y dónde completarlo                  |
| 3     | Claridad de pago y próxima acción | Reduce consultas y errores de interpretación             | Cliente y operador distinguen registrado, enviado, verificado y despachado |
| 4     | Recuperación del checkout         | Evita repetir datos por errores de red                   | Se recuperan los datos permitidos y el servidor vuelve a validar el total  |
| 5     | Prioridades en Inicio             | Reduce navegación manual                                 | El administrador entra directamente al pendiente correcto                  |
| 6     | Inventario e indicadores básicos  | Ayuda a operar con información real                      | Se ven movimientos, stock bajo y tiempos de atención sin duplicar ventas   |

«Sin nuevas suscripciones» significa usar ingeniería y la infraestructura que ya tiene el
proyecto. Las consultas, el almacenamiento, las búsquedas y la IA siguen consumiendo recursos:
hay que respetar las cuotas disponibles, limitar reintentos y detenerse al agotarlas. Ninguna
propuesta depende de comprar un servicio, promete IA ilimitada ni plantea crear cuentas para
eludir cuotas.

Los indicadores iniciales pueden calcularse con pedidos, pagos e investigaciones existentes:
tiempo de revisión, antigüedad de pendientes y tasa de fallo IA. Medir abandono de carrito o
conversión completa requiere instrumentar eventos adicionales; no se debe presentar como una
métrica ya disponible.

## 5. Referencias del código revisado

| Tema                                        | Fuente                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Invitados, validación y creación del pedido | [Servicio de checkout](../../src/lib/checkout/service.ts)                      |
| Formulario de compra                        | [Checkout del cliente](../../src/components/checkout/checkout-page-client.tsx) |
| Comprobante y pago en revisión              | [Pago manual](../../src/components/checkout/manual-payment-card.tsx)           |
| Aprobación y rechazo del pago               | [Servicio de verificación](../../src/lib/payments/verification-service.ts)     |
| Preparación, despacho y entrega             | [Servicio de fulfillment](../../src/lib/fulfillment/service.ts)                |
| Etapas visibles para el cliente             | [Línea de tiempo](../../src/lib/account/order-timeline.ts)                     |
| Secciones del administrador                 | [Navegación del admin](../../src/lib/admin/navigation.ts)                      |
| Inicio y métricas                           | [Inicio del administrador](<../../src/app/admin/(protected)/page.tsx>)         |
| Estado visible del autocompletado           | [Barra del editor](../../src/components/admin/products/autofill-bar.tsx)       |
| Envío y conciliación de investigaciones     | [Despacho IA](../../src/lib/ai/research/dispatch-service.ts)                   |
| Procesamiento en segundo plano              | [Función de investigación](../../src/lib/inngest/functions/ai-research-job.ts) |
| Pendientes generales del proyecto           | [Roadmap](../roadmap/ROADMAP.md)                                               |

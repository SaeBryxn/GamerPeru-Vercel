# Implementación de mejoras de los flujos

Referencia: [propuestas aprobadas](flujos-cliente-y-administrador.md).
Validación funcional final: el dueño prueba en Cloudflare. No se levantó servidor ni se accedió a producción.

## Cliente

- [x] 1. Pasos de compra y revisión explícita antes de registrar el pedido (`18a847b`).
- [x] 2. Formulario recuperable por pestaña, con identidad/carrito y vencimiento de dos horas (`18a847b`).
- [x] 3. Diferencias de precio, cantidad y envío antes de confirmar nuevamente (`18a847b`).
- [x] 4. Copiar monto, cuenta, destinatario y pedido con confirmación accesible (`17ad182`).
- [x] 5. Vencimiento de reserva leído del servidor; al vencer no promete stock (`17ad182`).
- [x] 6. Seguimiento automático con pausa en segundo plano y espera creciente (`17ad182`).
- [x] 7. Comparación de tallas sin sugerir rangos inexistentes (`17ad182`).
- [x] 8. Retirado el cupón sin códigos activos (`18a847b`).
- [x] 9. Recuperación por correo: enlace de 24 horas, cookie HttpOnly y acceso limitado al pedido (`d982c8e`).

El correo usa el proveedor y la cola ya existentes. Las solicitudes de recuperación tienen un
intervalo mínimo de 15 minutos y un máximo de cuatro por pedido en 24 horas; no se guardan tokens
ni correos en el evento. Falta comprobar la entrega real en Cloudflare. El sistema no confirma
pagos por haber recibido un comprobante.

## Administrador

- [x] 1. Inicio: pendientes por antigüedad e impacto y siguiente acción.
- [x] 2. Cola IA: etapas reales y última actividad.
- [x] 3. Configuración IA guiada.
- [x] 4. Reintentar el envío del trabajo existente sin duplicarlo.
- [x] 5. Próxima acción permitida y motivos de bloqueo en pedidos.
- [x] 6. Recordar el paso del catálogo y avisar al salir con cambios.
- [x] 7. Diferenciar obligatorio, opcional y bloques ocultos/vacíos.
- [x] 8. Pantalla de inventario, stock bajo y movimientos.
- [x] 9. Avisos de versiones nuevas sin sobrescribir cambios.
- [x] 10. Retirar invalidaciones inmediatas en las acciones administrativas afectadas.

## Commits principales subidos

| Commit    | Pieza                                                                          |
| --------- | ------------------------------------------------------------------------------ |
| `18a847b` | Checkout guiado, formulario recuperable, cambios de total y retirada del cupón |
| `17ad182` | Copiar datos de pago, reserva real, seguimiento y comparación de tallas        |
| `d982c8e` | Acceso temporal de invitados mediante el correo existente                      |
| `147818c` | Diagnóstico de cola IA, reintento y configuración guiada                       |
| `79c2603` | Pendientes por antigüedad e impacto y próxima acción del pedido                |
| `15bc53b` | Control de concurrencia del conteo físico bajo bloqueo de inventario           |
| `14d7248` | Paso recordado, avisos de cambios sin guardar y versión nueva                  |
| `09e396b` | Pantalla de inventario, filtros y movimientos                                  |
| `4a55860` | Baseline de especificaciones después de guardar                                |
| `0982ae2` | Verificación terminada en la barra de compra cuando el pago está confirmado    |

El último cierre retira invalidaciones inmediatas de las acciones de pagos, pedidos, categorías,
menú, equipo y home. Las pantallas solicitan sus datos nuevos desde el cliente; los cambios públicos
usan las etiquetas de caché con la política acordada. El detalle completo permanece en el historial
Git de la rama.

## Qué probar en Cloudflare

### Cliente

1. Añadir una variante al carrito: conservar la animación y el diseño anterior.
2. Completar el checkout y recargar la misma pestaña: recuperar datos; el cupón no aparece.
3. Pulsar Revisar pedido: todavía no se crea la compra. Confirmar pedido registra el pedido y
   pasa a las instrucciones de pago.
4. Cambiar el carrito desde otra pestaña antes de confirmar: cuando el servidor detecte cambios,
   revisar la explicación de precios, cantidades y envío y volver a confirmar.
5. Copiar monto, cuenta, destinatario y número de pedido: comprobar texto y aviso de copiado.
6. Comprobar el vencimiento de la reserva; al llegar a cero no debe prometer disponibilidad.
7. Enviar la operación: se muestra revisión, nunca pago confirmado automáticamente. El estado
   se actualiza cuando el administrador toma una decisión; la pestaña oculta pausa las consultas.
8. Abrir una guía sin rangos de mano: mostrar medidas disponibles sin deslizador ni talla
   inventada. Con rangos documentados, comprobar la comparación.
9. Desde otro navegador, abrir el enlace del correo de invitado. Confirmar el acceso y revisar
   únicamente ese pedido. Un enlace alterado o vencido no debe autorizar acceso. Solicitar otro
   desde `/checkout/recuperar` y comprobar también los límites de reenvío.

### Administrador

1. Inicio: comprobar siguiente tarea, antigüedad y filtros de pagos/pedidos.
2. Configuración IA: usar el asistente guiado y Comprobar disponibilidad. Sus indicadores
   describen configuración detectada; la recepción de un evento requiere comprobar una ejecución
   real de Inngest.
3. Producto borrador: Buscar datos. Distinguir guardado, error de envío y evento enviado sin
   actividad. Reintentar únicamente el envío fallido del trabajo existente.
4. Editor de producto: editar sin guardar, intentar abrir otro paso o salir mediante un enlace y
   cancelar la salida. Los datos deben conservarse. Guardar y recargar: se recuerda el paso.
5. Abrir un producto en dos pestañas, guardar en una y mantener cambios en la otra: comprobar el
   aviso de versión y el rechazo de una escritura antigua. La recarga con descarte es explícita.
6. Paso Página del producto: comprobar qué bloques son opcionales y cuáles están activados pero
   vacíos; los datos técnicos existentes también cuentan para dimensiones/especificaciones.
7. `/admin/inventario`: buscar por producto/SKU, filtrar agotados o stock bajo y revisar movimientos.
   Registrar un conteo con motivo; otro conteo basado en la lectura anterior debe ser rechazado.
8. Pedido pagado: iniciar preparación, actualizar seguimiento, despachar y registrar entrega.
   Comprobar la próxima acción y los bloqueos de un pedido pendiente de pago.
9. Guardar categorías, menú, equipo y home: comprobar que la pantalla se actualiza y no hay
   regeneración inmediata dentro de la acción.

## Validación y límites

- Prettier en archivos modificados, TypeScript, ESLint y pruebas unitarias específicas.
- Sin servidor local, E2E ni peticiones a la tienda o la base de producción.
- Sin migraciones ni nuevas dependencias o suscripciones.
- Falta la comprobación visual y funcional del dueño en Cloudflare.
- La entrega de correos requiere que el proveedor y el procesador ya existentes estén operativos.
  La cola IA requiere que Inngest reciba las ejecuciones. Los indicadores no sustituyen esas
  comprobaciones ni configuran cuentas externas automáticamente.
- Los enlaces de invitado duran 24 horas desde la emisión del evento. Los enlaces viejos llevan a
  la solicitud de uno nuevo. Su acceso se limita al pedido, también para el envío de comprobantes
  y la cancelación permitida por las reglas existentes.
- Los avisos de salida cubren los enlaces del editor y el cierre o recarga del documento. La
  navegación propia del navegador y las resoluciones 360/768/1440 requieren comprobación manual.

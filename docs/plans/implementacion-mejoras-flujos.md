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

- [ ] 1. Inicio: pendientes por antigüedad e impacto y siguiente acción.
- [x] 2. Cola IA: etapas reales y última actividad.
- [x] 3. Configuración IA guiada.
- [x] 4. Reintentar el envío del trabajo existente sin duplicarlo.
- [ ] 5. Próxima acción permitida y motivos de bloqueo en pedidos.
- [ ] 6. Recordar el paso del catálogo y avisar al salir con cambios.
- [ ] 7. Diferenciar obligatorio, opcional y bloques ocultos/vacíos.
- [ ] 8. Pantalla de inventario, stock bajo y movimientos.
- [ ] 9. Avisos de versiones nuevas sin sobrescribir cambios.
- [ ] 10. Retirar invalidaciones inmediatas en las acciones administrativas afectadas.

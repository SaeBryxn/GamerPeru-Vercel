# 06 · Seguridad y privacidad

El navegador es entrada no confiable. Las rutas y servicios resuelven identidad verificada y permisos en servidor, validan con Zod y verifican pertenencia de recursos. Ocultar botones no autoriza operaciones. Las credenciales privilegiadas permanecen en módulos `server-only` y no se serializan al cliente.

## Identidad y RBAC

Roles canónicos: SUPER_ADMIN, ADMIN_CATALOG, ADMIN_ORDERS, ADMIN_SUPPORT y CUSTOMER. `roles`, `permissions`, `role_permissions` y `user_roles` definen asignaciones; `src/lib/auth/rbac.ts` resuelve el contexto desde identidad verificada de Supabase. Permisos como `catalog:manage`, `catalog:publish`, `orders:verify`, `staff:manage` e `inventory:manage` se comprueban en servidor. Un correo o rol enviado en JSON no reemplaza esa resolución. Un fallo de autorización no concede acceso.

OAuth y correo/contraseña establecen sesión. Los clientes solo acceden a sus recursos. El pago invitado requiere grants/sesión; conocer un número de pedido no autoriza ver comprobantes. El flujo de auth valida redirects.

## Medios

| Límite           | Aplicación                                                                  |
| ---------------- | --------------------------------------------------------------------------- |
| Origen           | POST JSON desde SITE/www; excepciones locales de desarrollo según guard     |
| Sesión y permiso | 401 sin identidad, 403 sin `catalog:manage`                                 |
| Presupuesto      | UPDATE condicional atómico; `used + reserved + size <= budget`              |
| Propiedad        | Upload vinculado al actor, sin confiar en un UUID ajeno                     |
| Contenido        | HEAD, tamaño, MIME, firma y dimensiones del header; rango máximo 4096 bytes |
| Idempotencia     | Bloqueo del ledger; READY no contabiliza dos veces                          |
| Cancelación      | PENDING; abort no borra READY                                               |
| Expiración       | Sweep con una hora de margen, máximo 25 filas y skipLocked                  |

El control devuelve JSON saneado y `Cache-Control: no-store`. La firma limita cabeceras y caducidad. CORS del bucket debe permitir solo orígenes autorizados. El progreso no prueba aceptación: complete registra el asset. Las tablas nuevas tienen RLS y REVOKE de roles API, incluido service_role; el dominio usa conexión servidor. No se debilita CSP, RLS ni validación para silenciar warnings.

## Secretos, privacidad y observabilidad

Mantener claves R2, clave privilegiada Supabase, secretos de checkout, claves de cifrado y tokens fuera de Markdown, PNG y logs. `.env.example` describe nombres sin valores reales. El HMAC antiguo de medios ya no tiene consumidores; el UUID no elimina sesión ni propietario. CSP y orígenes de imagen conservan la configuración existente. Los logs/audit deben minimizar PII. Comprobantes, medios de pago y backups permanecen separados del bucket público.

## IA

La arquitectura separa credenciales cifradas, gateway y herramientas permitidas. Investigación/importación producen propuestas revisables. El asistente recibe recuperación y herramientas allowlisted con datos mínimos: nunca márgenes, datos privados de proveedores, secretos, borradores, información de otros clientes ni datos privados de EC OS. Precio, stock, pagos y autorización son hechos del dominio, no decisiones del modelo.

Las capturas usan identidades y pedidos sintéticos. No acreditan todas las propiedades anteriores: la [matriz de calidad](07-calidad-y-pruebas.md) distingue evidencia y pendientes.

Referencias: [ADR-003](../decisions/ADR-003-authentication-authorization-rbac.md), [credenciales IA](../decisions/ADR-007-ai-provider-credential-security.md), [asistente](../architecture/AI_CUSTOMER_ASSISTANT_ARCHITECTURE.md).

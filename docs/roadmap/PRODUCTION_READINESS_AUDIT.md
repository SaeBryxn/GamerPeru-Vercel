# Auditoría Técnica Integral y Plan de Pase a Producción

**Fecha:** 2026-09-27
**Rama auditada:** `feat/frontend-overhaul-and-admin` (66 archivos sin commitear)
**Alcance:** backend (Drizzle/PostgreSQL en Supabase, servicios de dominio, Inngest, R2) contra frontend (Next.js 16 App Router, storefront y admin).
**Método:** lectura del esquema, migraciones, servicios en `src/lib`, rutas en `src/app`, componentes, scripts, configuración y specs; búsqueda de quién llama a cada función de dominio; ejecución de las validaciones locales.

---

## 0. Resumen ejecutivo

El backend comercial está **mucho más avanzado que la interfaz que lo opera**. El motor de checkout, reservas de inventario, envío de comprobantes Yape/Plin, cancelaciones, reembolsos y reconciliación de stock existe, está probado (1.600 tests unitarios en verde) y es transaccional e idempotente. Pero **el ciclo del pedido se corta justo después de que el cliente sube su comprobante**:

> **No existe ninguna función, acción ni pantalla que apruebe o rechace un pago.** Ningún código del repositorio mueve un pago a `VERIFYING`, `PAID` o `REJECTED`. Por lo tanto ningún pedido llega jamás a `CONFIRMED`, el stock reservado nunca pasa a `ALLOCATED`, y no hay forma de despachar.

Hoy la tienda puede **recibir** pedidos y comprobantes, pero **no puede cerrar una venta**. Además, ningún correo transaccional sale del sistema: los eventos se escriben en la tabla `outbox_events` y nada los consume.

Veredicto: **no apta para producción.** Los bloqueantes son acotados y bien definidos (sección 4). La mayor parte del trabajo es construir interfaces admin sobre servicios que ya existen, más dos servicios nuevos (verificación de pago y despacho) y el despachador de correos.

### Estado de las validaciones (ejecutadas hoy en local)

| Gate                        | Resultado                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`              | PASS                                                                                                            |
| `eslint . --max-warnings=0` | PASS                                                                                                            |
| `vitest run`                | PASS — 131 archivos, 1.600 tests                                                                                |
| `prettier --check .`        | FALLA — 886 archivos, **pero 885 son solo CRLF** (ver 3.4). Único problema real: `public/images/home/README.md` |
| `next build`                | No ejecutado en esta auditoría                                                                                  |
| `pnpm test:e2e`             | No ejecutado en esta auditoría                                                                                  |
| CI remoto (GitHub Actions)  | Bloqueado por facturación desde GP-026 (waiver documentado)                                                     |

---

## 1. Mapeo de brechas Backend vs. Frontend

### 1.1 Lógica sin interfaz (backend huérfano)

Funciones de dominio exportadas que **ningún archivo de UI ni acción llama**:

| Función / entidad                                                                                                             | Archivo                                  | Qué hace                                                                    | Quién debería usarla                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `allocateOrderInventoryAfterPaymentApproval`                                                                                  | `src/lib/inventory/service.ts:1067`      | Pasa la reserva a `ALLOCATED` (stock comprometido definitivamente)          | Aprobación de pago (admin) — **no existe**                           |
| `reacquireOrderInventoryAfterLatePayment`                                                                                     | `src/lib/inventory/service.ts:1304`      | Recupera stock para un pago que llegó tarde tras expirar la reserva         | Aprobación de pago tardío (admin)                                    |
| `applyTerminalPaymentRejectionConsequences`                                                                                   | `src/lib/orders/service.ts:1564`         | Cancela el pedido y libera stock tras un rechazo definitivo                 | Rechazo de pago (admin)                                              |
| `cancelPaidPreShipmentAndRefund`                                                                                              | `src/lib/orders/service.ts:488`          | Cancela un pedido pagado antes del despacho y registra reembolso            | Admin de pedidos                                                     |
| `recordRefund`                                                                                                                | `src/lib/orders/service.ts:1007`         | Reembolso parcial/total contra un pago confirmado                           | Admin de pedidos                                                     |
| `getOrderTimeline`                                                                                                            | `src/lib/orders/service.ts:1707`         | Línea de tiempo completa de un pedido                                       | Detalle de pedido (admin y cliente)                                  |
| `receiveInventory`                                                                                                            | `src/lib/inventory/service.ts:161`       | Ingreso de mercadería (movimiento `RECEIVING`)                              | Admin de inventario                                                  |
| `transferInventoryQuarantine`                                                                                                 | `src/lib/inventory/service.ts:734`       | Mover unidades a/desde cuarentena                                           | Admin de inventario                                                  |
| `reconcileInventory` / `repairInventoryDiscrepancy`                                                                           | `src/lib/inventory/service.ts:1855/1968` | Detectar y reparar descuadres del ledger                                    | Admin de inventario                                                  |
| Tabla `inventory_ledger`                                                                                                      | `src/db/schema/inventory/`               | Historial de movimientos                                                    | Kardex en admin — sin vista                                          |
| Tabla `refunds`                                                                                                               | `src/db/schema/payments/refunds.ts`      | Reembolsos                                                                  | Sin vista                                                            |
| Tabla `shipments` (tracking, courier, fechas)                                                                                 | `src/db/schema/shipping/shipments.ts`    | Se crea en `UNFULFILLED` al hacer checkout                                  | **Nada la actualiza nunca**                                          |
| Tablas `shipping_methods`, `payment_method_configurations`, `payment_instruction_versions`                                    | `src/db/schema/...`                      | Configuración de envío y cuentas Yape/Plin                                  | Solo el script `scripts/seed-commerce-config.mjs`                    |
| Tabla `outbox_events`                                                                                                         | `src/db/schema/outbox.ts`                | Eventos `OrderPlaced`, `PaymentSubmitted`, `OrderCancelled`, `RefundIssued` | **Sin consumidor** (ver 3.1)                                         |
| Tabla `audit_events`                                                                                                          | `src/db/schema/audit/`                   | Auditoría                                                                   | Sin visor en admin                                                   |
| Roles/permisos `ADMIN_ORDERS`, `ADMIN_SUPPORT`, `orders:manage`, `orders:verify`, `support:*`, `staff:manage`, `audit:export` | migración `0006`                         | RBAC sembrado                                                               | Ninguna pantalla los exige; no hay UI para asignar roles al personal |
| `customer_profiles`, `customer_addresses` (vista staff)                                                                       | `src/db/schema/identity/`                | Clientes                                                                    | Sin módulo Clientes en admin                                         |
| `RESEND_API_KEY`                                                                                                              | `src/config/server-env.ts:18`            | Declarada en el esquema de entorno                                          | Ningún código envía correos                                          |

**Admin — navegación real hoy** (`src/lib/admin/navigation.ts`): Inicio, Productos, Categorías y marcas, Menú de la tienda, Asistente IA, Configuración IA. **No hay Pedidos, Pagos, Inventario, Clientes ni Configuración de la tienda.**

El dashboard (`/admin`) sí lee pedidos y pagos reales (cola de pagos sin verificar, pipeline, inventario, cohortes financieras), pero es **solo lectura y sin enlaces**: muestra "X pagos por verificar" sin forma de ir a verificarlos.

### 1.2 Interfaz sin lógica (frontend huérfano)

| Superficie                                                      | Archivo                                                            | Problema                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Chat flotante**                                               | `src/components/floating/chat-widget/chat-widget.tsx`              | Responde siempre un texto fijo ("Nuestro asistente todavía no está conectado"). Muestra un producto destacado sacado de datos estáticos.                                                                                                         |
| **Panel de búsqueda (drawer)**                                  | `src/components/search/search-quick-results.ts`                    | Filtra un **arreglo estático en el bundle** (`STOREFRONT_INVENTORY`), no la base de datos. Productos nuevos no aparecen; productos borrados sí. El modal de búsqueda sí usa `/api/search/predictive` — hay dos buscadores con fuentes distintas. |
| **Footer — columnas "Mouses" y "Mousepads"**                    | `src/components/navigation/navigation-data.ts:28`                  | Generadas desde el inventario estático; los enlaces pueden apuntar a slugs que no existen en la BD (404).                                                                                                                                        |
| **Marcas del footer**                                           | mismo archivo                                                      | Lista fija (ATK, Mchose, JINMS, X-Raypad), no las marcas publicadas.                                                                                                                                                                             |
| **Favoritos**                                                   | `src/app/(storefront)/cuenta/favoritos/page.tsx`                   | Placeholder "Próximamente". No existe tabla de wishlist. Además está enlazado desde el footer.                                                                                                                                                   |
| **Referidos**                                                   | `src/app/(storefront)/cuenta/referidos/page.tsx`                   | Placeholder "Próximamente". No hay esquema (GP-031).                                                                                                                                                                                             |
| **Imágenes editoriales del home**                               | `src/app/(storefront)/page.tsx:97-159`                             | Referencia 7 archivos en `public/images/home/` que **no existen** (solo hay un README). `HomeImage` colapsa el hueco en silencio: el home se ve vacío en esas secciones.                                                                         |
| **Videos del home**                                             | `video-hero.tsx:17`, `page.tsx:67`                                 | Embeds de YouTube con IDs fijos en código. Confirmar derechos de uso (activos de terceros).                                                                                                                                                      |
| **Seguimiento de envío en "Mis pedidos"**                       | `src/components/account/order-card.tsx:117`                        | Lee `trackingUrl` real, pero nadie puede escribirlo (no hay UI de despacho). Siempre vacío.                                                                                                                                                      |
| **Estado "En verificación" en confirmación**                    | `checkout-confirmation-view.tsx:78`, `manual-payment-card.tsx:308` | La UI contempla `VERIFYING`, pero ningún backend produce ese estado.                                                                                                                                                                             |
| **Mega-menú: `/guia-de-compra/*`, `/software/*`, `/soporte/*`** | `navigation-data.ts`                                               | Rutas inexistentes; están correctamente ocultas por `missingDestinations` en `menu-entries.ts`. No es bug, pero son secciones que no existen.                                                                                                    |

Lo que **sí está correctamente conectado** al backend: catálogo, categorías, marcas, PDP con Product Story, filtros, búsqueda en `/buscar`, carrito, checkout (invitado y autenticado), subida de comprobante a R2 privado, página de confirmación, cancelación de pedido impago por el cliente, autenticación (email + Google), perfil, direcciones, "Mis pedidos", y todo el admin de catálogo, historias e IA.

---

## 2. Auditoría de flujos incompletos

### 2.1 El flujo del dinero (el crítico)

```
Cliente                                   Sistema                          Admin
───────                                   ───────                          ─────
Checkout ─────────────► orders PENDING, payments UNPAID,
                        reserva ACTIVE (TTL), shipment UNFULFILLED,
                        outbox OrderPlaced                        ✓ construido
Sube comprobante ─────► payment_submissions, payments SUBMITTED,
                        reserva VERIFICATION_HOLD (congela TTL),
                        outbox PaymentSubmitted                   ✓ construido
                                                                        ✗ Nadie se entera (sin correo/alerta)
                                                                        ✗ No hay cola de verificación
                                                                        ✗ No se puede ver el comprobante
                                                                        ✗ No se puede aprobar ni rechazar
payments PAID / pedido CONFIRMED / reserva ALLOCATED              ✗ inalcanzable
Pedido PROCESSING → despacho → reserva CONSUMED, ledger
FULFILLMENT_DISPATCHED, shipment SHIPPED + tracking               ✗ no existe servicio
Entregado → FULFILLED / DELIVERED                                 ✗ no existe servicio
```

**Respuesta directa a tu pregunta:** después de que el cliente sube el comprobante, el pedido queda en `SUBMITTED` + `VERIFICATION_HOLD` **para siempre**. No hay pantalla para aprobarlo, no hay función que lo apruebe, y el stock nunca se descuenta definitivamente. La reserva congelada tampoco expira (por diseño, el TTL se suspende durante la verificación), así que esas unidades quedan bloqueadas indefinidamente.

Qué falta construir, por pieza:

1. **Servicio de verificación de pago** (nuevo, `src/lib/payments/verification-service.ts` o similar):
   - `startVerification` (`SUBMITTED → VERIFYING`, registra verificador).
   - `approvePayment` (`→ PAID`), dentro de la misma transacción: `allocateOrderInventoryAfterPaymentApproval`, pedido `→ CONFIRMED`, auditoría, outbox `PaymentApproved`. Si el envío fue tardío (`is_late`), usar `reacquireOrderInventoryAfterLatePayment` y resolver faltantes.
   - `rejectPayment` en dos modos: **no terminal** (abre `resubmission_grace_expires_at`, el cliente puede reenviar — el lado cliente ya lo soporta) y **terminal** (`applyTerminalPaymentRejectionConsequences`).
   - Idempotencia y bloqueo de fila, siguiendo el patrón de `orders/service.ts`. Permiso `orders:verify`.
   - La spec lo exige: "verifier ID, timestamps, decision, notes" — hoy no hay columnas para verificador/notas/decisión. **Requiere migración** (tabla `payment_verifications` o columnas en `payments`).
2. **Visor seguro de comprobantes:** URL firmada de corta duración desde el bucket privado (`proof-upload.ts` ya tiene el cliente S3 y `GetObjectCommand`), solo con `orders:verify`, nunca cacheada.
3. **Servicio de despacho/fulfillment** (nuevo): `markProcessing`, `dispatchOrder` (reserva `→ CONSUMED`, ledger `FULFILLMENT_DISPATCHED`, shipment `SHIPPED` con courier/tracking), `markDelivered` (pedido `FULFILLED`). No existe ninguna de estas transiciones.

### 2.2 Módulo por módulo

| Módulo                      | Backend                                                                                               | Storefront                                          | Admin                                                                                 | Estado                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Catálogo**                | Completo                                                                                              | Completo (PDP, filtros, búsqueda, SEO por producto) | Completo (editor, historias, medios, IA)                                              | Listo. Deuda: buscador del drawer estático.                                                                     |
| **Pedidos**                 | Crear, cancelar impago, cancelar pagado + reembolso, timeline                                         | Mis pedidos + confirmación                          | **No existe** (GP-027)                                                                | Bloqueante                                                                                                      |
| **Verificación de pagos**   | Envío del cliente completo; **aprobación/rechazo inexistente**                                        | Completo                                            | **No existe** (GP-028)                                                                | Bloqueante crítico                                                                                              |
| **Inventario**              | Motor completo (recepción, ajustes, cuarentena, reservas, expiración cron cada 2 min, reconciliación) | Disponibilidad en PDP                               | Solo "fijar stock por conteo" dentro del editor de producto (`setVariantStockAction`) | Parcial. Falta recepción, kardex y vista global de stock (GP-029). Solo `SUPER_ADMIN` tiene `inventory:manage`. |
| **Envíos**                  | Métodos + shipment creado en checkout                                                                 | Selección en checkout; tracking en "Mis pedidos"    | **No existe**                                                                         | Bloqueante (sin despacho no hay entrega)                                                                        |
| **Clientes**                | Perfiles, direcciones                                                                                 | Cuenta completa                                     | **No existe** (GP-030)                                                                | Fase 2 (se puede operar desde el detalle del pedido)                                                            |
| **Perfil de usuario**       | Completo                                                                                              | Completo (perfil, direcciones, contraseña)          | —                                                                                     | Listo. Favoritos y referidos son placeholders.                                                                  |
| **Configuración de tienda** | Tablas versionadas de instrucciones de pago y métodos de envío                                        | —                                                   | **No existe**; solo script de seed                                                    | Aceptable para lanzar vía script; UI en Fase 2                                                                  |
| **Personal / roles**        | RBAC completo con 5 roles                                                                             | —                                                   | Sin UI; la asignación es SQL manual                                                   | Aceptable para lanzar con procedimiento documentado                                                             |
| **Comunicaciones**          | Outbox escribe eventos; sin consumidor, sin proveedor                                                 | —                                                   | —                                                                                     | Bloqueante                                                                                                      |
| **IA (admin)**              | Completo                                                                                              | —                                                   | Completo                                                                              | Listo                                                                                                           |
| **Asistente IA cliente**    | No existe (GP-035)                                                                                    | Chat falso                                          | —                                                                                     | Ocultar o convertir en WhatsApp para lanzar                                                                     |

### 2.3 Casos borde que hoy no tienen salida

- **Pago tardío** (cliente paga después de expirar la reserva): el backend lo marca `is_late`, pero nadie lo resuelve.
- **Invitado que pierde la cookie** de acceso a su pedido: no hay "buscar mi pedido por número + email"; no podría volver a subir el comprobante. Confirmar el alcance de `guest_payment_access_grants` y definir el canal de recuperación (como mínimo, el correo de confirmación con el enlace).
- **Pedido con comprobante y cliente que pide cancelar**: `cancelUnpaidOrder` rechaza pedidos en `SUBMITTED/VERIFYING` (`orders/service.ts:271`) — correcto, pero entonces solo el admin puede resolverlo, y no tiene pantalla.
- **Operación duplicada** (mismo código Yape en dos pedidos): existe el índice anti-fraude `(operation_code, submitted_at)`, pero ninguna UI lo muestra al verificador.

---

## 3. Oportunidades y mejoras críticas para producción

### 3.1 Comunicaciones transaccionales (bloqueante)

- **Despachador del outbox:** función Inngest (cron cada minuto) que tome `outbox_events` `PENDING` con `FOR UPDATE SKIP LOCKED`, reintente con backoff (`retry_count`, `next_attempt_at`, `last_error`) y marque `DELIVERED/FAILED`. El esquema ya está diseñado para esto.
- **Adaptador de correo** detrás de una interfaz neutral (la spec prohíbe acoplar el proveedor a los eventos). Resend ya está previsto en el entorno.
- **Plantillas mínimas para lanzar:** pedido recibido (con instrucciones de pago y enlace), comprobante recibido, pago aprobado, pago rechazado (con enlace para reenviar), pedido cancelado, pedido despachado (con tracking).
- **Alerta interna** al equipo cuando entra un `PaymentSubmitted` (correo o WhatsApp al operador). Sin esto, los pagos se quedan sin revisar.
- **SMTP propio en Supabase Auth:** los correos de verificación y recuperación de contraseña usan hoy el SMTP por defecto de Supabase, con límite de envío muy bajo y pensado para desarrollo. En producción los registros fallarían. Configurar Resend como SMTP personalizado y revisar `supabase/templates/`.

### 3.2 Seguridad

- **Sin rate limiting** en checkout, envío de comprobante, solicitud de URL de subida, login/registro, recuperación de contraseña ni `/api/search/predictive`. Mínimo: límite por IP + sesión en las server actions de checkout y pagos, y activar la protección de Supabase Auth.
- **Sin Content-Security-Policy.** Hay HSTS, nosniff, frame-options y permissions-policy (`next.config.ts`), falta CSP (considerando YouTube, Supabase, R2, Sentry `/monitoring`).
- **Validación de entorno demasiado permisiva en producción:** `NEXT_PUBLIC_SITE_URL` cae por defecto a `http://localhost:3000` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` a un placeholder. Además variables críticas (`CHECKOUT_HMAC_SECRET`, `INVENTORY_HMAC_SECRET`, `AI_ENCRYPTION_KEY_V*`, `INNGEST_SIGNING_KEY`, credenciales R2) se leen fuera del esquema Zod central. Hacer que la app **falle al arrancar** en producción si falta cualquiera.
- **Inngest:** `/api/inngest` debe exigir `INNGEST_SIGNING_KEY` en producción; sin ella, cualquiera podría invocar las funciones.
- **Protección de rutas:** correcta. `src/proxy.ts` refresca la sesión y el layout `admin/(protected)` verifica RBAC en servidor; cada acción revalida permisos. Mantener este patrón en los módulos nuevos (verificar `orders:verify` / `orders:manage` en cada acción, no solo en el layout).
- **Archivos `.env*.local` y backups** están correctamente ignorados por git. Borrar los respaldos locales viejos (`.env.local.backup-*`, `.env.backup.local`) una vez rotados los secretos.

### 3.3 SEO y presencia

- **No existe `sitemap.ts` ni `robots.ts`.** Crítico para indexar el catálogo.
- **Sin favicon, iconos ni imagen Open Graph** por defecto; falta confirmar `metadataBase` en el layout raíz (depende de `NEXT_PUBLIC_SITE_URL`, hoy con fallback a localhost).
- Metadata dinámica y JSON-LD de producto: **ya existen** (`pdp-seo.ts`, `generateMetadata` en PDP, categorías, marcas y búsqueda). Bien.

### 3.4 Legal y operación en Perú (bloqueante)

- **Libro de Reclamaciones virtual** — obligatorio por el Código de Protección al Consumidor (Ley 29571) para comercios que venden a consumidores. No existe.
- **Términos y condiciones, Política de privacidad** (Ley 29733 de Protección de Datos Personales — se recolectan DNI, teléfono y dirección), **Política de cambios, devoluciones y garantía**, **datos del comercio** (razón social, RUC) visibles.
- **Página de contacto/soporte** real (hoy `/soporte` está oculto por no existir).
- Comprobante electrónico (boleta/factura SUNAT): definir si se emite fuera del sistema al inicio. No bloquea el código, sí la operación.

### 3.5 Deuda técnica a resolver ya

| Deuda                                                                                                                          | Impacto                                                                       | Acción                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **66 archivos sin commitear**, incluida la reubicación de `/cuenta` dentro de `(storefront)`                                   | Riesgo de pérdida de trabajo; no se puede desplegar lo que no está versionado | Cerrar y commitear antes de empezar los bloqueantes                                                                                   |
| **CRLF**: `core.autocrlf=true` sin `.gitattributes`, `prettier` con `endOfLine: "lf"`                                          | `pnpm format:check` falla en Windows en 885 archivos (en CI Linux pasaría)    | Añadir `.gitattributes` con `* text=auto eol=lf` y renormalizar                                                                       |
| **Datos estáticos de catálogo en producción** (`storefront-inventory.ts` usado por chat, drawer de búsqueda y footer)          | Resultados y enlaces que no reflejan la BD                                    | Drawer → `/api/search/predictive`; footer → catálogo publicado; limitar el archivo estático al modo `DEV_CATALOG_PREVIEW`             |
| **Componentes gigantes**: `product-editor.tsx` (3.136 líneas), `story-builder.tsx` (1.842), `checkout-page-client.tsx` (1.124) | Mantenibilidad, bundle y riesgo de regresión                                  | Dividir por sección (medios, variantes, precios, stock / pasos de checkout) — no bloquea el lanzamiento, salvo el checkout si se toca |
| **Servicios de dominio >1.800 líneas** (`inventory/service.ts` 2.207, `catalog/service.ts` 1.838, `orders/service.ts` 1.823)   | Difíciles de revisar                                                          | Añadir los servicios nuevos (verificación, despacho) como **módulos separados**, no dentro de estos archivos                          |
| **CI remoto bloqueado por facturación**                                                                                        | Ningún gate automático protege `main`                                         | Reactivar GitHub Actions (o migrar a otro runner) antes del despliegue                                                                |
| `eslint-disable` + `any` en `inventory-expiration.ts`                                                                          | Menor                                                                         | Tipar el handler de Inngest                                                                                                           |
| Dashboard sin drill-down                                                                                                       | Menor                                                                         | Enlazar cada métrica al módulo correspondiente cuando exista                                                                          |

---

## 4. Roadmap final hacia producción

El orden respeta dependencias técnicas. Cada bloque indica el GP canónico al que corresponde.

### Bloqueantes para el lanzamiento (para poder vender)

**Etapa A — Base estable**

1. **Estabilizar el árbol de trabajo:** revisar y commitear los 66 archivos pendientes; añadir `.gitattributes` (LF); corregir `public/images/home/README.md`; ejecutar `pnpm check` y `pnpm test:e2e` completos hasta verde.
2. **Restaurar CI remoto** (facturación de GitHub Actions o runner alternativo). Sin CI no hay gate objetivo para producción.

**Etapa B — Cerrar el ciclo del dinero** (lo más importante)

3. **Migración de verificación:** tabla/columnas para verificador, decisión, notas y timestamps de verificación (ADR corto si cambia el agregado de pago).
4. **Servicio de verificación de pago** — `startVerification`, `approvePayment`, `rejectPayment` (terminal y no terminal), resolución de pago tardío; transaccional, idempotente, auditado, permiso `orders:verify`, eventos outbox. Tests de integración contra BD real incluyendo concurrencia (dos admins aprobando a la vez) y pago tardío sin stock. → **GP-028**
5. **Admin de Pedidos (mínimo viable):** listado filtrable por estado, detalle con ítems, dirección, pago, envíos del comprobante y `getOrderTimeline`; acciones de cancelar (impago y pagado + reembolso vía servicios existentes). Añadir "Pedidos" a la navegación admin con `orders:manage`. → **GP-027**
6. **Cola de Verificación de Pagos:** lista de `SUBMITTED` ordenada por antigüedad, visor seguro del comprobante (URL firmada), código de operación con alerta de duplicados, monto esperado vs. declarado, botones Aprobar / Rechazar (con motivo y opción de reenvío). → **GP-028**
7. **Servicio y UI de despacho:** marcar en preparación, despachar (courier, número y URL de tracking; consume la reserva y escribe el ledger), marcar entregado. Integrado en el detalle del pedido. → alcance de **GP-027** (ampliar el alcance por escrito antes de implementar)

**Etapa C — Comunicación y operación**

8. **Despachador de outbox + adaptador de correo + plantillas** (pedido recibido, comprobante recibido, pago aprobado, pago rechazado, cancelado, despachado) y **alerta interna de nuevo comprobante**. → spec `SHIPPING_AND_COMMS_SPEC`
9. **SMTP personalizado en Supabase Auth** y revisión de las plantillas de confirmación y recuperación.
10. **Inventario mínimo operable:** pantalla de stock por variante (disponible / reservado / asignado), recepción de mercadería con `receiveInventory` y kardex de solo lectura. Decidir si `ADMIN_ORDERS` recibe `inventory:manage` (migración de seed). → **GP-029** (mínimo)
11. **Configuración de producción vía script:** ejecutar `seed-commerce-config.mjs --apply` con las cuentas reales de Yape/Plin y tarifas de envío; documentar el procedimiento SQL para asignar roles de personal.

**Etapa D — Storefront honesto**

12. **Eliminar lo falso:** buscador del drawer conectado a `/api/search/predictive`; footer desde el catálogo publicado; chat reemplazado por un botón de WhatsApp (o retirado) hasta GP-035; ocultar Favoritos y Referidos de la navegación y del footer.
13. **Activos del home:** subir las 7 imágenes editoriales faltantes (o retirar esas secciones), confirmar derechos de los videos de YouTube, añadir favicon, iconos e imagen OG por defecto.
14. **Páginas legales y de soporte:** Libro de Reclamaciones, Términos, Privacidad, Cambios/Devoluciones/Garantía, Contacto, datos del comercio en el footer.

**Etapa E — Endurecimiento y salida**

15. **SEO técnico:** `sitemap.ts` (productos, categorías y marcas publicadas), `robots.ts` (bloquear `/admin`, `/cuenta`, `/checkout`, `/auth`), `metadataBase`. → **GP-036** (mínimo)
16. **Seguridad:** rate limiting en checkout, pagos, auth y búsqueda; CSP; validación de entorno que falle en producción; `INNGEST_SIGNING_KEY` obligatoria. → **GP-043** (mínimo)
17. **Infraestructura de producción:** proyecto Supabase de producción con migraciones aplicadas (`docs/architecture/DATABASE_REMOTE_BOOTSTRAP.md`), buckets R2 con CORS y políticas privadas, Inngest Cloud con los crons registrados, Sentry, dominio y HTTPS, backups de BD verificados con un restore de prueba. → **GP-049 / GP-050**
18. **QA comercial de punta a punta** en staging con dinero real mínimo: invitado y registrado × Yape y Plin × aprobado, rechazado con reenvío, rechazo terminal, pago tardío, cancelación, despacho, entrega; verificar stock y correos en cada paso. Móvil primero. → **GP-048**
19. **Lanzamiento:** `pnpm check` y `pnpm test:e2e` en verde, CI verde, monitoreo activo, runbook de operación diaria (revisar cola de pagos, despachar). → **GP-052**

### Fase 2 (post-lanzamiento)

1. **Admin de Clientes** (búsqueda, historial de pedidos, direcciones). → GP-030
2. **Configuración de tienda en admin:** instrucciones Yape/Plin versionadas con QR, métodos y tarifas de envío.
3. **Gestión de personal y roles** desde el admin (`staff:manage`) y visor/exportación de auditoría (`audit:export`).
4. **Inventario completo:** cuarentena, reconciliación y reparación de descuadres con UI, alertas de stock bajo. → GP-029 completo
5. **Reembolsos parciales con UI** dedicada e historial.
6. **Búsqueda de pedido para invitados** (número + email) y página de seguimiento pública.
7. **Favoritos** (nueva tabla + UI).
8. **Referidos, afiliados y comisiones.** → GP-031 a GP-034
9. **Asistente IA para clientes** con herramientas en lista blanca. → GP-035
10. **SEO de contenido:** guías de compra, páginas de soporte y software; SEO de categorías y marcas. → GP-037 a GP-039, GP-047, GP-051
11. **Analítica comercial y dashboard de negocio** con drill-down. → GP-040, GP-041
12. **Integración con couriers** y tarifas por zona (ubigeo).
13. **Integración EC OS.** → GP-042
14. **Refactor de componentes gigantes** (editor de producto, story builder, checkout) y hardening de rendimiento, accesibilidad y responsive. → GP-044 a GP-046
15. **Pasarela de pago automática** (tarjetas) sobre la abstracción neutral ya prevista en el esquema (`payment_method_type = GATEWAY`).

---

## Apéndice — Evidencia clave

- Ningún archivo en `src/` asigna `PAID`, `VERIFYING` ni `REJECTED` a un pago; `allocateOrderInventoryAfterPaymentApproval` no tiene llamadas fuera de su propio archivo.
- `outbox_events` recibe inserciones en `checkout/service.ts:954`, `payments/service.ts:839` y `orders/service.ts` (5 lugares); ninguna función Inngest los lee. Funciones Inngest registradas: expiración de reservas y 3 de investigación IA.
- No hay `insert`/`update` sobre `shipments` fuera de su creación en `checkout/service.ts:856`.
- `src/app` no contiene `sitemap.ts`, `robots.ts`, `icon.*` ni `opengraph-image.*`.
- `public/images/home/` contiene solo `README.md`.
- Ninguna búsqueda de `resend|nodemailer|sendgrid|postmark` encuentra código de envío.

# QA Gamer Perú — Fase 1: matriz de flujos

Fecha: 2026-10-22 · Rama: `feat/cloudflare-workers` (`26e4860`) · Alcance: solo gamerperu.com (tienda, cuenta del cliente y admin). El CRM queda fuera.

Esta matriz define **qué** se evalúa en la fase 2 (heurísticas) y la fase 3 (QA funcional): flujos completos, no páginas sueltas.

## Roles

| Rol        | Quién es                         | Qué hace en el sitio                                            |
| ---------- | -------------------------------- | --------------------------------------------------------------- |
| Visitante  | Sin cuenta                       | Explora, compara, agrega al carrito, compra como invitado       |
| Cliente    | `CUSTOMER` con cuenta            | Compra, paga con Yape/Plin, sigue pedidos, gestiona direcciones |
| Operador   | `ADMIN_ORDERS` / `ADMIN_SUPPORT` | Verifica pagos, prepara y despacha pedidos                      |
| Catálogo   | `ADMIN_CATALOG`                  | Productos, fotos, historia, home, menú, categorías              |
| Superadmin | `SUPER_ADMIN`                    | Todo lo anterior, IA y equipo                                   |

## Dispositivos y condiciones

- Anchos: **360** (celular), **768** (tablet), **1440** (escritorio).
- Entrada: mouse, **solo teclado** y lector de pantalla en flujos de riesgo alto.
- Red: normal y 3G lenta en tienda y checkout (Workers Free: el Error 1102 aparece bajo carga).
- Tema del admin: claro y oscuro.

## Flujos

Riesgo: **A** = bloquea la venta o la confianza en el pago · **M** = frena la operación · **B** = informativo.
Cobertura E2E: suites existentes en `tests/e2e`.

### Tienda (visitante y cliente)

| ID  | Flujo                                  | Pantallas                                                 | Éxito                                                                      | Riesgo | Cobertura E2E                                       |
| --- | -------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- | ------ | --------------------------------------------------- |
| T1  | Descubrir desde la home                | `/`, mega-menú                                            | Llega a una categoría o producto en ≤ 2 clics                              | M      | homepage, global-navigation, mega-menu-destinations |
| T2  | Explorar categoría o marca con filtros | `/categorias/[slug]`, `/marcas/[slug]`                    | Filtra, ordena y entiende cuántos resultados hay                           | M      | catalog-discovery, discovery-filters                |
| T3  | Buscar                                 | buscador predictivo, `/buscar`                            | Encuentra por nombre, marca o modelo; vacío explica qué hacer              | M      | search                                              |
| T4  | Evaluar un producto                    | `/productos/[slug]` (galería, variantes, historia, video) | Entiende precio en soles, stock, variante y envío antes de agregar         | A      | product-detail, product-story, product-visual-qa    |
| T5  | Carrito                                | drawer y `/carrito`                                       | Cambia cantidades, ve el total y llega al checkout                         | A      | cart-storefront                                     |
| T6  | Checkout como invitado o cliente       | `/checkout`                                               | Completa dirección y envío; el total no cambia por sorpresa                | A      | checkout-storefront                                 |
| T7  | Pagar con Yape/Plin                    | `/checkout/confirmacion/[n]`                              | Envía código o captura y entiende que queda **en verificación**, no pagado | A      | payment-storefront                                  |
| T8  | Seguir el pedido                       | `/checkout/confirmacion/[n]` (línea de tiempo)            | Ve en qué paso está, fechas y la guía del courier                          | A      | parcial (sin la línea de tiempo nueva)              |
| T9  | Guías, software y soporte              | `/guia-de-compra/*`, `/software/*`, `/soporte/*`          | Resuelve su duda o llega a WhatsApp                                        | B      | mega-menu-destinations (parcial)                    |
| T10 | Legal                                  | `/legal/[slug]`                                           | Lee términos, privacidad y devoluciones                                    | B      | **sin cobertura**                                   |

### Cuenta del cliente

| ID  | Flujo                     | Pantallas                                            | Éxito                                          | Riesgo | Cobertura E2E     |
| --- | ------------------------- | ---------------------------------------------------- | ---------------------------------------------- | ------ | ----------------- |
| C1  | Crear cuenta y verificar  | `/auth/registro`, `/auth/verificar`, `/auth/confirm` | Cuenta creada y correo verificado sin dudas    | A      | **sin cobertura** |
| C2  | Entrar y completar perfil | `/auth/login`, `/auth/completar-perfil`              | Entra y vuelve a donde estaba                  | A      | parcial (login)   |
| C3  | Recuperar contraseña      | `/auth/olvide-password`, `/auth/cambiar-password`    | Recibe el enlace y cambia la contraseña        | M      | **sin cobertura** |
| C4  | Resumen de Mi cuenta      | `/cuenta` (encabezado a todo el ancho)               | Ve sus pedidos y accesos rápidos               | M      | parcial           |
| C5  | Mis pedidos               | `/cuenta/pedidos`                                    | Encuentra un pedido y abre su seguimiento      | A      | parcial           |
| C6  | Direcciones               | `/cuenta/direcciones`                                | Crea, edita, elige predeterminada y elimina    | M      | **sin cobertura** |
| C7  | Datos personales          | `/cuenta/perfil`                                     | Edita nombre, teléfono, documento y contraseña | M      | **sin cobertura** |
| C8  | Favoritos                 | `/cuenta/favoritos`                                  | Guarda y vuelve a un producto                  | B      | **sin cobertura** |

### Admin

| ID  | Flujo                         | Pantallas                                                     | Rol mínimo              | Éxito                                                          | Riesgo | Cobertura E2E                        |
| --- | ----------------------------- | ------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------- | ------ | ------------------------------------ |
| A1  | Entrar y orientarse           | `/admin`, sidebar (secciones, carpetas, contraído)            | cualquier staff         | Sabe qué atender hoy; el sidebar se contrae y recuerda         | M      | admin-foundation (sin sidebar nuevo) |
| A2  | Métricas del período          | `/admin?vista=metricas`                                       | según permisos          | Cambia período y compara                                       | B      | admin-foundation                     |
| A3  | Verificar un pago             | `/admin/pagos` (cola, comprobante, decisión)                  | `orders:verify`         | Toma, revisa la captura, aprueba o rechaza sin ambigüedad      | A      | admin-payment-verification           |
| A4  | Encontrar y revisar un pedido | `/admin/orders` (filtros, pestañas, miniaturas, vista rápida) | `orders:manage`         | Llega al pedido en ≤ 3 acciones y lo entiende sin abrirlo      | A      | admin-orders-list (sin vista rápida) |
| A5  | Preparar y despachar          | `/admin/orders/[n]` (envío, courier, entrega)                 | `orders:manage`         | Cambia el estado del envío y el cliente lo ve en T8            | A      | admin-z-orders-detail                |
| A6  | Crear y publicar un producto  | `/admin/products/new`, `/admin/products/[id]`                 | `catalog:manage`        | Producto con variantes, fotos y ficha técnica publicado        | A      | admin-product-manager                |
| A7  | Fotos de galería              | editor → galería                                              | `catalog:manage`        | Sube fotos de celular sin Error 1102, ordena y elige principal | A      | admin-product-manager (parcial)      |
| A8  | Historia del producto         | `/admin/products/[id]/story`                                  | `catalog:manage`        | Arma bloques, sube video, lo quita, guarda y publica           | M      | admin-story-builder                  |
| A9  | Stock                         | editor → stock por variante                                   | `inventory:manage`      | Ajusta stock y la tienda lo refleja                            | A      | parcial                              |
| A10 | Home de la tienda             | `/admin/home`                                                 | `catalog:manage`        | Cambia textos, imágenes y video y los publica                  | M      | **sin cobertura**                    |
| A11 | Menú de la tienda             | `/admin/menu`                                                 | `catalog:manage`        | Muestra u oculta entradas del menú                             | B      | **sin cobertura**                    |
| A12 | Categorías y marcas           | `/admin/taxonomia`                                            | `catalog:manage`        | Crea y edita sin romper URLs públicas                          | M      | **sin cobertura**                    |
| A13 | Asistente IA                  | `/admin/products/ai-import`                                   | `catalog:ai_research`   | Investiga, revisa y aplica una propuesta                       | B      | admin-ai-product-assistant           |
| A14 | Configuración IA              | `/admin/settings/ai`                                          | `ai:manage_credentials` | Configura proveedor y perfil sin exponer claves                | M      | parcial                              |
| A15 | Equipo y roles                | `/admin/equipo`                                               | `staff:manage`          | Da, cambia y quita accesos con confirmación                    | A      | admin-team, admin-team-guard         |
| A16 | Acceso denegado               | cualquier ruta admin sin rol                                  | sin rol                 | Ve "Acceso no autorizado" y una salida clara                   | A      | admin-foundation                     |

## Huecos detectados

1. **Sin E2E:** registro y verificación (C1), recuperar contraseña (C3), direcciones (C6), perfil (C7), favoritos (C8), legal (T10), home, menú y taxonomía del admin (A10–A12).
2. **E2E desactualizadas** respecto a lo construido estas semanas: línea de tiempo del pedido (T8), sidebar con carpetas y contraído (A1), filtros rápidos, vista rápida y comprobante en pedidos (A4), video en la historia (A8).
3. **Accesibilidad:** 19 de 23 suites ya corren axe; faltan las pantallas sin cobertura de arriba.
4. **Bloqueo de entorno:** todas las E2E necesitan Supabase local, que requiere Docker Desktop operativo en esta PC.

## Siguiente paso (fase 2)

Evaluación heurística (10 heurísticas de Nielsen + criterios de e-commerce peruano: precio en soles, stock, envío, confianza en Yape/Plin) sobre los flujos de riesgo **A** primero: T4–T8, C1–C2, C5, A3–A7, A9, A15, A16. Cada hallazgo con severidad 0–4, captura y recomendación.

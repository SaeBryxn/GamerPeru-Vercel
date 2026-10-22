# Plan — Nuevo editor de producto con autocompletado gratuito

Fecha: 2026-10-22 · Rama: `feat/cloudflare-workers` · Responsables: Claude (integrador) y Codex.

## Por qué

Hoy crear o editar un producto obliga a saltar entre seis pestañas, leer mucho texto, llenar cada dato a mano y abrir otra pantalla para la historia. La meta es que alguien sin experiencia complete un producto en minutos, viendo siempre qué falta, con la mayoría de los datos sugeridos desde la web.

## Diseño acordado

1. **Autocompletar desde la web** (barra arriba): se escribe el modelo o se pega el enlace del fabricante. Se proponen descripción, especificaciones, dimensiones, contenido de caja y fotos. Cada sugerencia se acepta o descarta; nada se publica solo. **Precio y stock nunca vienen de la IA.**
2. **Una sola página con 5 pasos plegables** (se abre el paso en curso):
   1. Lo básico: nombre, marca, categoría, descripción.
   2. Fotos: cuadrícula con arrastrar, foto principal marcada y fotos sugeridas por la web pendientes de aceptar.
   3. Colores, tallas y precios: reemplaza "Variantes". Fichas visuales "Negro · S/ 329 · 12 u." con edición en el lugar; SKU y peso en "Más opciones".
   4. Especificaciones: los campos de la categoría, con las sugeridas por la web precargadas y marcadas.
   5. Página del producto: historia, regalo, accesorios, guía de tallas, contenido de caja y soporte juntos, con vista previa al lado. La historia ya no se abre en otra pantalla.
3. **Panel "Para publicar" fijo a la derecha**: barra de avance, lo obligatorio que falta (clic → lleva al paso y resalta el campo), lo recomendado y el botón de publicar.
4. **Crear producto** = nombre, marca y categoría (o solo el modelo para autocompletar) → abre este mismo editor.
5. **Lenguaje simple**: ayudas de una línea, términos técnicos plegados.

## Autocompletado sin costo

Dos pasos separados, cada uno con cadena de respaldo entre **proveedores distintos** (nunca varias cuentas del mismo proveedor):

| Paso                 | Orden                                                  | Ya existe                                               |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| Buscar páginas       | Tavily (1.000 créditos/mes) → Serper (2.500 consultas) | Tavily en `src/lib/ai/research/search-acquisition.ts`   |
| Ordenar datos con IA | Gemini nivel gratuito → Groq nivel gratuito            | Gemini en `src/lib/ai/gateway/google-gemini-adapter.ts` |

- Se cambia de proveedor ante `AI_PROVIDER_RATE_LIMITED` / cuota agotada, y se lleva la cuenta de uso diario de cada uno para no pasar el límite gratis.
- Se reutiliza la investigación **ENRICH** existente (`createResearchJobAction` con `targetProductId`), que deja una propuesta revisable campo por campo (`reviewProposalFieldAction`, `applyProposalAction`).
- Credenciales solo en el servidor (cifradas como hoy); lo sugerido por IA es borrador hasta que una persona lo acepta.
- Riesgo a revisar: `ADMIN_AI_PROVIDER_KEYS` hoy es `google | openai | anthropic`; agregar `groq` y la búsqueda de respaldo puede requerir una migración aditiva.

## Reparto

Regla: cada archivo tiene un solo dueño. Codex no hace commits ni cambia de rama; Claude revisa, integra y sube. Codex usa el puerto 3001 y Claude el 3002.

### Claude

| Fase | Entrega                                                                                        | Archivos                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| C1   | Estructura de 5 pasos plegables y panel "Para publicar" fijo con clic → paso y campo resaltado | `products/[productId]/product-editor.tsx` y `.module.css`, `src/lib/admin/catalog/readiness-guidance.ts` |
| C2   | Pasos 1, 2 y 4 (lo básico, fotos, especificaciones) con lenguaje simple                        | mismos archivos y `src/components/admin/products/media-tile*`                                            |
| C3   | Autocompletado: barra, cadena de proveedores (Groq, Serper, cuotas) y sugerencias en cada paso | `src/lib/ai/**`, `src/components/admin/products/autofill-*` (nuevo)                                      |
| C4   | Crear producto mínimo que abre el editor                                                       | `products/new/**`                                                                                        |
| C5   | Integrar lo de Codex, QA en pantalla (360/768/1440), commits y push                            | —                                                                                                        |

### Codex

| Fase | Entrega                                                                                                      | Archivos (solo estos)                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| X1   | `VariantBoard`: paso 3 visual (fichas por color/talla con foto, precio, stock; agregar y editar en el lugar) | `src/components/admin/products/variant-board.tsx` y `.module.css` (nuevos)                             |
| X2   | `ProductPageStep`: paso 5 con bloques (historia resumida + bloques de la ficha de tienda) y vista previa     | `src/components/admin/products/product-page-step.tsx` y `.module.css` (nuevos), `product-pdp-fields.*` |

Contrato de integración: los componentes de Codex reciben datos y callbacks por props y usan las acciones existentes (`createVariantAction`, `updateVariantAction`, `reassignProductMediaVariantAction` en `src/lib/admin/catalog/actions.ts`, `setVariantStockAction` en `src/lib/admin/inventory/actions.ts`; la ficha de tienda se guarda con `updateProductAction` en el campo `pdpConfig` y los accesorios se buscan con `searchPdpAccessoriesAction`). Claude los monta en `product-editor.tsx`. Codex no toca `product-editor.tsx`, `src/lib/ai/**` ni la tienda.

## Orden

1. En paralelo: C1 (Claude) y X1 (Codex).
2. Claude integra X1 en el paso 3 y sigue con C2; Codex hace X2.
3. Claude integra X2 en el paso 5, hace C3 y luego C4.
4. QA final, commit por fase y push a `mi-repo feat/cloudflare-workers`.

## Hecho cuando

- Un producto nuevo se completa desde "Crear producto" hasta "Publicar" sin salir de la página.
- "Para publicar" lleva a cada campo faltante.
- Autocompletar llena al menos especificaciones y descripción de un mouse conocido, con respaldo si el primer proveedor falla, sin costo en el uso normal de la tienda.
- Formato, typecheck, lint y pruebas unitarias en verde; revisión en pantalla a 360, 768 y 1440 px.

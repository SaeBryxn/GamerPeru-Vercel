# Ficha de producto configurable

La PDP usa CSS Modules y la información del catálogo actual. La configuración opcional se guarda en `products.pdp_config` (JSONB), con `{}` por defecto. Los productos anteriores conservan sus precios, galería, variantes y ficha técnica; los módulos nuevos permanecen ocultos hasta configurarlos.

## Administración

En `/admin/products/[productId]`, abre **Información → Ficha de tienda**. El formulario de creación también permite preparar los bloques; las imágenes por variante y los accesorios se vinculan después de guardar el producto.

- **Precios y reseñas:** el precio normal y el anterior siguen en Variantes. El promedio y el contador se muestran cuando están habilitados y hay reseñas. No se generan reseñas ficticias.
- **Regalo:** interruptor, etiqueta, título y descripción. El banner requiere un título.
- **Colores y tallas:** cada variante admite un color, una talla opcional y una imagen de su propia galería. La selección cambia foto, precio y SKU. Al guardar se sincronizan los atributos de la variante que usan el carrito y los pedidos, conservando los demás atributos.
- **Accesorios:** buscador por nombre o SKU; se pueden vincular hasta 12 variantes activas de productos publicados. La tienda obtiene el nombre, imagen y precio del catálogo. Para crear un accesorio nuevo se utiliza el formulario normal de producto y luego se vincula aquí.
- **Tallas y dimensiones:** filas con nombre, peso y medidas en milímetros. El rango de mano incluye el mínimo y excluye el máximo; un extremo vacío representa un rango abierto. Una fila sin rango sirve para comparar, sin recomendarla. El deslizador va de 15 a 22 cm y la tabla convierte las medidas a pulgadas.
- **Especificaciones:** interruptores independientes para la grilla y el acordeón; se conserva el editor de ficha técnica y se pueden agregar atributos con notas debajo del valor.
- **Caja:** una o dos ediciones, con etiqueta neutra, dorada o azul; cada ítem tiene nombre, nota opcional y cantidad.
- **Soporte:** garantía, manual, driver/web-hub y nota de envío. Los enlaces vacíos se ocultan y solo se aceptan URLs HTTP(S) sin credenciales.

## Carrito y validación

El producto principal y los accesorios seleccionados se agregan dentro de la misma transacción. Cada accesorio agrega una unidad y el principal respeta el selector de cantidad. Si un accesorio deja de estar activo/publicado, se revierte toda la compra conjunta. Los precios se hidratan desde el catálogo; esta selección no confirma un pago ni modifica la verificación manual de Yape/Plin.

Las acciones requieren `catalog:manage`, mantienen el control de concurrencia y la auditoría existentes, validan la pertenencia de variantes/miniaturas y solo invalidan con `revalidateStorefrontCatalog()`. La lectura pública descarta de forma segura las secciones malformadas.

## Migración y despliegue

La migración Drizzle `0023_product_pdp_config.sql`, acompañada de su snapshot y journal, agrega una sola columna con valor por defecto. Debe aplicarse **antes** de desplegar el código que la lee. No requiere rellenar productos existentes ni borrar datos. Las pruebas usan Supabase local; `.env.local` no se modifica ni se incluye en Git.

## Verificación

- `pnpm format:check`
- `pnpm exec tsc --noEmit -p .`
- `pnpm lint`
- `pnpm exec vitest run tests/unit`
- `pnpm build`
- `pnpm exec playwright test --config=playwright.admin.config.ts product-pdp-admin.spec.ts`

La suite específica verifica guardado y recarga, foto/precio/SKU de variantes, calculador de mano, contenido comparativo, compatibilidad anterior, bloques desactivados y reversión transaccional de accesorios. Genera capturas de PDP/admin y comprueba ausencia de desbordamiento a 360, 768 y 1440 px.

Para usar un servidor local en otro puerto, configura `PLAYWRIGHT_TEST_BASE_URL` (por ejemplo, `http://localhost:3001`). La configuración del admin adapta el puerto, la URL pública y la conexión local de Hyperdrive; las URLs de base de datos y Supabase siguen validadas para impedir destinos remotos.

### Resultado de la ejecución local (22 de octubre de 2026)

La suite específica de la PDP aprobó sus 7 escenarios. En una ejecución focalizada de regresión también pasaron la creación con SKU/importes exactos y el guardado de especificaciones del administrador: **9 E2E aprobadas**. Las capturas y verificaciones de desbordamiento cubrieron 360, 768 y 1440 px.

La suite general `pnpm test:admin:e2e` se ejecutó completa y terminó con **67 aprobadas, 18 fallidas y 16 sin ejecutar**; no debe darse por verde. Entre los fallos aparecen selectores de encabezados antiguos del dashboard, índices de columnas de Pedidos y controles/identificadores antiguos del editor de medios e Historia.

Se contrastaron cuatro escenarios contra la base `33462fe`, sin los cambios de PDP: creación y especificaciones aprobaron; se reprodujeron el fallo del encabezado `Resumen Financiero` y el de intentar editar Información después de una recarga que vuelve a Resumen. Estos dos fallos son previos a esta implementación. El resto de la suite general requiere una revisión independiente de sus selectores y del orden de ejecución; no se alteró ese alcance para ocultar fallos.

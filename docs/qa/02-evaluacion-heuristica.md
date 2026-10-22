# QA Gamer Perú — Fase 2: evaluación heurística (flujos de riesgo alto)

Fecha: 2026-10-22 · Rama: `feat/cloudflare-workers` (`26e4860`) · Entorno: Next dev contra Supabase local con los datos de prueba (`tests/e2e/helpers/admin-fixtures.ts`). No se hizo ninguna petición a gamerperu.com.

Base: las 10 heurísticas de Nielsen más criterios de e-commerce peruano (precio en soles, stock, envío y confianza en Yape/Plin). Anchos revisados: 360 y 1440 px. Flujos de la [matriz](01-matriz-de-flujos.md): T4–T8, C1, C2, C5, A3–A7, A9, A15 y A16.

**Severidad:** 4 = bloquea una venta o un pago · 3 = problema grave, arreglar antes de lanzar · 2 = problema menor que frena o confunde · 1 = cosmético · 0 = no es problema (observación positiva).

Los datos de prueba no tienen fotos y usan nombres como "Yape E2E" o "Persona E2E Privada"; esos textos no se cuentan como hallazgos.

## Resumen

| Severidad | Cantidad | Hallazgos                          |
| --------- | -------- | ---------------------------------- |
| 4         | 1        | H-11                               |
| 3         | 6        | H-01, H-02, H-05, H-09, H-12, H-15 |
| 2         | 6        | H-03, H-04, H-06, H-13, H-14, H-16 |
| 1         | 2        | H-08, H-10                         |

## Hallazgos

### Tienda

| ID   | Flujo | Heurística                                     | Sev. | Hallazgo                                                                                                                                                                                       | Recomendación                                                                                                      |
| ---- | ----- | ---------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| H-01 | T4    | Visibilidad del estado · Prevención de errores | 3    | La ficha no dice si hay stock ni cuántas unidades quedan. El selector de cantidad llega al máximo del carrito sin mirar el stock, así que el error aparece recién al agregar o en el checkout. | Mostrar "En stock", "Últimas N unidades" o "Agotado" por variante y limitar la cantidad al stock disponible.       |
| H-02 | T4    | Visibilidad · Reconocer antes que recordar     | 3    | El costo y el plazo de envío solo aparecen en el checkout; en la ficha y en el carrito no hay ninguna referencia.                                                                              | Una línea bajo el precio: "Envío a Lima desde S/ X · 1 a 3 días hábiles", tomada de los métodos de envío activos.  |
| H-03 | T4    | Reconocimiento · Consistencia                  | 2    | La etiqueta del selector dice "Variante:" en vez del atributo real (color, switch, tamaño) y la opción elegida solo se distingue por un borde un poco más grueso.                              | Usar el nombre del atributo y marcar la opción elegida con fondo o check, además del borde.                        |
| H-04 | T5    | Flexibilidad · Accesibilidad                   | 2    | En el carrito lateral la cantidad se cambia con flechas de unos 16 px, difíciles de tocar en el celular.                                                                                       | Reutilizar el selector − / + de la ficha (área táctil de 44 px).                                                   |
| H-05 | T6    | Prevención de errores                          | 3    | Departamento, provincia y distrito son campos de texto libre (departamento y provincia vienen con "Lima" escrito). Permite direcciones con errores de tipeo o combinaciones imposibles.        | Selectores dependientes con el ubigeo (departamento → provincia → distrito) y la lista de distritos con cobertura. |
| H-06 | T6    | Coincidencia con el mundo real                 | 2    | Todos los métodos de pago muestran la misma descripción ("billetera digital o transferencia bancaria"); no ayuda a elegir entre Yape y Plin.                                                   | Descripción propia por método: "Paga con Yape al número… y envía el código de operación".                          |
| H-08 | T6    | Estética y diseño minimalista                  | 1    | El campo de código de descuento ocupa el primer lugar del resumen aunque no haya promociones activas; invita a salir a buscar cupones.                                                         | Mostrarlo plegado ("¿Tienes un código?") o solo cuando exista una promoción vigente.                               |

Observaciones positivas (sev. 0): el checkout numera los pasos, informa el plazo de cada envío y avisa con claridad que el pedido queda **Pendiente de pago**; el carrito aclara "Impuestos incluidos. El envío se calcula al finalizar la compra".

**No evaluado: T7 y T8** (pago y seguimiento del pedido). El cliente de prueba no tiene pedidos propios, así que no se pudo abrir la línea de tiempo. Hace falta un pedido de prueba asociado a `customer.e2e@gamerperu.pe` (ver fase 3).

### Cuenta

| ID   | Flujo | Heurística                                  | Sev. | Hallazgo                                                                                                                                                                      | Recomendación                                                                                                       |
| ---- | ----- | ------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| H-09 | C1    | Reconocimiento · Prevención · Accesibilidad | 3    | El registro usa solo placeholders: al escribir desaparece el nombre del campo. No hay botón para ver la contraseña ni enlace a términos y privacidad antes de "Crear cuenta". | Etiquetas visibles, botón "Mostrar" en contraseña, requisitos que se marcan al cumplirse y texto legal con enlaces. |
| H-10 | C5    | Estética y diseño minimalista               | 1    | Sin pedidos, el encabezado de Mi cuenta muestra los contadores "Pedidos 0" y "En camino 0" en grande.                                                                         | Ocultar los contadores en cero o reemplazarlos por un acceso a la tienda.                                           |

Observación positiva: el estado vacío de Mis pedidos explica qué verá el cliente y ofrece "Explorar la tienda".

### Admin

| ID   | Flujo | Heurística                                  | Sev. | Hallazgo                                                                                                                                                                                                                                                                                                                                               | Recomendación                                                                                                                                              |
| ---- | ----- | ------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-11 | A3    | Control y libertad · Visibilidad del estado | 4    | En la cola de Pagos hay comprobantes "Revisando: otro operador" tomados hace 25 días. El botón queda deshabilitado y la acción para liberarlos solo existe dentro del panel de revisión, que no se puede abrir. El backend ya permite que alguien con `staff:manage` libere el caso, pero la interfaz no lo ofrece: esos pagos no se pueden verificar. | En la fila, para quien tenga `staff:manage`, botón "Liberar" con confirmación; mostrar desde cuándo está tomado y destacar los tomados hace más de un día. |
| H-12 | A4    | Estética · Eficiencia de uso                | 3    | A 1440 px la tabla de Pedidos desborda: las columnas Creado y Actividad quedan cortadas y la columna Cliente parte nombre y correo letra por letra. Cada fila mide unos 70 px y 25 pedidos ocupan unos 3800 px de alto.                                                                                                                                | Dar ancho mínimo a Cliente y truncar el correo con `…`, unir Creado y Actividad en una columna y bajar la altura de las filas.                             |
| H-13 | A4    | Consistencia · Prevención de errores        | 2    | Cuando la foto de un producto no carga, la miniatura muestra el texto alternativo cortado ("Produ") en vez de un ícono.                                                                                                                                                                                                                                | Si la imagen falla (`onError`), mostrar el mismo ícono de caja que se usa cuando no hay foto.                                                              |
| H-14 | A4    | Consistencia · Reconocimiento               | 2    | La vista rápida muestra productos por S/ 987.00 y un total de S/ 1,002.00 sin desglosar el envío, y no permite ver el comprobante aunque exista.                                                                                                                                                                                                       | Desglose subtotal / envío / descuento / total y botón "Comprobante" en la sección de pago.                                                                 |
| H-15 | A6    | Visibilidad del estado · Consistencia       | 3    | Un producto con la etiqueta **Publicado** muestra a la vez "Falta 2 cosas para que entre a la tienda" (sin foto ni ficha técnica). El operador no sabe si el producto está a la venta o no. Además, "Falta 2 cosas" debería decir "Faltan".                                                                                                            | Si ya está publicado, cambiar el aviso a "Publicado con datos incompletos" y explicar qué ve el cliente; corregir la concordancia.                         |
| H-16 | A1    | Eficiencia de uso                           | 2    | La vista operativa de Inicio muestra los SKU agotados dos veces: en "Requiere tu atención" y en "Resumen de Inventario".                                                                                                                                                                                                                               | Dejar el dato en un solo lugar (Atención) y enlazarlo desde el otro bloque.                                                                                |

Observaciones positivas: "Acceso no autorizado" (A16) explica por qué y da dos salidas claras; el resumen del editor de productos separa lo obligatorio de lo recomendado y enlaza a cada sección; la cola de Pagos muestra intento, antigüedad y si hay captura.

## Capturas

En [capturas/](capturas/), con el prefijo `fase2-`: ficha de producto (360 y 1440), carrito lateral, checkout, registro (360), Pagos, Pedidos, vista rápida, editor de producto y acceso sin rol.

## Prioridad de corrección

1. **H-11** (pagos bloqueados): botón "Liberar" en la fila para supervisores.
2. **H-12, H-15**: tabla de pedidos legible a 1440 px y estado coherente del producto publicado.
3. **H-01, H-02, H-05, H-09**: stock y envío en la ficha, ubigeo en el checkout y registro con etiquetas visibles.
4. El resto (severidad 2 y 1).

## Pendiente para la fase 3

- Crear un pedido de prueba del cliente para evaluar T7 (pago) y T8 (línea de tiempo).
- Repetir la revisión a 768 px y solo con teclado en checkout y pago.
- Convertir cada hallazgo corregido en una prueba E2E de regresión.

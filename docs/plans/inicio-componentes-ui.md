# Componentes de Rare UI y React Bits en Inicio

Implementación local del 23 de octubre de 2026. Alcance: `/admin` y su vista de métricas.

## Selección aplicada

- **[Animated Counter, Rare UI](https://rareui.com/components/animatedcounter):**
  conteos del resumen operativo y pedidos pagados del período. La primera carga ya
  muestra el valor real; las ruedas cambian al recibir otro conteo. Duración de 200 ms,
  sin rebote y posición inmediata con movimiento reducido. El texto accesible se
  actualiza directamente. No se convierten importes monetarios a números de JavaScript.
- **[Spotlight Card, React Bits](https://reactbits.dev/components/spotlight-card):**
  accesos rápidos, conservando enlaces de Next.js y permisos existentes. Luz local
  tenue bajo el contenido con ratón; sin seguimiento en táctil o movimiento reducido.
  El foco de teclado tiene un indicador estático. No hay animación ambiental ni bucle.
- **Jerarquía:** cifras con el acento de su estado, iconos sobre superficies claras
  y énfasis en el valor neto del resumen financiero, usando tokens de ambos temas.

Se adaptó el código fuente a CSS Modules y a `framer-motion`, que ya estaba instalado.
No se incorporaron Tailwind, shadcn, servicios de pago ni dependencias nuevas.
Las licencias se conservan en `docs/licenses/`; el README incluye los créditos.

## Comparación y límites

Se descartaron fondos animados, partículas, inclinación de tarjetas y animaciones
continuas porque dificultan leer cifras y consumen recursos durante el trabajo.
Los bloques no crecen para alojar los efectos: se conserva la altura de pantalla
en escritorio y el desplazamiento interno de productos. Móvil conserva lectura vertical.

La búsqueda de plugins por «Cowork» no devolvió una conexión utilizable; esta
revisión no se atribuye a Cowork ni a Claude. No se tomaron capturas.

## Comprobación

- TypeScript y ESLint de los archivos afectados.
- 48 pruebas dirigidas: componentes de las bibliotecas, estados, permisos, enlaces,
  importes exactos y contratos de CSS del dashboard.
- Medición offline con datos ficticios en Edge: 1280×720, 1366×768, 1440×900 y
  1920×1080 sin scroll de página; productos con scroll interno operable por teclado.
  360×800 y 768×900 sin desborde horizontal. No equivale a una revisión visual de la app.
- Pendiente: el dueño revisa ambas vistas con sus datos en `http://localhost:3001/admin`.

Los cambios quedan en local; no se hace push para esta revisión.

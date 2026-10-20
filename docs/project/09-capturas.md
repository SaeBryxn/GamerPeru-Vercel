# 09 · Capturas locales

Ejecución única de `pnpm docs:screenshots` el 20/10/2026: **32 PNG de 36 previstos** (16 por tamaño). Escritorio **1440×900**, móvil **390×844**, viewport completo sin captura larga. [Manifest de resultados](assets/screenshots/manifest.json).

Se usaron `tests/e2e/helpers/admin-fixtures.ts` y `scripts/test/seed-admin-e2e.mjs` contra Supabase local. El script publica temporalmente el producto determinista y restaura su estado al terminar. La semilla recrea usuarios y fixtures locales: usar una instancia desechable. No se consultó producción.

El navegador bloquea destinos externos. Imágenes `/media/` y `/_next/image` usan el PNG sintético aprobado `tests/fixtures/gp014-media/hero.png`; no representan fotografías comerciales. Embeds externos quedan bloqueados, por lo que la home puede mostrar el área de video sin reproducción. La captura de subida muestra el inicio real de la tarea, con progreso 0 % y Cancelar; el PUT local se pausa si llega a iniciarse y se cancela después. No acredita transferencia completa ni CPU real. Los datos de clientes/pedidos son sintéticos.

## Reproducir

1. Iniciar Supabase local y aplicar migraciones. Revisar que PostgreSQL sea `127.0.0.1:54322/postgres` y Auth `http://127.0.0.1:54321`.
2. Exportar DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY y SUPABASE_SERVICE_ROLE_KEY con valores **locales**, sin cargar credenciales alojadas.
3. Ejecutar el fixture de almacenamiento en otra terminal: `node scripts/test/media-s3-fixture.ts`. Configurar `S3_ENDPOINT=http://127.0.0.1:9000`. El script usa credenciales R2 ficticias.
4. Dejar libre 3001 y ejecutar `pnpm docs:screenshots`. Levanta su propio Next dev oculto, no detiene 3000 y al finalizar solo termina su proceso hijo. Si 3001 está ocupado, falla sin cerrarlo.
5. Revisar manifest y PNG. Fallos individuales quedan PENDIENTE; solo se exige al menos una captura válida para terminar con código 0. No equivale a una suite E2E completa.

El log de servidor queda en el directorio temporal del sistema (`gamerperu-gp061-dev-server.log`), fuera del repositorio. Las guardas rechazan DB/Auth/S3 alojados. El script final corrige la ruta de PLP para próximas ejecuciones; por instrucción del dueño no se repitió esta ejecución ni se regeneró evidencia después de los ajustes de tipos/limpieza del script.

## Pendientes

| Vista                 | Tamaños            | Motivo y seguimiento                                                                                                                                                                                      |
| --------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLP                   | Escritorio y móvil | El intento usó `/productos`, que no existe como listado. El script final apunta a `/categorias/test-cat-e2e-a`; capturar en una próxima ejecución autorizada. No se atribuye este fallo a la app.         |
| Pago manual Yape/Plin | Escritorio y móvil | El pedido semilla `GP-AD000002` no expuso `manual-payment-card` al cliente fixture. Revisar ownership/estado/datos semilla en una próxima sesión; no crear pedidos ni alterar la app para obtener el PNG. |

## Galería

Cada par muestra el mismo recorrido con el viewport indicado. La disponibilidad de PNG no demuestra todos los estados de carga, error, éxito ni accesibilidad de la pantalla.

### Home: navegación y portada local con embeds externos bloqueados

![Home: navegación y portada local con embeds externos bloqueados. Escritorio, 1440×900.](assets/screenshots/desktop/home.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Home: navegación y portada local con embeds externos bloqueados. Móvil, 390×844.](assets/screenshots/mobile/home.png)

Móvil, 390×844. Datos locales sintéticos.

### PDP: producto semilla publicado temporalmente

![PDP: producto semilla publicado temporalmente. Escritorio, 1440×900.](assets/screenshots/desktop/pdp.png)

Escritorio, 1440×900. Datos locales sintéticos.

![PDP: producto semilla publicado temporalmente. Móvil, 390×844.](assets/screenshots/mobile/pdp.png)

Móvil, 390×844. Datos locales sintéticos.

### Búsqueda: consulta E2E sobre datos locales

![Búsqueda: consulta E2E sobre datos locales. Escritorio, 1440×900.](assets/screenshots/desktop/busqueda.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Búsqueda: consulta E2E sobre datos locales. Móvil, 390×844.](assets/screenshots/mobile/busqueda.png)

Móvil, 390×844. Datos locales sintéticos.

### Inicio de sesión: formulario público

![Inicio de sesión: formulario público. Escritorio, 1440×900.](assets/screenshots/desktop/login.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Inicio de sesión: formulario público. Móvil, 390×844.](assets/screenshots/mobile/login.png)

Móvil, 390×844. Datos locales sintéticos.

### Carrito: drawer después de añadir la variante semilla

![Carrito: drawer después de añadir la variante semilla. Escritorio, 1440×900.](assets/screenshots/desktop/carrito.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Carrito: drawer después de añadir la variante semilla. Móvil, 390×844.](assets/screenshots/mobile/carrito.png)

Móvil, 390×844. Datos locales sintéticos.

### Checkout: formulario previo a crear un pedido

![Checkout: formulario previo a crear un pedido. Escritorio, 1440×900.](assets/screenshots/desktop/checkout.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Checkout: formulario previo a crear un pedido. Móvil, 390×844.](assets/screenshots/mobile/checkout.png)

Móvil, 390×844. Datos locales sintéticos.

### Cuenta: identidad CUSTOMER de prueba

![Cuenta: identidad CUSTOMER de prueba. Escritorio, 1440×900.](assets/screenshots/desktop/cuenta.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Cuenta: identidad CUSTOMER de prueba. Móvil, 390×844.](assets/screenshots/mobile/cuenta.png)

Móvil, 390×844. Datos locales sintéticos.

### Admin: dashboard con identidad SUPER_ADMIN local

![Admin: dashboard con identidad SUPER_ADMIN local. Escritorio, 1440×900.](assets/screenshots/desktop/admin-dashboard.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Admin: dashboard con identidad SUPER_ADMIN local. Móvil, 390×844.](assets/screenshots/mobile/admin-dashboard.png)

Móvil, 390×844. Datos locales sintéticos.

### Admin: listado de productos de la semilla

![Admin: listado de productos de la semilla. Escritorio, 1440×900.](assets/screenshots/desktop/admin-productos.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Admin: listado de productos de la semilla. Móvil, 390×844.](assets/screenshots/mobile/admin-productos.png)

Móvil, 390×844. Datos locales sintéticos.

### Admin: editor de producto y estado actual

![Admin: editor de producto y estado actual. Escritorio, 1440×900.](assets/screenshots/desktop/admin-editor.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Admin: editor de producto y estado actual. Móvil, 390×844.](assets/screenshots/mobile/admin-editor.png)

Móvil, 390×844. Datos locales sintéticos.

### Admin: constructor de Product Story

![Admin: constructor de Product Story. Escritorio, 1440×900.](assets/screenshots/desktop/admin-historia.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Admin: constructor de Product Story. Móvil, 390×844.](assets/screenshots/mobile/admin-historia.png)

Móvil, 390×844. Datos locales sintéticos.

### Admin: secciones administrables de la home

![Admin: secciones administrables de la home. Escritorio, 1440×900.](assets/screenshots/desktop/admin-home.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Admin: secciones administrables de la home. Móvil, 390×844.](assets/screenshots/mobile/admin-home.png)

Móvil, 390×844. Datos locales sintéticos.

### Admin: listado de pedidos sintéticos

![Admin: listado de pedidos sintéticos. Escritorio, 1440×900.](assets/screenshots/desktop/admin-pedidos.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Admin: listado de pedidos sintéticos. Móvil, 390×844.](assets/screenshots/mobile/admin-pedidos.png)

Móvil, 390×844. Datos locales sintéticos.

### Admin: revisión de pagos sintéticos, sin aprobar ninguno

![Admin: revisión de pagos sintéticos, sin aprobar ninguno. Escritorio, 1440×900.](assets/screenshots/desktop/admin-pagos.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Admin: revisión de pagos sintéticos, sin aprobar ninguno. Móvil, 390×844.](assets/screenshots/mobile/admin-pagos.png)

Móvil, 390×844. Datos locales sintéticos.

### Admin: equipo y roles locales

![Admin: equipo y roles locales. Escritorio, 1440×900.](assets/screenshots/desktop/admin-equipo.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Admin: equipo y roles locales. Móvil, 390×844.](assets/screenshots/mobile/admin-equipo.png)

Móvil, 390×844. Datos locales sintéticos.

### Admin: subida iniciada a 0 % y botón Cancelar visible

![Admin: subida iniciada a 0 % y botón Cancelar visible. Escritorio, 1440×900.](assets/screenshots/desktop/admin-subida.png)

Escritorio, 1440×900. Datos locales sintéticos.

![Admin: subida iniciada a 0 % y botón Cancelar visible. Móvil, 390×844.](assets/screenshots/mobile/admin-subida.png)

Móvil, 390×844. Datos locales sintéticos.

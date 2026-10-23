# Revisión del manual y del plan

Fecha: 23 de octubre de 2026. Base: `4f9a814`.

## Método aplicado

Se redactó el contenido a partir del código actual y se revisó mediante contraejemplos. El registro conserva afirmaciones corregidas, evidencia y límites de verificación. No representa sesiones de usuarios ni una auditoría de producción.

## Pasada 1: exactitud funcional

| Afirmación a cuestionar                        | Evidencia                                           | Corrección incorporada                                                                                   |
| ---------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Administrador puede hacer cualquier tarea      | `src/lib/admin/staff/levels.ts`                     | Distinguir Administrador y Superadministrador; inventario y credenciales requieren permisos adicionales. |
| Dar acceso invita y crea la cuenta             | `equipo/team-workspace.tsx`: exige cuenta existente | Instruir registro previo; no prometer correo de invitación.                                              |
| Existe un perfil administrativo en la cabecera | `admin-header.tsx`; sí existe `/cuenta/perfil`      | Separar perfil de cliente y propuesta de menú administrativo.                                            |
| Guardar contenido de home es privado           | `home/section-form.tsx`: Guardar y publicar         | Advertir el efecto público antes de utilizar la acción.                                                  |
| Ocultar un menú protege su URL                 | `menu/menu-workspace.tsx`: cambia visibilidad       | Diferenciar navegación, existencia de destino y autorización.                                            |

## Pasada 2: errores y consecuencias

| Contraejemplo                                | Evidencia                                            | Regla del manual                                                 |
| -------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Proveedor activo y trabajo que no se ejecuta | `autofill-bar.tsx`, diagnóstico de envío             | Comprobar perfil, envío y ejecución por separado.                |
| Datos de IA incompletos                      | `research/schemas.ts`, `proposals/apply-service.ts`  | Compatibilidad de un campo no garantiza evidencia para llenarlo. |
| Bloque público habilitado sin contenido      | `product-page-step.tsx`                              | Puede seguir oculto; completar y guardar.                        |
| Comprobante recibido sin dinero confirmado   | Revisión de pagos y servicios de inventario          | Verificar recepción y no duplicar descuentos de stock.           |
| Conteo físico igual al actual                | `inventario/stock-count.tsx`, servicio de inventario | Informar ausencia de diferencia y de movimiento nuevo.           |
| Stock cambiado por otra persona              | Referencia esperada y formulario de conteo           | Conservar borrador y revisar valores antes de guardar.           |
| Correo solicitado que todavía no llega       | Flujo de recuperación y outbox existente             | No afirmar entrega real sin evidencia.                           |
| Historial y resumen parciales                | `inventory/page-reader.ts` y página de inventario    | Declarar 50 movimientos y alcance de la página.                  |

## Pasada 3: herramientas y alcance

- La investigación verificó repositorios oficiales en la fecha indicada; no se instalaron.
- Playwright, axe, Inngest y Sentry ya están declarados en `package.json`.
- Gitleaks anuncia mantenimiento de seguridad; Betterleaks incluye capacidades externas que no se activan por esta recomendación.
- La licencia del SDK no implica alojamiento ilimitado gratuito. Se distinguen SDK, servidor y plataforma.
- El rediseño se divide por piezas y comienza por la cabecera. El plan no se presenta como código ya implementado.
- Se mantienen CSS Modules, tokens del admin y restricciones del Worker; la tienda pública conserva el diseño aprobado.

## Pasada 4: comprobación documental y visual

El PDF se genera del Markdown con `scripts/docs/generate-user-manual.py`. Antes de entregar se comprueban texto extraíble, capítulos, enlaces internos de navegación del PDF, numeración y render de todas las páginas. Se inspeccionan las tablas y páginas de procedimientos a tamaño legible.

Resultado final: 20 páginas renderizadas e inspeccionadas, 18 capítulos y 18 marcadores navegables. Se comprobó la presencia de todos los capítulos, texto extraíble sin caracteres de sustitución y cero palabras fuera de los márgenes verificados. Se corrigieron una entrada del índice que se incluía a sí misma y una última página que contenía solo una frase.

La edición, fecha y base del pie se toman del Markdown para evitar dos versiones distintas entre fuente y PDF. El generador se ejecutó con el runtime de documentos, sin cambiar las dependencias de pnpm. La revisión visual se hizo mediante hojas de contacto de todas las páginas y ampliación de procedimientos y tablas. No equivale a una prueba funcional del sitio.

## Pendientes que el manual no da por resueltos

- Comprobar funcionamiento real de cola, correo y configuración alojados.
- Validación del dueño sobre la interfaz desplegada y sus permisos reales.
- Rotación de la contraseña de base de datos de producción previamente expuesta, a cargo del dueño. Este trabajo no lee ni reproduce ese secreto.
- Medición de tareas y usabilidad antes del rediseño global.

## Actualización 1.1: cabecera y cuenta

Base implementada: `1505dcd`, 23 de octubre de 2026. Se actualizaron acceso, navegación y recorrido del cliente para explicar Mi cuenta y el enlace al perfil existente. Se retiró la afirmación de que el menú seguía siendo una propuesta.

Contraejemplo detectado: proteger enlaces no protege el formulario de cierre de sesión. La cabecera solicita ahora autorización al editor mediante un evento cancelable; cancelar conserva el borrador y evita ejecutar el cierre de sesión. Los errores de la acción existente permanecen visibles.

Evidencia de código: TypeScript y lint correctos, 4 archivos y 20 pruebas unitarias correctas, incluidos navegación por teclado, tema, salida cancelada y conservación del borrador. Revisión visual estática offline a 360, 768 y 1440 px, claro y oscuro, sin desbordamiento. Se usaron componentes reales con datos ficticios; no equivale a probar navegación o autenticación en Cloudflare.

El PDF de la edición 1.1 se regeneró desde el Markdown: 20 páginas renderizadas e inspeccionadas, 18 capítulos y 18 marcadores, sin caracteres de sustitución ni palabras fuera de los márgenes comprobados. Se compactaron referencias duplicadas para evitar una página final con una sola entrada. La prueba funcional alojada y la conveniencia del nuevo acceso a la tienda quedan pendientes del dueño.

# Repositorios para mejorar el flujo de Gamer Perú

Revisión: 23 de octubre de 2026. Base del proyecto: `4f9a814`, rama `feat/cloudflare-workers`.

## Decisión

Aprovechar primero lo instalado y añadir herramientas pequeñas cuando resuelvan una carencia concreta. Estas recomendaciones no instalan dependencias, no activan servicios ni cambian el comportamiento de la tienda.

La selección cubre continuidad del trabajo, seguridad, diseño, accesibilidad, comprobaciones visuales, colas y diagnóstico. Un repositorio no garantiza buen diseño ni sustituye la revisión humana.

## Selección priorizada

| Orden | Repositorio oficial                                                           | Situación en Gamer Perú                           | Uso recomendado                                                                             |
| ----- | ----------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1     | [affaan-m/ECC](https://github.com/affaan-m/ECC)                               | Candidato; ya existen skills y documentos propios | Selección de reglas, revisión y continuidad entre sesiones.                                 |
| 2     | [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks)                     | No figura como dependencia de pnpm                | Detector local de secretos antes de compartir cambios.                                      |
| 3     | [microsoft/playwright](https://github.com/microsoft/playwright)               | Instalado: `@playwright/test`                     | Comprobar interfaces y recorridos concretos cuando el dueño habilite el entorno de pruebas. |
| 4     | [dequelabs/axe-core](https://github.com/dequelabs/axe-core)                   | Instalado mediante `@axe-core/playwright`         | Detectar problemas automáticos de accesibilidad.                                            |
| 5     | [inngest/inngest-js](https://github.com/inngest/inngest-js)                   | Instalado: `inngest`                              | Entender y diagnosticar los trabajos de investigación y comunicaciones ya existentes.       |
| 6     | [getsentry/sentry-javascript](https://github.com/getsentry/sentry-javascript) | Instalado: `@sentry/nextjs`                       | Aprovechar el diagnóstico existente, con datos personales y secretos filtrados.             |
| 7     | [storybookjs/storybook](https://github.com/storybookjs/storybook)             | Incorporación opcional                            | Catálogo aislado de componentes del admin con datos ficticios.                              |
| 8     | [GoogleChrome/lighthouse-ci](https://github.com/GoogleChrome/lighthouse-ci)   | Incorporación opcional                            | Comparar rendimiento de páginas representativas en un entorno autorizado.                   |

## 1. ECC: continuidad y revisión

ECC ofrece reglas, skills, agentes y automatizaciones; el proyecto declara licencia MIT. Algunas funciones opcionales tienen limitaciones en Windows. Adoptar solo instrucciones útiles y revisión de cambios; evaluar aparte la memoria automática.

**Aplicación propuesta:** una ficha de continuidad con objetivo, archivos autorizados, decisiones de diseño, validación y próximo paso. Las decisiones permanentes viven en documentos versionados. No copiar instrucciones genéricas que impongan Tailwind, suites completas o cambios de rama. No reinstalar skills equivalentes ni duplicar hooks. No crear AGENTS.md como efecto lateral.

**Coste:** el repositorio abierto es gratuito; el modelo y los servicios alojados pueden consumir cuotas o dinero. Más agentes no garantizan menos tokens.

**Éxito:** una nueva sesión retoma una tarea sin alterar el alcance ni repetir exploraciones ya documentadas. [Fuente](https://github.com/affaan-m/ECC).

## 2. Gitleaks: prevención de exposición de secretos

La CLI usa licencia MIT. Su README indica que está completa en funciones y que las futuras publicaciones se centrarán en parches de seguridad. El autor está desarrollando [Betterleaks](https://github.com/betterleaks/betterleaks).

**Aplicación propuesta:** analizar cambios locales de código con resultados censurados. No abrir `.env.local`, imprimir valores ni publicar informes con credenciales. La integración de CI se evaluará por separado: el coste y condiciones de una acción alojada no se deducen de la licencia de la CLI.

**Decisión:** Gitleaks es una opción conservadora para escaneo estático. Betterleaks queda como alternativa a evaluar, no como instalación automática: documenta validación HTTP de secretos y revocación opcional, capacidades que no corresponden al alcance actual.

**Éxito:** detectar una credencial ficticia de prueba sin revelar su valor. Rotar una credencial expuesta sigue siendo responsabilidad del dueño; un escáner no la vuelve segura. [Gitleaks](https://github.com/gitleaks/gitleaks), [Betterleaks](https://github.com/betterleaks/betterleaks).

## 3. Playwright: revisión visible y reproducible

Automatiza Chromium, Firefox y WebKit. Licencia Apache-2.0. Ya está instalado; no hace falta otra herramienta equivalente.

**Aplicación propuesta:** capturas a 360, 768 y 1440 px, foco de teclado y una interacción por componente. Para recorridos con datos se necesita un entorno autorizado y datos de prueba. Mientras siga vigente la restricción, no levantar servidor ni ejecutar E2E; las vistas estáticas no acreditan operaciones reales.

**Éxito:** conservar una referencia aprobada y detectar cambios de diseño no pedidos. Una captura distinta necesita revisión: la diferencia no es automáticamente un error. [Fuente](https://github.com/microsoft/playwright).

## 4. axe-core: accesibilidad automática

Motor de comprobación automática con licencia MPL-2.0. La integración para Playwright ya está en el proyecto.

**Aplicación propuesta:** revisar etiquetas, relaciones accesibles y problemas detectables de contraste en componentes representativos. Complementar con teclado y lectura de mensajes. No prometer conformidad WCAG completa por obtener cero incidencias automáticas.

**Éxito:** no introducir incidencias automáticas graves en la pantalla modificada y completar su recorrido con teclado. [Fuente](https://github.com/dequelabs/axe-core).

## 5. Inngest: hacer trazable la cola existente

El SDK JavaScript ya utilizado permite trabajos por eventos, pasos y reintentos. No se propone añadir una segunda cola. Los SDK y el servidor tienen condiciones distintas: el proyecto documenta Apache-2.0 para los SDK y SSPL/DOSP para el servidor.

**Aplicación propuesta:** relacionar trabajo del admin, evento enviado, ejecución y resultado. Separar «configurado», «enviado», «en ejecución» y «terminado». Un proveedor habilitado no demuestra que una función haya recibido un evento.

**Coste:** no se garantiza alojamiento gratuito ilimitado; comprobar el plan y el uso real antes de habilitar más carga. No montar otra infraestructura para resolver un fallo de configuración sin diagnosticarlo.

**Éxito:** una investigación de prueba permite localizar su ejecución y explicar un estado en cola. [SDK](https://github.com/inngest/inngest-js), [servidor y licencia](https://github.com/inngest/inngest).

## 6. Sentry JavaScript: diagnóstico con contexto mínimo

Ya está instalado. La licencia del SDK JavaScript es MIT; algunos componentes relacionados tienen licencias distintas. La plataforma alojada tiene sus propias condiciones.

**Aplicación propuesta:** revisar la configuración actual y vincular errores a la versión y operación, filtrando correo, direcciones, comprobantes, credenciales y cuerpos sensibles. Mantener instrumentación ligera por el presupuesto de CPU de Workers.

**Éxito:** un error sintético se identifica por su versión y operación sin datos privados. La presencia del paquete no demuestra que la recepción remota funcione. [Repositorio](https://github.com/getsentry/sentry-javascript), [licencia](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/LICENSE).

## 7. Storybook: biblioteca visual del admin

Permite desarrollar y documentar componentes aislados. Licencia MIT.

**Aplicación propuesta:** estados de tablas, filtros, paneles laterales, formularios y mensajes usando CSS Modules y los tokens existentes. Empezar solo si mantener las vistas estáticas resulta costoso. No incluirlo en el Worker público ni tratarlo como sustituto de la página real.

**Coste:** uso local sin contratar plataforma visual; un servicio externo de comparación sería otra decisión. Tiene coste de mantenimiento y dependencias de desarrollo.

**Éxito:** un mismo formulario muestra vacío, carga, error, éxito y conflicto sin consultar producción. [Fuente](https://github.com/storybookjs/storybook).

## 8. Lighthouse CI: rendimiento después de estabilizar la interfaz

Herramientas Apache-2.0 para ejecutar y comparar informes de Lighthouse.

**Aplicación propuesta:** pocos recorridos representativos, misma máquina y condiciones comparables; observar tendencias, no perseguir una puntuación perfecta. Nunca iniciar barridos contra `gamerperu.com`. Los flujos autenticados requieren preparación específica y autorización.

**Éxito:** un cambio no deteriora de forma relevante las páginas evaluadas. Los resultados de laboratorio no demuestran por sí solos la experiencia de clientes reales. [Fuente](https://github.com/GoogleChrome/lighthouse-ci).

## Orden de adopción y límite de coste

1. Documentar el flujo y la continuidad; seleccionar ECC sin instalarlo aún.
2. Evaluar un escáner estático de secretos con resultados censurados.
3. Reutilizar Playwright y axe para piezas concretas cuando corresponda.
4. Diagnosticar Inngest y revisar Sentry existentes antes de agregar servicios.
5. Evaluar Storybook si la biblioteca del admin lo necesita.
6. Evaluar Lighthouse CI después de cerrar la navegación y pantallas principales.

No se propone cambiar Next.js, Supabase, Drizzle, Cloudflare ni CSS Modules. No se contratan servicios. Cualquier herramienta nueva debe aportar una mejora verificable y tener una forma simple de retirarla.

## Revisión por contraejemplos

| Idea inicial                                                 | Contraejemplo encontrado                                    | Decisión corregida                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Instalar más herramientas completará el flujo                | Cuatro integraciones relevantes ya existen                  | Reutilizar y diagnosticar antes de instalar.                       |
| Recomendar Gitleaks como si añadiera funciones continuamente | El README anuncia mantenimiento centrado en seguridad       | Explicar su estado y evaluar alternativas sin cambios automáticos. |
| Cualquier detector de secretos es solo local                 | Betterleaks incluye validación HTTP y revocación opcional   | Limitar la propuesta a escaneo estático censurado.                 |
| La memoria de ECC funcionará igual en cualquier PC           | El proyecto documenta limitaciones de Windows               | Documentos versionados como base; memoria automática en piloto.    |
| Código gratuito implica operación gratuita                   | Hay modelos, cuotas, infraestructura y plataformas alojadas | Separar licencia, ejecución y coste de mantenimiento.              |

## Evidencia local

- `package.json`: herramientas instaladas; no prueba su configuración remota.
- `src/lib/admin/navigation.ts`: secciones reales del admin.
- `src/components/admin/admin-header.tsx`: cabecera actual sin menú de perfil administrativo.
- `docs/plans/implementacion-mejoras-flujos.md`: trabajo implementado y pruebas pendientes.
- Consulta de fuentes públicas realizada el 23 de octubre de 2026. La selección es una recomendación para este proyecto, no una clasificación universal.

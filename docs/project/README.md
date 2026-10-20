# Gamer Perú — documentación del MVP

Estado del repositorio al 20 de octubre de 2026, después de GP-059 (`29ce758`). Este paquete explica el producto y enlaza la evidencia; no acredita un despliegue ni una medición de CPU de producción.

| Documento                                                 | Lectura                                          |
| --------------------------------------------------------- | ------------------------------------------------ |
| [01 · Resumen ejecutivo](01-resumen-ejecutivo.md)         | Propósito, público, alcance y métricas           |
| [02 · Historia](02-historia-del-proyecto.md)              | Git, etapas, decisiones y Error 1102             |
| [03 · Arquitectura](03-arquitectura.md)                   | Contexto, contenedores, componentes y despliegue |
| [04 · Datos](04-modelo-de-datos.md)                       | 59 tablas reales, relaciones y contabilidad      |
| [05 · Flujos](05-flujos.md)                               | Compra, pagos, identidad, publicación y subida   |
| [06 · Seguridad](06-seguridad.md)                         | Permisos, secretos, privacidad e IA              |
| [07 · Calidad](07-calidad-y-pruebas.md)                   | Suites, resultados y criterios de cierre         |
| [08 · Operación](08-operacion.md)                         | Despliegue, rollback, observabilidad y limpieza  |
| [09 · Capturas](09-capturas.md)                           | Evidencia local, escritorio y móvil; pendientes  |
| [10 · Limitaciones y futuro](10-limitaciones-y-futuro.md) | Deuda y decisiones sujetas a medición            |

Las especificaciones originales están en [architecture](../architecture/), las decisiones en [ADR](../decisions/README.md) y los resultados por entrega en [roadmap](../roadmap/ROADMAP.md). En caso de discrepancia histórica, usar el código actual, las migraciones y el ADR posterior aplicable. Por ejemplo, la arquitectura original describe Vercel; el hosting de esta rama es Cloudflare. Los diagramas Mermaid se mantienen como texto versionado.

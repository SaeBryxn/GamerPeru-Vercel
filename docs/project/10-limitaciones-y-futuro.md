# 10 · Limitaciones y futuro

GP-058/059 se cerraron con evidencia local y notas operativas. GP-061 documenta ese estado sin modificar la app. **GP-060 no se ejecuta**: no se cambia next/image ni se promete eliminar toda transformación por Worker. Un trabajo futuro requiere alcance propio.

| Límite                      | Consecuencia / siguiente decisión                                                   |
| --------------------------- | ----------------------------------------------------------------------------------- |
| CPU de producción sin medir | Dueño observa editor, cinco fotos, publicar y PDP                                   |
| Next/RSC e ISR en Free      | Rutas sin caché pueden superar CPU aunque la subida sea directa                     |
| Tag de catálogo compartido  | Evaluar tags por producto con evidencia de regeneración excesiva                    |
| JPEG SOF fuera de 4 KB      | Rechazo seguro; no descargar todo el archivo para completar                         |
| Beacon de mejor esfuerzo    | Sweep libera reservas caducadas con margen y límite                                 |
| Contabilidad servidor       | No inventaría objetos introducidos fuera del dominio                                |
| Objetos antiguos            | No se reprocesan ni se borran huérfanos automáticamente                             |
| Medios de home              | QA de formatos, poster, CORS y publicación pendiente                                |
| Capturas con semilla        | No prueban datos reales ni todos los estados; ver [09](09-capturas.md)              |
| Visual/performance          | Falta completar contraste, 360/768/1280 y Lighthouse local                          |
| Documentos históricos       | Algunos describen Vercel o normalización anterior; consultar código y ADR posterior |

## Cuándo evaluar Workers Paid

Los criterios del dueño son más del **0,5 %** de invocaciones del admin o storefront con `exceededCpu` en una semana, o más de **70 000 peticiones/día sostenidas**. No son mediciones de esta tarea ni límites del proveedor. Mantener Free mientras no se cumplan y registrar evidencia. Antes de contratar, el dueño debe verificar precio y cuotas vigentes; este GP no cambia el plan.

El bundle no es una optimización pendiente: original **5869,50 KiB gzip**, final **5864,57**, delta **−4,93 KiB**. El dueño acepta el aumento intermedio +4,68 KiB; solo incrementos superiores a 20 KiB necesitan justificación. No se intenta reducir Next/OpenNext.

Abrir GPs propios para reconciliación contable, métricas por ruta, cobertura de estados de error, auditoría visual/accesible y una eventual nueva entrega de imágenes. EC OS sigue siendo externo y opcional.

# Manual de Gamer Perú

- [Manual editable](manual-de-uso-gamer-peru.md).
- [Manual PDF](../../output/pdf/manual-de-uso-gamer-peru.pdf).
- [Revisión y correcciones](revision-del-manual-y-del-plan.md).
- [Plan de rediseño](../plans/plan-integral-admin-y-flujo-de-trabajo.md).

## Actualizar el PDF

El generador lee únicamente el Markdown; no inicia Next.js, carga archivos de entorno ni consulta servicios.

Requiere Python 3 y `reportlab`. Utiliza el runtime de documentos disponible en Codex o un entorno Python propio con esa biblioteca y las fuentes Arial/Consolas o DejaVu instaladas.

Desde la raíz del repositorio:

```powershell
python scripts/docs/generate-user-manual.py
```

Para escribir otra salida:

```powershell
python scripts/docs/generate-user-manual.py --output ruta/al/manual.pdf
```

Después de cada cambio:

1. Actualizar el capítulo afectado y la fecha/base funcional cuando corresponda.
2. Contrastar pasos y permisos con el código. Añadir los contraejemplos al registro de revisión.
3. Generar el PDF y comprobar capítulos, índice y numeración.
4. Renderizar todas las páginas con Poppler (`pdftoppm`) e inspeccionar tablas, márgenes y cortes.
5. Entregar Markdown y PDF de la misma versión. No sustituir la revisión visual por la extracción de texto.

La edición, fecha y commit base de la cabecera/pie se leen del Markdown. El generador rechaza una fuente que no declare esos metadatos. Las instrucciones propuestas para pantallas futuras se mantienen en el plan, fuera de los procedimientos vigentes.

"use client";

import React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { EditorComparisonPayload } from "@/lib/admin/catalog/story-builder-model";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField } from "./editor-field";
import styles from "../story-builder.module.css";

interface ComparisonEditorProps {
  blockId: string;
  payload: EditorComparisonPayload;
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorComparisonPayload) => void;
  onAnnounce?: (msg: string) => void;
}

export function ComparisonEditor({
  blockId,
  payload,
  issues = [],
  onChange,
  onAnnounce = () => {},
}: ComparisonEditorProps) {
  const getIssue = (fieldPath: string) => issues.find((i) => i.path.includes(fieldPath))?.message;

  function addColumn() {
    if (payload.headers.length >= 6) return;
    const nextHeaders = [...payload.headers, ""];
    const nextRows = payload.rows.map((row) => ({
      ...row,
      cells: [...row.cells, ""],
    }));
    onChange({ ...payload, headers: nextHeaders, rows: nextRows });
    onAnnounce(`Columna ${nextHeaders.length} agregada a la tabla.`);
  }

  function removeColumn(colIndex: number) {
    if (payload.headers.length <= 2) return;
    const nextHeaders = payload.headers.filter((_, i) => i !== colIndex);
    const nextRows = payload.rows.map((row) => ({
      ...row,
      cells: row.cells.filter((_, i) => i !== colIndex),
    }));
    onChange({ ...payload, headers: nextHeaders, rows: nextRows });
    onAnnounce(`Columna ${colIndex + 1} eliminada. Quedan ${nextHeaders.length} columnas.`);
  }

  function updateHeader(colIndex: number, text: string) {
    const nextHeaders = [...payload.headers];
    nextHeaders[colIndex] = text;
    onChange({ ...payload, headers: nextHeaders });
  }

  function addRow() {
    if (payload.rows.length >= 20) return;
    const newId = crypto.randomUUID();
    const newCells = new Array(payload.headers.length).fill("");
    const nextRows = [...payload.rows, { clientId: newId, cells: newCells }];
    onChange({ ...payload, rows: nextRows });
    onAnnounce(`Fila ${nextRows.length} agregada.`);
  }

  function removeRow(rowIndex: number) {
    if (payload.rows.length <= 1) return;
    const nextRows = payload.rows.filter((_, i) => i !== rowIndex);
    onChange({ ...payload, rows: nextRows });
    onAnnounce(`Fila ${rowIndex + 1} eliminada. Quedan ${nextRows.length} filas.`);
  }

  function moveRow(rowIndex: number, direction: -1 | 1) {
    const destination = rowIndex + direction;
    if (destination < 0 || destination >= payload.rows.length) return;
    const nextRows = [...payload.rows];
    const current = nextRows[rowIndex]!;
    const adjacent = nextRows[destination]!;
    nextRows[rowIndex] = adjacent;
    nextRows[destination] = current;
    onChange({ ...payload, rows: nextRows });
    onAnnounce(`Fila movida a la posición ${destination + 1}.`);
  }

  function updateCell(rowIndex: number, colIndex: number, text: string) {
    const nextRows = [...payload.rows];
    const row = nextRows[rowIndex]!;
    const nextCells = [...row.cells];
    nextCells[colIndex] = text;
    nextRows[rowIndex] = { ...row, cells: nextCells };
    onChange({ ...payload, rows: nextRows });
  }

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-comparison-${blockId}`}>
      <EditorField
        fieldId={`field-${blockId}-title`}
        label="Título de la comparación (opcional)"
        helpText="Máximo 200 caracteres."
        error={getIssue(".title")}
      >
        {(inputProps) => (
          <input
            type="text"
            {...inputProps}
            value={payload.title}
            onChange={(e) => onChange({ ...payload, title: e.target.value })}
            maxLength={200}
            className={styles.textInput}
            placeholder="Ej: Comparativa de modelos"
          />
        )}
      </EditorField>

      <div className={styles.nestedSection}>
        <div className={styles.nestedSectionHeader}>
          <div>
            <h4 className={styles.nestedSectionTitle}>
              Columnas / Encabezados ({payload.headers.length} de 6)
            </h4>
            <p className={styles.fieldHelp}>
              Entre 2 y 6 columnas. Agregar o quitar una columna actualiza todas las filas
              automáticamente.
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={payload.headers.length >= 6}
            onClick={addColumn}
            aria-label="Agregar columna a la comparación"
            data-testid={`add-comparison-column-${blockId}`}
          >
            <Plus size={16} aria-hidden="true" />
            Agregar columna
          </button>
        </div>

        {getIssue(".headers") && (
          <p className={styles.fieldError} role="alert">
            {getIssue(".headers")}
          </p>
        )}

        <div className={styles.headersRowGrid}>
          {payload.headers.map((header, colIndex) => {
            const colPos = colIndex + 1;
            const headerError = getIssue(`headers[${colIndex}]`);
            return (
              <div key={colIndex} className={styles.headerCellCard}>
                <div className={styles.headerCellCardHeader}>
                  <label
                    htmlFor={`field-${blockId}-headers-${colIndex}`}
                    className={styles.fieldLabel}
                  >
                    Columna {colPos} *
                  </label>
                  {payload.headers.length > 2 && (
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.deleteAction}`}
                      onClick={() => removeColumn(colIndex)}
                      aria-label={`Eliminar columna ${colPos}`}
                      data-testid={`remove-column-${blockId}-${colIndex}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <input
                  id={`field-${blockId}-headers-${colIndex}`}
                  type="text"
                  value={header}
                  onChange={(e) => updateHeader(colIndex, e.target.value)}
                  maxLength={100}
                  className={styles.textInput}
                  placeholder={`Encabezado ${colPos}`}
                  aria-invalid={Boolean(headerError)}
                  aria-describedby={
                    headerError ? `field-${blockId}-headers-${colIndex}-error` : undefined
                  }
                />
                {headerError && (
                  <p
                    id={`field-${blockId}-headers-${colIndex}-error`}
                    className={styles.fieldError}
                    role="alert"
                  >
                    {headerError}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.nestedSection}>
        <div className={styles.nestedSectionHeader}>
          <div>
            <h4 className={styles.nestedSectionTitle}>
              Filas de comparación ({payload.rows.length} de 20)
            </h4>
            <p className={styles.fieldHelp}>
              Entre 1 y 20 filas. Cada celda corresponde a la columna respectiva.
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={payload.rows.length >= 20}
            onClick={addRow}
            aria-label="Agregar fila a la comparación"
            data-testid={`add-comparison-row-${blockId}`}
          >
            <Plus size={16} aria-hidden="true" />
            Agregar fila
          </button>
        </div>

        {getIssue(".rows") && !payload.rows.some((_, r) => getIssue(`rows[${r}]`)) && (
          <p className={styles.fieldError} role="alert">
            {getIssue(".rows")}
          </p>
        )}

        {/* Labelled internal horizontal scroll region for narrow viewports */}
        <div
          className={styles.comparisonTableScrollRegion}
          role="region"
          aria-label="Tabla de celdas de comparación"
          tabIndex={0}
        >
          <div className={styles.comparisonRowsStack}>
            {payload.rows.map((row, rowIndex) => {
              const rowPos = rowIndex + 1;
              const rowError = getIssue(`rows[${rowIndex}]`);

              return (
                <div
                  key={row.clientId}
                  className={styles.comparisonRowCard}
                  data-testid={`comparison-row-${blockId}-${rowIndex}`}
                >
                  <div className={styles.comparisonRowHeader}>
                    <strong className={styles.nestedCardTitle}>Fila {rowPos}</strong>
                    <div className={styles.nestedCardActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        disabled={rowIndex === 0}
                        onClick={() => moveRow(rowIndex, -1)}
                        aria-label={`Mover fila ${rowPos} hacia arriba`}
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        disabled={rowIndex === payload.rows.length - 1}
                        onClick={() => moveRow(rowIndex, 1)}
                        aria-label={`Mover fila ${rowPos} hacia abajo`}
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                      </button>
                      {payload.rows.length > 1 && (
                        <button
                          type="button"
                          className={`${styles.iconButton} ${styles.deleteAction}`}
                          onClick={() => removeRow(rowIndex)}
                          aria-label={`Eliminar fila ${rowPos}`}
                          data-testid={`remove-row-${blockId}-${rowIndex}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  {rowError && (
                    <p className={styles.fieldError} role="alert">
                      {rowError}
                    </p>
                  )}

                  <div className={styles.comparisonCellsGrid}>
                    {row.cells.map((cell, colIndex) => {
                      const rawHeader = payload.headers[colIndex]?.trim();
                      const colHeader =
                        rawHeader && rawHeader.length > 0 ? rawHeader : `Columna ${colIndex + 1}`;
                      const cellId = `field-${blockId}-cell-${rowIndex}-${colIndex}`;
                      const cellError = getIssue(`rows[${rowIndex}][${colIndex}]`);

                      return (
                        <div key={colIndex} className={styles.comparisonCellWrapper}>
                          <label htmlFor={cellId} className={styles.accessibleCellLabel}>
                            Fila {rowPos}, Columna {colIndex + 1} ({colHeader})
                          </label>
                          <input
                            id={cellId}
                            type="text"
                            value={cell}
                            onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                            maxLength={200}
                            className={styles.textInput}
                            placeholder={`${colHeader} *`}
                            aria-invalid={Boolean(cellError)}
                            aria-describedby={cellError ? `${cellId}-error` : undefined}
                          />
                          {cellError && (
                            <p id={`${cellId}-error`} className={styles.fieldError} role="alert">
                              {cellError}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

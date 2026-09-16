"use client";

import React, { useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { EditorStatHighlightPayload } from "@/lib/admin/catalog/story-builder-model";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField } from "./editor-field";
import styles from "../story-builder.module.css";

interface StatHighlightEditorProps {
  blockId: string;
  payload: EditorStatHighlightPayload;
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorStatHighlightPayload) => void;
  onAnnounce?: (msg: string) => void;
}

export function StatHighlightEditor({
  blockId,
  payload,
  issues = [],
  onChange,
  onAnnounce = () => {},
}: StatHighlightEditorProps) {
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  const getIssue = (fieldPath: string) => issues.find((i) => i.path.includes(fieldPath))?.message;

  function addStat() {
    if (payload.stats.length >= 6) return;
    const newId = crypto.randomUUID();
    const nextStats = [...payload.stats, { clientId: newId, value: "", label: "", unit: "" }];
    onChange({ ...payload, stats: nextStats });
    onAnnounce(`Estadística ${nextStats.length} agregada.`);
    setTimeout(() => {
      const el = document.getElementById(`field-${blockId}-stats-${nextStats.length - 1}-value`);
      el?.focus();
    }, 10);
  }

  function removeStat(index: number) {
    const nextStats = payload.stats.filter((_, i) => i !== index);
    onChange({ ...payload, stats: nextStats });
    onAnnounce(`Estadística ${index + 1} eliminada. Quedan ${nextStats.length}.`);
    setTimeout(() => {
      const nextFocusIndex = Math.min(index, nextStats.length - 1);
      if (nextFocusIndex >= 0) {
        const el = document.getElementById(`field-${blockId}-stats-${nextFocusIndex}-value`);
        el?.focus();
      } else {
        addButtonRef.current?.focus();
      }
    }, 10);
  }

  function moveStat(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= payload.stats.length) return;
    const nextStats = [...payload.stats];
    const current = nextStats[index]!;
    const adjacent = nextStats[destination]!;
    nextStats[index] = adjacent;
    nextStats[destination] = current;
    onChange({ ...payload, stats: nextStats });
    onAnnounce(`Estadística movida a la posición ${destination + 1}.`);
    setTimeout(() => {
      const el = document.getElementById(`field-${blockId}-stats-${destination}-value`);
      el?.focus();
    }, 10);
  }

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-stat-highlight-${blockId}`}>
      <EditorField
        fieldId={`field-${blockId}-title`}
        label="Título del bloque (opcional)"
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
            placeholder="Ej: Rendimiento excepcional"
          />
        )}
      </EditorField>

      <div className={styles.nestedSection}>
        <div className={styles.nestedSectionHeader}>
          <div>
            <h4 className={styles.nestedSectionTitle}>Estadísticas (1 a 6)</h4>
            <p className={styles.fieldHelp}>
              Cifras destacadas con su valor, unidad opcional y etiqueta explicativa.
            </p>
          </div>
          <button
            ref={addButtonRef}
            type="button"
            className={styles.secondaryButton}
            disabled={payload.stats.length >= 6}
            onClick={addStat}
            aria-label="Agregar estadística"
            data-testid={`add-stat-${blockId}`}
          >
            <Plus size={16} aria-hidden="true" />
            Agregar estadística
          </button>
        </div>

        {getIssue(".stats") && !payload.stats.some((_, i) => getIssue(`stats[${i}]`)) && (
          <p className={styles.fieldError} role="alert">
            {getIssue(".stats")}
          </p>
        )}

        <div className={styles.nestedList}>
          {payload.stats.map((item, index) => {
            const pos = index + 1;
            const valueError = getIssue(`stats[${index}].value`);
            const labelError = getIssue(`stats[${index}].label`);
            const unitError = getIssue(`stats[${index}].unit`);

            return (
              <div
                key={item.clientId}
                className={styles.nestedCard}
                data-testid={`stat-row-${blockId}-${index}`}
              >
                <div className={styles.nestedCardHeader}>
                  <strong className={styles.nestedCardTitle}>Estadística {pos}</strong>
                  <div className={styles.nestedCardActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={index === 0}
                      onClick={() => moveStat(index, -1)}
                      aria-label={`Mover estadística ${pos} hacia arriba`}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={index === payload.stats.length - 1}
                      onClick={() => moveStat(index, 1)}
                      aria-label={`Mover estadística ${pos} hacia abajo`}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.deleteAction}`}
                      onClick={() => removeStat(index)}
                      aria-label={`Eliminar estadística ${pos}`}
                      data-testid={`remove-stat-${blockId}-${index}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className={styles.nestedGridThree}>
                  <EditorField
                    fieldId={`field-${blockId}-stats-${index}-value`}
                    label="Valor"
                    required
                    helpText="Máx 50 car."
                    error={valueError}
                  >
                    {(inputProps) => (
                      <input
                        type="text"
                        {...inputProps}
                        value={item.value}
                        onChange={(e) => {
                          const next = [...payload.stats];
                          next[index] = { ...item, value: e.target.value };
                          onChange({ ...payload, stats: next });
                        }}
                        maxLength={50}
                        className={styles.textInput}
                        placeholder="Ej: 26000 o 45"
                      />
                    )}
                  </EditorField>

                  <EditorField
                    fieldId={`field-${blockId}-stats-${index}-unit`}
                    label="Unidad (opcional)"
                    helpText="Máx 20 car."
                    error={unitError}
                  >
                    {(inputProps) => (
                      <input
                        type="text"
                        {...inputProps}
                        value={item.unit}
                        onChange={(e) => {
                          const next = [...payload.stats];
                          next[index] = { ...item, unit: e.target.value };
                          onChange({ ...payload, stats: next });
                        }}
                        maxLength={20}
                        className={styles.textInput}
                        placeholder="Ej: DPI o g"
                      />
                    )}
                  </EditorField>

                  <EditorField
                    fieldId={`field-${blockId}-stats-${index}-label`}
                    label="Etiqueta"
                    required
                    helpText="Máx 100 car."
                    error={labelError}
                  >
                    {(inputProps) => (
                      <input
                        type="text"
                        {...inputProps}
                        value={item.label}
                        onChange={(e) => {
                          const next = [...payload.stats];
                          next[index] = { ...item, label: e.target.value };
                          onChange({ ...payload, stats: next });
                        }}
                        maxLength={100}
                        className={styles.textInput}
                        placeholder="Ej: Resolución óptica"
                      />
                    )}
                  </EditorField>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

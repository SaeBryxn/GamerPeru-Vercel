"use client";

import React, { useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { EditorFaqPayload } from "@/lib/admin/catalog/story-builder-model";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField } from "./editor-field";
import styles from "../story-builder.module.css";

interface FaqEditorProps {
  blockId: string;
  payload: EditorFaqPayload;
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorFaqPayload) => void;
  onAnnounce?: (msg: string) => void;
}

export function FaqEditor({
  blockId,
  payload,
  issues = [],
  onChange,
  onAnnounce = () => {},
}: FaqEditorProps) {
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  const getIssue = (fieldPath: string) => issues.find((i) => i.path.includes(fieldPath))?.message;

  function addItem() {
    if (payload.items.length >= 15) return;
    const newId = crypto.randomUUID();
    const nextItems = [...payload.items, { clientId: newId, question: "", answer: "" }];
    onChange({ ...payload, items: nextItems });
    onAnnounce(`Pregunta frecuente ${nextItems.length} agregada.`);
    setTimeout(() => {
      const el = document.getElementById(`field-${blockId}-items-${nextItems.length - 1}-question`);
      el?.focus();
    }, 10);
  }

  function removeItem(index: number) {
    const nextItems = payload.items.filter((_, i) => i !== index);
    onChange({ ...payload, items: nextItems });
    onAnnounce(`Pregunta frecuente ${index + 1} eliminada. Quedan ${nextItems.length}.`);
    setTimeout(() => {
      const nextFocusIndex = Math.min(index, nextItems.length - 1);
      if (nextFocusIndex >= 0) {
        const el = document.getElementById(`field-${blockId}-items-${nextFocusIndex}-question`);
        el?.focus();
      } else {
        addButtonRef.current?.focus();
      }
    }, 10);
  }

  function moveItem(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= payload.items.length) return;
    const nextItems = [...payload.items];
    const current = nextItems[index]!;
    const adjacent = nextItems[destination]!;
    nextItems[index] = adjacent;
    nextItems[destination] = current;
    onChange({ ...payload, items: nextItems });
    onAnnounce(`Pregunta movida a la posición ${destination + 1}.`);
  }

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-faq-${blockId}`}>
      <EditorField
        fieldId={`field-${blockId}-title`}
        label="Título de la sección (opcional)"
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
            placeholder="Ej: Preguntas frecuentes"
          />
        )}
      </EditorField>

      <div className={styles.nestedSection}>
        <div className={styles.nestedSectionHeader}>
          <div>
            <h4 className={styles.nestedSectionTitle}>
              Preguntas y respuestas ({payload.items.length} de 15)
            </h4>
            <p className={styles.fieldHelp}>
              Entre 1 y 15 preguntas con respuestas en texto plano.
            </p>
          </div>
          <button
            ref={addButtonRef}
            type="button"
            className={styles.secondaryButton}
            disabled={payload.items.length >= 15}
            onClick={addItem}
            aria-label="Agregar pregunta frecuente"
            data-testid={`add-faq-item-${blockId}`}
          >
            <Plus size={16} aria-hidden="true" />
            Agregar pregunta
          </button>
        </div>

        {getIssue(".items") && !payload.items.some((_, i) => getIssue(`items[${i}]`)) && (
          <p className={styles.fieldError} role="alert">
            {getIssue(".items")}
          </p>
        )}

        <div className={styles.nestedList}>
          {payload.items.map((item, index) => {
            const pos = index + 1;
            const questionError = getIssue(`items[${index}].question`);
            const answerError = getIssue(`items[${index}].answer`);

            return (
              <div
                key={item.clientId}
                className={styles.nestedCard}
                data-testid={`faq-item-row-${blockId}-${index}`}
              >
                <div className={styles.nestedCardHeader}>
                  <strong className={styles.nestedCardTitle}>Pregunta {pos}</strong>
                  <div className={styles.nestedCardActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={index === 0}
                      onClick={() => moveItem(index, -1)}
                      aria-label={`Mover pregunta ${pos} hacia arriba`}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={index === payload.items.length - 1}
                      onClick={() => moveItem(index, 1)}
                      aria-label={`Mover pregunta ${pos} hacia abajo`}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.deleteAction}`}
                      onClick={() => removeItem(index)}
                      aria-label={`Eliminar pregunta ${pos}`}
                      data-testid={`remove-faq-item-${blockId}-${index}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <EditorField
                  fieldId={`field-${blockId}-items-${index}-question`}
                  label="Pregunta"
                  required
                  helpText="Máximo 300 caracteres."
                  error={questionError}
                >
                  {(inputProps) => (
                    <input
                      type="text"
                      {...inputProps}
                      value={item.question}
                      onChange={(e) => {
                        const next = [...payload.items];
                        next[index] = { ...item, question: e.target.value };
                        onChange({ ...payload, items: next });
                      }}
                      maxLength={300}
                      className={styles.textInput}
                      placeholder="Ej: ¿Qué tipo de interruptores utiliza?"
                    />
                  )}
                </EditorField>

                <EditorField
                  fieldId={`field-${blockId}-items-${index}-answer`}
                  label="Respuesta"
                  required
                  helpText="Máximo 2000 caracteres. Solo texto plano."
                  error={answerError}
                >
                  {(inputProps) => (
                    <textarea
                      {...inputProps}
                      value={item.answer}
                      onChange={(e) => {
                        const next = [...payload.items];
                        next[index] = { ...item, answer: e.target.value };
                        onChange({ ...payload, items: next });
                      }}
                      maxLength={2000}
                      rows={3}
                      className={styles.textareaInput}
                      placeholder="Respuesta explicativa para el cliente"
                    />
                  )}
                </EditorField>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

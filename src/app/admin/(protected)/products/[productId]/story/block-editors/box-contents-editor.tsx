"use client";

import React, { useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { EditorBoxContentsPayload } from "@/lib/admin/catalog/story-builder-model";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField, MediaField } from "./editor-field";
import styles from "../story-builder.module.css";

interface BoxContentsEditorProps {
  blockId: string;
  payload: EditorBoxContentsPayload;
  selectableMedia: readonly AdminStorySelectableMedia[];
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorBoxContentsPayload) => void;
  onOpenMediaPicker: (options: {
    title: string;
    mediaType: "IMAGE";
    selectedMediaId?: string;
    allowClear?: boolean;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    onSelect: (mediaId: string | undefined) => void;
  }) => void;
  onAnnounce?: (msg: string) => void;
}

export function BoxContentsEditor({
  blockId,
  payload,
  selectableMedia,
  issues = [],
  onChange,
  onOpenMediaPicker,
  onAnnounce = () => {},
}: BoxContentsEditorProps) {
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  const getIssue = (fieldPath: string) => issues.find((i) => i.path.includes(fieldPath))?.message;

  function addItem() {
    if (payload.items.length >= 12) return;
    const newId = crypto.randomUUID();
    const nextItems = [
      ...payload.items,
      { clientId: newId, title: "", mediaId: undefined, count: "" },
    ];
    onChange({ ...payload, items: nextItems });
    onAnnounce(`Elemento de caja ${nextItems.length} agregado.`);
  }

  function removeItem(index: number) {
    const nextItems = payload.items.filter((_, i) => i !== index);
    onChange({ ...payload, items: nextItems });
    onAnnounce(`Elemento de caja ${index + 1} eliminado. Quedan ${nextItems.length}.`);
    setTimeout(() => {
      const nextFocusIndex = Math.min(index, nextItems.length - 1);
      if (nextFocusIndex >= 0) {
        const el = document.getElementById(`field-${blockId}-items-${nextFocusIndex}-title`);
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
    onAnnounce(`Elemento de caja movido a la posición ${destination + 1}.`);
  }

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-box-contents-${blockId}`}>
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
            placeholder="Ej: ¿Qué incluye la caja?"
          />
        )}
      </EditorField>

      <div className={styles.nestedSection}>
        <div className={styles.nestedSectionHeader}>
          <div>
            <h4 className={styles.nestedSectionTitle}>
              Elementos incluidos ({payload.items.length} de 12)
            </h4>
            <p className={styles.fieldHelp}>
              Accesorios, cables, manuales o componentes de la caja.
            </p>
          </div>
          <button
            ref={addButtonRef}
            type="button"
            className={styles.secondaryButton}
            disabled={payload.items.length >= 12}
            onClick={addItem}
            aria-label="Agregar elemento a la caja"
            data-testid={`add-box-item-${blockId}`}
          >
            <Plus size={16} aria-hidden="true" />
            Agregar elemento
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
            const titleError = getIssue(`items[${index}].title`);
            const countError = getIssue(`items[${index}].count`);
            const mediaError = getIssue(`items[${index}].mediaId`);

            return (
              <div
                key={item.clientId}
                className={styles.nestedCard}
                data-testid={`box-item-row-${blockId}-${index}`}
              >
                <div className={styles.nestedCardHeader}>
                  <strong className={styles.nestedCardTitle}>Elemento {pos}</strong>
                  <div className={styles.nestedCardActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={index === 0}
                      onClick={() => moveItem(index, -1)}
                      aria-label={`Mover elemento ${pos} hacia arriba`}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={index === payload.items.length - 1}
                      onClick={() => moveItem(index, 1)}
                      aria-label={`Mover elemento ${pos} hacia abajo`}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.deleteAction}`}
                      onClick={() => removeItem(index)}
                      aria-label={`Eliminar elemento ${pos}`}
                      data-testid={`remove-box-item-${blockId}-${index}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className={styles.nestedGridTwo}>
                  <EditorField
                    fieldId={`field-${blockId}-items-${index}-title`}
                    label="Nombre del accesorio"
                    required
                    helpText="Máx 100 caracteres."
                    error={titleError}
                  >
                    {(inputProps) => (
                      <input
                        type="text"
                        {...inputProps}
                        value={item.title}
                        onChange={(e) => {
                          const next = [...payload.items];
                          next[index] = { ...item, title: e.target.value };
                          onChange({ ...payload, items: next });
                        }}
                        maxLength={100}
                        className={styles.textInput}
                        placeholder="Ej: Cable Paracord USB-C"
                      />
                    )}
                  </EditorField>

                  <EditorField
                    fieldId={`field-${blockId}-items-${index}-count`}
                    label="Cantidad (opcional)"
                    helpText="Entero entre 1 y 100."
                    error={countError}
                  >
                    {(inputProps) => (
                      <input
                        type="text"
                        inputMode="numeric"
                        {...inputProps}
                        value={item.count}
                        onChange={(e) => {
                          const next = [...payload.items];
                          next[index] = { ...item, count: e.target.value };
                          onChange({ ...payload, items: next });
                        }}
                        className={styles.textInput}
                        placeholder="Ej: 1"
                      />
                    )}
                  </EditorField>
                </div>

                <MediaField
                  fieldId={`field-${blockId}-items-${index}-mediaId`}
                  label="Imagen del accesorio (opcional)"
                  mediaType="IMAGE"
                  selectedMediaId={item.mediaId}
                  selectableMedia={selectableMedia}
                  error={mediaError}
                  onOpenPicker={(triggerRef) =>
                    onOpenMediaPicker({
                      title: `Seleccionar imagen para ${item.title || `elemento ${pos}`}`,
                      mediaType: "IMAGE",
                      selectedMediaId: item.mediaId,
                      triggerRef,
                      onSelect: (mediaId) => {
                        const next = [...payload.items];
                        next[index] = { ...item, mediaId };
                        onChange({ ...payload, items: next });
                      },
                    })
                  }
                  onClear={() => {
                    const next = [...payload.items];
                    next[index] = { ...item, mediaId: undefined };
                    onChange({ ...payload, items: next });
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

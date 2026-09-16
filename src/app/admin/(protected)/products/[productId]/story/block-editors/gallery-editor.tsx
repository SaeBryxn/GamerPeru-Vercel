"use client";

import React, { useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  getExactFieldIssue,
  type EditorGalleryPayload,
} from "@/lib/admin/catalog/story-builder-model";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField, MediaField } from "./editor-field";
import styles from "../story-builder.module.css";

interface GalleryEditorProps {
  blockId: string;
  payload: EditorGalleryPayload;
  selectableMedia: readonly AdminStorySelectableMedia[];
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorGalleryPayload) => void;
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

export function GalleryEditor({
  blockId,
  payload,
  selectableMedia,
  issues = [],
  onChange,
  onOpenMediaPicker,
  onAnnounce = () => {},
}: GalleryEditorProps) {
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  const getIssue = (fieldPath: string) => getExactFieldIssue(issues, fieldPath);

  function addItem() {
    if (payload.items.length >= 6) return;
    const newId = crypto.randomUUID();
    const nextItems = [
      ...payload.items,
      { clientId: newId, mediaId: undefined, altText: "", caption: "" },
    ];
    onChange({ ...payload, items: nextItems });
    onAnnounce(`Elemento de galería ${nextItems.length} agregado.`);
  }

  function removeItem(index: number) {
    const nextItems = payload.items.filter((_, i) => i !== index);
    onChange({ ...payload, items: nextItems });
    onAnnounce(`Elemento de galería ${index + 1} eliminado. Quedan ${nextItems.length}.`);
    setTimeout(() => {
      const nextFocusIndex = Math.min(index, nextItems.length - 1);
      if (nextFocusIndex >= 0) {
        const el = document.getElementById(`field-${blockId}-items-${nextFocusIndex}-mediaId`);
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
    onAnnounce(`Elemento de galería movido a la posición ${destination + 1}.`);
  }

  const galleryItemsError =
    getIssue(".items") && !payload.items.some((_, i) => getIssue(`items[${i}]`))
      ? getIssue(".items")
      : payload.items.length < 3
        ? "La galería requiere al menos 3 imágenes para poder guardarse."
        : undefined;

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-gallery-${blockId}`}>
      <EditorField
        fieldId={`field-${blockId}-title`}
        label="Título de la galería (opcional)"
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
            placeholder="Ej: Galería del producto"
          />
        )}
      </EditorField>

      <div className={styles.nestedSection}>
        <div className={styles.nestedSectionHeader}>
          <div>
            <h4 className={styles.nestedSectionTitle}>Imágenes de galería (3 a 6)</h4>
            <p className={styles.fieldHelp}>
              Colección ordenada de fotos. Mínimo 3 y máximo 6 imágenes obligatorias.
            </p>
          </div>
          <button
            ref={addButtonRef}
            type="button"
            className={styles.secondaryButton}
            disabled={payload.items.length >= 6}
            onClick={addItem}
            aria-label="Agregar imagen a galería"
            data-testid={`add-gallery-item-${blockId}`}
          >
            <Plus size={16} aria-hidden="true" />
            Agregar imagen
          </button>
        </div>

        {galleryItemsError && (
          <p className={styles.fieldError} role="alert">
            {galleryItemsError}
          </p>
        )}

        <div className={styles.nestedList}>
          {payload.items.map((item, index) => {
            const pos = index + 1;
            const mediaError = getIssue(`items[${index}].mediaId`);
            const altError = getIssue(`items[${index}].altText`);
            const captionError = getIssue(`items[${index}].caption`);

            return (
              <div
                key={item.clientId}
                className={styles.nestedCard}
                data-testid={`gallery-row-${blockId}-${index}`}
              >
                <div className={styles.nestedCardHeader}>
                  <strong className={styles.nestedCardTitle}>Elemento de galería {pos}</strong>
                  <div className={styles.nestedCardActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={index === 0}
                      onClick={() => moveItem(index, -1)}
                      aria-label={`Mover elemento de galería ${pos} hacia arriba`}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={index === payload.items.length - 1}
                      onClick={() => moveItem(index, 1)}
                      aria-label={`Mover elemento de galería ${pos} hacia abajo`}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.deleteAction}`}
                      onClick={() => removeItem(index)}
                      aria-label={`Eliminar elemento de galería ${pos}`}
                      data-testid={`remove-gallery-item-${blockId}-${index}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <MediaField
                  fieldId={`field-${blockId}-items-${index}-mediaId`}
                  label={`Imagen ${pos}`}
                  required
                  mediaType="IMAGE"
                  selectedMediaId={item.mediaId}
                  selectableMedia={selectableMedia}
                  error={mediaError}
                  onOpenPicker={(triggerRef) =>
                    onOpenMediaPicker({
                      title: `Seleccionar imagen para elemento ${pos} de Galería`,
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

                <div className={styles.nestedGridTwo}>
                  <EditorField
                    fieldId={`field-${blockId}-items-${index}-altText`}
                    label="Texto alternativo (opcional)"
                    helpText="Máximo 200 caracteres."
                    error={altError}
                  >
                    {(inputProps) => (
                      <input
                        type="text"
                        {...inputProps}
                        value={item.altText}
                        onChange={(e) => {
                          const next = [...payload.items];
                          next[index] = { ...item, altText: e.target.value };
                          onChange({ ...payload, items: next });
                        }}
                        maxLength={200}
                        className={styles.textInput}
                        placeholder="Descripción para accesibilidad"
                      />
                    )}
                  </EditorField>

                  <EditorField
                    fieldId={`field-${blockId}-items-${index}-caption`}
                    label="Pie de imagen (opcional)"
                    helpText="Máximo 300 caracteres."
                    error={captionError}
                  >
                    {(inputProps) => (
                      <input
                        type="text"
                        {...inputProps}
                        value={item.caption}
                        onChange={(e) => {
                          const next = [...payload.items];
                          next[index] = { ...item, caption: e.target.value };
                          onChange({ ...payload, items: next });
                        }}
                        maxLength={300}
                        className={styles.textInput}
                        placeholder="Leyenda visible"
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

"use client";

import React from "react";
import {
  getExactFieldIssue,
  type EditorImageTextPayload,
} from "@/lib/admin/catalog/story-builder-model";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField, MediaField } from "./editor-field";
import styles from "../story-builder.module.css";

interface ImageTextEditorProps {
  blockId: string;
  payload: EditorImageTextPayload;
  selectableMedia: readonly AdminStorySelectableMedia[];
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorImageTextPayload) => void;
  onOpenMediaPicker: (options: {
    title: string;
    mediaType: "IMAGE" | "VIDEO";
    selectedMediaId?: string;
    allowClear?: boolean;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    onSelect: (mediaId: string | undefined) => void;
  }) => void;
}

export function ImageTextEditor({
  blockId,
  payload,
  selectableMedia,
  issues = [],
  onChange,
  onOpenMediaPicker,
}: ImageTextEditorProps) {
  const getIssue = (field: string) => getExactFieldIssue(issues, field);

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-image-text-${blockId}`}>
      <EditorField
        fieldId={`field-${blockId}-headline`}
        label="Encabezado"
        required
        helpText="Máximo 200 caracteres."
        error={getIssue("headline")}
      >
        {(inputProps) => (
          <input
            type="text"
            {...inputProps}
            value={payload.headline}
            onChange={(e) => onChange({ ...payload, headline: e.target.value })}
            maxLength={200}
            className={styles.textInput}
            placeholder="Título del bloque editorial"
          />
        )}
      </EditorField>

      <EditorField
        fieldId={`field-${blockId}-body`}
        label="Cuerpo editorial"
        required
        helpText="Máximo 2000 caracteres. Descripción detallada."
        error={getIssue("body")}
      >
        {(inputProps) => (
          <textarea
            {...inputProps}
            value={payload.body}
            onChange={(e) => onChange({ ...payload, body: e.target.value })}
            maxLength={2000}
            rows={4}
            className={styles.textareaInput}
            placeholder="Texto explicativo del producto"
          />
        )}
      </EditorField>

      <MediaField
        fieldId={`field-${blockId}-mediaId`}
        label="Imagen"
        required
        mediaType="IMAGE"
        selectedMediaId={payload.mediaId}
        selectableMedia={selectableMedia}
        error={getIssue("mediaId")}
        onOpenPicker={(triggerRef) =>
          onOpenMediaPicker({
            title: "Seleccionar imagen para bloque editorial",
            mediaType: "IMAGE",
            selectedMediaId: payload.mediaId,
            triggerRef,
            onSelect: (mediaId) => onChange({ ...payload, mediaId }),
          })
        }
        onClear={() => onChange({ ...payload, mediaId: undefined })}
      />

      <fieldset className={styles.fieldset}>
        <legend className={styles.fieldLabel}>Posición de la imagen</legend>
        <div className={styles.radioGroup}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name={`field-${blockId}-imagePosition`}
              value="left"
              checked={payload.imagePosition === "left"}
              onChange={() => onChange({ ...payload, imagePosition: "left" })}
              className={styles.radioInput}
            />
            <span>Izquierda</span>
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name={`field-${blockId}-imagePosition`}
              value="right"
              checked={payload.imagePosition === "right"}
              onChange={() => onChange({ ...payload, imagePosition: "right" })}
              className={styles.radioInput}
            />
            <span>Derecha</span>
          </label>
        </div>
      </fieldset>
    </div>
  );
}

"use client";

import React from "react";
import type { EditorFullBleedImagePayload } from "@/lib/admin/catalog/story-builder-model";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField, MediaField } from "./editor-field";
import styles from "../story-builder.module.css";

interface FullBleedImageEditorProps {
  blockId: string;
  payload: EditorFullBleedImagePayload;
  selectableMedia: readonly AdminStorySelectableMedia[];
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorFullBleedImagePayload) => void;
  onOpenMediaPicker: (options: {
    title: string;
    mediaType: "IMAGE" | "VIDEO";
    selectedMediaId?: string;
    allowClear?: boolean;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    onSelect: (mediaId: string | undefined) => void;
  }) => void;
}

export function FullBleedImageEditor({
  blockId,
  payload,
  selectableMedia,
  issues = [],
  onChange,
  onOpenMediaPicker,
}: FullBleedImageEditorProps) {
  const getIssue = (field: string) =>
    issues.find((i) => i.path.endsWith(`.${field}`) || i.path.endsWith(`[${field}]`))?.message;

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-full-bleed-image-${blockId}`}>
      <MediaField
        fieldId={`field-${blockId}-mediaId`}
        label="Imagen a todo lo ancho"
        required
        mediaType="IMAGE"
        selectedMediaId={payload.mediaId}
        selectableMedia={selectableMedia}
        helpText="Selecciona una imagen adjunta al producto para ocupar el ancho completo."
        error={getIssue("mediaId")}
        onOpenPicker={(triggerRef) =>
          onOpenMediaPicker({
            title: "Seleccionar imagen a todo lo ancho",
            mediaType: "IMAGE",
            selectedMediaId: payload.mediaId,
            triggerRef,
            onSelect: (mediaId) => onChange({ ...payload, mediaId }),
          })
        }
        onClear={() => onChange({ ...payload, mediaId: undefined })}
      />

      <EditorField
        fieldId={`field-${blockId}-altText`}
        label="Texto alternativo (opcional)"
        helpText="Máximo 200 caracteres. Si se deja vacío, el renderizador utilizará el texto del catálogo o del producto."
        error={getIssue("altText")}
      >
        {(inputProps) => (
          <input
            type="text"
            {...inputProps}
            value={payload.altText}
            onChange={(e) => onChange({ ...payload, altText: e.target.value })}
            maxLength={200}
            className={styles.textInput}
            placeholder="Descripción accesible de la imagen"
          />
        )}
      </EditorField>

      <EditorField
        fieldId={`field-${blockId}-caption`}
        label="Pie de imagen (opcional)"
        helpText="Máximo 300 caracteres. Leyenda visible bajo la imagen."
        error={getIssue("caption")}
      >
        {(inputProps) => (
          <input
            type="text"
            {...inputProps}
            value={payload.caption}
            onChange={(e) => onChange({ ...payload, caption: e.target.value })}
            maxLength={300}
            className={styles.textInput}
            placeholder="Leyenda o pie"
          />
        )}
      </EditorField>
    </div>
  );
}

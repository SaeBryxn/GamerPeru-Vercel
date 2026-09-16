"use client";

import React from "react";
import type { EditorSpecFeaturePayload } from "@/lib/admin/catalog/story-builder-model";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField, MediaField } from "./editor-field";
import styles from "../story-builder.module.css";

interface SpecFeatureEditorProps {
  blockId: string;
  payload: EditorSpecFeaturePayload;
  selectableMedia: readonly AdminStorySelectableMedia[];
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorSpecFeaturePayload) => void;
  onOpenMediaPicker: (options: {
    title: string;
    mediaType: "IMAGE" | "VIDEO";
    selectedMediaId?: string;
    allowClear?: boolean;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    onSelect: (mediaId: string | undefined) => void;
  }) => void;
}

export function SpecFeatureEditor({
  blockId,
  payload,
  selectableMedia,
  issues = [],
  onChange,
  onOpenMediaPicker,
}: SpecFeatureEditorProps) {
  const getIssue = (field: string) =>
    issues.find((i) => i.path.endsWith(`.${field}`) || i.path.endsWith(`[${field}]`))?.message;

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-spec-feature-${blockId}`}>
      <EditorField
        fieldId={`field-${blockId}-title`}
        label="Título de la característica"
        required
        helpText="Máximo 200 caracteres."
        error={getIssue("title")}
      >
        {(inputProps) => (
          <input
            type="text"
            {...inputProps}
            value={payload.title}
            onChange={(e) => onChange({ ...payload, title: e.target.value })}
            maxLength={200}
            className={styles.textInput}
            placeholder="Ej: Sensor PAW3950"
          />
        )}
      </EditorField>

      <EditorField
        fieldId={`field-${blockId}-badge`}
        label="Distintivo / Badge (opcional)"
        helpText="Máximo 50 caracteres. Texto breve que resalta una cualidad."
        error={getIssue("badge")}
      >
        {(inputProps) => (
          <input
            type="text"
            {...inputProps}
            value={payload.badge}
            onChange={(e) => onChange({ ...payload, badge: e.target.value })}
            maxLength={50}
            className={styles.textInput}
            placeholder="Ej: Flagship o 8000 Hz"
          />
        )}
      </EditorField>

      <EditorField
        fieldId={`field-${blockId}-description`}
        label="Descripción"
        required
        helpText="Máximo 2000 caracteres."
        error={getIssue("description")}
      >
        {(inputProps) => (
          <textarea
            {...inputProps}
            value={payload.description}
            onChange={(e) => onChange({ ...payload, description: e.target.value })}
            maxLength={2000}
            rows={4}
            className={styles.textareaInput}
            placeholder="Explicación detallada de la característica técnica"
          />
        )}
      </EditorField>

      <MediaField
        fieldId={`field-${blockId}-mediaId`}
        label="Imagen de apoyo (opcional)"
        mediaType="IMAGE"
        selectedMediaId={payload.mediaId}
        selectableMedia={selectableMedia}
        error={getIssue("mediaId")}
        onOpenPicker={(triggerRef) =>
          onOpenMediaPicker({
            title: "Seleccionar imagen para característica destacada",
            mediaType: "IMAGE",
            selectedMediaId: payload.mediaId,
            triggerRef,
            onSelect: (mediaId) => onChange({ ...payload, mediaId }),
          })
        }
        onClear={() => onChange({ ...payload, mediaId: undefined })}
      />
    </div>
  );
}

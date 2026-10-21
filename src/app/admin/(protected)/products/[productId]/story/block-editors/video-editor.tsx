"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import {
  getExactFieldIssue,
  type EditorVideoPayload,
} from "@/lib/admin/catalog/story-builder-model";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField, MediaField } from "./editor-field";
import styles from "../story-builder.module.css";

interface VideoEditorProps {
  blockId: string;
  payload: EditorVideoPayload;
  selectableMedia: readonly AdminStorySelectableMedia[];
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorVideoPayload) => void;
  onOpenMediaPicker: (options: {
    title: string;
    mediaType: "IMAGE" | "VIDEO";
    selectedMediaId?: string;
    allowClear?: boolean;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    onSelect: (mediaId: string | undefined) => void;
  }) => void;
}

export function VideoEditor({
  blockId,
  payload,
  selectableMedia,
  issues = [],
  onChange,
  onOpenMediaPicker,
}: VideoEditorProps) {
  const getIssue = (field: string) => getExactFieldIssue(issues, field);

  const hasAttachedVideos = selectableMedia.some((m) => m.mediaType === "VIDEO");

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-video-${blockId}`}>
      {!hasAttachedVideos && (
        <div className={styles.alertWarning} role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Este producto todavía no tiene videos MP4</strong>
            <p>Pulsa «Seleccionar video MP4» y sube un video MP4 para completar este bloque.</p>
          </div>
        </div>
      )}

      <MediaField
        fieldId={`field-${blockId}-videoMediaId`}
        label="Video MP4 del producto"
        required
        mediaType="VIDEO"
        selectedMediaId={payload.videoMediaId}
        selectableMedia={selectableMedia}
        helpText="Sube un video MP4 o elige uno que ya hayas subido."
        error={getIssue("videoMediaId")}
        onOpenPicker={(triggerRef) =>
          onOpenMediaPicker({
            title: "Seleccionar video del producto",
            mediaType: "VIDEO",
            selectedMediaId: payload.videoMediaId,
            triggerRef,
            onSelect: (videoMediaId) => onChange({ ...payload, videoMediaId }),
          })
        }
        onClear={() => onChange({ ...payload, videoMediaId: undefined })}
      />

      <MediaField
        fieldId={`field-${blockId}-posterMediaId`}
        label="Imagen de portada / Póster (opcional)"
        mediaType="IMAGE"
        selectedMediaId={payload.posterMediaId}
        selectableMedia={selectableMedia}
        helpText="Imagen visible antes de reproducir el video."
        error={getIssue("posterMediaId")}
        onOpenPicker={(triggerRef) =>
          onOpenMediaPicker({
            title: "Seleccionar afiche del video",
            mediaType: "IMAGE",
            selectedMediaId: payload.posterMediaId,
            triggerRef,
            onSelect: (posterMediaId) => onChange({ ...payload, posterMediaId }),
          })
        }
        onClear={() => onChange({ ...payload, posterMediaId: undefined })}
      />

      <EditorField
        fieldId={`field-${blockId}-title`}
        label="Título del video (opcional)"
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
            placeholder="Título o nombre del clip"
          />
        )}
      </EditorField>

      <EditorField
        fieldId={`field-${blockId}-caption`}
        label="Descripción / Leyenda (opcional)"
        helpText="Máximo 500 caracteres."
        error={getIssue("caption")}
      >
        {(inputProps) => (
          <textarea
            {...inputProps}
            value={payload.caption}
            onChange={(e) => onChange({ ...payload, caption: e.target.value })}
            maxLength={500}
            rows={2}
            className={styles.textareaInput}
            placeholder="Descripción que acompaña al video"
          />
        )}
      </EditorField>
    </div>
  );
}

"use client";

import React from "react";
import type { EditorHeroMediaPayload } from "@/lib/admin/catalog/story-builder-model";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField, MediaField } from "./editor-field";
import styles from "../story-builder.module.css";

interface HeroMediaEditorProps {
  blockId: string;
  payload: EditorHeroMediaPayload;
  selectableMedia: readonly AdminStorySelectableMedia[];
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorHeroMediaPayload) => void;
  onOpenMediaPicker: (options: {
    title: string;
    mediaType: "IMAGE" | "VIDEO";
    selectedMediaId?: string;
    allowClear?: boolean;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    onSelect: (mediaId: string | undefined) => void;
  }) => void;
}

export function HeroMediaEditor({
  blockId,
  payload,
  selectableMedia,
  issues = [],
  onChange,
  onOpenMediaPicker,
}: HeroMediaEditorProps) {
  const getIssue = (field: string) =>
    issues.find((i) => i.path.endsWith(`.${field}`) || i.path.endsWith(`[${field}]`))?.message;

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-hero-media-${blockId}`}>
      <p className={styles.sectionNotice}>
        La portada admite imagen de apertura, video y afiche de precarga. El renderizador público
        aplica la alternativa visual adecuada según el dispositivo.
      </p>

      <EditorField
        fieldId={`field-${blockId}-headline`}
        label="Encabezado"
        required
        helpText="Máximo 200 caracteres. Texto plano únicamente."
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
            placeholder="Título principal del producto"
          />
        )}
      </EditorField>

      <EditorField
        fieldId={`field-${blockId}-tagline`}
        label="Lema (opcional)"
        helpText="Máximo 500 caracteres. Breve frase descriptiva."
        error={getIssue("tagline")}
      >
        {(inputProps) => (
          <input
            type="text"
            {...inputProps}
            value={payload.tagline}
            onChange={(e) => onChange({ ...payload, tagline: e.target.value })}
            maxLength={500}
            className={styles.textInput}
            placeholder="Frase secundaria"
          />
        )}
      </EditorField>

      <EditorField
        fieldId={`field-${blockId}-body`}
        label="Cuerpo (opcional)"
        helpText="Máximo 1000 caracteres. Descripción editorial de apertura."
        error={getIssue("body")}
      >
        {(inputProps) => (
          <textarea
            {...inputProps}
            value={payload.body}
            onChange={(e) => onChange({ ...payload, body: e.target.value })}
            maxLength={1000}
            rows={3}
            className={styles.textareaInput}
            placeholder="Párrafo explicativo"
          />
        )}
      </EditorField>

      <div className={styles.mediaFieldsGrid}>
        <MediaField
          fieldId={`field-${blockId}-mediaId`}
          label="Imagen principal (opcional)"
          mediaType="IMAGE"
          selectedMediaId={payload.mediaId}
          selectableMedia={selectableMedia}
          error={getIssue("mediaId")}
          onOpenPicker={(triggerRef) =>
            onOpenMediaPicker({
              title: "Seleccionar imagen principal de portada",
              mediaType: "IMAGE",
              selectedMediaId: payload.mediaId,
              triggerRef,
              onSelect: (mediaId) => onChange({ ...payload, mediaId }),
            })
          }
          onClear={() => onChange({ ...payload, mediaId: undefined })}
        />

        <MediaField
          fieldId={`field-${blockId}-posterMediaId`}
          label="Afiche / Póster (opcional)"
          mediaType="IMAGE"
          selectedMediaId={payload.posterMediaId}
          selectableMedia={selectableMedia}
          error={getIssue("posterMediaId")}
          onOpenPicker={(triggerRef) =>
            onOpenMediaPicker({
              title: "Seleccionar póster de portada",
              mediaType: "IMAGE",
              selectedMediaId: payload.posterMediaId,
              triggerRef,
              onSelect: (posterMediaId) => onChange({ ...payload, posterMediaId }),
            })
          }
          onClear={() => onChange({ ...payload, posterMediaId: undefined })}
        />

        <MediaField
          fieldId={`field-${blockId}-videoMediaId`}
          label="Video MP4 (opcional)"
          mediaType="VIDEO"
          selectedMediaId={payload.videoMediaId}
          selectableMedia={selectableMedia}
          error={getIssue("videoMediaId")}
          onOpenPicker={(triggerRef) =>
            onOpenMediaPicker({
              title: "Seleccionar video de portada",
              mediaType: "VIDEO",
              selectedMediaId: payload.videoMediaId,
              triggerRef,
              onSelect: (videoMediaId) => onChange({ ...payload, videoMediaId }),
            })
          }
          onClear={() => onChange({ ...payload, videoMediaId: undefined })}
        />
      </div>
    </div>
  );
}

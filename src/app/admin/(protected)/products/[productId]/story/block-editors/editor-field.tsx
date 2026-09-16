"use client";

import React, { useRef } from "react";
import Image from "next/image";
import { Image as ImageIcon, Video as VideoIcon, X } from "lucide-react";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import styles from "../story-builder.module.css";

interface EditorFieldProps {
  fieldId: string;
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean;
  }) => React.ReactNode;
}

export function EditorField({
  fieldId,
  label,
  required = false,
  helpText,
  error,
  children,
}: EditorFieldProps) {
  const helpId = helpText ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.formGroup}>
      <label htmlFor={fieldId} className={styles.fieldLabel}>
        {label}
        {required && <span className={styles.requiredIndicator}> *</span>}
      </label>
      {helpText && (
        <p id={helpId} className={styles.fieldHelp}>
          {helpText}
        </p>
      )}
      {children({
        id: fieldId,
        "aria-describedby": describedBy,
        "aria-invalid": Boolean(error),
      })}
      {error && (
        <p id={errorId} className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface MediaFieldProps {
  fieldId: string;
  label: string;
  required?: boolean;
  mediaType: "IMAGE" | "VIDEO";
  selectedMediaId?: string;
  selectableMedia: readonly AdminStorySelectableMedia[];
  helpText?: string;
  error?: string;
  onOpenPicker: (triggerRef: React.RefObject<HTMLButtonElement | null>) => void;
  onClear?: () => void;
}

export function MediaField({
  fieldId,
  label,
  required = false,
  mediaType,
  selectedMediaId,
  selectableMedia,
  helpText,
  error,
  onOpenPicker,
  onClear,
}: MediaFieldProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const helpId = helpText ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  const selectedMedia = selectedMediaId
    ? selectableMedia.find((m) => m.productMediaId === selectedMediaId)
    : null;

  return (
    <div className={styles.formGroup}>
      <span className={styles.fieldLabel}>
        {label}
        {required && <span className={styles.requiredIndicator}> *</span>}
      </span>
      {helpText && (
        <p id={helpId} className={styles.fieldHelp}>
          {helpText}
        </p>
      )}

      <div
        id={fieldId}
        className={`${styles.mediaFieldWrapper} ${error ? styles.mediaFieldError : ""}`}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        tabIndex={-1}
      >
        {selectedMedia ? (
          <div className={styles.selectedMediaCard} data-testid={`selected-media-${fieldId}`}>
            <div className={styles.selectedMediaThumbnail}>
              {selectedMedia.mediaType === "IMAGE" ? (
                <Image
                  src={selectedMedia.publicUrl}
                  alt={selectedMedia.altText ?? "Imagen seleccionada"}
                  width={80}
                  height={60}
                  className={styles.mediaThumbnail}
                  unoptimized
                />
              ) : (
                <div className={styles.videoPlaceholderSmall}>
                  <VideoIcon size={20} aria-hidden="true" />
                  <span>MP4</span>
                </div>
              )}
            </div>
            <div className={styles.selectedMediaInfo}>
              {selectedMedia.variantTitle && (
                <span className={styles.variantBadge}>Variante: {selectedMedia.variantTitle}</span>
              )}
              {selectedMedia.altText && (
                <span className={styles.mediaAltText}>{selectedMedia.altText}</span>
              )}
              <span className={styles.mediaMeta}>
                {selectedMedia.width && selectedMedia.height
                  ? `${selectedMedia.width}×${selectedMedia.height} · `
                  : ""}
                {selectedMedia.mimeType}
              </span>
            </div>
            <div className={styles.selectedMediaActions}>
              <button
                ref={triggerRef}
                type="button"
                className={styles.secondaryButton}
                onClick={() => onOpenPicker(triggerRef)}
                aria-label={`Cambiar ${label.toLowerCase()}`}
                data-testid={`change-media-${fieldId}`}
              >
                Cambiar
              </button>
              {onClear && (
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={onClear}
                  aria-label={`Quitar ${label.toLowerCase()}`}
                  data-testid={`clear-media-${fieldId}`}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            ref={triggerRef}
            type="button"
            className={styles.mediaSelectTrigger}
            onClick={() => onOpenPicker(triggerRef)}
            aria-label={`Seleccionar ${label.toLowerCase()}`}
            data-testid={`select-media-${fieldId}`}
          >
            {mediaType === "IMAGE" ? (
              <ImageIcon size={20} aria-hidden="true" />
            ) : (
              <VideoIcon size={20} aria-hidden="true" />
            )}
            <span>{mediaType === "IMAGE" ? "Seleccionar imagen" : "Seleccionar video MP4"}</span>
          </button>
        )}
      </div>

      {error && (
        <p id={errorId} className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

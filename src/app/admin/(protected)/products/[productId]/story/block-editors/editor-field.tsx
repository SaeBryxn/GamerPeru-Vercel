"use client";

import React, { useRef } from "react";
import Image from "next/image";
import { Image as ImageIcon, Play, Trash2, Video as VideoIcon } from "lucide-react";
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

/**
 * Reproduce en silencio la vista previa de un video mientras el puntero o el foco están sobre su
 * contenedor, y la pausa al salir. Los manejadores se aplican al contenedor (la tarjeta o la
 * opción del selector) para que enfocar sus botones también muestre el video.
 */
export function useVideoHoverPreview() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      // El navegador puede rechazar play() (ahorro de datos, pestaña en segundo plano): se ignora.
      void Promise.resolve(video.play()).catch(() => undefined);
    } catch {
      // Entornos sin soporte de medios.
    }
  };

  const pause = () => {
    const video = videoRef.current;
    if (video && !video.paused) video.pause();
  };

  const previewHandlers = {
    onMouseEnter: play,
    onMouseLeave: pause,
    onFocus: play,
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      pause();
    },
  };

  return { videoRef, previewHandlers };
}

interface VideoThumbProps {
  src: string;
  label: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Ocupa todo el ancho disponible (selector) en vez del tamaño fijo de 128×72. */
  fill?: boolean;
}

export function VideoThumb({ src, label, videoRef, fill = false }: VideoThumbProps) {
  return (
    <div className={`${styles.videoThumb} ${fill ? styles.videoThumbFill : ""}`}>
      {/* #t=0.1 obliga a pintar el primer cuadro con preload="metadata" en Safari y Chrome. */}
      <video
        ref={videoRef}
        src={`${src}#t=0.1`}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={label}
        className={styles.videoThumbMedia}
        data-testid="video-thumb"
      />
      <span className={styles.videoThumbBadge} aria-hidden="true">
        <Play size={10} />
        MP4
      </span>
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
  const { videoRef, previewHandlers } = useVideoHoverPreview();
  const helpId = helpText ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  const selectedMedia = selectedMediaId
    ? selectableMedia.find((m) => m.productMediaId === selectedMediaId)
    : null;
  const isVideo = selectedMedia?.mediaType === "VIDEO";

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
          <div
            className={styles.selectedMediaCard}
            data-testid={`selected-media-${fieldId}`}
            {...(isVideo ? previewHandlers : {})}
          >
            <div className={styles.selectedMediaPreview}>
              {isVideo ? (
                <VideoThumb
                  src={selectedMedia.publicUrl}
                  label={`Vista previa: ${selectedMedia.altText ?? label}`}
                  videoRef={videoRef}
                />
              ) : (
                <div className={styles.selectedMediaThumbnail}>
                  <Image
                    src={selectedMedia.publicUrl}
                    alt={selectedMedia.altText ?? "Imagen seleccionada"}
                    width={80}
                    height={60}
                    className={styles.mediaThumbnail}
                    unoptimized
                  />
                </div>
              )}
              {onClear && (
                <button
                  type="button"
                  className={styles.mediaClearButton}
                  onClick={onClear}
                  aria-label={isVideo ? "Quitar video" : `Quitar ${label.toLowerCase()}`}
                  title={isVideo ? "Quitar video" : "Quitar imagen"}
                  data-testid={`clear-media-${fieldId}`}
                >
                  <span className={styles.mediaClearIcon}>
                    <Trash2 size={14} aria-hidden="true" />
                  </span>
                </button>
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

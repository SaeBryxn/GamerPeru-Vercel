"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ImageUp, LoaderCircle, Search, Video, X } from "lucide-react";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import {
  STORY_IMAGE_ACCEPT,
  uploadStoryImage,
  type StoryImageUploadStage,
} from "./story-image-upload";
import styles from "./story-builder.module.css";

const STAGE_LABEL: Record<StoryImageUploadStage, string> = {
  authorizing: "Preparando la subida…",
  uploading: "Subiendo imagen…",
  processing: "Optimizando imagen…",
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface MediaPickerDialogProps {
  isOpen: boolean;
  productId: string;
  /** Called with an image uploaded from the picker, before it is selected. */
  onUploaded: (media: AdminStorySelectableMedia) => void;
  title: string;
  mediaType: "IMAGE" | "VIDEO";
  selectableMedia: readonly AdminStorySelectableMedia[];
  selectedMediaId?: string;
  allowClear?: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  onSelect: (mediaId: string | undefined) => void;
  onClose: () => void;
}

export function MediaPickerDialog({
  isOpen,
  productId,
  onUploaded,
  title,
  mediaType,
  selectableMedia,
  selectedMediaId,
  allowClear = true,
  triggerRef,
  onSelect,
  onClose,
}: MediaPickerDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [uploadStage, setUploadStage] = useState<StoryImageUploadStage | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    const result = await uploadStoryImage(productId, file, setUploadStage);
    setUploadStage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    onUploaded(result.media);
    onSelect(result.media.productMediaId);
    onClose();
    window.setTimeout(() => triggerRef.current?.focus(), 10);
  };

  const filteredMedia = selectableMedia.filter((media) => {
    if (media.mediaType !== mediaType) return false;
    if (!filterQuery.trim()) return true;
    const query = filterQuery.toLowerCase();
    const alt = (media.altText ?? "").toLowerCase();
    const variant = (media.variantTitle ?? "").toLowerCase();
    return alt.includes(query) || variant.includes(query);
  });

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusFirst = () => {
      if (dialog.contains(document.activeElement) && document.activeElement !== dialog) {
        return;
      }
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? dialog).focus();
    };
    focusFirst();
    const timer = window.setTimeout(focusFirst, 10);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        window.setTimeout(() => triggerRef.current?.focus(), 10);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !dialog.contains(target)) {
        event.stopPropagation();
        focusFirst();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} role="presentation">
      <div
        ref={dialogRef}
        className={`${styles.modalContent} ${styles.mediaModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-picker-title"
        tabIndex={-1}
        data-testid="media-picker-dialog"
      >
        <div className={styles.modalHeader}>
          <div>
            <h2 id="media-picker-title">{title}</h2>
            <p>
              {mediaType === "IMAGE"
                ? "Sube una imagen solo para la historia o elige una existente. Las imágenes que subas aquí no aparecen en la galería del producto."
                : "Selecciona un video público MP4 adjunto al producto."}
            </p>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              onClose();
              window.setTimeout(() => triggerRef.current?.focus(), 10);
            }}
            aria-label="Cerrar selector multimedia"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {mediaType === "IMAGE" && (
          <div className={styles.storyUpload}>
            <input
              ref={fileInputRef}
              type="file"
              accept={STORY_IMAGE_ACCEPT}
              className={styles.visuallyHiddenInput}
              onChange={(event) => void handleFile(event.target.files?.[0])}
              data-testid="story-image-upload-input"
              tabIndex={-1}
              aria-hidden="true"
            />
            <button
              type="button"
              className={styles.storyUploadButton}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadStage !== null}
              data-testid="story-image-upload-button"
            >
              {uploadStage ? (
                <LoaderCircle size={18} className={styles.spinner} aria-hidden="true" />
              ) : (
                <ImageUp size={18} aria-hidden="true" />
              )}
              <span>
                {uploadStage ? STAGE_LABEL[uploadStage] : "Subir imagen para la historia"}
              </span>
            </button>
            <p className={styles.storyUploadHint} aria-live="polite">
              {uploadError ??
                "JPEG, PNG, WebP o AVIF hasta 10 MB. Para banners a todo lo ancho, usa al menos 2400 px de ancho."}
            </p>
          </div>
        )}

        <div className={styles.pickerSearch}>
          <Search size={16} aria-hidden="true" className={styles.searchIcon} />
          <input
            type="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filtrar por texto alternativo o variante…"
            aria-label="Filtrar archivos multimedia"
            className={styles.searchInput}
          />
        </div>

        {allowClear && selectedMediaId && (
          <div className={styles.pickerActionsRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                onSelect(undefined);
                onClose();
                window.setTimeout(() => triggerRef.current?.focus(), 10);
              }}
              data-testid="media-picker-clear"
            >
              Quitar selección actual
            </button>
          </div>
        )}

        <div
          role="listbox"
          aria-label={title}
          className={styles.mediaGrid}
          data-testid="media-picker-list"
        >
          {filteredMedia.length === 0 ? (
            <p className={styles.emptySearchMessage}>
              {selectableMedia.filter((m) => m.mediaType === mediaType).length === 0
                ? mediaType === "IMAGE"
                  ? "No hay imágenes disponibles adjuntas a este producto."
                  : "No hay videos MP4 disponibles adjuntos a este producto."
                : "No se encontraron archivos multimedia que coincidan con la búsqueda."}
            </p>
          ) : (
            filteredMedia.map((media) => {
              const isSelected = media.productMediaId === selectedMediaId;
              return (
                <div
                  key={media.productMediaId}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  className={`${styles.mediaOption} ${isSelected ? styles.mediaOptionSelected : ""}`}
                  onClick={() => {
                    onSelect(media.productMediaId);
                    onClose();
                    window.setTimeout(() => triggerRef.current?.focus(), 10);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(media.productMediaId);
                      onClose();
                      window.setTimeout(() => triggerRef.current?.focus(), 10);
                    }
                  }}
                  data-testid={`media-option-${media.productMediaId}`}
                >
                  <div className={styles.mediaThumbnailWrapper}>
                    {media.mediaType === "IMAGE" ? (
                      <Image
                        src={media.publicUrl}
                        alt={media.altText ?? "Miniatura multimedia"}
                        width={120}
                        height={90}
                        className={styles.mediaThumbnail}
                        unoptimized
                      />
                    ) : (
                      <div className={styles.videoPlaceholder}>
                        <Video size={32} aria-hidden="true" />
                        <span>MP4</span>
                      </div>
                    )}
                  </div>
                  <div className={styles.mediaDetails}>
                    {media.placement === "STORY" && (
                      <span className={styles.storyBadge}>Solo historia</span>
                    )}
                    {media.variantTitle && (
                      <span className={styles.variantBadge}>Variante: {media.variantTitle}</span>
                    )}
                    {media.altText && <span className={styles.mediaAltText}>{media.altText}</span>}
                    <span className={styles.mediaMeta}>
                      {media.width && media.height ? `${media.width}×${media.height} · ` : ""}
                      {media.mimeType}
                    </span>
                    <span
                      className={`${styles.selectionStateText} ${
                        isSelected ? styles.selectionStateActive : ""
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check size={14} aria-hidden="true" /> Seleccionado
                        </>
                      ) : (
                        "Click para seleccionar"
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

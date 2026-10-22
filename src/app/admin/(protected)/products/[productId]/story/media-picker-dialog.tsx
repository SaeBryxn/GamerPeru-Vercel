"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ImageUp, LoaderCircle, Search, Trash2, Video, X } from "lucide-react";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import { useVideoHoverPreview, VideoThumb } from "./block-editors/editor-field";
import {
  STORY_IMAGE_ACCEPT,
  STORY_VIDEO_ACCEPT,
  uploadStoryMedia,
  type StoryImageUploadStage,
} from "./story-image-upload";
import styles from "./story-builder.module.css";

const STAGE_LABEL: Record<"IMAGE" | "VIDEO", Record<StoryImageUploadStage, string>> = {
  IMAGE: {
    authorizing: "Preparando la subida…",
    uploading: "Subiendo imagen…",
    processing: "Registrando imagen…",
  },
  VIDEO: {
    authorizing: "Preparando la subida…",
    uploading: "Subiendo video…",
    processing: "Registrando video…",
  },
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type DeleteStoryMediaResult = { ok: true } | { ok: false; error: string };

/** Nombre visible de un medio: su texto alternativo o «Video N» según su orden en el producto. */
function getMediaDisplayName(
  media: AdminStorySelectableMedia,
  allMedia: readonly AdminStorySelectableMedia[]
): string {
  if (media.altText) return media.altText;
  const sameType = allMedia.filter((m) => m.mediaType === media.mediaType);
  const position = sameType.findIndex((m) => m.productMediaId === media.productMediaId) + 1;
  return `${media.mediaType === "VIDEO" ? "Video" : "Imagen"} ${position}`;
}

interface MediaOptionProps {
  media: AdminStorySelectableMedia;
  displayName: string;
  isSelected: boolean;
  onChoose: () => void;
}

function MediaOption({ media, displayName, isSelected, onChoose }: MediaOptionProps) {
  const { videoRef, previewHandlers } = useVideoHoverPreview();
  const isVideo = media.mediaType === "VIDEO";

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={`${styles.mediaOption} ${isSelected ? styles.mediaOptionSelected : ""}`}
      onClick={onChoose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChoose();
        }
      }}
      {...(isVideo ? previewHandlers : {})}
      data-testid={`media-option-${media.productMediaId}`}
    >
      {isVideo ? (
        <VideoThumb
          src={media.publicUrl}
          label={`Vista previa: ${displayName}`}
          videoRef={videoRef}
          fill
        />
      ) : (
        <div className={styles.mediaThumbnailWrapper}>
          <Image
            src={media.publicUrl}
            alt={media.altText ?? "Miniatura multimedia"}
            width={120}
            height={90}
            className={styles.mediaThumbnail}
            unoptimized
          />
        </div>
      )}
      <div className={styles.mediaDetails}>
        {media.placement === "STORY" && <span className={styles.storyBadge}>Solo historia</span>}
        {media.variantTitle && (
          <span className={styles.variantBadge}>Variante: {media.variantTitle}</span>
        )}
        {(isVideo || Boolean(media.altText)) && (
          <span className={styles.mediaAltText}>{displayName}</span>
        )}
        <span className={styles.mediaMeta}>
          {media.width && media.height ? `${media.width}×${media.height} · ` : ""}
          {media.mimeType}
        </span>
        <span
          className={`${styles.selectionStateText} ${isSelected ? styles.selectionStateActive : ""}`}
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
}

interface MediaPickerDialogProps {
  isOpen: boolean;
  productId: string;
  /** Called with an image or video uploaded from the picker, before it is selected. */
  onUploaded: (media: AdminStorySelectableMedia) => void;
  title: string;
  mediaType: "IMAGE" | "VIDEO";
  selectableMedia: readonly AdminStorySelectableMedia[];
  selectedMediaId?: string;
  allowClear?: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  onSelect: (mediaId: string | undefined) => void;
  onClose: () => void;
  /**
   * Desvincula del producto un video subido solo para la historia. Si se omite, el selector no
   * ofrece la acción «Eliminar del producto».
   */
  onDeleteFromProduct?: (media: AdminStorySelectableMedia) => Promise<DeleteStoryMediaResult>;
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
  onDeleteFromProduct,
}: MediaPickerDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const confirmingDeleteIdRef = useRef<string | null>(null);
  const deleteTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmingDeleteIdRef.current = confirmingDeleteId;
    if (confirmingDeleteId) cancelDeleteRef.current?.focus();
  }, [confirmingDeleteId]);

  const cancelDelete = () => {
    const id = confirmingDeleteIdRef.current;
    setConfirmingDeleteId(null);
    if (id) window.setTimeout(() => deleteTriggerRefs.current.get(id)?.focus(), 0);
  };

  const confirmDelete = async (media: AdminStorySelectableMedia) => {
    if (!onDeleteFromProduct) return;
    setDeletingId(media.productMediaId);
    setDeleteMessage(null);
    const result = await onDeleteFromProduct(media);
    setDeletingId(null);
    setConfirmingDeleteId(null);
    if (!result.ok) {
      setDeleteMessage(result.error);
      window.setTimeout(() => deleteTriggerRefs.current.get(media.productMediaId)?.focus(), 0);
      return;
    }
    setDeleteMessage("Video eliminado del producto.");
    dialogRef.current?.focus();
  };
  const [filterQuery, setFilterQuery] = useState("");
  const [uploadStage, setUploadStage] = useState<StoryImageUploadStage | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    const result = await uploadStoryMedia(productId, file, mediaType, setUploadStage);
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

  const storyVideos =
    mediaType === "VIDEO"
      ? selectableMedia.filter((m) => m.mediaType === "VIDEO" && m.placement === "STORY")
      : [];

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
        // Con una confirmación abierta, Escape solo la cancela.
        const confirmingId = confirmingDeleteIdRef.current;
        if (confirmingId) {
          setConfirmingDeleteId(null);
          window.setTimeout(() => deleteTriggerRefs.current.get(confirmingId)?.focus(), 0);
          return;
        }
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
                : "Sube un video MP4 solo para la historia o elige uno existente."}
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

        <div className={styles.storyUpload}>
          <input
            ref={fileInputRef}
            type="file"
            accept={mediaType === "VIDEO" ? STORY_VIDEO_ACCEPT : STORY_IMAGE_ACCEPT}
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
            ) : mediaType === "VIDEO" ? (
              <Video size={18} aria-hidden="true" />
            ) : (
              <ImageUp size={18} aria-hidden="true" />
            )}
            <span>
              {uploadStage
                ? STAGE_LABEL[mediaType][uploadStage]
                : mediaType === "VIDEO"
                  ? "Subir video para la historia"
                  : "Subir imagen para la historia"}
            </span>
          </button>
          <p className={styles.storyUploadHint} aria-live="polite">
            {uploadError ??
              (mediaType === "VIDEO"
                ? "MP4 (H.264) hasta 50 MB. Los videos .MOV del iPhone deben exportarse como MP4."
                : "JPEG, PNG o WebP hasta 10 MB. Para banners a todo lo ancho, usa al menos 2400 px de ancho.")}
          </p>
        </div>

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
            filteredMedia.map((media) => (
              <MediaOption
                key={media.productMediaId}
                media={media}
                displayName={getMediaDisplayName(media, selectableMedia)}
                isSelected={media.productMediaId === selectedMediaId}
                onChoose={() => {
                  onSelect(media.productMediaId);
                  onClose();
                  window.setTimeout(() => triggerRef.current?.focus(), 10);
                }}
              />
            ))
          )}
        </div>

        {onDeleteFromProduct && storyVideos.length > 0 && (
          <section
            className={styles.storyMediaManager}
            aria-labelledby="story-media-manager-title"
            data-testid="story-media-manager"
          >
            <h3 id="story-media-manager-title">Videos subidos para la historia</h3>
            <p className={styles.storyUploadHint}>
              «Eliminar del producto» lo quita del producto y de los bloques que lo usan, que
              quedarán pendientes hasta que elijas otro video.
            </p>
            <ul className={styles.storyMediaManagerList}>
              {storyVideos.map((media) => {
                const name = getMediaDisplayName(media, selectableMedia);
                const isConfirming = confirmingDeleteId === media.productMediaId;
                const isDeleting = deletingId === media.productMediaId;
                const questionId = `delete-story-media-${media.productMediaId}`;
                return (
                  <li key={media.productMediaId} className={styles.storyMediaManagerRow}>
                    <span className={styles.storyMediaManagerName}>
                      <Video size={16} aria-hidden="true" />
                      {name}
                    </span>
                    {isConfirming ? (
                      <div
                        role="group"
                        aria-labelledby={questionId}
                        className={styles.storyMediaConfirm}
                      >
                        <p id={questionId}>¿Eliminar «{name}» del producto?</p>
                        <button
                          ref={cancelDeleteRef}
                          type="button"
                          className={styles.secondaryButton}
                          onClick={cancelDelete}
                          disabled={isDeleting}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className={styles.dangerSolidButton}
                          onClick={() => void confirmDelete(media)}
                          disabled={isDeleting}
                          data-testid={`confirm-delete-media-${media.productMediaId}`}
                        >
                          {isDeleting ? (
                            <LoaderCircle size={16} className={styles.spinner} aria-hidden="true" />
                          ) : (
                            <Trash2 size={16} aria-hidden="true" />
                          )}
                          {isDeleting ? "Eliminando…" : "Sí, eliminar"}
                        </button>
                      </div>
                    ) : (
                      <button
                        ref={(node) => {
                          if (node) deleteTriggerRefs.current.set(media.productMediaId, node);
                          else deleteTriggerRefs.current.delete(media.productMediaId);
                        }}
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => {
                          setDeleteMessage(null);
                          setConfirmingDeleteId(media.productMediaId);
                        }}
                        disabled={deletingId !== null}
                        aria-label={`Eliminar del producto: ${name}`}
                        data-testid={`delete-media-${media.productMediaId}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        Eliminar del producto
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <p className={styles.storyMediaManagerStatus} role="status">
          {deleteMessage}
        </p>
      </div>
    </div>
  );
}

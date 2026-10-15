"use client";

import React, { useId, useState } from "react";
import { ImageOff, Upload, Video } from "lucide-react";
import {
  confirmHomeMediaUploadAction,
  requestHomeMediaUploadAction,
} from "@/lib/home/home-media-actions";
import type { HomeImageSlot, HomeVideoSourceContent } from "@/lib/home/section-schemas";
import { uploadDirect, type DirectUploadStage } from "@/lib/media/direct-upload-client";
import { directUploadAccept, type DirectUploadPurpose } from "@/lib/media/direct-upload-policy";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import styles from "./home-editor.module.css";

export interface EditorMedia {
  url: string | null;
  mediaType: "IMAGE" | "VIDEO" | "DOCUMENT";
}

const STAGE_LABEL: Record<DirectUploadStage, string> = {
  preparing: "Preparando…",
  authorizing: "Autorizando…",
  uploading: "Subiendo…",
  processing: "Registrando…",
};

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/** Accepts a bare id or any common YouTube link and returns the 11-character id. */
export function extractYouTubeId(input: string): string {
  const value = input.trim();
  if (YOUTUBE_ID_REGEX.test(value)) return value;
  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("v");
    if (fromQuery && YOUTUBE_ID_REGEX.test(fromQuery)) return fromQuery;
    const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (YOUTUBE_ID_REGEX.test(last)) return last;
  } catch {
    // Not a URL: return it as typed so validation can explain the problem.
  }
  return value;
}

interface UploadButtonProps {
  purpose: DirectUploadPurpose;
  label: string;
  onUploaded: (assetId: string, media: EditorMedia) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

/** Uploads one file straight to R2 and reports the registered asset. */
function UploadButton({ purpose, label, onUploaded, onError, disabled }: UploadButtonProps) {
  const inputId = useId();
  const [stage, setStage] = useState<DirectUploadStage | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const result = await uploadDirect({
      purpose,
      file,
      request: (input) => requestHomeMediaUploadAction({ purpose, ...input }),
      confirm: (input) => confirmHomeMediaUploadAction({ purpose, ...input }),
      onStage: setStage,
    });
    setStage(null);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onUploaded(result.data.mediaAssetId, {
      url: resolvePublicMediaUrl(result.data.objectKey),
      mediaType: result.data.mediaType,
    });
  };

  return (
    <span className={styles.uploadButton}>
      <input
        id={inputId}
        type="file"
        accept={directUploadAccept(purpose)}
        className={styles.visuallyHidden}
        disabled={(disabled ?? false) || stage !== null}
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <label htmlFor={inputId} className={styles.secondaryButton} aria-disabled={stage !== null}>
        <Upload size={14} aria-hidden="true" />
        {stage ? STAGE_LABEL[stage] : label}
      </label>
      <span className={styles.visuallyHidden} aria-live="polite">
        {stage ? STAGE_LABEL[stage] : ""}
      </span>
    </span>
  );
}

interface ImageSlotFieldProps {
  label: string;
  hint?: string;
  value: HomeImageSlot;
  media: Record<string, EditorMedia>;
  error?: string;
  onChange: (next: HomeImageSlot) => void;
  onMediaAdded: (assetId: string, media: EditorMedia) => void;
}

export function ImageSlotField({
  label,
  hint,
  value,
  media,
  error,
  onChange,
  onMediaAdded,
}: ImageSlotFieldProps) {
  const altId = useId();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const preview = value.mediaAssetId ? media[value.mediaAssetId]?.url : null;

  return (
    <fieldset className={styles.mediaField}>
      <legend className={styles.fieldLabel}>{label}</legend>
      {hint && <p className={styles.fieldHint}>{hint}</p>}
      <div className={styles.mediaRow}>
        <div className={styles.mediaPreview}>
          {preview ? (
            // Admin preview of an uploaded asset; the storefront serves it through next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" />
          ) : (
            <span className={styles.mediaEmpty}>
              <ImageOff size={18} aria-hidden="true" />
              Sin imagen
            </span>
          )}
        </div>
        <div className={styles.mediaActions}>
          <UploadButton
            purpose="home_image"
            label={value.mediaAssetId ? "Cambiar imagen" : "Subir imagen"}
            onError={setUploadError}
            onUploaded={(assetId, uploaded) => {
              setUploadError(null);
              onMediaAdded(assetId, uploaded);
              onChange({ ...value, mediaAssetId: assetId });
            }}
          />
          {value.mediaAssetId && (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => onChange({ ...value, mediaAssetId: null })}
            >
              Quitar imagen
            </button>
          )}
        </div>
      </div>
      <label htmlFor={altId} className={styles.fieldLabel}>
        Texto alternativo
      </label>
      <input
        id={altId}
        className={styles.input}
        value={value.alt}
        maxLength={200}
        onChange={(event) => onChange({ ...value, alt: event.target.value })}
        aria-invalid={Boolean(error)}
      />
      <p className={styles.fieldHint}>Describe la imagen para quien no puede verla.</p>
      {(uploadError ?? error) && (
        <p className={styles.fieldError} role="alert">
          {uploadError ?? error}
        </p>
      )}
    </fieldset>
  );
}

interface VideoSourceFieldProps {
  label: string;
  value: HomeVideoSourceContent;
  media: Record<string, EditorMedia>;
  error?: string;
  onChange: (next: HomeVideoSourceContent | UploadDraft) => void;
  onMediaAdded: (assetId: string, media: EditorMedia) => void;
}

/** An upload in progress: the schema requires both files, so the form holds the partial state. */
export interface UploadDraft {
  kind: "upload";
  videoAssetId: string | null;
  posterAssetId: string | null;
}

export function VideoSourceField({
  label,
  value,
  media,
  error,
  onChange,
  onMediaAdded,
}: VideoSourceFieldProps) {
  const youtubeId = useId();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const draft = value as HomeVideoSourceContent | UploadDraft;
  const videoUrl =
    draft.kind === "upload" && draft.videoAssetId ? media[draft.videoAssetId]?.url : null;
  const posterUrl =
    draft.kind === "upload" && draft.posterAssetId ? media[draft.posterAssetId]?.url : null;

  return (
    <fieldset className={styles.mediaField}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.segmented} role="radiogroup" aria-label="Origen del video">
        <label className={styles.segment}>
          <input
            type="radio"
            checked={draft.kind === "upload"}
            onChange={() => onChange({ kind: "upload", videoAssetId: null, posterAssetId: null })}
          />
          Archivo de video
        </label>
        <label className={styles.segment}>
          <input
            type="radio"
            checked={draft.kind === "youtube"}
            onChange={() => onChange({ kind: "youtube", videoId: "" })}
          />
          YouTube
        </label>
      </div>

      {draft.kind === "youtube" ? (
        <>
          <label htmlFor={youtubeId} className={styles.fieldLabel}>
            Enlace o código del video de YouTube
          </label>
          <input
            id={youtubeId}
            className={styles.input}
            value={draft.videoId}
            onChange={(event) =>
              onChange({ kind: "youtube", videoId: extractYouTubeId(event.target.value) })
            }
            aria-invalid={Boolean(error)}
          />
          <p className={styles.fieldHint}>
            YouTube carga reproductor, fuentes y anuncios de terceros. Un archivo propio pesa menos
            y no depende de otro sitio.
          </p>
        </>
      ) : (
        <div className={styles.videoGrid}>
          <div>
            <div className={styles.mediaPreview}>
              {videoUrl ? (
                <video src={videoUrl} muted playsInline preload="metadata" controls />
              ) : (
                <span className={styles.mediaEmpty}>
                  <Video size={18} aria-hidden="true" />
                  Sin video
                </span>
              )}
            </div>
            <UploadButton
              purpose="home_video"
              label={draft.videoAssetId ? "Cambiar video" : "Subir video"}
              onError={setUploadError}
              onUploaded={(assetId, uploaded) => {
                setUploadError(null);
                onMediaAdded(assetId, uploaded);
                onChange({ ...draft, videoAssetId: assetId });
              }}
            />
            <p className={styles.fieldHint}>MP4 (H.264) o WebM, hasta 25 MB. Sin sonido.</p>
          </div>
          <div>
            <div className={styles.mediaPreview}>
              {posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={posterUrl} alt="" />
              ) : (
                <span className={styles.mediaEmpty}>
                  <ImageOff size={18} aria-hidden="true" />
                  Sin portada
                </span>
              )}
            </div>
            <UploadButton
              purpose="home_video_poster"
              label={draft.posterAssetId ? "Cambiar portada" : "Subir portada"}
              onError={setUploadError}
              onUploaded={(assetId, uploaded) => {
                setUploadError(null);
                onMediaAdded(assetId, uploaded);
                onChange({ ...draft, posterAssetId: assetId });
              }}
            />
            <p className={styles.fieldHint}>
              Primer cuadro que se ve mientras carga y lo único que ven quienes evitan animaciones.
            </p>
          </div>
        </div>
      )}
      {(uploadError ?? error) && (
        <p className={styles.fieldError} role="alert">
          {uploadError ?? error}
        </p>
      )}
    </fieldset>
  );
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { uploadDirect } from "@/lib/media/direct-upload-client";
import {
  requestReviewPhotoAction,
  confirmReviewPhotoAction,
  abortReviewPhotoAction,
} from "@/lib/reviews/photo-actions";
import { REVIEW_PHOTO_LIMIT } from "@/lib/reviews/types";
import styles from "./pdp-reviews.module.css";

type Photo = { id: string; url: string | null };

export function ReviewPhotoUpload({
  productId,
  photos,
  onChange,
  onBusy,
  disabled,
}: {
  productId: string;
  photos: Photo[];
  onChange: (next: Photo[]) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => () => controller.current?.abort(), []);

  const upload = async (files: File[]) => {
    if (busy || disabled || !files.length) return;
    if (photos.length + files.length > REVIEW_PHOTO_LIMIT) {
      setError("Puedes adjuntar hasta 3 fotos.");
      return;
    }
    if (
      files.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) ||
          file.size > 20 * 1024 * 1024
      )
    ) {
      setError("Usa JPEG, PNG, WebP o AVIF de hasta 20 MB. Optimizamos cada foto antes de subir.");
      return;
    }
    controller.current = new AbortController();
    setBusy(true);
    onBusy(true);
    setError("");
    const next = [...photos];
    try {
      for (const file of files) {
        setProgress(0);
        const result = await uploadDirect({
          purpose: "review_photo",
          file,
          signal: controller.current.signal,
          onProgress: setProgress,
          request: (input) => requestReviewPhotoAction({ ...input, productId }),
          confirm: ({ uploadId }) => confirmReviewPhotoAction({ uploadId, productId }),
          abort: abortReviewPhotoAction,
        });
        if (!result.ok) {
          setError(result.error);
          break;
        }
        next.push(result.data);
        onChange([...next]);
      }
    } catch {
      setError("No se pudo subir la foto. Vuelve a intentarlo.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <fieldset className={styles.photoField} disabled={disabled}>
      <legend>Fotos de tu compra (opcional)</legend>
      <p className={styles.formNote}>
        Hasta 3 fotos. Las revisaremos junto con tu opinión antes de publicarlas.
      </p>
      <ul className={styles.photos}>
        {photos.map((photo, index) => (
          <li key={photo.id}>
            {photo.url && (
              <Image src={photo.url} width={100} height={100} alt={`Foto adjunta ${index + 1}`} />
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(photos.filter((item) => item.id !== photo.id))}
              aria-label={`Quitar foto ${index + 1}`}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <label className={styles.field}>
        <span>Adjuntar fotos ({photos.length}/3)</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          disabled={busy || photos.length >= REVIEW_PHOTO_LIMIT}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void upload(files);
          }}
        />
      </label>
      {busy && (
        <div role="status">
          <span>Subiendo foto… {progress}%</span>{" "}
          <button type="button" onClick={() => controller.current?.abort()}>
            Cancelar subida
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className={styles.formError}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

import { abortUpload, trackPendingUpload, forgetPendingUpload } from "./upload-api-client";
import { ImagePreparationError, compressImageForUpload } from "./compress-image";
import {
  DIRECT_UPLOAD_POLICIES,
  checkDirectUpload,
  type DirectUploadPurpose,
} from "./direct-upload-policy";

export type DirectUploadStage = "preparing" | "authorizing" | "uploading" | "processing";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

export interface DirectUploadClientOptions<Confirmed> {
  purpose: DirectUploadPurpose;
  file: File;
  /** Server action that signs the upload for this exact type and size. */
  request: (input: { mimeType: string; fileSizeBytes: number }) => Promise<
    ActionResult<{
      uploadId: string;
      putUrl: string;
      requiredHeaders: Record<string, string>;
    }>
  >;
  /** Server action that verifies the stored object and registers it. */
  confirm: (input: {
    uploadId: string;
    width: number | null;
    height: number | null;
  }) => Promise<ActionResult<Confirmed>>;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  onStage?: (stage: DirectUploadStage) => void;
}

export type DirectUploadClientResult<Confirmed> =
  { ok: true; data: Confirmed } | { ok: false; error: string };

interface Dimensions {
  width: number | null;
  height: number | null;
}

const UNKNOWN_SIZE: Dimensions = { width: null, height: null };

async function measureImage(file: File): Promise<Dimensions> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return UNKNOWN_SIZE;
  }
}

function measureVideo(file: File): Promise<Dimensions> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (size: Dimensions) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(size);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      done({ width: video.videoWidth || null, height: video.videoHeight || null });
    video.onerror = () => done(UNKNOWN_SIZE);
    video.src = url;
  });
}

/**
 * Uploads a file straight to R2 (ADR-012): images are scaled and re-encoded in the browser
 * first, videos are sent as exported. The server signs the request (type, size and caching are
 * part of the signature), the browser PUTs the bytes to the bucket, and the server registers the
 * object after a HEAD check. The file never passes through the Worker.
 */
export async function uploadDirect<Confirmed>({
  purpose,
  file,
  request,
  confirm,
  onStage,
  onProgress,
  signal,
}: DirectUploadClientOptions<Confirmed>): Promise<DirectUploadClientResult<Confirmed>> {
  if (signal?.aborted) return { ok: false, error: "Subida cancelada." };
  if (/\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)) {
    return {
      ok: false,
      error: "HEIC no es compatible. Convierte la imagen a JPEG, PNG, WebP o AVIF.",
    };
  }
  if (
    purpose === "gallery_image" &&
    (file.size > 20 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type))
  ) {
    return {
      ok: false,
      error: "Usa JPEG, PNG, WebP o AVIF de hasta 20 MB. La imagen se optimiza antes de subir.",
    };
  }
  const policy = DIRECT_UPLOAD_POLICIES[purpose];
  // Re-encoded purposes accept any decodable still image: what is checked is the prepared output.
  if (!policy.alwaysReencode) {
    const unsupported = checkDirectUpload(purpose, { type: file.type, size: 1 });
    if (unsupported) return { ok: false, error: unsupported.message };
  }

  onStage?.("preparing");
  let prepared: File;
  try {
    prepared = policy.maxImageDimension
      ? await compressImageForUpload(file, {
          maxDimension: policy.maxImageDimension,
          alwaysReencode: policy.alwaysReencode,
        })
      : file;
  } catch (error) {
    if (error instanceof ImagePreparationError) return { ok: false, error: error.message };
    throw error;
  }
  const problem = checkDirectUpload(purpose, { type: prepared.type, size: prepared.size });
  if (problem) return { ok: false, error: problem.message };

  if (signal?.aborted) return { ok: false, error: "Subida cancelada." };
  onStage?.("authorizing");
  const [signed, dimensions] = await Promise.all([
    request({ mimeType: prepared.type, fileSizeBytes: prepared.size }),
    policy.mediaType === "VIDEO" ? measureVideo(prepared) : measureImage(prepared),
  ]);
  if (!signed.success || !signed.data) {
    return { ok: false, error: signed.error ?? "No se pudo autorizar la subida." };
  }

  const uploadId = signed.data.uploadId;
  trackPendingUpload(uploadId);
  let committed = false;
  let progress = 0;
  const report = (pct: number) => {
    progress = Math.max(progress, Math.min(100, pct));
    onProgress?.(progress);
  };
  try {
    signal?.throwIfAborted();
    onStage?.("uploading");
    report(0);
    for (let attempt = 0; ; attempt++) {
      try {
        await putWithProgress(signed.data.putUrl, signed.data.requiredHeaders, prepared, {
          signal,
          onProgress: report,
        });
        break;
      } catch (error) {
        if (
          signal?.aborted ||
          !(error instanceof UploadTransferError) ||
          !error.retryable ||
          attempt >= 2
        )
          throw error;
        await retryDelay(attempt, signal);
      }
    }
    signal?.throwIfAborted();
    onStage?.("processing");
    for (let attempt = 0; ; attempt++) {
      let confirmed: ActionResult<Confirmed>;
      try {
        confirmed = await confirm({ uploadId: signed.data.uploadId, ...dimensions });
      } catch (error) {
        if (!(error instanceof TypeError) || attempt >= 2) throw error;
        await retryDelay(attempt, signal);
        continue;
      }
      if (confirmed.success && confirmed.data !== undefined) {
        committed = true;
        return { ok: true, data: confirmed.data };
      }
      if (
        attempt >= 2 ||
        (confirmed.status !== 0 && !(confirmed.status && confirmed.status >= 500))
      ) {
        return { ok: false, error: confirmed.error ?? "No se pudo registrar el archivo." };
      }
      await retryDelay(attempt, signal);
    }
  } catch (error) {
    if (signal?.aborted) return { ok: false, error: "Subida cancelada." };
    return {
      ok: false,
      error:
        error instanceof UploadTransferError
          ? error.message
          : "No se pudo completar la subida. Vuelve a intentarlo.",
    };
  } finally {
    if (committed || (await abortUpload(uploadId))) forgetPendingUpload(uploadId);
  }
}

class UploadTransferError extends Error {
  readonly retryable: boolean;
  constructor(status: number) {
    super(
      status === 403
        ? "La autorización de subida caducó o fue rechazada. Vuelve a subir el archivo."
        : "No se pudo transferir el archivo al almacenamiento."
    );
    this.retryable = status === 0 || status === 408 || status === 429 || status >= 500;
  }
}

function retryDelay(attempt: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Subida cancelada", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Subida cancelada", "AbortError"));
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      },
      attempt === 0 ? 500 : 1500
    );
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export function putWithProgress(
  url: string,
  headers: Record<string, string>,
  body: File,
  options: { onProgress?: (pct: number) => void; signal?: AbortSignal }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = (error?: Error) => {
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else {
        options.onProgress?.(100);
        resolve();
      }
    };
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        options.onProgress?.(Math.floor((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      done(xhr.status >= 200 && xhr.status < 300 ? undefined : new UploadTransferError(xhr.status));
    xhr.onerror = () => done(new UploadTransferError(0));
    xhr.ontimeout = () => done(new UploadTransferError(408));
    xhr.onabort = () => done(new DOMException("Subida cancelada", "AbortError"));
    if (options.signal?.aborted) {
      done(new DOMException("Subida cancelada", "AbortError"));
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    xhr.send(body);
  });
}

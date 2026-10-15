import { compressImageForUpload } from "./compress-image";
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
}

export interface DirectUploadClientOptions<Confirmed> {
  purpose: DirectUploadPurpose;
  file: File;
  /** Server action that signs the upload for this exact type and size. */
  request: (input: { mimeType: string; fileSizeBytes: number }) => Promise<
    ActionResult<{
      uploadToken: string;
      presignedPutUrl: string;
      requiredHeaders: Record<string, string>;
    }>
  >;
  /** Server action that verifies the stored object and registers it. */
  confirm: (input: {
    uploadToken: string;
    width: number | null;
    height: number | null;
  }) => Promise<ActionResult<Confirmed>>;
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
}: DirectUploadClientOptions<Confirmed>): Promise<DirectUploadClientResult<Confirmed>> {
  const policy = DIRECT_UPLOAD_POLICIES[purpose];
  const unsupported = checkDirectUpload(purpose, { type: file.type, size: 1 });
  if (unsupported) return { ok: false, error: unsupported.message };

  onStage?.("preparing");
  const prepared = policy.maxImageDimension
    ? await compressImageForUpload(file, { maxDimension: policy.maxImageDimension })
    : file;
  const problem = checkDirectUpload(purpose, { type: prepared.type, size: prepared.size });
  if (problem) return { ok: false, error: problem.message };

  onStage?.("authorizing");
  const [signed, dimensions] = await Promise.all([
    request({ mimeType: prepared.type, fileSizeBytes: prepared.size }),
    policy.mediaType === "VIDEO" ? measureVideo(prepared) : measureImage(prepared),
  ]);
  if (!signed.success || !signed.data) {
    return { ok: false, error: signed.error ?? "No se pudo autorizar la subida." };
  }

  onStage?.("uploading");
  try {
    const put = await fetch(signed.data.presignedPutUrl, {
      method: "PUT",
      headers: signed.data.requiredHeaders,
      body: prepared,
    });
    if (!put.ok) {
      return { ok: false, error: "No se pudo transferir el archivo al almacenamiento." };
    }
  } catch {
    return { ok: false, error: "Se cortó la conexión mientras se subía el archivo." };
  }

  onStage?.("processing");
  const confirmed = await confirm({ uploadToken: signed.data.uploadToken, ...dimensions });
  if (!confirmed.success || confirmed.data === undefined) {
    return { ok: false, error: confirmed.error ?? "No se pudo registrar el archivo." };
  }
  return { ok: true, data: confirmed.data };
}

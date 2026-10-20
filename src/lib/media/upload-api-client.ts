import { z } from "zod";
import type {
  CompleteUploadBody,
  RequestUploadBody,
  UploadAuthorization,
  UploadCompletion,
} from "./upload-api-schema";

export interface UploadApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  status?: number;
}

async function post<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>
): Promise<UploadApiResult<T>> {
  try {
    const response = await fetch(`/api/admin/media/uploads${path}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = z.object({ error: z.string(), code: z.string() }).safeParse(payload);
      return {
        success: false,
        status: response.status,
        ...(error.success ? error.data : { error: "No se pudo procesar la subida." }),
      };
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        status: 422,
        error: "El servicio devolvió una respuesta de subida no válida.",
      };
    }
    return { success: true, data: parsed.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      status: error instanceof TypeError ? 0 : 422,
      error: "No se pudo conectar con el servicio de subidas.",
    };
  }
}

const authorization = z.object({
  uploadId: z.string(),
  putUrl: z.string().url(),
  requiredHeaders: z.record(z.string()),
  expiresAt: z.number(),
});
const completion = z.object({
  mediaAssetId: z.string(),
  objectKey: z.string(),
  src: z.string().nullable(),
  mimeType: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  productMediaId: z.string().optional(),
  mediaType: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]).optional(),
  replayed: z.boolean().optional(),
  productStatus: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});
export function requestUpload(
  body: RequestUploadBody
): Promise<UploadApiResult<UploadAuthorization>> {
  return post("", body, authorization);
}
export function completeUpload(
  body: CompleteUploadBody
): Promise<UploadApiResult<UploadCompletion>> {
  return post("/complete", body, completion);
}

export async function abortUpload(uploadId: string): Promise<boolean> {
  try {
    const response = await fetch("/api/admin/media/uploads/abort", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
      signal: AbortSignal.timeout(5000),
    });
    return response.status === 204;
  } catch {
    return false;
  }
}
const pendingUploads = new Set<string>();
let pagehideRegistered = false;
export function trackPendingUpload(uploadId: string): void {
  pendingUploads.add(uploadId);
  if (typeof window !== "undefined" && !pagehideRegistered) {
    window.addEventListener("pagehide", () => {
      for (const id of pendingUploads)
        navigator.sendBeacon(
          "/api/admin/media/uploads/abort",
          new Blob([JSON.stringify({ uploadId: id })], { type: "application/json" })
        );
    });
    pagehideRegistered = true;
  }
}
export function forgetPendingUpload(uploadId: string): void {
  pendingUploads.delete(uploadId);
}

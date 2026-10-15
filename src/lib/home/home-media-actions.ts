"use server";

import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { mapDomainErrorToUi } from "@/lib/admin/catalog/error-mapping";
import type { DirectUploadRequest } from "@/lib/admin/media/direct-upload-service";
import { isDirectUploadPurpose } from "@/lib/media/direct-upload-policy";
import {
  confirmHomeMediaUpload,
  requestHomeMediaUpload,
  type ConfirmHomeMediaUploadResult,
} from "./home-media-service";

export interface HomeMediaActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

async function readyContext() {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      error: {
        success: false as const,
        error: "Debes iniciar sesión con una cuenta de personal autorizada.",
        code: "AUTHENTICATION_REQUIRED",
      },
    };
  }
  if (!authContext.permissions.has("catalog:manage")) {
    return {
      error: {
        success: false as const,
        error: "No tienes los permisos necesarios para gestionar el home.",
        code: "FORBIDDEN",
      },
    };
  }
  return { authContext };
}

const INVALID_PURPOSE = {
  success: false as const,
  error: "Tipo de archivo no válido para el home.",
  code: "DIRECT_UPLOAD_PURPOSE_MISMATCH",
};

/** Step 1: signs a direct browser-to-R2 upload. No file data reaches the server. */
export async function requestHomeMediaUploadAction(input: {
  purpose: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<HomeMediaActionResult<DirectUploadRequest>> {
  const context = await readyContext();
  if (context.error) return context.error;
  if (!isDirectUploadPurpose(input.purpose)) return INVALID_PURPOSE;

  try {
    const data = await requestHomeMediaUpload(
      { purpose: input.purpose, mimeType: input.mimeType, fileSizeBytes: input.fileSizeBytes },
      { authContext: context.authContext }
    );
    return { success: true, data };
  } catch (err) {
    return { success: false, ...mapDomainErrorToUi(err) };
  }
}

/** Step 3: after the browser's PUT, registers the media asset (HEAD check plus one row). */
export async function confirmHomeMediaUploadAction(input: {
  purpose: string;
  uploadToken: string;
  width?: number | null;
  height?: number | null;
}): Promise<HomeMediaActionResult<ConfirmHomeMediaUploadResult>> {
  const context = await readyContext();
  if (context.error) return context.error;
  if (!isDirectUploadPurpose(input.purpose)) return INVALID_PURPOSE;

  try {
    const data = await confirmHomeMediaUpload(
      {
        purpose: input.purpose,
        uploadToken: input.uploadToken,
        width: input.width,
        height: input.height,
      },
      { authContext: context.authContext }
    );
    return { success: true, data };
  } catch (err) {
    return { success: false, ...mapDomainErrorToUi(err) };
  }
}

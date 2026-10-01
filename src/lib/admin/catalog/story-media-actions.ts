"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { mapDomainErrorToUi } from "./error-mapping";
import {
  confirmStoryImageUpload,
  requestStoryImageUpload,
  type ConfirmStoryImageUploadResult,
  type RequestStoryImageUploadResult,
} from "./story-media-service";

export interface StoryMediaActionResult<T> {
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
        error: "No tienes los permisos necesarios para gestionar medios del catálogo.",
        code: "FORBIDDEN",
      },
    };
  }
  return { authContext };
}

/** Step 1: signs a direct browser-to-R2 upload. No file data reaches the server. */
export async function requestStoryImageUploadAction(input: {
  productId: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<StoryMediaActionResult<RequestStoryImageUploadResult>> {
  const context = await readyContext();
  if (context.error) return context.error;

  try {
    const data = await requestStoryImageUpload(input, { authContext: context.authContext });
    return { success: true, data };
  } catch (err) {
    return { success: false, ...mapDomainErrorToUi(err) };
  }
}

/** Step 3: after the browser's PUT, registers the image (HEAD check plus two rows). */
export async function confirmStoryImageUploadAction(input: {
  productId: string;
  uploadToken: string;
  width?: number | null;
  height?: number | null;
}): Promise<StoryMediaActionResult<ConfirmStoryImageUploadResult>> {
  const context = await readyContext();
  if (context.error) return context.error;

  try {
    const data = await confirmStoryImageUpload(
      { uploadToken: input.uploadToken, width: input.width, height: input.height },
      { authContext: context.authContext }
    );
    revalidatePath(`/admin/products/${input.productId}/story`);
    return { success: true, data };
  } catch (err) {
    return { success: false, ...mapDomainErrorToUi(err) };
  }
}

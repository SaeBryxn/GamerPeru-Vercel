import "server-only";

import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import {
  registerDirectUploadAsset,
  requestDirectUpload,
  verifyDirectUpload,
  type DirectUploadOptions,
  type DirectUploadRequest,
} from "@/lib/admin/media/direct-upload-service";
import type { DirectUploadPurpose } from "@/lib/media/direct-upload-policy";

/**
 * Uploads for home sections (ADR-012): images, self-hosted videos and their posters, all through
 * the shared direct upload. Confirming only registers the asset; a section references it when
 * the operator saves the section, which also records it in `home_section_media`.
 */

export const HOME_MEDIA_PURPOSES = ["home_image", "home_video", "home_video_poster"] as const;
export type HomeMediaPurpose = (typeof HOME_MEDIA_PURPOSES)[number];

const KEY_PREFIXES: Record<HomeMediaPurpose, string> = {
  home_image: "home/images",
  home_video: "home/videos",
  home_video_poster: "home/posters",
};

export interface HomeMediaServiceOptions extends DirectUploadOptions {
  authContext?: VerifiedAuthContextReady;
  database?: typeof db;
}

export interface ConfirmHomeMediaUploadResult {
  mediaAssetId: string;
  objectKey: string;
  mimeType: string;
  mediaType: "IMAGE" | "VIDEO" | "DOCUMENT";
  width: number | null;
  height: number | null;
}

function assertHomePurpose(purpose: DirectUploadPurpose): asserts purpose is HomeMediaPurpose {
  if (!(HOME_MEDIA_PURPOSES as readonly string[]).includes(purpose)) {
    throw new CatalogDomainError(
      "Tipo de archivo no válido para el home.",
      "DIRECT_UPLOAD_PURPOSE_MISMATCH",
      400
    );
  }
}

async function authorize(options?: HomeMediaServiceOptions): Promise<string> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has("catalog:manage")) {
      throw new CatalogDomainError(
        "No tienes permisos suficientes para realizar esta acción.",
        "FORBIDDEN",
        403
      );
    }
    return options.authContext.authUserId;
  }
  return (await requirePermission("catalog:manage")).authUserId;
}

export async function requestHomeMediaUpload(
  input: { purpose: DirectUploadPurpose; mimeType: string; fileSizeBytes: number },
  options?: HomeMediaServiceOptions
): Promise<DirectUploadRequest> {
  const actorId = await authorize(options);
  assertHomePurpose(input.purpose);
  return requestDirectUpload(
    {
      purpose: input.purpose,
      actorId,
      subjectId: null,
      keyPrefix: KEY_PREFIXES[input.purpose],
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
    },
    options
  );
}

/** Registers a verified home upload. Idempotent on the object key; audited once. */
export async function confirmHomeMediaUpload(
  input: {
    purpose: DirectUploadPurpose;
    uploadToken: string;
    width?: number | null;
    height?: number | null;
  },
  options?: HomeMediaServiceOptions
): Promise<ConfirmHomeMediaUploadResult> {
  const actorId = await authorize(options);
  assertHomePurpose(input.purpose);
  const database = options?.database ?? db;
  const token = await verifyDirectUpload(
    { uploadToken: input.uploadToken, purpose: input.purpose, actorId },
    options
  );

  return database.transaction(async (tx) => {
    const { asset, created } = await registerDirectUploadAsset(tx, token, input);
    if (created) {
      await tx.insert(auditEvents).values({
        actorType: "ADMIN",
        actorId,
        action: "home:media:upload",
        targetType: "media_asset",
        targetId: asset.id,
        metadata: {
          purpose: token.purpose,
          object_key: token.objectKey,
          mime_type: token.mimeType,
          file_size_bytes: token.fileSizeBytes,
          upload: "direct",
        },
      });
    }
    return {
      mediaAssetId: asset.id,
      objectKey: asset.objectKey,
      mimeType: asset.mimeType,
      mediaType: asset.mediaType,
      width: asset.width,
      height: asset.height,
    };
  });
}

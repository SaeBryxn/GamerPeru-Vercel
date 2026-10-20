import { z } from "zod";
import { DIRECT_UPLOAD_PURPOSES } from "./direct-upload-policy";

const file = { mimeType: z.string().min(1).max(100), fileSizeBytes: z.number().int().positive() };
export const requestUploadSchema = z.discriminatedUnion("purpose", [
  z
    .object({
      purpose: z.literal("gallery_image"),
      productId: z.string().uuid(),
      variantId: z.string().uuid().nullable().optional(),
      ...file,
    })
    .strict(),
  z.object({ purpose: z.literal("story_image"), productId: z.string().uuid(), ...file }).strict(),
  z.object({ purpose: z.literal("home_image"), ...file }).strict(),
  z.object({ purpose: z.literal("home_video"), ...file }).strict(),
  z.object({ purpose: z.literal("home_video_poster"), ...file }).strict(),
]);
export const completeUploadSchema = z
  .object({
    purpose: z.enum(DIRECT_UPLOAD_PURPOSES),
    productId: z.string().uuid().optional(),
    uploadId: z.string().min(1).max(4096),
    width: z.number().int().positive().max(20000).nullable().optional(),
    height: z.number().int().positive().max(20000).nullable().optional(),
    mutationRequestId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type RequestUploadBody = z.infer<typeof requestUploadSchema>;
export type CompleteUploadBody = z.infer<typeof completeUploadSchema>;
export interface UploadAuthorization {
  uploadId: string;
  putUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: number;
}
export interface UploadCompletion {
  mediaAssetId: string;
  objectKey: string;
  src: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  mediaType?: "IMAGE" | "VIDEO" | "DOCUMENT";
  productMediaId?: string;
  replayed?: boolean;
  productStatus?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

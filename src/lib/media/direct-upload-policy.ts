/**
 * What each kind of direct-to-R2 upload accepts (ADR-012). Shared by the browser, which checks
 * and prepares files before asking for a signature, and the server, which enforces the same
 * limits on the signed request and again on the stored object.
 */

export const DIRECT_UPLOAD_PURPOSES = [
  "gallery_image",
  "story_image",
  "home_image",
  "home_video",
  "home_video_poster",
] as const;

export type DirectUploadPurpose = (typeof DIRECT_UPLOAD_PURPOSES)[number];

export interface DirectUploadPolicy {
  /** Accepted MIME types and the extension each one is stored with. */
  mimeTypes: Readonly<Record<string, string>>;
  maxBytes: number;
  mediaType: "IMAGE" | "VIDEO";
  /** Longest side the browser scales images to before uploading; videos are uploaded as-is. */
  maxImageDimension: number | null;
  /** Spanish label used in validation messages. */
  label: string;
  /** Upload only the browser's re-encoded image, never the original file (strips metadata). */
  alwaysReencode?: boolean;
}

const MB = 1024 * 1024;

const STILL_IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const DIRECT_UPLOAD_POLICIES: Readonly<Record<DirectUploadPurpose, DirectUploadPolicy>> = {
  gallery_image: {
    mimeTypes: { "image/webp": "webp", "image/jpeg": "jpg" },
    maxBytes: 4 * MB,
    mediaType: "IMAGE",
    maxImageDimension: 2000,
    label: "La foto",
    alwaysReencode: true,
  },
  story_image: {
    mimeTypes: STILL_IMAGE_TYPES,
    maxBytes: 10 * MB,
    mediaType: "IMAGE",
    maxImageDimension: 2560,
    label: "La imagen",
  },
  home_image: {
    mimeTypes: STILL_IMAGE_TYPES,
    maxBytes: 10 * MB,
    mediaType: "IMAGE",
    maxImageDimension: 2560,
    label: "La imagen",
  },
  home_video: {
    mimeTypes: { "video/mp4": "mp4", "video/webm": "webm" },
    maxBytes: 25 * MB,
    mediaType: "VIDEO",
    maxImageDimension: null,
    label: "El video",
  },
  home_video_poster: {
    mimeTypes: { "image/jpeg": "jpg", "image/webp": "webp" },
    maxBytes: 2 * MB,
    mediaType: "IMAGE",
    maxImageDimension: 1920,
    label: "La portada del video",
  },
};

export function isDirectUploadPurpose(value: unknown): value is DirectUploadPurpose {
  return (DIRECT_UPLOAD_PURPOSES as readonly unknown[]).includes(value);
}

/** Value for an `<input type="file" accept>` attribute. */
export function directUploadAccept(purpose: DirectUploadPurpose): string {
  return Object.keys(DIRECT_UPLOAD_POLICIES[purpose].mimeTypes).join(",");
}

function formatList(values: string[]): string {
  return values.length > 1
    ? `${values.slice(0, -1).join(", ")} o ${values[values.length - 1]}`
    : (values[0] ?? "");
}

/**
 * Checks a declared type and size against the purpose. Returns a Spanish message describing
 * the problem, or null when the file is acceptable.
 */
export function checkDirectUpload(
  purpose: DirectUploadPurpose,
  file: { type: string; size: number }
): {
  code: "DIRECT_UPLOAD_UNSUPPORTED_TYPE" | "DIRECT_UPLOAD_SIZE_LIMIT_EXCEEDED";
  message: string;
} | null {
  const policy = DIRECT_UPLOAD_POLICIES[purpose];
  if (!Object.hasOwn(policy.mimeTypes, file.type)) {
    const formats = Object.values(policy.mimeTypes).map((ext) => ext.toUpperCase());
    return {
      code: "DIRECT_UPLOAD_UNSUPPORTED_TYPE",
      message: `Formato no admitido. Usa ${formatList(formats)}.`,
    };
  }
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > policy.maxBytes) {
    return {
      code: "DIRECT_UPLOAD_SIZE_LIMIT_EXCEEDED",
      message: `${policy.label} debe pesar como máximo ${policy.maxBytes / MB} MB.`,
    };
  }
  return null;
}

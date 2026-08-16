import { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/config/env";

/**
 * Cloudflare R2 Logical Bucket Names
 */
export const R2_BUCKETS = {
  PUBLIC_MEDIA: serverEnv.R2_PUBLIC_MEDIA_BUCKET,
  PRIVATE_PROOFS: serverEnv.R2_PRIVATE_PROOFS_BUCKET,
  DB_BACKUPS: serverEnv.R2_DB_BACKUPS_BUCKET,
} as const;

/**
 * Server-Only Cloudflare R2 Client (S3 Compatible)
 *
 * Configured with custom R2 endpoint and credentials.
 */
export function createR2Client() {
  const accountId = serverEnv.R2_ACCOUNT_ID || "placeholder_r2_account_id";
  const accessKeyId = serverEnv.R2_ACCESS_KEY_ID || "placeholder_r2_access_key";
  const secretAccessKey = serverEnv.R2_SECRET_ACCESS_KEY || "placeholder_r2_secret";

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

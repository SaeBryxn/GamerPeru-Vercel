import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/config/server-env";

/**
 * Cloudflare R2 Logical Bucket Names
 */
export const R2_BUCKETS = {
  get PUBLIC_MEDIA() {
    return serverEnv.R2_PUBLIC_MEDIA_BUCKET;
  },
  get CATALOG_STAGING() {
    return serverEnv.R2_CATALOG_STAGING_BUCKET;
  },
  get PRIVATE_PROOFS() {
    return serverEnv.R2_PRIVATE_PROOFS_BUCKET;
  },
  get PRIVATE_PAYMENT_MEDIA() {
    return serverEnv.R2_PRIVATE_PAYMENT_MEDIA_BUCKET;
  },
  get DB_BACKUPS() {
    return serverEnv.R2_DB_BACKUPS_BUCKET;
  },
} as const;

/**
 * Server-Only Cloudflare R2 Client (S3 Compatible)
 *
 * Configured with custom R2 endpoint and credentials.
 */
export function createR2Client() {
  const accountId = serverEnv.R2_ACCOUNT_ID ?? "placeholder_r2_account_id";
  const accessKeyId = serverEnv.R2_ACCESS_KEY_ID ?? "placeholder_r2_access_key";
  const secretAccessKey = serverEnv.R2_SECRET_ACCESS_KEY ?? "placeholder_r2_secret";

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

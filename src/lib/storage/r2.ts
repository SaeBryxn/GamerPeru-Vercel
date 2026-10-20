import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/config/server-env";

export { R2_BUCKETS } from "./r2-buckets";

export interface StorageConnection {
  accountId?: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  region?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Builds the S3 client for either provider. An explicit endpoint (Supabase Storage, MinIO) is
 * used as-is with path-style buckets; without one the Cloudflare R2 host is derived from the
 * account id and R2's required "auto" region.
 */
export function buildStorageClient(connection: StorageConnection): S3Client {
  const explicitEndpoint = nonEmpty(connection.endpoint);
  const endpoint =
    explicitEndpoint ?? `https://${connection.accountId?.trim()}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: explicitEndpoint ? (nonEmpty(connection.region) ?? "auto") : "auto",
    endpoint,
    forcePathStyle: Boolean(explicitEndpoint),
    // Default checksums are computed at signing time over an empty body, so a presigned PUT
    // would carry a CRC32 that never matches the file the browser uploads and R2 rejects it.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: connection.accessKeyId.trim(),
      secretAccessKey: connection.secretAccessKey.trim(),
    },
  });
}

export function createR2Client() {
  return buildStorageClient({
    accountId: serverEnv.R2_ACCOUNT_ID ?? "placeholder_r2_account_id",
    accessKeyId: serverEnv.R2_ACCESS_KEY_ID ?? "placeholder_r2_access_key",
    secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY ?? "placeholder_r2_secret",
    endpoint: serverEnv.S3_ENDPOINT,
    region: serverEnv.S3_REGION,
  });
}

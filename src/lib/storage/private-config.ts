import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/config/server-env";
import { R2_BUCKETS } from "./r2";

export type PrivateStorageCapability = "PROOF_UPLOAD" | "QR_READ";

export type StorageCapabilityResult =
  | { isAvailable: true; bucketName: string; client: S3Client }
  | { isAvailable: false; reason: string };

function isPlaceholderOrEmpty(val: string | undefined): boolean {
  if (!val || val.trim() === "") return true;
  if (val.startsWith("placeholder_")) return true;
  return false;
}

/**
 * Validates private Cloudflare R2 storage capability in a fail-closed manner.
 * Rejects placeholder credentials and returns typed availability.
 */
export function validatePrivateStorageCapability(
  capability: PrivateStorageCapability,
  customEnv?: {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    proofsBucket?: string;
    paymentMediaBucket?: string;
  }
): StorageCapabilityResult {
  const accountId = customEnv?.accountId ?? serverEnv.R2_ACCOUNT_ID;
  const accessKeyId = customEnv?.accessKeyId ?? serverEnv.R2_ACCESS_KEY_ID;
  const secretAccessKey = customEnv?.secretAccessKey ?? serverEnv.R2_SECRET_ACCESS_KEY;

  if (
    isPlaceholderOrEmpty(accountId) ||
    isPlaceholderOrEmpty(accessKeyId) ||
    isPlaceholderOrEmpty(secretAccessKey)
  ) {
    return {
      isAvailable: false,
      reason: `Storage credentials not configured or placeholder detected for ${capability}.`,
    };
  }

  let bucketName: string;
  if (capability === "PROOF_UPLOAD") {
    bucketName = customEnv?.proofsBucket ?? R2_BUCKETS.PRIVATE_PROOFS;
    if (isPlaceholderOrEmpty(bucketName)) {
      return {
        isAvailable: false,
        reason: "R2_PRIVATE_PROOFS_BUCKET is not configured.",
      };
    }
  } else {
    bucketName = customEnv?.paymentMediaBucket ?? R2_BUCKETS.PRIVATE_PAYMENT_MEDIA;
    if (isPlaceholderOrEmpty(bucketName)) {
      return {
        isAvailable: false,
        reason: "R2_PRIVATE_PAYMENT_MEDIA_BUCKET is not configured.",
      };
    }
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    },
  });

  return {
    isAvailable: true,
    bucketName,
    client,
  };
}

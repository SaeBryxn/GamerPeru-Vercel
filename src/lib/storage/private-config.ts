import "server-only";
import type { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/config/server-env";
import { buildStorageClient, R2_BUCKETS } from "./r2";

export type PrivateStorageCapability = "PROOF_UPLOAD" | "QR_READ";

export type StorageCapabilityResult =
  | { isAvailable: true; bucketName: string; client: S3Client }
  | { isAvailable: false; reason: string };

function isPlaceholderOrEmpty(val: string | undefined): boolean {
  if (!val || val.trim() === "") return true;
  if (val.startsWith("placeholder_")) return true;
  return false;
}

let testStorageClientOverride: S3Client | null = null;

/**
 * Test seam to inject a mock/in-memory S3Client during integration tests.
 * Never used in production (defaults to null).
 */
export function setTestStorageClientOverride(client: S3Client | null): void {
  testStorageClientOverride = client;
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
    endpoint?: string;
    region?: string;
  }
): StorageCapabilityResult {
  if (testStorageClientOverride) {
    return {
      isAvailable: true,
      bucketName:
        capability === "PROOF_UPLOAD"
          ? (customEnv?.proofsBucket ?? R2_BUCKETS.PRIVATE_PROOFS)
          : (customEnv?.paymentMediaBucket ?? R2_BUCKETS.PRIVATE_PAYMENT_MEDIA),
      client: testStorageClientOverride,
    };
  }

  const accountId = customEnv?.accountId ?? serverEnv.R2_ACCOUNT_ID;
  const accessKeyId = customEnv?.accessKeyId ?? serverEnv.R2_ACCESS_KEY_ID;
  const secretAccessKey = customEnv?.secretAccessKey ?? serverEnv.R2_SECRET_ACCESS_KEY;
  const endpoint = customEnv ? customEnv.endpoint : serverEnv.S3_ENDPOINT;
  const region = customEnv ? customEnv.region : serverEnv.S3_REGION;

  // The account id only names the Cloudflare host; an explicit S3_ENDPOINT already carries it.
  const needsAccountId = isPlaceholderOrEmpty(endpoint);
  const missing = [
    needsAccountId && isPlaceholderOrEmpty(accountId) ? "R2_ACCOUNT_ID (or S3_ENDPOINT)" : null,
    isPlaceholderOrEmpty(accessKeyId) ? "R2_ACCESS_KEY_ID" : null,
    isPlaceholderOrEmpty(secretAccessKey) ? "R2_SECRET_ACCESS_KEY" : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    return {
      isAvailable: false,
      reason: `Storage credentials not configured or placeholder detected for ${capability}: ${missing.join(", ")}.`,
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

  const client = buildStorageClient({
    accountId,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    endpoint,
    region,
  });

  return {
    isAvailable: true,
    bucketName,
    client,
  };
}

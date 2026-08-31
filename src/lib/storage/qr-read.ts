import "server-only";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2_BUCKETS } from "./r2";

/**
 * Generates a short-lived pre-signed GET URL for a private payment instruction QR media asset.
 */
export async function generateQrPresignedGetUrl(params: {
  s3Client: S3Client;
  bucketName?: string;
  objectKey: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const bucket = params.bucketName ?? R2_BUCKETS.PRIVATE_PAYMENT_MEDIA;
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: params.objectKey,
  });

  return getSignedUrl(params.s3Client, command, {
    expiresIn: params.expiresInSeconds ?? 900, // 15 minutes technical TTL
  });
}

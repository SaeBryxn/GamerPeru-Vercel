import "server-only";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Payment proofs are sensitive operational data; the domain model caps their signed URLs at 5m. */
export const PROOF_VIEW_URL_TTL_SECONDS = 300;

/**
 * Generates a short-lived pre-signed GET URL for a finalized private payment proof.
 * The response is marked no-store so neither the browser nor an intermediary keeps a copy.
 */
export async function generateProofPresignedGetUrl(params: {
  s3Client: S3Client;
  bucketName: string;
  objectKey: string;
  mimeType: string;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: params.bucketName,
    Key: params.objectKey,
    ResponseCacheControl: "private, no-store, max-age=0",
    ResponseContentDisposition: "inline",
    ResponseContentType: params.mimeType,
  });

  return getSignedUrl(params.s3Client, command, { expiresIn: PROOF_VIEW_URL_TTL_SECONDS });
}

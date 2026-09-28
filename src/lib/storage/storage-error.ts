import "server-only";

export interface StorageErrorDetails {
  errorName: string;
  errorMessage: string;
  errorCode?: string;
  httpStatus?: number;
  providerRequestId?: string;
}

/**
 * Reduces an AWS SDK (or network) failure to the fields that identify its cause: the S3 error
 * code (e.g. InvalidAccessKeyId, NoSuchBucket, SignatureDoesNotMatch), the HTTP status and the
 * provider's request id. Signed URLs and credentials never appear in these fields.
 */
export function describeStorageError(error: unknown): StorageErrorDetails {
  if (!(error instanceof Error)) {
    return { errorName: "UnknownError", errorMessage: String(error) };
  }

  const sdkError = error as Error & {
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number; requestId?: string };
    cause?: unknown;
  };
  const cause = sdkError.cause instanceof Error ? sdkError.cause : undefined;

  return {
    errorName: sdkError.name,
    errorMessage: cause ? `${sdkError.message} (cause: ${cause.message})` : sdkError.message,
    errorCode: sdkError.Code ?? sdkError.code ?? (cause as { code?: string } | undefined)?.code,
    httpStatus: sdkError.$metadata?.httpStatusCode,
    providerRequestId: sdkError.$metadata?.requestId,
  };
}

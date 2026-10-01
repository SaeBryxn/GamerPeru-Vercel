import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client } from "@/lib/storage/r2";
import { requireCatalogMediaRuntimeConfig } from "@/config/server-env";
import { CatalogDomainError } from "./types";

export function derivePresignedPutLifetime(
  intentExpiresAtSeconds: number,
  currentServerTimeSeconds: number,
  maximumSigningDurationSeconds: number
): number {
  const remainingSeconds = intentExpiresAtSeconds - currentServerTimeSeconds;
  if (remainingSeconds <= 0) {
    throw new CatalogDomainError(
      "La autorización temporal para subir el archivo ha expirado.",
      "MEDIA_INTENT_TOKEN_EXPIRED",
      410
    );
  }

  return Math.min(remainingSeconds, maximumSigningDurationSeconds);
}

export interface StagingHeadResult {
  contentLength: number;
  contentType?: string;
}

export function isAuthoritativeStorageNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  const statusCode = e.$metadata?.httpStatusCode;
  if (statusCode !== undefined) {
    return statusCode === 404;
  }
  return e.name === "NotFound" || e.name === "NoSuchKey";
}

function isPreconditionFailedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e.name === "PreconditionFailed" ||
    e.name === "AtLeastOneConditionalRequestParameterFailed" ||
    e.$metadata?.httpStatusCode === 412
  );
}

export interface CatalogStorageAdapter {
  generatePresignedPutUrl(params: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
    /** Signed into the URL; the uploader must send the same Cache-Control header. */
    cacheControl?: string;
  }): Promise<string>;

  headObject(params: { bucket: string; key: string }): Promise<StagingHeadResult | null>;

  getObjectBytes(params: { bucket: string; key: string }): Promise<Buffer>;

  getObjectBytesBounded(params: { bucket: string; key: string; maxBytes: number }): Promise<Buffer>;

  putObject(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
  }): Promise<void>;

  putObjectIfNotExists(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
  }): Promise<{ created: boolean }>;

  deleteObject(params: { bucket: string; key: string }): Promise<void>;
}

export class R2CatalogStorageAdapter implements CatalogStorageAdapter {
  private readonly client: S3Client;

  constructor(client?: S3Client) {
    // Requires real configuration when constructing production adapter
    requireCatalogMediaRuntimeConfig();
    this.client = client ?? createR2Client();
  }

  async generatePresignedPutUrl(params: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
    cacheControl?: string;
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ...(params.cacheControl ? { CacheControl: params.cacheControl } : {}),
    });
    // The SDK leaves these headers out of the signature by default; signing them makes R2 refuse
    // an upload whose type or caching differs from what the server authorized.
    return getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
      signableHeaders: new Set(
        params.cacheControl ? ["content-type", "cache-control"] : ["content-type"]
      ),
    });
  }

  async headObject(params: { bucket: string; key: string }): Promise<StagingHeadResult | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
        })
      );
      if (res.ContentLength === undefined) {
        throw new Error("Catalog storage HEAD response omitted ContentLength.");
      }
      return {
        contentLength: res.ContentLength,
        contentType: res.ContentType,
      };
    } catch (err: unknown) {
      if (isAuthoritativeStorageNotFoundError(err)) {
        return null;
      }
      // Re-throw non-404 storage failures (e.g. auth, network, 5xx) so service fails closed
      throw err;
    }
  }

  async getObjectBytes(params: { bucket: string; key: string }): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
      })
    );
    if (!res.Body) {
      throw new Error(`Empty body returned for object ${params.key}`);
    }
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getObjectBytesBounded(params: {
    bucket: string;
    key: string;
    maxBytes: number;
  }): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
      })
    );
    if (!res.Body) {
      throw new Error(`Empty body returned for object ${params.key}`);
    }

    const stream = res.Body as unknown as {
      [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer>;
      destroy?: () => void;
      transformToByteArray?: () => Promise<Uint8Array>;
    };

    if (typeof stream[Symbol.asyncIterator] === "function") {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer>) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > params.maxBytes) {
          if (typeof stream.destroy === "function") {
            stream.destroy();
          }
          const err = new Error(
            `MEDIA_FILE_TOO_LARGE: Object ${params.key} exceeded maximum allowed bytes of ${params.maxBytes}`
          );
          (err as unknown as { code: string }).code = "PAYLOAD_TOO_LARGE";
          throw err;
        }
        chunks.push(buf);
      }
      return Buffer.concat(chunks);
    }

    if (typeof stream.transformToByteArray === "function") {
      const bytes = await stream.transformToByteArray();
      if (bytes.byteLength > params.maxBytes) {
        const err = new Error(
          `Object ${params.key} exceeded maximum allowed bytes of ${params.maxBytes}`
        );
        (err as unknown as { code: string }).code = "PAYLOAD_TOO_LARGE";
        throw err;
      }
      return Buffer.from(bytes);
    }

    throw new Error(`Unsupported body type for object ${params.key}`);
  }

  async putObject(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        CacheControl: params.cacheControl,
      })
    );
  }

  async putObjectIfNotExists(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
  }): Promise<{ created: boolean }> {
    // Supabase Storage accepts and ignores If-None-Match, so a conditional PUT alone would
    // report every write as a creation and skip the caller's integrity verification branch.
    // The HEAD probe restores that signal; the conditional header still wins genuine races on
    // providers that honor it. Keys are content-addressed, so a lost race rewrites identical bytes.
    const existing = await this.headObject({ bucket: params.bucket, key: params.key });
    if (existing) {
      return { created: false };
    }

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
          CacheControl: params.cacheControl,
          IfNoneMatch: "*",
        })
      );
      return { created: true };
    } catch (err: unknown) {
      if (isPreconditionFailedError(err)) {
        return { created: false };
      }
      throw err;
    }
  }

  async deleteObject(params: { bucket: string; key: string }): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
      })
    );
  }
}

/**
 * In-memory deterministic storage adapter for unit and Admin Live integration tests.
 * Operates purely in memory without network or real Cloudflare credentials.
 */
export class InMemoryCatalogStorageAdapter implements CatalogStorageAdapter {
  private readonly store = new Map<
    string,
    { body: Buffer; contentType: string; cacheControl?: string }
  >();
  public deleteFailures = new Set<string>();
  public headFailures = new Map<string, Error>();

  private makeStoreKey(bucket: string, key: string): string {
    return `${bucket}:::${key}`;
  }

  async generatePresignedPutUrl(params: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string> {
    return `https://fake-r2-staging.test/${params.bucket}/${params.key}?expiresIn=${params.expiresInSeconds}&contentType=${encodeURIComponent(params.contentType)}`;
  }

  async headObject(params: { bucket: string; key: string }): Promise<StagingHeadResult | null> {
    const simulated = this.headFailures.get(params.key);
    if (simulated) {
      throw simulated;
    }
    const item = this.store.get(this.makeStoreKey(params.bucket, params.key));
    if (!item) return null;
    return {
      contentLength: item.body.length,
      contentType: item.contentType,
    };
  }

  async getObjectBytes(params: { bucket: string; key: string }): Promise<Buffer> {
    const item = this.store.get(this.makeStoreKey(params.bucket, params.key));
    if (!item) {
      const error = new Error(`NoSuchKey: ${params.key} in bucket ${params.bucket}`);
      error.name = "NoSuchKey";
      throw error;
    }
    return Buffer.from(item.body);
  }

  async getObjectBytesBounded(params: {
    bucket: string;
    key: string;
    maxBytes: number;
  }): Promise<Buffer> {
    const item = this.store.get(this.makeStoreKey(params.bucket, params.key));
    if (!item) {
      const error = new Error(`NoSuchKey: ${params.key} in bucket ${params.bucket}`);
      error.name = "NoSuchKey";
      throw error;
    }
    if (item.body.length > params.maxBytes) {
      const err = new Error(
        `MEDIA_FILE_TOO_LARGE: Object ${params.key} exceeded maximum allowed bytes of ${params.maxBytes}`
      );
      (err as unknown as { code: string }).code = "PAYLOAD_TOO_LARGE";
      throw err;
    }
    return Buffer.from(item.body);
  }

  async putObject(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
  }): Promise<void> {
    this.store.set(this.makeStoreKey(params.bucket, params.key), {
      body: Buffer.from(params.body),
      contentType: params.contentType,
      cacheControl: params.cacheControl,
    });
  }

  async putObjectIfNotExists(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
  }): Promise<{ created: boolean }> {
    const storeKey = this.makeStoreKey(params.bucket, params.key);
    if (this.store.has(storeKey)) {
      return { created: false };
    }
    this.store.set(storeKey, {
      body: Buffer.from(params.body),
      contentType: params.contentType,
      cacheControl: params.cacheControl,
    });
    return { created: true };
  }

  async deleteObject(params: { bucket: string; key: string }): Promise<void> {
    if (this.deleteFailures.has(params.key)) {
      throw new Error(`Simulated delete failure for key: ${params.key}`);
    }
    this.store.delete(this.makeStoreKey(params.bucket, params.key));
  }

  setObject(
    bucket: string,
    key: string,
    body: Buffer,
    contentType: string,
    cacheControl?: string
  ): void {
    this.store.set(this.makeStoreKey(bucket, key), {
      body: Buffer.from(body),
      contentType,
      cacheControl,
    });
  }

  hasObject(bucket: string, key: string): boolean {
    return this.store.has(this.makeStoreKey(bucket, key));
  }
}

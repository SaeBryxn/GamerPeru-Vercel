import "server-only";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client } from "@/lib/storage/r2";
import { requireCatalogMediaRuntimeConfig } from "@/config/server-env";

export interface StorageHeadResult {
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

export interface CatalogStorageAdapter {
  generatePresignedPutUrl(params: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
    /** Signed into the URL; the uploader must send the same Cache-Control header. */
    cacheControl?: string;
    /** Signed into the URL; R2 refuses a body of any other length. */
    contentLength?: number;
  }): Promise<string>;

  headObject(params: { bucket: string; key: string }): Promise<StorageHeadResult | null>;

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
    contentLength?: number;
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ...(params.cacheControl ? { CacheControl: params.cacheControl } : {}),
      ...(params.contentLength !== undefined ? { ContentLength: params.contentLength } : {}),
    });
    // The SDK leaves these headers out of the signature by default; signing them makes R2 refuse
    // an upload whose type, caching or size differs from what the server authorized.
    const signed = ["content-type"];
    if (params.cacheControl) signed.push("cache-control");
    if (params.contentLength !== undefined) signed.push("content-length");
    return getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
      signableHeaders: new Set(signed),
    });
  }

  async headObject(params: { bucket: string; key: string }): Promise<StorageHeadResult | null> {
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

  async headObject(params: { bucket: string; key: string }): Promise<StorageHeadResult | null> {
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

import "server-only";
import { requireCatalogMediaRuntimeConfig } from "@/config/server-env";
import { getMediaS3Signer } from "@/lib/storage/s3-signer";

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

  getObjectRange?(params: {
    bucket: string;
    key: string;
    start: number;
    end: number;
  }): Promise<Uint8Array | null>;

  deleteObject(params: { bucket: string; key: string }): Promise<void>;
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

  async getObjectRange(p: {
    bucket: string;
    key: string;
    start: number;
    end: number;
  }): Promise<Uint8Array | null> {
    const item = this.store.get(this.makeStoreKey(p.bucket, p.key));
    return item ? new Uint8Array(item.body.subarray(p.start, p.end + 1)) : null;
  }

  hasObject(bucket: string, key: string): boolean {
    return this.store.has(this.makeStoreKey(bucket, key));
  }
}

export class SignerCatalogStorageAdapter implements CatalogStorageAdapter {
  generatePresignedPutUrl(p: Parameters<CatalogStorageAdapter["generatePresignedPutUrl"]>[0]) {
    if (p.cacheControl === undefined || p.contentLength === undefined)
      throw new Error("Faltan cabeceras de firma de medios.");
    return getMediaS3Signer().presignPut({
      ...p,
      cacheControl: p.cacheControl,
      contentLength: p.contentLength,
    });
  }
  headObject(p: { bucket: string; key: string }) {
    return getMediaS3Signer().head(p);
  }
  getObjectRange(p: { bucket: string; key: string; start: number; end: number }) {
    return getMediaS3Signer().getRange(p);
  }
  deleteObject(p: { bucket: string; key: string }) {
    return getMediaS3Signer().delete(p);
  }
}
let defaultAdapter: CatalogStorageAdapter | undefined;
export function getDefaultCatalogStorageAdapter(): CatalogStorageAdapter {
  if (!defaultAdapter) {
    requireCatalogMediaRuntimeConfig();
    defaultAdapter = new SignerCatalogStorageAdapter();
  }
  return defaultAdapter;
}

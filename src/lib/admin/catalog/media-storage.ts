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

export interface StagingHeadResult {
  contentLength: number;
  contentType?: string;
}

export interface CatalogStorageAdapter {
  generatePresignedPutUrl(params: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string>;

  headObject(params: { bucket: string; key: string }): Promise<StagingHeadResult | null>;

  getObjectBytes(params: { bucket: string; key: string }): Promise<Buffer>;

  putObject(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
  }): Promise<void>;

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
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      ContentType: params.contentType,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
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
        return null;
      }
      return {
        contentLength: res.ContentLength,
        contentType: res.ContentType,
      };
    } catch {
      return null;
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
      throw new Error(`NoSuchKey: ${params.key} in bucket ${params.bucket}`);
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

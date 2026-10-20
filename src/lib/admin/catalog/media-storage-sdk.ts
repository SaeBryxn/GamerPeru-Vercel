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

import type { CatalogStorageAdapter, StorageHeadResult } from "./media-storage";
import { isAuthoritativeStorageNotFoundError } from "./media-storage";

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

import "server-only";

import { AwsClient } from "aws4fetch";
import { serverEnv } from "@/config/server-env";

export interface S3SignerConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle: boolean;
}

export class S3Signer {
  private readonly client: AwsClient;

  constructor(private readonly config: S3SignerConfig) {
    this.client = new AwsClient({ ...config, service: "s3", retries: 0 });
  }

  private objectUrl(bucket: string, key: string): URL {
    const url = new URL(this.config.endpoint);
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    if (this.config.pathStyle) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodeURIComponent(bucket)}/${encodedKey}`;
    } else {
      url.hostname = `${bucket}.${url.hostname}`;
      url.pathname = `/${encodedKey}`;
    }
    return url;
  }

  async presignPut(p: {
    bucket: string;
    key: string;
    contentType: string;
    cacheControl: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<string> {
    const url = this.objectUrl(p.bucket, p.key);
    url.searchParams.set("X-Amz-Expires", String(p.expiresInSeconds));
    const signed = await this.client.sign(url, {
      method: "PUT",
      headers: {
        "content-type": p.contentType,
        "cache-control": p.cacheControl,
        "content-length": String(p.contentLength),
      },
      aws: { signQuery: true, allHeaders: true },
    });
    return signed.url;
  }

  private async send(p: { bucket: string; key: string }, init: RequestInit): Promise<Response> {
    const request = await this.client.sign(this.objectUrl(p.bucket, p.key), init);
    const response = await fetch(request);
    if (!response.ok && response.status !== 404) {
      await response.body?.cancel();
      throw new Error(`La operación de almacenamiento falló (${response.status}).`);
    }
    return response;
  }

  async head(p: { bucket: string; key: string }) {
    const response = await this.send(p, { method: "HEAD" });
    if (response.status === 404) return null;
    const rawLength = response.headers.get("content-length");
    const contentLength = Number(rawLength);
    if (rawLength === null || !Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw new Error("HEAD de almacenamiento sin longitud válida.");
    }
    return { contentLength, contentType: response.headers.get("content-type") ?? undefined };
  }

  async getRange(p: { bucket: string; key: string; start: number; end: number }) {
    const response = await this.send(p, {
      method: "GET",
      headers: { Range: `bytes=${p.start}-${p.end}` },
    });
    if (response.status === 404) return null;
    // A storage provider ignoring Range must never make us buffer the full object.
    const reader = response.body?.getReader();
    if (!reader) return null;
    const limit = p.end - p.start + 1;
    const result = new Uint8Array(limit);
    let length = 0;
    try {
      while (length < limit) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const part = chunk.value.subarray(0, limit - length);
        result.set(part, length);
        length += part.length;
      }
    } finally {
      await reader.cancel();
    }
    return result.slice(0, length);
  }

  async delete(p: { bucket: string; key: string }): Promise<void> {
    const response = await this.send(p, { method: "DELETE" });
    await response.body?.cancel();
  }
}

let mediaSigner: S3Signer | undefined;

export function getMediaS3Signer(): S3Signer {
  return (mediaSigner ??= new S3Signer({
    endpoint:
      serverEnv.S3_ENDPOINT?.trim() ??
      `https://${serverEnv.R2_ACCOUNT_ID?.trim()}.r2.cloudflarestorage.com`,
    region: serverEnv.S3_ENDPOINT ? (serverEnv.S3_REGION?.trim() ?? "auto") : "auto",
    accessKeyId: serverEnv.R2_ACCESS_KEY_ID?.trim() ?? "",
    secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY?.trim() ?? "",
    pathStyle: Boolean(serverEnv.S3_ENDPOINT),
  }));
}

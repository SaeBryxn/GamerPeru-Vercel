import { afterEach, describe, expect, it, vi } from "vitest";
import { S3Signer } from "@/lib/storage/s3-signer";

const config = {
  endpoint: "http://127.0.0.1:9000/s3",
  region: "auto",
  accessKeyId: "test",
  secretAccessKey: "test-secret",
  pathStyle: true,
};
afterEach(() => vi.unstubAllGlobals());
describe("firmante ligero de medios", () => {
  it("firma las tres cabeceras, caducidad y claves escapadas con path-style", async () => {
    const url = new URL(
      await new S3Signer(config).presignPut({
        bucket: "public-media",
        key: "folder/foto uno.webp",
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
        contentLength: 100,
        expiresInSeconds: 900,
      })
    );
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "cache-control;content-length;content-type;host"
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.pathname).toBe("/s3/public-media/folder/foto%20uno.webp");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });
  it("R2 nativo usa el bucket como subdominio", async () => {
    const url = await new S3Signer({
      ...config,
      endpoint: "https://account.r2.cloudflarestorage.com",
      pathStyle: false,
    }).presignPut({
      bucket: "public",
      key: "foto.jpg",
      contentType: "image/jpeg",
      cacheControl: "immutable",
      contentLength: 10,
      expiresInSeconds: 900,
    });
    expect(new URL(url).hostname).toBe("public.account.r2.cloudflarestorage.com");
  });
  it("HEAD devuelve ausencia solo con 404, falla cerrado en 500 y sin longitud", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const signer = new S3Signer(config);
    expect(await signer.head({ bucket: "public", key: "x" })).toBeNull();
    await expect(signer.head({ bucket: "public", key: "x" })).rejects.toThrow("500");
    await expect(signer.head({ bucket: "public", key: "x" })).rejects.toThrow("longitud");
  });
  it("acota la lectura aun si el proveedor ignora Range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(9000)))
    );
    const result = await new S3Signer(config).getRange({
      bucket: "public",
      key: "x",
      start: 0,
      end: 4095,
    });
    expect(result?.length).toBe(4096);
  });
});

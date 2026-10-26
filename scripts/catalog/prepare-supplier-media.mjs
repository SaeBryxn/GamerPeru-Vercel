import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { stableId } from "./supplier-plan.mjs";

const directory = path.resolve(process.argv[2] ?? "scratch/catalogo-20261026");
const upload = process.argv.includes("--upload");
const plan = JSON.parse(fs.readFileSync(path.join(directory, "plan.json"), "utf8"));
const manifestPath = path.join(directory, "media.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};
fs.mkdirSync(path.join(directory, "imagenes-originales"), { recursive: true });
fs.mkdirSync(path.join(directory, "imagenes-web"), { recursive: true });
let client;
if (upload) {
  process.loadEnvFile(".env.local");
  for (const key of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_PUBLIC_MEDIA_BUCKET",
  ])
    if (!process.env[key]) throw new Error(`Falta ${key}`);
  client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint:
      process.env.S3_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}
const urls = [...new Set(plan.products.flatMap((p) => p.images.map((i) => i.url)))];
const errors = [];
let completed = 0,
  cursor = 0;
async function processImage(url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "cdn.shopify.com" ||
    !/^\/s\/files\/1\/(?:0691\/4942\/5882|0846\/5727\/5175)\//.test(parsed.pathname)
  )
    throw new Error("La imagen no pertenece al CDN oficial verificado.");
  let item = manifest[url];
  if (!item || !fs.existsSync(path.join(directory, item.file))) {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000), redirect: "error" });
    if (!response.ok) throw new Error(`Descarga HTTP ${response.status}`);
    if (!/^image\/(jpeg|png|webp)/.test(response.headers.get("content-type") ?? ""))
      throw new Error("El servidor no devolvió una imagen admitida.");
    const parts = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) throw new Error("Imagen mayor a 20 MB");
      parts.push(chunk);
    }
    const original = Buffer.concat(parts);
    const sourceHash = createHash("sha256").update(original).digest("hex");
    fs.writeFileSync(path.join(directory, "imagenes-originales", sourceHash), original);
    const { data, info } = await sharp(original, { limitInputPixels: 100000000 })
      .rotate()
      .resize({ width: 1800, withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const hash = createHash("sha256").update(data).digest("hex");
    const file = `imagenes-web/${hash}.webp`;
    fs.writeFileSync(path.join(directory, file), data);
    item = {
      id: stableId(`media:${hash}`),
      objectKey: `catalog/suppliers/2026-10-26/${hash}.webp`,
      file,
      checksumSha256: hash,
      originalChecksum: sourceHash,
      fileSizeBytes: data.length,
      width: info.width,
      height: info.height,
      mimeType: "image/webp",
      uploaded: false,
    };
    manifest[url] = item;
  }
  if (client && !item.uploaded) {
    let exists = false;
    try {
      const stored = await client.send(
        new HeadObjectCommand({ Bucket: process.env.R2_PUBLIC_MEDIA_BUCKET, Key: item.objectKey })
      );
      if (
        stored.Metadata?.sha256 !== item.checksumSha256 ||
        stored.ContentLength !== item.fileSizeBytes
      )
        throw new Error("El objeto existente no coincide con su hash y tamaño.");
      exists = true;
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 404) throw error;
    }
    // Two official URLs can contain identical bytes. A concurrent worker may create the
    // content-addressed object first; verify that object below instead of overwriting it.
    if (!exists)
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: process.env.R2_PUBLIC_MEDIA_BUCKET,
            Key: item.objectKey,
            Body: fs.readFileSync(path.join(directory, item.file)),
            ContentType: item.mimeType,
            CacheControl: "public, max-age=31536000, immutable",
            Metadata: { sha256: item.checksumSha256 },
            IfNoneMatch: "*",
          })
        );
      } catch (error) {
        if (error.$metadata?.httpStatusCode !== 412) throw error;
      }
    const verified = await client.send(
      new HeadObjectCommand({ Bucket: process.env.R2_PUBLIC_MEDIA_BUCKET, Key: item.objectKey })
    );
    if (
      verified.ContentLength !== item.fileSizeBytes ||
      verified.Metadata?.sha256 !== item.checksumSha256
    )
      throw new Error("No se confirmó la imagen subida.");
    item.uploaded = true;
  }
  completed++;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (completed % 25 === 0) console.log(JSON.stringify({ completed, total: urls.length, upload }));
}
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        await processImage(url);
      } catch (error) {
        errors.push({ url, error: error.message });
      }
    }
  })
);
fs.writeFileSync(path.join(directory, "errores-imagenes.json"), JSON.stringify(errors, null, 2));
console.log(JSON.stringify({ completed, total: urls.length, errors: errors.length, upload }));
if (errors.length) process.exitCode = 1;

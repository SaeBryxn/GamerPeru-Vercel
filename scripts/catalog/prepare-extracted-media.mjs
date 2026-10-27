import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { stableId } from "./supplier-plan.mjs";

const directory = path.resolve(process.argv[2]);
const upload = process.argv.includes("--upload");
const sources = JSON.parse(fs.readFileSync(path.join(directory, "extracted/images.json")));
const extraction = JSON.parse(fs.readFileSync(path.join(directory, "extracted/catalogue.json")));
const sourceDate = new Date(extraction.extractedAt).toISOString().slice(0, 10);
const target = path.join(directory, "publication");
fs.mkdirSync(path.join(target, "imagenes-web"), { recursive: true });
const manifestPath = path.join(target, "media.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath)) : {};
const hash = (data) => createHash("sha256").update(data).digest("hex");
sharp.concurrency(1);
sharp.cache({ memory: 32 });
let client;
if (upload) {
  process.loadEnvFile(".env.local");
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
const groups = [...Map.groupBy(Object.entries(sources), ([, value]) => value.sha256).values()];
let cursor = 0,
  completed = 0;
const errors = [];
async function processGroup(entries) {
  const [url, source] = entries[0];
  const sourceFile = path.resolve(directory, "extracted", source.file);
  if (!sourceFile.startsWith(path.join(directory, "extracted/images") + path.sep))
    throw Error("Invalid source path");
  let item = entries.map(([key]) => manifest[key]).find(Boolean);
  if (!item || !fs.existsSync(path.join(target, item.file))) {
    const original = fs.readFileSync(sourceFile);
    if (hash(original) !== source.sha256) throw Error("Original checksum mismatch");
    const { data, info } = await sharp(original, { limitInputPixels: 100000000 })
      .rotate()
      .resize({ width: 1800, withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const checksum = hash(data);
    const file = `imagenes-web/${checksum}.webp`;
    fs.writeFileSync(path.join(target, file), data);
    item = {
      id: stableId(`media:${checksum}`),
      objectKey: `catalog/suppliers/${sourceDate}/${checksum}.webp`,
      file,
      checksumSha256: checksum,
      originalChecksum: source.sha256,
      fileSizeBytes: data.length,
      width: info.width,
      height: info.height,
      mimeType: "image/webp",
      uploaded: false,
    };
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
        throw Error("Stored object mismatch");
      exists = true;
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 404) throw error;
    }
    if (!exists)
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: process.env.R2_PUBLIC_MEDIA_BUCKET,
            Key: item.objectKey,
            Body: fs.readFileSync(path.join(target, item.file)),
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
      throw Error("Upload verification failed");
    item.uploaded = true;
  }
  for (const [key] of entries) manifest[key] = item;
  completed++;
  if (completed % 25 === 0) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    console.log(JSON.stringify({ completed, total: groups.length, upload }));
  }
}
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < groups.length) {
      const entries = groups[cursor++];
      try {
        await processGroup(entries);
      } catch (error) {
        errors.push({ url: entries[0][0], error: error.message });
      }
    }
  })
);
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
fs.writeFileSync(path.join(target, "errores-imagenes.json"), JSON.stringify(errors, null, 2));
console.log(JSON.stringify({ completed, total: groups.length, errors: errors.length, upload }));
if (errors.length) process.exitCode = 1;

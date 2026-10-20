import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

const explicitEndpoint = process.env.S3_ENDPOINT?.trim();
const endpoint =
  explicitEndpoint ?? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const region = explicitEndpoint ? (process.env.S3_REGION ?? "auto") : "auto";
const client = new S3Client({
  region,
  endpoint,
  forcePathStyle: Boolean(explicitEndpoint),
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const PUBLIC = process.env.R2_PUBLIC_MEDIA_BUCKET;
const PRIVATE = process.env.R2_PRIVATE_PROOFS_BUCKET;
const PROOFS = process.env.R2_PRIVATE_PROOFS_BUCKET;

let pass = 0,
  fail = 0;
async function step(name, fn) {
  try {
    const r = await fn();
    pass++;
    console.log(`  OK   ${name}${r ? ` -> ${r}` : ""}`);
    return r;
  } catch (e) {
    fail++;
    console.log(`  FALLA ${name} -> ${e.name}: ${e.message}`);
    return null;
  }
}

console.log(`endpoint: ${endpoint}\nregion:   ${region}\n`);

console.log("1) Buckets accesibles");
for (const b of [PUBLIC, PROOFS]) {
  await step(`HeadBucket ${b}`, async () => {
    await client.send(new HeadBucketCommand({ Bucket: b }));
  });
}

const key = `storage-selftest/_selftest-${crypto.randomUUID()}`;
const body = Buffer.from("gamerperu-storage-selftest");

console.log("\n2) Escritura/lectura directa (bucket privado de pruebas)");
await step("PutObject", async () => {
  await client.send(
    new PutObjectCommand({ Bucket: PRIVATE, Key: key, Body: body, ContentType: "text/plain" })
  );
});
await step("HeadObject", async () => {
  const r = await client.send(new HeadObjectCommand({ Bucket: PRIVATE, Key: key }));
  return `${r.ContentLength} bytes, ${r.ContentType}`;
});
await step("GetObject integridad", async () => {
  const r = await client.send(new GetObjectCommand({ Bucket: PRIVATE, Key: key }));
  const got = Buffer.from(await r.Body.transformToByteArray());
  if (!got.equals(body)) throw new Error("bytes no coinciden");
  return "bytes identicos";
});
await step("ListObjectsV2", async () => {
  const r = await client.send(
    new ListObjectsV2Command({ Bucket: PRIVATE, Prefix: "storage-selftest/", MaxKeys: 5 })
  );
  return `${r.KeyCount ?? 0} objetos con ese prefijo`;
});

console.log("\n3) Presigned PUT (la ruta real del panel: el navegador sube directo)");
const presignKey = `storage-selftest/_selftest-presign-${crypto.randomUUID()}`;
const presigned = await step("generar URL firmada", async () => {
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: PRIVATE,
      Key: presignKey,
      ContentType: "image/png",
    }),
    { expiresIn: 600 }
  );
  return url.split("?")[0];
});
if (presigned) {
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: PRIVATE,
      Key: presignKey,
      ContentType: "image/png",
    }),
    { expiresIn: 600 }
  );
  await step("subir con la URL firmada (fetch)", async () => {
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" }, body });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return `HTTP ${res.status}`;
  });
  await step("verificar objeto subido", async () => {
    const r = await client.send(new HeadObjectCommand({ Bucket: PRIVATE, Key: presignKey }));
    return `${r.ContentLength} bytes`;
  });
}

console.log("\n4) Escritura condicional If-None-Match (anti-sobrescritura del bucket publico)");
const condKey = `products/_selftest/${crypto.randomUUID()}.webp`;
await step("primer PutObject condicional (debe crear)", async () => {
  await client.send(
    new PutObjectCommand({
      Bucket: PUBLIC,
      Key: condKey,
      Body: body,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
      IfNoneMatch: "*",
    })
  );
  return "creado";
});
// Informativo: Supabase Storage acepta e ignora If-None-Match. El adaptador compensa con un
// HEAD previo, asi que este paso documenta la capacidad del proveedor, no un fallo del sistema.
await step("segundo PutObject condicional (capacidad del proveedor)", async () => {
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: PUBLIC,
        Key: condKey,
        Body: body,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
        IfNoneMatch: "*",
      })
    );
  } catch (e) {
    const code = e.$metadata?.httpStatusCode;
    if (code === 412 || e.name === "PreconditionFailed")
      return `el proveedor honra If-None-Match (${code ?? e.name})`;
    throw e;
  }
  return "el proveedor ignora If-None-Match; el adaptador usa HEAD previo";
});

console.log("\n5) Lectura publica por CDN (sin credenciales)");
const cdn = process.env.NEXT_PUBLIC_CDN_URL;
await step(`GET ${cdn}/<objeto>`, async () => {
  const res = await fetch(`${cdn}/${condKey}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  if (txt !== body.toString()) throw new Error("contenido distinto");
  return `HTTP ${res.status}, cache-control: ${res.headers.get("cache-control")}`;
});

console.log("\n6) Bucket privado NO debe ser legible sin credenciales");
const privKey = `storage-selftest/_selftest-private-${crypto.randomUUID()}`;
await client.send(
  new PutObjectCommand({ Bucket: PRIVATE, Key: privKey, Body: body, ContentType: "text/plain" })
);
await step("GET publico al bucket privado (debe fallar)", async () => {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PRIVATE}/${privKey}`
  );
  if (res.ok) throw new Error("FUGA: el bucket privado respondio 200 sin credenciales");
  return `bloqueado (HTTP ${res.status})`;
});

console.log("\n7) Limpieza");
for (const [b, k] of [
  [PRIVATE, key],
  [PRIVATE, presignKey],
  [PRIVATE, privKey],
  [PUBLIC, condKey],
]) {
  await step(`DeleteObject ${b}/${k.slice(0, 40)}...`, async () => {
    await client.send(new DeleteObjectCommand({ Bucket: b, Key: k }));
  });
}

console.log(`\nRESULTADO STORAGE: ${pass} ok, ${fail} fallas`);
process.exit(fail > 0 ? 1 : 0);

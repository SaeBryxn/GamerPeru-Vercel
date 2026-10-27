import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
const target = path.resolve(process.argv[2]);
const file = path.join(target, "media.json");
const media = JSON.parse(fs.readFileSync(file));
process.loadEnvFile(".env.local");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  const ids = [...new Set(Object.values(media).map((m) => m.id))];
  const previous =
    await sql`select id,object_key,checksum_sha256,file_size_bytes from media_assets where id in ${sql(ids)}`;
  const known = new Map(previous.map((a) => [a.id, a]));
  for (const item of Object.values(media)) {
    const old = known.get(item.id);
    item.registeredBeforeImport ??= Boolean(old);
    if (!old) continue;
    if (old.checksum_sha256 !== item.checksumSha256 || old.file_size_bytes !== item.fileSizeBytes)
      throw Error("Existing media integrity mismatch");
    item.objectKey = old.object_key;
  }
  fs.writeFileSync(file, JSON.stringify(media));
  console.log(
    JSON.stringify({
      references: Object.keys(media).length,
      reusedRegisteredAssets: previous.length,
    })
  );
} finally {
  await sql.end();
}

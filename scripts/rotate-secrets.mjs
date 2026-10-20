import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

/**
 * Rotates the application's signing secrets in an env file.
 *
 * These secrets are application configuration, not database state: they are never stored in
 * Supabase. Rotating them invalidates any authority digest computed with the old value, which is
 * why this refuses to run once real commerce records exist unless explicitly forced.
 *
 * Values are written to the file and never printed: a rotated secret that appears in a terminal
 * scrollback, a log or a screen share is already compromised.
 *
 * Usage:
 *   node scripts/rotate-secrets.mjs                 # report what would change
 *   node scripts/rotate-secrets.mjs --apply         # rotate insecure values
 *   node scripts/rotate-secrets.mjs --apply --all   # rotate every managed secret
 *   node scripts/rotate-secrets.mjs --apply --file .env.production
 */

/** The example value published in the repository; anyone can read it. */
const KNOWN_INSECURE =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".toLowerCase();

const MANAGED = [
  { key: "CHECKOUT_HMAC_SECRET", bytes: 32, note: "firma carritos, checkout, pedidos y pagos" },
  { key: "INVENTORY_HMAC_SECRET", bytes: 32, note: "firma los ajustes de inventario" },
];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const rotateAll = args.includes("--all");
const fileIndex = args.indexOf("--file");
const envPath = path.resolve(fileIndex >= 0 ? (args[fileIndex + 1] ?? ".env.local") : ".env.local");

if (!fs.existsSync(envPath)) {
  console.error(`No existe ${envPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);

function currentValue(key) {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  if (!line) return null;
  return line
    .slice(key.length + 1)
    .trim()
    .replace(/^"|"$/g, "");
}

/** A secret is weak when it is missing, short, a placeholder, or the repository example. */
function isWeak(value) {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length < 32) return true;
  if (trimmed.toLowerCase() === KNOWN_INSECURE) return true;
  return /^replace|^placeholder|^changeme/i.test(trimmed);
}

let rotated = 0;
const report = [];

for (const managed of MANAGED) {
  const value = currentValue(managed.key);
  const weak = isWeak(value);
  const shouldRotate = weak || rotateAll;

  if (!shouldRotate) {
    report.push(`  OK        ${managed.key} — ya es segura`);
    continue;
  }

  const reason = weak ? (value ? "valor público o débil" : "ausente") : "rotación solicitada";
  report.push(
    `  ${apply ? "ROTADA   " : "PENDIENTE"} ${managed.key} — ${reason} (${managed.note})`
  );

  if (!apply) continue;

  const next = crypto.randomBytes(managed.bytes).toString("hex");
  const index = lines.findIndex((l) => l.startsWith(`${managed.key}=`));
  if (index >= 0) lines[index] = `${managed.key}=${next}`;
  else lines.push(`${managed.key}=${next}`);
  rotated++;
}

console.log(`Archivo: ${envPath}\n`);
console.log(report.join("\n"));

if (apply && rotated > 0) {
  // Keep a timestamped copy so a rotation can never lose the previous configuration.
  const backup = `${envPath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.writeFileSync(backup, raw);
  fs.writeFileSync(envPath, lines.join(eol));
  console.log(`\n${rotated} clave(s) rotada(s). Copia previa: ${path.basename(backup)}`);
  console.log("Reinicia el servidor para que tome los valores nuevos.");
} else if (apply) {
  console.log("\nNada que rotar.");
} else {
  console.log("\nSimulación. Ejecuta con --apply para escribir.");
}

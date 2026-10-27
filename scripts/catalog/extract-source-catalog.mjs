import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseDocument } from "htmlparser2";
import {
  descendants,
  enrichAttackProduct,
  normalizeAttackProduct,
  parseJinmsProduct,
  parseMemoryProduct,
  sourceProductLinks,
} from "./source-catalog.mjs";

const directory = path.resolve(process.argv[2] ?? "scratch/catalogo-fuentes");
const downloadImages = process.argv.includes("--images");
fs.mkdirSync(path.join(directory, "sources"), { recursive: true });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const errors = [];
async function fetchSource(url) {
  const file = path.join(directory, "sources", `${hash(url)}.txt`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const value = await response.text();
      if (value.length > 20 * 1024 * 1024) throw Error("Source exceeds 20 MB");
      fs.writeFileSync(file, value);
      return value;
    } catch (error) {
      last = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw last;
}
async function pool(items, worker, concurrency = 4) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        try {
          await worker(item);
        } catch (error) {
          errors.push({ source: item, error: error.message });
        }
      }
    })
  );
}
const products = new Map(),
  excluded = [];
const attackCurrency = JSON.parse(await fetchSource("https://attackshark.com/cart.js")).currency;
if (!["USD", "PEN"].includes(attackCurrency)) throw Error("Attack Shark currency not verified");
const collections = [
  ["shop-all-keyboard", "teclados"],
  ["shop-all-mouse", "mouses"],
  ["headset", "audio"],
  ["shop-all-mousepad", "mousepads"],
];
for (const [collection, category] of collections) {
  for (let page = 1; page <= 20; page++) {
    const url = `https://attackshark.com/collections/${collection}/products.json?limit=250&page=${page}`;
    const source = JSON.parse(await fetchSource(url));
    if (!Array.isArray(source.products)) throw Error(`Missing product list: ${url}`);
    for (const item of source.products) {
      const product = normalizeAttackProduct(item, category, attackCurrency);
      if (product) products.set(`${product.source}:${product.sourceId}`, product);
      else
        excluded.push({
          sourceUrl: `https://attackshark.com/products/${item.handle}`,
          name: item.title,
          reason: "Fuera de teclados, mouses, audífonos y mousepads",
        });
    }
    if (source.products.length < 250) break;
    if (page === 20) throw Error("Attack Shark pagination incomplete");
  }
}
console.log(
  JSON.stringify({ source: "attack-shark", products: products.size, excluded: excluded.length })
);
await pool([...products.values()], async (product) => {
  const enriched = enrichAttackProduct(product, await fetchSource(product.sourceUrl));
  products.set(`${product.source}:${product.sourceId}`, enriched);
});
const jinmsIndex = await fetchSource("https://www.jinms.com/products/");
const jinmsLinks = sourceProductLinks(
  jinmsIndex,
  "https://www.jinms.com",
  /^\/jinms-[a-z0-9-]+\/$/
);
await pool(jinmsLinks, async (url) => {
  const product = parseJinmsProduct(await fetchSource(url), url);
  if (!product.name) throw Error("Missing JINMS product name");
  products.set(`${product.source}:${product.sourceId}`, product);
});
console.log(
  JSON.stringify({
    source: "jinms",
    discovered: jinmsLinks.length,
    extracted: [...products.values()].filter((p) => p.source === "jinms").length,
  })
);
const monitorLinks = new Set();
for (let page = 1; page <= 20; page++) {
  const url = `https://www.memorykings.pe/listados/582/monitores-gaming?pagina=${page}`;
  const html = await fetchSource(url);
  for (const link of sourceProductLinks(html, "https://www.memorykings.pe", /^\/producto\/\d+\//))
    monitorLinks.add(link);
  const pages = descendants(parseDocument(html))
    .filter((n) => n.name === "a")
    .map((n) => n.attribs?.href ?? "");
  if (
    !pages.some(
      (href) =>
        new URL(href, "https://www.memorykings.pe").searchParams.get("pagina") === String(page + 1)
    )
  )
    break;
  if (page === 20) throw Error("Monitor pagination incomplete");
}
let completed = 0;
await pool([...monitorLinks], async (url) => {
  const product = parseMemoryProduct(await fetchSource(url), url);
  if (!product.name || !product.sourceId) throw Error("Missing monitor identity");
  products.set(`${product.source}:${product.sourceId}`, product);
  if (++completed % 25 === 0)
    console.log(JSON.stringify({ source: "memory-kings", completed, total: monitorLinks.size }));
});
const catalogue = [...products.values()].sort((a, b) =>
  `${a.brand}:${a.name}`.localeCompare(`${b.brand}:${b.name}`)
);
const report = {
  extractedAt: new Date().toISOString(),
  products: catalogue,
  excluded,
  errors,
  policy: {
    stock: "Cero unidades propias; nunca se copia el stock del proveedor",
    prices: "Moneda y precio de la fuente, sin presentarlos como costo de compra",
    reviews: "No se importan calificaciones ni reseñas del proveedor",
  },
};
fs.writeFileSync(path.join(directory, "catalogue.json"), JSON.stringify(report, null, 2));
const csvCell = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
const rows = [
  [
    "Marca",
    "Categoría",
    "Modelo",
    "Título original",
    "Moneda",
    "Precio referencia",
    "Versiones",
    "Especificaciones",
    "Imágenes",
    "Fuente",
  ],
  ...catalogue.map((p) => [
    p.brand,
    p.category,
    p.name,
    p.originalName,
    p.variants[0]?.price?.currency,
    p.variants[0]?.price ? p.variants[0].price.cents / 100 : "",
    p.variants.length,
    p.specifications.map((s) => `${s.label}: ${s.value}`).join("\n"),
    p.images.join("\n"),
    p.sourceUrl,
  ]),
];
fs.writeFileSync(
  path.join(directory, "catalogue.csv"),
  "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")
);
if (downloadImages) {
  fs.mkdirSync(path.join(directory, "images"), { recursive: true });
  const file = path.join(directory, "images.json");
  const manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const urls = [...new Set(catalogue.flatMap((p) => p.images))];
  let count = 0;
  const allowedHosts = new Set([
    "attackshark.com",
    "cdn.shopify.com",
    "ecdn6.globalso.com",
    "cdn.memorykings.pe",
  ]);
  await pool(urls, async (url) => {
    if (!manifest[url] || !fs.existsSync(path.join(directory, manifest[url].file))) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname))
        throw Error("Image host outside source allowlist");
      const response = await fetch(url, { signal: AbortSignal.timeout(45000), redirect: "error" });
      if (!response.ok) throw Error(`Image HTTP ${response.status}`);
      const mime = (response.headers.get("content-type") ?? "").split(";")[0];
      if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(mime)) throw Error("Unsupported image type");
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 20 * 1024 * 1024) throw Error("Image exceeds 20 MB");
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks),
        checksum = hash(data),
        extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
      const relative = `images/${checksum}.${extension}`;
      fs.writeFileSync(path.join(directory, relative), data);
      manifest[url] = { file: relative, bytes, mime, sha256: checksum };
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    }
    if (++count % 50 === 0) console.log(JSON.stringify({ images: count, total: urls.length }));
  });
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ downloaded: count, images: urls.length }));
}
fs.writeFileSync(path.join(directory, "errors.json"), JSON.stringify(errors, null, 2));
console.log(
  JSON.stringify({
    products: catalogue.length,
    bySource: Object.fromEntries(
      ["attack-shark", "jinms", "memory-kings"].map((s) => [
        s,
        catalogue.filter((p) => p.source === s).length,
      ])
    ),
    missingSpecs: catalogue.filter((p) => !p.specifications.length).map((p) => p.name),
    missingPrice: catalogue.filter((p) => !p.variants.some((v) => v.price)).map((p) => p.name),
    errors: errors.length,
  })
);
if (errors.length) process.exitCode = 1;

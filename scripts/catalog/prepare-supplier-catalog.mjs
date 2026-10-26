import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSupplierPlan, normalizedSupplierProducts, slugify } from "./supplier-plan.mjs";

export function prepare(directory) {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
  const atk = read("fuentes/atk-normalizado.json");
  const mchose = read("fuentes/mchose.json").products;
  const existing = read("estado-inicial.json").catalog;
  const webTexts = Object.fromEntries(
    fs
      .readdirSync(path.join(directory, "fuentes"))
      .filter((f) => f.startsWith("web-") && f.endsWith(".txt"))
      .map((f) => [f.slice(4, -4), fs.readFileSync(path.join(directory, "fuentes", f), "utf8")])
  );
  const market = [];
  for (const file of ["mercado-atk-ucp-datos.json", "mercado-mchose-ucp-datos.json"]) {
    for (const p of read(`fuentes/${file}`).products ?? []) {
      if (p.price_range.min.currency !== "PEN" || !/\bATK\b|\bMCHOSE\b/i.test(p.title)) continue;
      const name = p.title
        .split("|")[0]
        .replace(
          /^(TECLADO(?: MAGNETICO)?|MOUSEPAD|GLASS MOUSEPAD|MOUSE|AUDIFONO(?: IN-EAR)?|RECEPTOR|SKATES MOUSE)\s+/i,
          ""
        )
        .trim();
      market.push({
        modelKey: slugify(name),
        priceCents: p.price_range.min.amount,
        url: p.url,
        title: p.title,
      });
    }
  }
  const plan = buildSupplierPlan({
    products: normalizedSupplierProducts(atk, mchose),
    existing,
    webTexts,
    market,
  });
  plan.snapshot = {
    categories: read("estado-inicial.json").categories,
    brands: read("estado-inicial.json").brands,
  };
  fs.writeFileSync(path.join(directory, "plan.json"), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(directory, "referencias-peru.json"), JSON.stringify(market, null, 2));
  console.log(
    JSON.stringify({
      products: plan.products.length,
      variants: plan.products.reduce((n, p) => n + p.variants.length, 0),
      images: new Set(plan.products.flatMap((p) => p.images.map((i) => i.url))).size,
      byBrand: Object.fromEntries(
        ["atk", "mchose"].map((b) => [b, plan.products.filter((p) => p.brand === b).length])
      ),
      excluded: plan.excluded.length,
      poorSpecs: plan.products.filter((p) => p.facts.length < 2).map((p) => p.name),
    })
  );
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  prepare(process.argv[2] ?? "scratch/catalogo-20261026");

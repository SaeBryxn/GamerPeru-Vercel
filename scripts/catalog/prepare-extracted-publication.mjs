import fs from "node:fs";
import path from "node:path";
import { stableId, slugify, structuredSpecs } from "./supplier-plan.mjs";

const directory = path.resolve(process.argv[2]);
const snapshot = JSON.parse(fs.readFileSync(path.join(directory, "publication-before.json")));
const extraction = JSON.parse(fs.readFileSync(path.join(directory, "extracted/catalogue.json")));
const target = path.join(directory, "publication");
fs.mkdirSync(target, { recursive: true });
const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[`*_]/g, "")
    .replace(/\b(?:javascript|vbscript|data)\s*:/gi, "")
    .replace(/\bon([a-z]+)\s*=/gi, "$1 ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[-+•]\s+|#{1,6}\s+|>\s+|\d+\.\s+)/, "")
    .slice(0, max);
const roundRetail = (cents) => Math.max(900, (Math.ceil((cents / 100 + 1) / 10) * 10 - 1) * 100);
const brandName = (p) =>
  p.brand === "COOLER" && /COOLER\s+MASTER/i.test(p.originalName) ? "Cooler Master" : p.brand;
const brandDefs = [...new Set(extraction.products.map(brandName))].map((name) => {
  const previous = snapshot.brands.find((b) => b.name.toLowerCase() === name.toLowerCase());
  return (
    previous ?? {
      id: stableId(`brand:${slugify(name)}`),
      name,
      slug: slugify(name),
      status: "PUBLISHED",
    }
  );
});
const monitor = snapshot.categories.find((c) => c.slug === "monitores") ?? {
  id: stableId("category:monitores"),
  name: "Monitores Gaming",
  slug: "monitores",
  status: "PUBLISHED",
  current_spec_schema_id: null,
  schema_version: null,
  field_definitions: null,
  is_active: null,
};
const categories = snapshot.categories.some((c) => c.slug === "monitores")
  ? snapshot.categories
  : [...snapshot.categories, monitor];
const categoryPrices = (category) => {
  const ids = snapshot.catalog
    .filter((p) => p.category_id === categories.find((c) => c.slug === category)?.id)
    .map((p) => p.id);
  return snapshot.variants
    .filter((v) => ids.includes(v.product_id) && v.price_cents > 0)
    .map((v) => v.price_cents)
    .sort((a, b) => a - b);
};
const products = extraction.products.map((p) => {
  const brand = brandDefs.find((b) => b.name.toLowerCase() === brandName(p).toLowerCase());
  const id = stableId(`extracted:${p.source}:${p.sourceId}`);
  const facts = p.specifications
    .map((f) => ({
      label: clean(f.label, 80),
      value: clean(f.value, 200),
      note: clean(f.note, 180),
    }))
    .filter((f) => f.label && f.value);
  const name = clean(p.name.replace(/^Jinms /, "JINMS ").replace(/\bHe$/, "HE"), 200);
  const existing = snapshot.catalog.find(
    (row) => row.brand_id === brand.id && row.name.toLowerCase() === name.toLowerCase()
  );
  const slug = existing?.slug ?? slugify(name);
  const variants = p.variants.map((v, i) => {
    const variantId = stableId(`extracted-variant:${p.source}:${p.sourceId}:${v.sourceId ?? i}`);
    const prices = categoryPrices(p.category);
    const family = snapshot.catalog.find(
      (row) => row.brand_id === brand.id && row.name.toLowerCase().startsWith(name.toLowerCase())
    );
    const familyPrices = family
      ? snapshot.variants
          .filter((row) => row.product_id === family.id)
          .map((row) => row.price_cents)
      : [];
    const reference = v.price?.cents ?? familyPrices[0] ?? prices[Math.floor(prices.length / 2)];
    if (!reference || (v.price && v.price.currency !== "PEN"))
      throw Error(`No valid PEN reference: ${name}`);
    const logistics = { mouses: 20, teclados: 35, mousepads: 20, audio: 25 }[p.category] ?? 20;
    const priceCents =
      v.price && p.source === "attack-shark"
        ? roundRetail((reference * 1.18 + logistics * 100) * 1.15)
        : v.price
          ? roundRetail(reference * 1.03)
          : roundRetail(reference);
    const attributes = Object.fromEntries(
      v.options
        .filter((o) => o.value && o.value !== "Default Title")
        .map((o) => [
          /color/i.test(o.name)
            ? "color"
            : /size/i.test(o.name)
              ? "size"
              : /switch/i.test(o.name)
                ? "switch"
                : slugify(o.name).replace(/-/g, "_"),
          clean(o.value, 140),
        ])
    );
    return {
      id: variantId,
      sku: `GP-${p.source === "memory-kings" ? "MON" : p.source === "jinms" ? "JMS" : "AS"}-${variantId.replace(/-/g, "").slice(0, 20)}`,
      title: clean(v.name === "Modelo" || v.name === "Default Title" ? "Estándar" : v.name, 150),
      priceCents,
      attributes,
      imageUrl: v.image,
      sourceSku: v.sku,
      sourcePrice: v.price,
      priceBasis: v.price
        ? p.source === "attack-shark"
          ? "PVP PEN del fabricante + reserva 18%, logística y margen estimado 15%"
          : "Referencia minorista PEN + 3% y redondeo"
        : familyPrices.length
          ? "Estimación provisional basada en el mismo modelo del catálogo actual"
          : "Estimación provisional: mediana de precios de la categoría del catálogo actual",
      estimated: !v.price,
    };
  });
  const images = p.images.map((url, i) => ({
    url,
    variantId: null,
    placement:
      (p.storyImages ?? []).includes(url) && !(p.galleryImages ?? []).includes(url)
        ? "STORY"
        : "GALLERY",
    alt: `${name} · imagen ${i + 1}`,
  }));
  for (const v of variants)
    if (v.imageUrl)
      images.push({
        url: v.imageUrl,
        variantId: v.id,
        placement: "GALLERY",
        alt: `${name} · ${v.title}`,
      });
  return {
    id,
    source: p.sourceUrl,
    sourceKey: `${p.source}:${p.sourceId}`,
    brand: brand.slug,
    category: p.category,
    name,
    slug,
    existingId: existing?.id ?? null,
    description:
      clean(p.description, 1000) ||
      `${name}. ${facts
        .slice(0, 3)
        .map((f) => `${f.label}: ${f.value}`)
        .join(". ")}`.slice(0, 1000),
    facts,
    storyImages: p.storyImages ?? [],
    images,
    variants,
    pdpConfig: {
      contentSections: ["story", "reviews"],
      specifications: facts.slice(0, 60),
      highlightsEnabled: true,
      dimensionsEnabled: true,
      specificationsEnabled: true,
      support: { shippingNote: "Consulta disponibilidad antes de comprar." },
    },
  };
});
if (new Set(products.map((p) => p.slug)).size !== products.length)
  throw Error("Duplicate publication slug");
const plan = {
  schemaVersion: 1,
  batch: `catalogo-extraido-${new Date(extraction.extractedAt).toISOString().slice(0, 10)}`,
  createdAt: new Date().toISOString(),
  snapshot: { ...snapshot, categories },
  brands: brandDefs,
  products,
};
fs.writeFileSync(path.join(target, "plan.json"), JSON.stringify(plan, null, 2));
fs.writeFileSync(path.join(target, "estado-inicial.json"), JSON.stringify(snapshot, null, 2));
fs.writeFileSync(
  path.join(target, "precios-provisionales.json"),
  JSON.stringify(
    products
      .filter((p) => p.variants.some((v) => v.estimated))
      .map((p) => ({
        name: p.name,
        variants: p.variants.map((v) => ({ priceCents: v.priceCents, basis: v.priceBasis })),
      })),
    null,
    2
  )
);
console.log(
  JSON.stringify(
    {
      products: products.length,
      variants: products.reduce((n, p) => n + p.variants.length, 0),
      brands: brandDefs.length,
      newBrands: brandDefs.filter((b) => !snapshot.brands.some((x) => x.id === b.id)).length,
      existing: products.filter((p) => p.existingId),
      estimated: products
        .filter((p) => p.variants.some((v) => v.estimated))
        .map((p) => ({ name: p.name, price: p.variants[0].priceCents / 100 })),
      structured: products.filter((p) => Object.keys(structuredSpecs(p)).length).length,
    },
    null,
    2
  )
);

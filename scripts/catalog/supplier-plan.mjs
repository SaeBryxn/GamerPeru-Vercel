import { createHash } from "node:crypto";
import { parseDocument } from "htmlparser2";
import { compactProductName } from "./product-names.mjs";

export const PRICING = {
  usdPen: 3.45,
  exchangeDate: "2026-10-22",
  exchangeSource:
    "https://www.sbs.gob.pe/app/pp/SISTIP_PORTAL/Paginas/Publicacion/TipoCambioPromedio.aspx",
  reserveTax: 0.18,
  estimatedMarkup: 0.15,
  marketPremium: 0.03,
};

export function stableId(key) {
  const h = createHash("sha256").update(`gamerperu-supplier-v1:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const slugify = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\+/g, " plus ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 195)
    .replace(/-$/, "");
const children = (n) => n.children ?? [];
const text = (n) =>
  n.type === "text"
    ? n.data
    : ["script", "style"].includes(n.name)
      ? ""
      : children(n).map(text).join(" ");
const nodes = (n, tag) => children(n).flatMap((c) => (c.name === tag ? [c] : nodes(c, tag)));
export const plain = (value) =>
  text(parseDocument(String(value ?? ""), { decodeEntities: true }))
    .replace(/\s+/g, " ")
    .trim();
const clip = (s, n) => plain(s).slice(0, n).trim();

export function categoryFor(title) {
  if (/gaming combo|gear bundle|setup bundle/i.test(title)) return "accesorios";
  if (
    /keycap|keychain|switches|switch\s+gt|receiver|dongle|cable|case|bag|sleeve|wrist.rest|stand|earpads|bottle|cap\b|mod kit|plate|grip|tape|skates|puller/i.test(
      title
    )
  )
    return "accesorios";
  if (/mouse\s*(?:gaming\s*)?pad|mousepad/i.test(title)) return "mousepads";
  if (/headset|headphone|earphone|soundbar|\biems?\b/i.test(title)) return "audio";
  if (/keyboard/i.test(title)) return "teclados";
  if (/\bmouse\b|\bmice\b/i.test(title)) return "mouses";
  return "accesorios";
}

const LABELS = {
  "product name": "Modelo",
  model: "Versión",
  color: "Colores",
  dimensions: "Dimensiones",
  size: "Medidas",
  weight: "Peso",
  weights: "Peso",
  sensor: "Sensor",
  mcu: "MCU",
  chipset: "Chipset",
  switch: "Switches",
  switches: "Switches",
  "main switch": "Switches",
  connectivity: "Conexión",
  connection: "Conexión",
  "connection method": "Conexión",
  battery: "Batería",
  "battery capacity": "Capacidad de batería",
  "battery life": "Autonomía",
  "polling rate": "Polling rate",
  "report rate": "Polling rate",
  "scan rate": "Frecuencia de escaneo",
  layout: "Distribución",
  keycaps: "Keycaps",
  structure: "Estructura",
  material: "Material",
  surface: "Superficie",
  base: "Base",
  thickness: "Grosor",
  firmness: "Firmeza",
  "rapid trigger": "Rapid Trigger",
  "actuation range": "Rango de actuación",
  "actuation point": "Punto de actuación",
  latency: "Latencia",
  resolution: "Resolución",
  dpi: "DPI",
  software: "Software",
  driver: "Software",
  lighting: "Iluminación",
  "rgb lighting": "Iluminación",
  "scroll wheel": "Rueda",
  encoder: "Encoder",
  coating: "Recubrimiento",
  "mouse feet": "Skates",
  dongle: "Receptor",
  "button latency": "Latencia del clic",
  compatibility: "Compatibilidad",
  driverunit: "Driver",
  "frequency response": "Respuesta de frecuencia",
  impedance: "Impedancia",
  sensitivity: "Sensibilidad",
};

export function extractFacts(html, webText = "") {
  const facts = [];
  const add = (label, value) => {
    label = clip(label, 80);
    value = clip(value, 200);
    if (
      !label ||
      !value ||
      /\b(undefined|null)\b/i.test(value) ||
      /<|>|javascript:|\bdata:/i.test(value)
    )
      return;
    if (!facts.some((f) => f.label === label && f.value === value))
      facts.push({ label, value, note: "Según la ficha oficial; puede variar por versión." });
  };
  const doc = parseDocument(html ?? "", { decodeEntities: true });
  for (const tr of nodes(doc, "tr")) {
    const cells = children(tr)
      .filter((n) => ["td", "th"].includes(n.name))
      .map((n) => plain(text(n)));
    if (cells.length > 1)
      add(
        LABELS[cells[0].toLowerCase()] ?? cells[0],
        [...new Set(cells.slice(1).filter(Boolean))].join(" / ")
      );
  }
  for (const li of nodes(doc, "li")) {
    const line = plain(text(li));
    const colon = line.indexOf(":");
    if (colon > 0 && colon < 65)
      add(
        LABELS[line.slice(0, colon).trim().toLowerCase()] ?? line.slice(0, colon),
        line.slice(colon + 1)
      );
    else {
      const label = /PAW\s*\d/i.test(line)
        ? "Sensor"
        : /polling|[248]k\s*hz/i.test(line)
          ? "Polling rate"
          : /battery|mAh/i.test(line)
            ? "Batería"
            : /switch/i.test(line)
              ? "Switches"
              : /weight|\d\s*g\b/i.test(line)
                ? "Peso"
                : /wireless|connect|bluetooth|USB/i.test(line)
                  ? "Conexión"
                  : /\bdpi\b/i.test(line)
                    ? "DPI"
                    : /encoder|wheel/i.test(line)
                      ? "Rueda"
                      : null;
      if (label) add(label, line);
    }
  }
  const flatLines = String(html ?? "")
    .replace(/<br\s*\/?\s*>|<\/(?:p|li|div|tr|h[1-6])>/gi, "\n")
    .split("\n")
    .map(plain)
    .filter(Boolean);
  for (const line of flatLines) {
    const colon = line.search(/[:：]/);
    if (colon > 0 && colon < 65) {
      const key = line.slice(0, colon).trim(),
        value = line.slice(colon + 1);
      if (value.trim())
        add(
          key.toLowerCase() === "driver" && /mm/.test(value)
            ? "Transductor"
            : (LABELS[key.toLowerCase()] ?? key),
          value
        );
    } else if (line.length < 220) {
      const label = /PAW\s*\d/i.test(line)
        ? "Sensor"
        : /polling|[248]k\s*hz/i.test(line)
          ? "Polling rate"
          : /battery|mAh/i.test(line)
            ? "Batería"
            : /switch/i.test(line)
              ? "Switches"
              : /\d\s*g\b/i.test(line)
                ? "Peso"
                : /connect|bluetooth|USB/i.test(line)
                  ? "Conexión"
                  : /\bdpi\b/i.test(line)
                    ? "DPI"
                    : /scan rate/i.test(line)
                      ? "Frecuencia de escaneo"
                      : /rapid trigger/i.test(line)
                        ? "Rapid Trigger"
                        : null;
      if (label) add(label, line);
    }
  }
  const lines = webText.split("\n").map((l) => l.replace(/^L\d+:\s?/, "").trim());
  const start = lines.findIndex((l) =>
    /^(?:#{1,4}\s*)?(?:technical\s+)?specifications?\s*$/i.test(l)
  );
  if (start >= 0) {
    let label = null,
      values = [];
    const flush = () => {
      if (label) add(label, [...new Set(values)].join(" / "));
    };
    for (const line of lines.slice(start + 1)) {
      if (/^#{1,3}\s|^Share$|^\[MOBILE|Customer Reviews/.test(line)) break;
      if (!line || line.includes("【") || line.startsWith("[")) continue;
      const bullet = line.replace(/^\s*[-*]\s*/, "");
      const colon = bullet.indexOf(":");
      if (colon > 0 && colon < 65) {
        flush();
        label = null;
        values = [];
        add(
          LABELS[bullet.slice(0, colon).toLowerCase()] ?? bullet.slice(0, colon),
          bullet.slice(colon + 1)
        );
        continue;
      }
      const key = line.toLowerCase().replace(/:$/, "");
      if (LABELS[key]) {
        flush();
        label = LABELS[key];
        values = [];
      } else if (label && values.length < 8) values.push(line);
    }
    flush();
  }
  for (const line of lines.filter((l) => /^\s*[-*]\s+/.test(l))) {
    const match = line.replace(/^\s*[-*]\s+/, "").match(/^([^:]{1,60}):\s*(.+)$/);
    if (match && LABELS[match[1].toLowerCase()]) add(LABELS[match[1].toLowerCase()], match[2]);
  }
  const sourceText = plain(html);
  const sensors = [...new Set(sourceText.match(/PAW\s*\d{4}(?:\s+(?:TI|Ultra|Master))?/gi) ?? [])];
  if (sensors.length && !facts.some((f) => f.label === "Sensor"))
    add("Sensor", sensors.join(" / "));
  if (/bluetooth|tri.mode/i.test(sourceText))
    add("Conexión", "Conexión inalámbrica multimodo; revisa la versión seleccionada.");
  return facts.slice(0, 35);
}

const roundRetail = (soles) => Math.max(9, Math.ceil((soles + 1) / 10) * 10 - 1);
export function suggestPrice(usdCents, category, marketCents = null) {
  if (!Number.isInteger(usdCents) || usdCents <= 0) throw new Error("Precio oficial USD inválido");
  if (marketCents !== null && (!Number.isInteger(marketCents) || marketCents <= 0))
    throw new Error("Referencia PEN inválida");
  const logistics =
    { mouses: 20, teclados: 35, mousepads: 20, audio: 25, accesorios: 12 }[category] ?? 20;
  const estimate =
    marketCents !== null
      ? (marketCents / 100) * (1 + PRICING.marketPremium)
      : ((usdCents / 100) * PRICING.usdPen * (1 + PRICING.reserveTax) + logistics) *
        (1 + PRICING.estimatedMarkup);
  return {
    cents: roundRetail(estimate) * 100,
    basis:
      marketCents !== null
        ? "Referencia minorista Perú + 3% y redondeo"
        : "PVP oficial USD convertido + reserva tributaria/logística + 15%; estimación",
    provisional: true,
  };
}

export function normalizedSupplierProducts(atk, mchose) {
  const a = atk.map((p) => ({
    brand: "atk",
    sourceId: p.id,
    title: p.title,
    handle: p.handle,
    url: `https://www.atk.store/products/${p.handle}`,
    html: p.description?.html ?? "",
    options: p.options.map((o) => ({ name: o.name, values: o.values.map((v) => v.label) })),
    images: (p.media ?? []).filter((m) => m.type === "image").map((m) => m.url),
    variants: p.variants.map((v) => {
      if (v.price.currency !== "USD") throw new Error(`Moneda inesperada: ${p.title}`);
      return {
        sourceId: v.id,
        sku: v.sku ?? "",
        title: v.title,
        usdCents: v.price.amount,
        options: v.options,
        imageUrl: v.media?.find((m) => m.type === "image")?.url ?? null,
      };
    }),
  }));
  const m = mchose.map((p) => ({
    brand: "mchose",
    sourceId: String(p.id),
    title: p.title,
    handle: p.handle,
    url: `https://www.mchose.store/products/${p.handle}`,
    html: p.body_html ?? "",
    options: p.options,
    images: p.images.map((i) => i.src),
    variants: p.variants.map((v) => ({
      sourceId: String(v.id),
      sku: v.sku ?? "",
      title: v.title,
      usdCents: Math.round(Number(v.price) * 100),
      options: p.options
        .map((o) => ({ name: o.name, label: v[`option${o.position}`] }))
        .filter((o) => o.label),
      imageUrl: v.featured_image?.src ?? null,
    })),
  }));
  return [...a, ...m];
}

function editionTitle(p, edition, category) {
  if (!edition) return p.title;
  if (p.brand === "mchose") return `MCHOSE ${edition}`;
  if (category === "mouses") {
    const prefix = p.title.match(
      /\b(A9(?: NB)?|F1(?: V\d)?|X1(?: V\d)?|Z1(?: V\d)?|U2(?: V\d)?(?: Mini)?|Y9|Ghost|ZERO|Phantom|Duckbill|FIERCE X)\b/i
    )?.[0];
    if (prefix)
      return `ATK ${edition.toLowerCase().startsWith(prefix.toLowerCase()) ? edition : `${prefix} ${edition}`}`;
  }
  return /^ATK\b/i.test(edition)
    ? edition
    : `${p.title.replace(/\bSeries\b/gi, "").trim()} — ${edition}`;
}

export function buildSupplierPlan({ products, existing, webTexts = {}, market = [] }) {
  const groups = new Map(),
    excluded = [];
  const existingModels = new Set(
    existing.map((p) => slugify(p.name.replace(/\s+(?:Black Gold|White Gold|White|Black)$/i, "")))
  );
  // Match only the exact options already maintained by the owner. Sibling colors and
  // editions still belong in the import; excluding a whole family silently lost them.
  const preservedOptions = [
    {
      handle: "atk-sky-xsoft-esport-gaming-mousepad",
      owner: /ATK Sky XSoft/i,
      titles: ["Sky / Black(Large Size)", "Sky / Orange(Large Size)"],
    },
    {
      handle: "atk-99g-xsoft-esport-gaming-mousepad",
      owner: /ATK 99G Air/i,
      titles: ["Air / Matcha Green"],
    },
    {
      handle: "atk-anime-mouse-pad-reverie",
      owner: /ATK (?:Anime.*)?Reverie.*Pink/i,
      titles: ["Pink"],
    },
    {
      handle: "atk-dragonfly-a9-series-lightweight-wireless-mouse",
      owner: /ATK A9 PRO MAX White/i,
      titles: ["A9 Pro Max / White"],
    },
    {
      handle: "mchose-a7-v3-series-lightweight-wireless-gaming-mouse",
      owner: /Mchose A7 V3 Pro\+/i,
      titles: ["A7 V3 Pro+ / White"],
    },
    {
      handle: "mchose-k7-v2-series-wireless-gaming-mouse",
      owner: /Mchose K7 v2 Ultra\+ Black Gold/i,
      titles: ["K7 V2 Ultra+ / Black Gold"],
    },
    {
      handle: "mchose-k7-v2-series-wireless-gaming-mouse",
      owner: /Mchose K7 v2 Ultra\+ White Gold/i,
      titles: ["K7 V2 Ultra+ / White Gold"],
    },
  ].filter((rule) => existing.some((p) => rule.owner.test(p.name)));
  for (const p of products) {
    if (/after.sales|mystery|gift card|bonus pack/i.test(p.title)) {
      excluded.push({
        title: p.title,
        source: p.url,
        reason: "Servicio, promoción o pack de contenido variable; no se importa como SKU propio.",
      });
      continue;
    }
    if (!p.variants.length || !p.images.length) {
      excluded.push({
        title: p.title,
        source: p.url,
        reason: "Sin variantes o fotos verificadas.",
      });
      continue;
    }
    const managed = preservedOptions.filter((rule) => rule.handle === p.handle);
    const category = categoryFor(p.title);
    const facts = extractFacts(p.html, webTexts[p.handle] ?? "");
    const byEdition = new Map();
    for (const v of p.variants) {
      if (v.usdCents <= 0) continue;
      const edition = v.options.find((o) => /^(model|version)$/i.test(o.name))?.label ?? "";
      const editionName = clip(editionTitle(p, edition, category), 190);
      // Supplier identity must keep using the original title, even when its display name is shorter.
      const sourceName = clip(p.title, 190),
        key = slugify(sourceName),
        name = compactProductName(sourceName, category);
      if (
        managed.some((rule) => rule.titles.some((title) => slugify(title) === slugify(v.title))) ||
        (!managed.length &&
          (existingModels.has(slugify(editionName)) ||
            (p.brand === "atk" &&
              /a9.*pro\s*max/i.test(editionName) &&
              existing.some((x) => /atk.*a9.*pro.*max/i.test(x.name)))))
      ) {
        excluded.push({
          title: name,
          source: p.url,
          reason: "Versión ya existente; conserva precio, imágenes y stock.",
        });
        continue;
      }
      if (!byEdition.has(key)) byEdition.set(key, { key, name, edition: "", variants: [] });
      byEdition.get(key).variants.push(v);
    }
    for (const { key, name, edition, variants } of byEdition.values()) {
      const id = stableId(`product:${key}`);
      let group = groups.get(key);
      if (!group) {
        const kind = /gaming combo|gear bundle|setup bundle/i.test(name)
          ? "combo"
          : {
              mouses: "mouse",
              teclados: "teclado",
              mousepads: "mousepad",
              audio: "producto de audio",
              accesorios: "accesorio",
            }[category];
        const specifications = [
          { label: "Marca", value: p.brand.toUpperCase(), note: "" },
          { label: "Modelo", value: name, note: "" },
          ...(edition ? [{ label: "Versión", value: edition, note: "" }] : []),
          ...facts,
        ];
        const featureSummary = facts
          .filter((f) =>
            [
              "Sensor",
              "Polling rate",
              "Conexión",
              "Distribución",
              "Dimensiones",
              "Superficie",
              "Material",
            ].includes(f.label)
          )
          .slice(0, 3)
          .map((f) => `${f.label}: ${f.value}.`)
          .join(" ");
        const description = clip(
          `${name}. ${kind[0].toUpperCase() + kind.slice(1)} de ${p.brand.toUpperCase()}. ${featureSummary} Revisa la configuración elegida: las prestaciones pueden variar entre versiones de esta familia.`,
          900
        );
        group = {
          id,
          slug: key,
          name,
          brand: p.brand,
          category,
          description,
          source: p.url,
          sourceHandle: p.handle,
          sourceIds: [p.sourceId],
          edition,
          facts,
          pdpConfig: {
            highlightsEnabled: true,
            dimensionsEnabled: false,
            specificationsEnabled: true,
            specifications,
            packageContents: { enabled: false, editions: [] },
            accessories: { enabled: false, variantIds: [] },
            rating: { enabled: false, average: null, count: null },
            gift: { enabled: false },
            sizeGuide: { enabled: false, sizes: [] },
            support: { driverUrl: "", shippingNote: "Consulta disponibilidad antes de comprar." },
          },
          variants: [],
          images: p.images
            .slice(0, 4)
            .map((url, i) => ({ url, variantId: null, alt: `${name} · foto oficial ${i + 1}` })),
        };
        groups.set(key, group);
      }
      const optionKey = (v) =>
        v.options
          .map((o) => `${o.name}:${o.label}`)
          .join("|")
          .toLowerCase();
      for (const v of variants) {
        if (group.variants.some((prior) => prior.optionKey === optionKey(v))) continue;
        const variantEdition =
          v.options.find((o) => /^(model|version)$/i.test(o.name))?.label ?? "";
        const modelNeedle = slugify(editionTitle(p, variantEdition, category));
        const references = market.filter((m) => {
          const key = m.modelKey.replace("-dragonfly-", "-");
          return modelNeedle === key || modelNeedle.startsWith(`${key}-`);
        });
        const median = references.length
          ? references.map((m) => m.priceCents).sort((a, b) => a - b)[
              Math.floor(references.length / 2)
            ]
          : null;
        const price = suggestPrice(v.usdCents, category, median);
        const variantId = stableId(`variant:${p.brand}:${v.sourceId}`);
        const attrs = {
          supplier_variant_id: v.sourceId,
          supplier_product_id: p.sourceId,
          supplier_sku: v.sku,
        };
        for (const o of v.options)
          if (o.label && o.label !== "Default Title")
            attrs[
              /color/i.test(o.name)
                ? "color"
                : /size/i.test(o.name)
                  ? "size"
                  : /model|version/i.test(o.name)
                    ? "version"
                    : /switch/i.test(o.name)
                      ? "switch"
                      : slugify(o.name).replace(/-/g, "_")
            ] = clip(o.label, 140);
        const title = clip(v.title === "Default Title" ? "Estándar" : v.title, 150);
        group.variants.push({
          id: variantId,
          sku: `GP-${p.brand.toUpperCase()}-${String(v.sourceId).split("/").at(-1)}`,
          title,
          optionKey: optionKey(v),
          priceCents: price.cents,
          officialUsdCents: v.usdCents,
          priceBasis: price.basis,
          marketPriceCents: median,
          marketSources: references.map((r) => r.url),
          attributes: attrs,
          imageUrl: v.imageUrl,
        });
        if (
          v.imageUrl &&
          !group.images.some((i) => i.url === v.imageUrl && i.variantId === variantId) &&
          group.images[0]?.url !== v.imageUrl
        )
          group.images.push({ url: v.imageUrl, variantId, alt: `${name} · ${title}` });
      }
    }
  }
  return {
    schemaVersion: 1,
    batch: "proveedores-2026-10-26",
    pricing: PRICING,
    createdAt: new Date().toISOString(),
    stockPolicy: "Cero unidades nuevas; no modificar existencias anteriores.",
    products: [...groups.values()].filter((p) => p.variants.length),
    excluded: [...new Map(excluded.map((e) => [e.title + e.reason, e])).values()],
  };
}

export function storyForProduct(product, media) {
  const image = media[product.images[0].url];
  if (!image) throw new Error(`Falta la imagen principal de ${product.name}`);
  const specs = product.pdpConfig.specifications.map(({ label, value }) => ({
    label: label.slice(0, 100),
    value: value.slice(0, 200),
  }));
  const groups = [];
  for (let i = 0; i < specs.length; i += 20)
    groups.push({
      groupName: i === 0 ? "Ficha del fabricante" : "Más características",
      specs: specs.slice(i, i + 20),
    });
  const blocks = [
    {
      block_id: stableId(`${product.id}:hero`),
      type: "hero_media",
      order: 1,
      payload: { headline: product.name, body: product.description, mediaKey: image.objectKey },
    },
    {
      block_id: stableId(`${product.id}:specs`),
      type: "technical_specs",
      order: 2,
      payload: { title: "Especificaciones de la familia · revisa la versión elegida", groups },
    },
  ];
  const alternate = product.images.find((i) => i.url !== product.images[0].url && media[i.url]);
  if (alternate)
    blocks.push({
      block_id: stableId(`${product.id}:photo`),
      type: "full_bleed_image",
      order: 3,
      payload: {
        mediaKey: media[alternate.url].objectKey,
        altText: product.name,
        caption: "Imagen oficial del fabricante. Las características dependen de la versión.",
      },
    });
  return blocks;
}

export function structuredSpecs(product) {
  const values = {};
  const find = (label) =>
    product.facts
      .filter((f) => f.label === label)
      .map((f) => f.value)
      .join(" / ");
  if (product.category === "mouses") {
    const sensors = [
      ...new Set(find("Sensor").match(/PAW\s*\d{4}(?:\s+(?:TI|Ultra|Master))?/gi) ?? []),
    ];
    if (sensors.length) values.sensor = sensors.join(" / ");
    const rates = [
      ...new Set(
        [...find("Polling rate").matchAll(/(\d[\d,.]*)\s*(k?hz)/gi)].map(
          (m) => Number(m[1].replace(/,/g, "")) * (/^k/i.test(m[2]) ? 1000 : 1)
        )
      ),
    ];
    if (rates.length === 1 && rates[0] >= 125 && rates[0] <= 8000) values.polling = rates[0];
    const weights = [
      ...new Set([...find("Peso").matchAll(/(\d+(?:\.\d+)?)\s*g\b/gi)].map((m) => Number(m[1]))),
    ];
    if (weights.length === 1 && weights[0] >= 20 && weights[0] <= 200) values.peso = weights[0];
    if (/ergonomic/i.test(product.name)) values.forma = "ergonomico";
  }
  if (product.category === "mousepads") {
    const dims = (find("Dimensiones") || find("Medidas")).match(
      /(\d{3,4})\s*[x×*]\s*(\d{3,4})\s*[x×*]\s*(\d+(?:\.\d+)?)\s*mm/i
    );
    if (dims) {
      const [l, w, h] = dims.slice(1).map(Number);
      if (l >= 100 && l <= 1200 && w >= 100 && w <= 800 && h >= 0.1 && h <= 10)
        Object.assign(values, { largo: l, ancho: w, grosor: h });
    }
    if (/\bglass\b/i.test(product.name)) values.superficie = "vidrio";
  }
  return values;
}

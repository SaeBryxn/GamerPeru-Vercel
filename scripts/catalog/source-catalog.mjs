import { DomUtils, parseDocument } from "htmlparser2";
import { compactProductName } from "./product-names.mjs";
import { categoryFor, extractFacts, plain } from "./supplier-plan.mjs";

export const descendants = (node) =>
  (node.children ?? []).flatMap((child) => [child, ...descendants(child)]);
const documentNodes = (html) => descendants(parseDocument(html, { decodeEntities: true }));
const text = (node) => DomUtils.textContent(node).replace(/\s+/g, " ").trim();
const hasClass = (node, name) => (node.attribs?.class ?? "").split(/\s+/).includes(name);

export function sourceProductLinks(html, base, pattern) {
  return [
    ...new Set(
      documentNodes(html)
        .filter((node) => node.name === "a")
        .flatMap((node) => {
          try {
            const url = new URL(node.attribs.href, base);
            return url.origin === new URL(base).origin && pattern.test(url.pathname)
              ? [url.href.split("#")[0]]
              : [];
          } catch {
            return [];
          }
        })
    ),
  ];
}

function structuredSchemas(nodes) {
  const entries = nodes
    .filter((node) => node.name === "script" && node.attribs.type === "application/ld+json")
    .flatMap((node) => {
      try {
        const value = JSON.parse(DomUtils.textContent(node));
        return Array.isArray(value) ? value : (value["@graph"] ?? [value]);
      } catch {
        return [];
      }
    });
  return entries;
}
const productSchema = (nodes) =>
  structuredSchemas(nodes).find(
    (item) => item["@type"] === "Product" || item["@type"]?.includes?.("Product")
  ) ?? {};

/** A price without a verified currency is deliberately left unknown. */
export function sourcePrice(amount, currency) {
  if (!/^(USD|PEN)$/.test(currency ?? "")) return null;
  const value = String(amount ?? "").replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0) return null;
  return { currency, cents: Math.round(Number(value) * 100) };
}

export function normalizeAttackProduct(product, category, currency) {
  const inferred = categoryFor(product.title);
  const primaryType = categoryFor(product.product_type ?? "");
  if (inferred !== category && primaryType !== category) return null;
  // Membership alone is insufficient: collection pages also include separate cables and receivers.
  if (
    /^(?:ATTACK SHARK\s+)?(?:C0\d|8K\s+(?:Dongle|Receiver)|.*(?:Keycap Set|Replacement|Mouse Skates|Palm Rest|Wrist Rest))\b/i.test(
      product.title
    )
  )
    return null;
  let name = compactProductName(product.title, category)
    .replace(
      /\b(?:Rapid Trigger|PAW\d{4}(?:MAX)?|Ultra[-\s]Light|Superlight|with Side[- ]Printed PBT Keycaps|Full[- ]Aluminum)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  const model = product.title.match(
    /ATTACK\s+SHARK(?:\s*[x×]\s*([a-z]+))?\s+([a-z][a-z0-9+/-]*(?:\s+(?:PRO|MAX|ULTRA|TURBO|AIR|HE|V\d+|SE|PLUS|[248]K))*)/i
  );
  if (model) {
    name = `ATTACK SHARK${model[1] ? ` x ${model[1]}` : ""} ${model[2]}`;
    const cables = [
      ...new Set(
        (product.title.match(/\bC0\d(?:\s*(?:ULTRA|PRO))?\b/gi) ?? []).map((value) =>
          value.replace(/\s+/g, "").toUpperCase()
        )
      ),
    ];
    if (cables.length) name += ` + ${cables.join(" + ")}`;
    else if (/coiled cable/i.test(product.title))
      name += /8k(?:hz)? coiled cable/i.test(product.title) ? " + cable 8K" : " + cable";
    if (/not include (?:the )?charging dock/i.test(product.title)) name += " (sin base)";
  }
  const facts = extractFacts(product.body_html ?? "");
  const dimensions = [
    ...new Set(
      plain(product.body_html ?? "").match(
        /\b\d{2,4}\s*[x×]\s*\d{2,4}(?:\s*[x×]\s*\d+(?:\.\d+)?)?\s*(?:mm|cm)\b/gi
      ) ?? []
    ),
  ];
  if (dimensions.length)
    facts.push({
      label: "Medidas indicadas",
      value: dimensions.join(" / "),
      note: "Según la descripción del fabricante; incluye las medidas de las piezas indicadas.",
    });
  const galleryImages = product.images.map((image) => image.src);
  const storyImages = [
    ...new Set(
      documentNodes(product.body_html ?? "")
        .filter((node) => node.name === "img")
        .flatMap((node) => [node.attribs?.src, node.attribs?.["data-src"]])
        .filter(Boolean)
        .flatMap((value) => {
          try {
            const url = new URL(value, "https://attackshark.com");
            return url.protocol === "https:" &&
              ["attackshark.com", "cdn.shopify.com"].includes(url.hostname)
              ? [url.href]
              : [];
          } catch {
            return [];
          }
        })
    ),
  ];
  return {
    source: "attack-shark",
    sourceId: String(product.id),
    sourceUrl: `https://attackshark.com/products/${product.handle}`,
    brand: "ATTACK SHARK",
    category,
    name,
    originalName: product.title,
    description: plain(product.body_html ?? "").slice(0, 600),
    specifications: facts,
    galleryImages,
    storyImages,
    images: [...new Set([...galleryImages, ...storyImages])],
    variants: product.variants.map((variant) => ({
      sourceId: String(variant.id),
      sku: variant.sku ?? "",
      name: variant.title,
      price: sourcePrice(variant.price, currency),
      options: product.options
        .map((option) => ({ name: option.name, value: variant[`option${option.position}`] }))
        .filter((option) => option.value),
      image: variant.featured_image?.src ?? null,
    })),
    stock: 0,
  };
}

export function parseJinmsProduct(html, sourceUrl) {
  const nodes = documentNodes(html),
    schema = productSchema(nodes);
  const name = text(nodes.find((node) => node.name === "h1") ?? { children: [] });
  const summary = nodes.find((node) => node.attribs?.productdesc === "1");
  const breadcrumb = structuredSchemas(nodes).find((entry) => entry["@type"] === "BreadcrumbList");
  const category = categoryFor(
    (breadcrumb?.itemListElement ?? []).map((entry) => entry.name).join(" ")
  );
  const specifications = extractFacts(summary ? DomUtils.getOuterHTML(summary) : "");
  const images = [
    ...new Set(
      [schema.image]
        .flat()
        .map((image) => (typeof image === "string" ? image : image?.url))
        .filter(Boolean)
    ),
  ];
  const offer = [schema.offers].flat().find((entry) => entry?.price);
  return {
    source: "jinms",
    sourceId: new URL(sourceUrl).pathname.replaceAll("/", ""),
    sourceUrl,
    brand: "JINMS",
    category,
    name,
    originalName: name,
    description: summary ? plain(DomUtils.getOuterHTML(summary)).slice(0, 600) : "",
    specifications,
    images,
    variants: [
      {
        name: "Modelo",
        sku: "",
        price: sourcePrice(offer?.price, offer?.priceCurrency),
        options: [],
        image: images[0] ?? null,
      },
    ],
    stock: 0,
  };
}

/** Shopify stores some technical copy outside body_html, in the product's own rich text. */
export function enrichAttackProduct(product, html) {
  const nodes = documentNodes(html);
  const info = nodes.find((node) => hasClass(node, "product-info"));
  const richText = info ? descendants(info).filter((node) => hasClass(node, "prose")) : [];
  const facts = [...product.specifications];
  const add = (label, value) => {
    if (value && !facts.some((row) => row.label === label && row.value === value))
      facts.push({ label, value, note: "Según la ficha del producto en el fabricante." });
  };
  for (const block of richText) {
    const clean = parseDocument(DomUtils.getOuterHTML(block));
    for (const node of descendants(clean).filter((node) => ["script", "style"].includes(node.name)))
      DomUtils.removeElement(node);
    const content = DomUtils.getInnerHTML(clean);
    for (const fact of extractFacts(content)) add(fact.label, fact.value);
    for (const line of content
      .replace(/<br\s*\/?\s*>|<\/(?:p|li|div)>/gi, "\n")
      .split("\n")
      .map(plain)
      .filter((value) => value.length > 3 && value.length < 160)) {
      const label = /\b(?:lcd|oled|tft)\b/i.test(line)
        ? "Pantalla"
        : /\brgb\b/i.test(line)
          ? "Iluminación"
          : /\b(?:keys|buttons)\b/i.test(line)
            ? "Teclas y botones"
            : /\b(?:usb|bluetooth|wired|wireless)\b/i.test(line)
              ? "Conexión"
              : null;
      if (label) add(label, line.replace(/^\s*[•*-]\s*/, ""));
    }
  }
  const context = [
    product.originalName,
    product.description,
    ...richText.map((block) => plain(DomUtils.getOuterHTML(block))),
  ].join(" ");
  const dimensions = [
    ...new Set(
      context.match(/\b\d{2,4}\s*[x×]\s*\d{2,4}(?:\s*[x×]\s*\d+(?:\.\d+)?)?\s*(?:mm|cm)\b/gi) ?? []
    ),
  ];
  if (dimensions.length) add("Medidas indicadas", dimensions.join(" / "));
  if (/genuine carbon fiber/i.test(product.originalName)) add("Material", "Genuine carbon fiber");
  if (/rainbow coated/i.test(product.originalName)) add("Recubrimiento", "Rainbow coated");
  return { ...product, specifications: facts };
}

export function parseMemoryProduct(html, sourceUrl) {
  const nodes = documentNodes(html),
    schema = productSchema(nodes);
  const originalName =
    schema.name || text(nodes.find((node) => node.name === "h1") ?? { children: [] });
  const brand =
    (typeof schema.brand === "string" ? schema.brand : schema.brand?.name) ||
    originalName.match(/^MONITOR\s+[\d.]+\s+([A-Z][A-Z0-9]+)/i)?.[1] ||
    "";
  const scope = nodes.find((node) => hasClass(node, "especificaciones-content"));
  const facts = [];
  const add = (label, value) => {
    if (
      label &&
      value &&
      label.length <= 150 &&
      value.length <= 1000 &&
      !facts.some((row) => row.label === label && row.value === value)
    )
      facts.push({ label, value });
  };
  let label = "",
    values = [];
  const flush = () => {
    add(label, values.join(" / "));
    values = [];
  };
  if (scope) {
    const hasHeadings = descendants(scope).some((node) => ["strong", "b"].includes(node.name));
    for (const row of descendants(scope).filter(
      (node) =>
        ["div", "p", "li", "tr", "dt", "dd"].includes(node.name) &&
        !descendants(node).some((child) => ["div", "p", "li", "tr"].includes(child.name))
    )) {
      const value = text(row);
      if (!value) continue;
      const heading = descendants(row).find((node) => ["strong", "b"].includes(node.name));
      const cells = (row.children ?? []).filter((node) => ["th", "td"].includes(node.name));
      if (cells.length > 1) {
        add(text(cells[0]), cells.slice(1).map(text).join(" / "));
        continue;
      }
      if (hasHeadings) continue;
      if ((heading && text(heading) === value) || row.name === "dt") {
        flush();
        label = value.replace(/:$/, "");
      } else if (label) values.push(value);
    }
    flush();
    // Some editors put several bold labels and values inside one paragraph.
    if (hasHeadings) {
      const lines = DomUtils.getInnerHTML(scope)
        .replace(
          /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi,
          (_match, _tag, body) => `\n@@LABEL@@${plain(body)}\n`
        )
        .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|td|th|tr)>/gi, "\n")
        .split("\n")
        .map(plain)
        .filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("@@LABEL@@")) {
          flush();
          label = line.slice(9).replace(/:$/, "");
        } else if (label) values.push(line);
      }
      flush();
    }
    // Plain-text specification pairs are separated by an empty paragraph on this source.
    if (!facts.length) {
      let group = [];
      const finish = () => {
        if (group.length > 1) add(group[0], group.slice(1).join(" / "));
        group = [];
      };
      for (const node of (scope.children ?? []).filter((node) => node.name)) {
        const value = text(node);
        if (value) group.push(value);
        else finish();
      }
      finish();
    }
  }
  const id = new URL(sourceUrl).pathname.match(/\/producto\/(\d+)/)?.[1];
  const mainImage = typeof schema.image === "string" ? schema.image : schema.image?.[0];
  // Restrict the gallery to this product's code; related monitors and shop banners are excluded.
  const images = [
    ...new Set(
      [
        mainImage,
        ...nodes
          .filter((node) => ["img", "a"].includes(node.name))
          .flatMap((node) => [node.attribs?.src, node.attribs?.href]),
      ].filter(
        (value) =>
          value &&
          value.includes("cdn.memorykings.pe/files/") &&
          (value === mainImage || new RegExp(`/${id}[-_]`, "i").test(value))
      )
    ),
  ];
  const offer = [schema.offers].flat().find((entry) => entry?.price);
  return {
    source: "memory-kings",
    sourceId: id,
    sourceUrl,
    brand,
    category: "monitores",
    name: schema.mpn && brand ? `${brand} ${schema.mpn}` : originalName,
    originalName,
    description: schema.description ?? "",
    specifications: facts,
    images,
    variants: [
      {
        name: "Modelo",
        sku: schema.mpn ?? "",
        price: sourcePrice(offer?.price, offer?.priceCurrency),
        options: [],
        image: images[0] ?? null,
      },
    ],
    stock: 0,
  };
}

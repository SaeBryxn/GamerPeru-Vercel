import { z } from "zod";
import type { ProductVariantDetail } from "./product-detail-types";

const shortText = (max = 180) => z.string().trim().max(max).default("");
const supportUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Usa un enlace HTTP o HTTPS válido.")
  .default("");
const measurement = z.number().finite().positive().max(3000).nullable().default(null);
const handMeasurement = z.number().finite().min(15).max(22).nullable().default(null);

export const pdpSizeSchema = z
  .object({
    name: shortText(40),
    weight: shortText(50),
    lengthMm: measurement,
    widthMm: measurement,
    heightMm: measurement,
    handMin: handMeasurement,
    handMax: handMeasurement,
  })
  .refine(
    (size) => size.handMin === null || size.handMax === null || size.handMin < size.handMax,
    "La longitud mínima debe ser menor que la máxima."
  );

export const PDP_CONTENT_SECTIONS = ["story", "reviews"] as const;
export const productPdpConfigSchema = z.object({
  contentSections: z
    .array(z.enum(PDP_CONTENT_SECTIONS))
    .max(2)
    .refine((sections) => new Set(sections).size === sections.length, "No repitas secciones.")
    .default(["reviews", "story"]),
  rating: z
    .object({
      enabled: z.boolean().default(false),
      average: z.number().finite().min(0).max(5).nullable().default(null),
      count: z.number().int().min(0).max(1000000).nullable().default(null),
    })
    .default({}),
  gift: z
    .object({
      enabled: z.boolean().default(false),
      label: shortText(80).default("PROMOCIÓN · REGALO CON TU COMPRA"),
      title: shortText(),
      description: shortText(300),
    })
    .default({}),
  highlightsEnabled: z.boolean().default(true),
  dimensionsEnabled: z.boolean().default(true),
  specificationsEnabled: z.boolean().default(true),
  specifications: z
    .array(z.object({ label: shortText(80), value: shortText(300), note: shortText(180) }))
    .max(60)
    .default([]),
  sizeGuide: z
    .object({
      enabled: z.boolean().default(false),
      sizes: z.array(pdpSizeSchema).max(6).default([]),
    })
    .default({}),
  packageContents: z
    .object({
      enabled: z.boolean().default(false),
      editions: z
        .array(
          z.object({
            name: shortText(80),
            badge: z.enum(["neutral", "gold", "blue"]).default("neutral"),
            items: z
              .array(
                z.object({
                  name: shortText(100),
                  note: shortText(160),
                  quantity: shortText(20).default("1"),
                })
              )
              .max(30)
              .default([]),
          })
        )
        .max(2)
        .default([]),
    })
    .default({}),
  accessories: z
    .object({
      enabled: z.boolean().default(false),
      variantIds: z
        .array(z.string().uuid())
        .max(12)
        .transform((ids) => [...new Set(ids)])
        .default([]),
    })
    .default({}),
  variants: z
    .record(
      z.string().uuid(),
      z.object({
        color: shortText(60),
        size: shortText(40),
        mediaAssetId: z.string().uuid().nullable().default(null),
      })
    )
    .default({}),
  support: z
    .object({
      warranty: shortText(120),
      manualUrl: supportUrl,
      driverUrl: supportUrl,
      shippingNote: shortText(200),
    })
    .default({}),
});

export type ProductPdpConfig = z.infer<typeof productPdpConfigSchema>;
export type ProductCommerceConfig = Pick<
  ProductPdpConfig,
  "rating" | "gift" | "support" | "highlightsEnabled"
>;
export type PdpSize = z.infer<typeof pdpSizeSchema>;
export const EMPTY_PRODUCT_PDP_CONFIG = productPdpConfigSchema.parse({});

/** Older or damaged optional sections must never prevent a product from rendering. */
export function parseProductPdpConfig(value: unknown): ProductPdpConfig {
  const root =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const safe: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(productPdpConfigSchema.shape)) {
    const parsed = schema.safeParse(root[key]);
    if (parsed.success) safe[key] = parsed.data;
  }
  return productPdpConfigSchema.parse(safe);
}

export function resolveSuggestedSize(sizes: PdpSize[], cm: number): number {
  if (!Number.isFinite(cm)) return -1;
  return sizes.findIndex(
    (size) =>
      (size.handMin !== null || size.handMax !== null) &&
      (size.handMin === null || cm >= size.handMin) &&
      (size.handMax === null || cm < size.handMax)
  );
}

export function formatHandRange(size: PdpSize): string {
  if (size.handMin === null && size.handMax === null) return "Sin rango sugerido";
  if (size.handMin === null) return `< ${size.handMax} cm`;
  if (size.handMax === null) return `≥ ${size.handMin} cm`;
  return `${size.handMin}–${size.handMax} cm`;
}

export function formatDimensions(size: PdpSize, inches = false): string | null {
  const values = [size.lengthMm, size.widthMm, size.heightMm];
  if (values.some((value) => value === null)) return null;
  return (
    values.map((value) => (inches ? (value! / 25.4).toFixed(2) : String(value))).join(" × ") +
    (inches ? " in" : " mm")
  );
}

/** Canonical aliases keep mixed old/new variants selectable after editing only one swatch. */
export function projectPdpVariants(
  variants: ProductVariantDetail[],
  config: ProductPdpConfig
): ProductVariantDetail[] {
  return variants.map((variant) => {
    const presentation = config.variants[variant.id];
    const attributes = { ...variant.attributes };
    const color = attributes.colorway ?? attributes.color;
    const size = attributes.size ?? attributes.talla ?? attributes.tamano;
    delete attributes.colorway;
    delete attributes.talla;
    delete attributes.tamano;
    if (color) attributes.color = color;
    if (size) attributes.size = size;
    return { ...variant, attributes, thumbnailMediaAssetId: presentation?.mediaAssetId ?? null };
  });
}

/** Prices and cart attributes remain authoritative in product_variants, including legacy edits. */
export function buildPdpEditorConfig(
  value: unknown,
  variants: Array<Pick<ProductVariantDetail, "id" | "attributes">>
): ProductPdpConfig {
  const config = parseProductPdpConfig(value);
  for (const variant of variants) {
    const presentation = config.variants[variant.id];
    if (!presentation) continue;
    presentation.color = String(variant.attributes.colorway ?? variant.attributes.color ?? "");
    presentation.size = String(
      variant.attributes.size ?? variant.attributes.talla ?? variant.attributes.tamano ?? ""
    );
  }
  return config;
}

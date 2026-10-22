import { describe, expect, it, vi } from "vitest";
import {
  formatDimensions,
  formatHandRange,
  parseProductPdpConfig,
  projectPdpVariants,
  buildPdpEditorConfig,
  productPdpConfigSchema,
  resolveSuggestedSize,
} from "@/lib/catalog/product-pdp-config";
import { validateAccessoryVariantIds } from "@/lib/cart/validation";

import type { ProductVariantDetail } from "@/lib/catalog/product-detail-types";
import { validatePdpReferences } from "@/lib/admin/catalog/pdp-config";

const main = "018f0000-0000-7000-8000-000000000001";
const accessory = "018f0000-0000-7000-8000-000000000002";
const config = parseProductPdpConfig({
  sizeGuide: {
    enabled: true,
    sizes: [
      { name: "Mini", weight: "45 ± 2 g", lengthMm: 110, widthMm: 60, heightMm: 36, handMax: 17.5 },
      { name: "Med", handMin: 17.5, handMax: 19 },
      { name: "Max", handMin: 19 },
      { name: "Sin rango" },
    ],
  },
});

describe("Configuración compatible de la PDP", () => {
  it("permite productos anteriores sin configuración y conserva la ficha técnica", () => {
    expect(parseProductPdpConfig(null)).toEqual(parseProductPdpConfig({}));
    expect(parseProductPdpConfig({}).specificationsEnabled).toBe(true);
    expect(parseProductPdpConfig({}).gift.enabled).toBe(false);
    expect(parseProductPdpConfig({}).accessories.variantIds).toEqual([]);
  });
  it("ignora una sección dañada sin perder las demás", () => {
    const parsed = parseProductPdpConfig({
      rating: { average: 8 },
      gift: { enabled: true, title: "Grip de regalo" },
    });
    expect(parsed.rating.enabled).toBe(false);
    expect(parsed.gift.title).toBe("Grip de regalo");
    expect(productPdpConfigSchema.safeParse({ rating: { average: 8 } }).success).toBe(false);
  });
  it("rechaza URLs ejecutables, con credenciales y reseñas fraccionarias", () => {
    for (const manualUrl of [
      "javascript:alert(1)",
      "data:text/html,test",
      "https://user:secret@example.com",
    ])
      expect(productPdpConfigSchema.safeParse({ support: { manualUrl } }).success).toBe(false);
    expect(productPdpConfigSchema.safeParse({ rating: { count: 1.2 } }).success).toBe(false);
    expect(
      productPdpConfigSchema.safeParse({ support: { manualUrl: "https://example.com/manual.pdf" } })
        .success
    ).toBe(true);
  });
  it("elige una única talla en los límites y no recomienda filas sin rango", () => {
    const sizes = config.sizeGuide.sizes;
    expect(resolveSuggestedSize(sizes, 15)).toBe(0);
    expect(resolveSuggestedSize(sizes, 17.5)).toBe(1);
    expect(resolveSuggestedSize(sizes, 18.8)).toBe(1);
    expect(resolveSuggestedSize(sizes, 19)).toBe(2);
    expect(resolveSuggestedSize(sizes, 22)).toBe(2);
    expect(resolveSuggestedSize([sizes[3]!], 18.8)).toBe(-1);
    expect(formatHandRange(sizes[0]!)).toBe("< 17.5 cm");
    expect(formatHandRange(sizes[2]!)).toBe("≥ 19 cm");
  });
  it("convierte mm a pulgadas y oculta dimensiones incompletas", () => {
    expect(formatDimensions(config.sizeGuide.sizes[0]!)).toBe("110 × 60 × 36 mm");
    expect(formatDimensions(config.sizeGuide.sizes[0]!, true)).toBe("4.33 × 2.36 × 1.42 in");
    expect(formatDimensions(config.sizeGuide.sizes[1]!)).toBeNull();
  });
  it("rechaza rangos invertidos o fuera de los límites del calculador", () => {
    expect(
      productPdpConfigSchema.safeParse({ sizeGuide: { sizes: [{ handMin: 19, handMax: 17 }] } })
        .success
    ).toBe(false);
    expect(
      productPdpConfigSchema.safeParse({ sizeGuide: { sizes: [{ handMin: 14 }] } }).success
    ).toBe(false);
  });
  it("limita, valida y desduplica los accesorios antes de tocar el carrito", () => {
    expect(validateAccessoryVariantIds([accessory, accessory], main)).toEqual({
      success: true,
      data: [accessory],
    });
    expect(validateAccessoryVariantIds(undefined, main)).toEqual({ success: true, data: [] });
    expect(validateAccessoryVariantIds([main], main).success).toBe(false);
    expect(validateAccessoryVariantIds(["invalid"], main).success).toBe(false);
    expect(validateAccessoryVariantIds(Array(13).fill(accessory), main).success).toBe(false);
  });
});

describe("Referencias de la ficha validadas por el servidor", () => {
  it("rechaza miniaturas que no estén vinculadas a la variante del producto", async () => {
    const executor = { execute: vi.fn().mockResolvedValue([]) };
    const config = parseProductPdpConfig({ variants: { [main]: { mediaAssetId: accessory } } });
    await expect(validatePdpReferences(config, main, executor)).rejects.toMatchObject({
      code: "INVALID_PDP_REFERENCE",
    });
  });
  it("rechaza un accesorio que dejó de ser comprable al guardar", async () => {
    const executor = { execute: vi.fn().mockResolvedValue([]) };
    const config = parseProductPdpConfig({
      accessories: { enabled: true, variantIds: [accessory] },
    });
    await expect(validatePdpReferences(config, main, executor)).rejects.toMatchObject({
      code: "INVALID_PDP_REFERENCE",
    });
  });
});

describe("Compatibilidad de atributos de variantes", () => {
  it("normaliza los alias antiguos al configurar solo una variante", () => {
    const base = {
      productId: main,
      sku: "TEST",
      title: "Test",
      priceCents: 100,
      compareAtPriceCents: null,
      weightGrams: null,
      displayOrder: 0,
      status: "ACTIVE" as const,
    };
    const variants: ProductVariantDetail[] = [
      { ...base, id: main, attributes: { color: "Grafito", size: "Mini" } },
      { ...base, id: accessory, attributes: { colorway: "Blanco", talla: "Mini" } },
    ];
    const result = projectPdpVariants(
      variants,
      parseProductPdpConfig({ variants: { [main]: { color: "Grafito", size: "Mini" } } })
    );
    expect(result.map((variant) => variant.attributes)).toEqual([
      { color: "Grafito", size: "Mini" },
      { color: "Blanco", size: "Mini" },
    ]);
    expect(variants[1]!.attributes.colorway).toBe("Blanco");
    const updatedEditor = buildPdpEditorConfig(
      { variants: { [main]: { color: "Negro", size: "Max" } } },
      variants
    );
    expect(updatedEditor.variants[main]?.color).toBe("Grafito");
    expect(updatedEditor.variants[main]?.size).toBe("Mini");
  });
});

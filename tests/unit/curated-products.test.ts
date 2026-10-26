import { describe, expect, it } from "vitest";
import { ProductSelectionSchema, selectProducts } from "@/lib/catalog/curated-products";
import { BrandStripContentSchema, listHomeSectionMediaSlots } from "@/lib/home/section-schemas";
import { parseProductPdpConfig, productPdpConfigSchema } from "@/lib/catalog/product-pdp-config";

describe("Productos elegidos por el administrador", () => {
  const items = [{ slug: "mouse-a" }, { slug: "mouse-b" }, { slug: "mouse-c" }];
  it("mantiene la compatibilidad de la selección automática", () => {
    expect(selectProducts(items)).toEqual(items);
    expect(ProductSelectionSchema.parse({})).toEqual({ mode: "automatic", productSlugs: [] });
  });
  it("respeta el orden manual, omite despublicados y nunca rellena huecos", () => {
    expect(
      selectProducts(items, {
        mode: "manual",
        productSlugs: ["mouse-c", "despublicado", "mouse-a"],
      })
    ).toEqual([items[2], items[0]]);
    expect(selectProducts(items, { mode: "manual", productSlugs: [] })).toEqual([]);
  });
  it("rechaza productos duplicados y una selección excesiva", () => {
    expect(
      ProductSelectionSchema.safeParse({ mode: "manual", productSlugs: ["mouse-a", "mouse-a"] })
        .success
    ).toBe(false);
    expect(
      ProductSelectionSchema.safeParse({
        mode: "manual",
        productSlugs: Array.from({ length: 25 }, (_, i) => `mouse-${i}`),
      }).success
    ).toBe(false);
  });
});

describe("Carrusel de marcas administrable", () => {
  const asset = "018f0000-0000-7000-8000-000000000001";
  const content = {
    title: "Marcas",
    items: [
      { name: "Mchose", href: "/marcas/mchose", image: { mediaAssetId: asset, alt: "Mchose" } },
    ],
  };
  it("registra las imágenes con el mismo contrato de medios del home", () => {
    const parsed = BrandStripContentSchema.parse(content);
    expect([
      ...listHomeSectionMediaSlots({
        id: asset,
        type: "brand_strip",
        displayOrder: 0,
        isVisible: true,
        content: parsed,
      }),
    ]).toEqual([["items.0.image", asset]]);
  });
  it("acepta enlaces internos con filtros y rechaza destinos ejecutables o externos", () => {
    const accepts = (href: string) =>
      BrandStripContentSchema.safeParse({ ...content, items: [{ ...content.items[0], href }] })
        .success;
    expect(accepts("/marcas/mchose?categoria=mouses")).toBe(true);
    for (const href of [
      "javascript:alert(1)",
      "https://otro.test",
      "//otro.test",
      "/\\otro.test",
      "/x\ny",
    ])
      expect(accepts(href), href).toBe(false);
  });
});

describe("Orden de historia y opiniones", () => {
  it("migra la configuración anterior sin Completa tu setup", () => {
    expect(parseProductPdpConfig({}).contentSections).toEqual(["reviews", "story"]);
  });
  it("permite cambiar el orden u ocultar todo sin duplicados", () => {
    expect(
      parseProductPdpConfig({ contentSections: ["story", "reviews"] }).contentSections
    ).toEqual(["story", "reviews"]);
    expect(parseProductPdpConfig({ contentSections: [] }).contentSections).toEqual([]);
    expect(productPdpConfigSchema.safeParse({ contentSections: ["story", "story"] }).success).toBe(
      false
    );
  });
});

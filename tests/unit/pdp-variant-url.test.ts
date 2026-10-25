import { describe, expect, it } from "vitest";
import {
  buildVariantHref,
  findVariantFromSearch,
  variantUrlSlug,
} from "@/components/product-detail/variant-url";
import type { ProductVariantDetail } from "@/lib/catalog/product-detail-types";

const variant = (id: string, title: string): ProductVariantDetail => ({
  id,
  productId: "p",
  sku: id,
  title,
  priceCents: 18900,
  compareAtPriceCents: null,
  weightGrams: null,
  displayOrder: 0,
  status: "ACTIVE",
  attributes: {},
});
const negro = variant("a", "Negro");
const blanco = variant("b", "Blanco");
const dorado = variant("c", "Negro / Dorado");

describe("enlace por color en la ficha", () => {
  it("convierte el nombre de la variante en un slug legible", () => {
    expect(variantUrlSlug(blanco)).toBe("blanco");
    expect(variantUrlSlug(dorado)).toBe("negro-dorado");
    expect(variantUrlSlug(variant("d", "Edición Ácida"))).toBe("edicion-acida");
  });

  it("un enlace con ?color= abre esa variante", () => {
    const variants = [negro, blanco, dorado];
    expect(findVariantFromSearch(variants, "?color=blanco")).toBe(blanco);
    expect(findVariantFromSearch(variants, "?color=NEGRO-DORADO")).toBe(dorado);
    expect(findVariantFromSearch(variants, "?color=rojo")).toBeNull();
    expect(findVariantFromSearch(variants, "")).toBeNull();
  });

  it("al elegir un color cambia solo ese parámetro de la URL", () => {
    expect(buildVariantHref("https://gamerperu.com/productos/atk-a9", blanco)).toBe(
      "/productos/atk-a9?color=blanco"
    );
    expect(
      buildVariantHref("https://gamerperu.com/productos/atk-a9?color=blanco&utm=ig#specs", negro)
    ).toBe("/productos/atk-a9?color=negro&utm=ig#specs");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildMenuBrandGroups,
  defaultMenuDisplay,
  MenuProductSelectionSchema,
  MenuDisplaySchema,
} from "@/lib/navigation/menu-display";

const products = (count: number, brand = "Nueva marca", brandSlug = "nueva-marca") =>
  Array.from({ length: count }, (_, i) => ({
    name: `${brand} Modelo ${i}`,
    slug: `${brandSlug}-${i}`,
    brandName: brand,
    brandSlug,
    categorySlug: "mouses",
  }));

describe("Menú compacto administrable", () => {
  it("limita cada marca y construye su destino con la categoría y la marca reales", () => {
    const groups = buildMenuBrandGroups(
      [...products(20), ...products(2, "Otra", "otra")],
      "mouses"
    );
    expect(groups.map((g) => g.items.length)).toEqual([5, 2]);
    expect(groups[0]?.more?.href).toBe("/categorias/mouses?marca=nueva-marca");
    expect(groups[0]?.items[0]?.label).toBe("Modelo 0");
  });
  it("usa límites y nombres del administrador sin cambiar enlaces ni la ficha", () => {
    const source = products(15);
    const display = {
      ...defaultMenuDisplay(),
      singleBrandItems: 6,
      productLabels: { "nueva-marca-2": "Favorito" },
    };
    const groups = buildMenuBrandGroups(source.toReversed(), "mouses", true, display);
    expect(groups[0]?.items).toHaveLength(6);
    expect(groups[0]?.items[0]?.href).toBe("/productos/nueva-marca-14");
    const item = buildMenuBrandGroups(source, "mouses", true, display)[0]?.items[2];
    expect(item).toMatchObject({
      label: "Favorito",
      href: "/productos/nueva-marca-2",
      description: "Nueva marca Modelo 2",
    });
    expect(source[2]?.name).toBe("Nueva marca Modelo 2");
  });
  it("no rellena una selección manual vacía ni mezcla categorías", () => {
    expect(buildMenuBrandGroups([], "mouses")).toEqual([]);
    expect(buildMenuBrandGroups(products(3), "mousepads")).toEqual([]);
  });
  it("admite selecciones anteriores y valida los nuevos ajustes", () => {
    expect(MenuProductSelectionSchema.parse({ mode: "manual", productSlugs: [] }).mode).toBe(
      "manual"
    );
    expect(
      MenuDisplaySchema.safeParse({ ...defaultMenuDisplay(), itemsPerBrand: 80 }).success
    ).toBe(false);
    expect(
      MenuDisplaySchema.safeParse({
        ...defaultMenuDisplay(),
        productLabels: { "test-product": "<script>" },
      }).success
    ).toBe(false);
  });
});

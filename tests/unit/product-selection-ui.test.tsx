// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProductSelection } from "@/components/admin/product-selection";
import { BrandStrip } from "@/components/home/brand-strip/brand-strip";

describe("Selección de productos sin editar código", () => {
  const products = [
    { slug: "a", name: "Mouse A", categorySlug: "mouses" },
    { slug: "b", name: "Mouse B", categorySlug: "mouses" },
    { slug: "pad", name: "Mousepad", categorySlug: "mousepads" },
  ];
  it("solo ofrece productos de la categoría elegida", () => {
    render(
      <ProductSelection
        products={products}
        value={{ mode: "manual", productSlugs: [] }}
        onChange={vi.fn()}
        categorySlug="mousepads"
      />
    );
    expect(screen.queryByRole("option", { name: "Mouse A" })).toBeNull();
    expect(screen.getByRole("option", { name: "Mousepad" })).toBeTruthy();
  });
  it("sube, quita y agrega productos conservando el resto de la selección", async () => {
    const onChange = vi.fn();
    render(
      <ProductSelection
        products={products}
        value={{ mode: "manual", productSlugs: ["a", "b"] }}
        onChange={onChange}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Subir Mouse B" }));
    expect(onChange).toHaveBeenLastCalledWith({ mode: "manual", productSlugs: ["b", "a"] });
    await user.click(screen.getByRole("button", { name: "Quitar Mouse A" }));
    expect(onChange).toHaveBeenLastCalledWith({ mode: "manual", productSlugs: ["b"] });
    await user.selectOptions(screen.getByLabelText("Agregar producto (2/24)"), "pad");
    expect(onChange).toHaveBeenLastCalledWith({ mode: "manual", productSlugs: ["a", "b", "pad"] });
  });
});

describe("Marcas con enlaces configurados", () => {
  it("permite una sola marca y abre su destino en la misma pestaña", () => {
    render(
      <BrandStrip
        items={[
          {
            id: "mchose",
            name: "Mchose",
            href: "/marcas/mchose?categoria=mouses",
            logoUrl: "/logo.png",
          },
        ]}
        title="Nuestras marcas elegidas"
      />
    );
    const link = screen.getByRole("link", { name: "Mchose" });
    expect(link.getAttribute("href")).toBe("/marcas/mchose?categoria=mouses");
    expect(link.getAttribute("target")).toBeNull();
    expect(screen.getByRole("heading", { name: "Nuestras marcas elegidas" })).toBeTruthy();
  });
});

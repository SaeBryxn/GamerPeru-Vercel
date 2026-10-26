// @vitest-environment jsdom
import React from "react";
import { render, screen, within } from "@testing-library/react";
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
  it("solo ofrece productos de la categoría elegida al abrir el panel", async () => {
    render(
      <ProductSelection
        products={products}
        value={{ mode: "manual", productSlugs: [] }}
        onChange={vi.fn()}
        categorySlug="mousepads"
      />
    );
    const user = userEvent.setup();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Elegir productos" }));
    const dialog = screen.getByRole("dialog", { name: "Elige los productos" });
    expect(within(dialog).queryByRole("button", { name: "Agregar Mouse A" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Agregar Mousepad" })).toBeTruthy();
  });
  it("previsualiza el orden sin guardar hasta aplicar y permite cancelar", async () => {
    const onChange = vi.fn();
    render(
      <ProductSelection
        products={products}
        value={{ mode: "manual", productSlugs: ["a", "b"] }}
        onChange={onChange}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Elegir productos" }));
    await user.click(screen.getByRole("button", { name: "Subir Mouse B" }));
    await user.click(screen.getByRole("button", { name: "Quitar de la selección Mouse A" }));
    await user.click(screen.getByRole("button", { name: "Agregar Mousepad" }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Aplicar selección" }));
    expect(onChange).toHaveBeenLastCalledWith({ mode: "manual", productSlugs: ["b", "pad"] });
  });
  it("mantiene el panel y los productos elegidos si guardar falla", async () => {
    const onChange = vi.fn();
    const onApply = vi.fn().mockResolvedValue({ success: false, error: "No se pudo guardar." });
    render(
      <ProductSelection
        products={products}
        value={{ mode: "manual", productSlugs: [] }}
        onChange={onChange}
        onApply={onApply}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Elegir productos" }));
    await user.click(screen.getByRole("button", { name: "Agregar Mouse A" }));
    await user.click(screen.getByRole("button", { name: "Guardar selección" }));
    expect(screen.getByRole("alert").textContent).toContain("No se pudo guardar.");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onChange).not.toHaveBeenCalled();
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

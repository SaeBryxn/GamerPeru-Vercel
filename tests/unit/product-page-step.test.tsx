// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProductPageStep } from "@/components/admin/products/product-page-step";
import { productPdpConfigSchema } from "@/lib/catalog/product-pdp-config";

const actions = vi.hoisted(() => ({ update: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/admin/catalog/actions", () => ({ updateProductAction: actions.update }));
vi.mock("@/lib/admin/catalog/pdp-actions", () => ({ searchPdpAccessoriesAction: actions.search }));
afterEach(cleanup);

it("avisa si un bloque activado está vacío y actualiza el resumen al apagarlo", () => {
  render(
    <ProductPageStep
      product={{ id: "product-empty", name: "Mouse", updatedAt: new Date("2026-10-22T08:00:00Z") }}
      pdpConfig={productPdpConfigSchema.parse({
        gift: { enabled: true },
        accessories: { enabled: true },
        sizeGuide: { enabled: true },
        packageContents: { enabled: true },
      })}
      variants={[]}
      media={[]}
      storySummary={{
        lifecycle: "NO_STORY",
        draftRevisionNumber: null,
        publishedRevisionNumber: null,
        publishedAt: null,
      }}
      onChanged={vi.fn()}
    />
  );
  expect(screen.getAllByText("Activado, pero vacío: no se verá en la tienda")).toHaveLength(6);
  fireEvent.click(screen.getByRole("switch", { name: "Mostrar en la tienda: Contenido de caja" }));
  expect(screen.getAllByText("Activado, pero vacío: no se verá en la tienda")).toHaveLength(5);
  expect(
    screen
      .getByRole("switch", { name: "Mostrar en la tienda: Contenido de caja" })
      .getAttribute("aria-checked")
  ).not.toBe("true");
});

it("permite activar un regalo, verlo en la vista previa y guardar pdpConfig", async () => {
  const config = productPdpConfigSchema.parse({
    gift: { title: "Grip de regalo", description: "Incluido con tu mouse" },
  });
  const product = {
    id: "product-1",
    name: "Mouse de prueba",
    updatedAt: new Date("2026-10-22T08:00:00Z"),
  };
  actions.update.mockResolvedValue({
    success: true,
    data: {
      product: {
        ...product,
        updatedAt: new Date("2026-10-22T08:01:00Z"),
        pdpConfig: { ...config, gift: { ...config.gift, enabled: true } },
      },
    },
  });
  const onChanged = vi.fn();
  render(
    <ProductPageStep
      product={product}
      pdpConfig={config}
      variants={[]}
      media={[]}
      storySummary={{
        lifecycle: "NO_STORY",
        draftRevisionNumber: null,
        publishedRevisionNumber: null,
        publishedAt: null,
      }}
      onChanged={onChanged}
    />
  );
  expect(screen.getByRole("link", { name: "Editar historia" }).getAttribute("href")).toBe(
    "/admin/products/product-1/story"
  );
  fireEvent.click(screen.getByRole("switch", { name: "Mostrar en la tienda: Regalo" }));
  expect(screen.getByLabelText("Título del regalo")).toBeTruthy();
  expect(screen.getByText("Incluido con tu mouse")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Guardar página del producto" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(actions.update).toHaveBeenCalledWith(
    expect.objectContaining({
      productId: "product-1",
      expectedUpdatedAt: "2026-10-22T08:00:00.000Z",
      pdpConfig: expect.objectContaining({
        gift: expect.objectContaining({ enabled: true, title: "Grip de regalo" }),
      }),
      mutationRequestId: expect.any(String),
    })
  );
  expect(actions.search).not.toHaveBeenCalled();
});

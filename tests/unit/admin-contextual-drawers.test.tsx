// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SideDrawer } from "@/components/admin/ui/side-drawer";
import { ProductQuickView } from "@/components/admin/products/product-quick-view";
import { ReviewQueue } from "@/app/admin/(protected)/resenas/review-queue";
import { TaxonomyWorkspace } from "@/app/admin/(protected)/taxonomia/taxonomy-workspace";

const actions = vi.hoisted(() => ({
  load: vi.fn(),
  update: vi.fn(),
  moderate: vi.fn(),
  taxonomy: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: actions.refresh }) }));
vi.mock("@/lib/admin/catalog/quick-view-action", () => ({
  getQuickProductDetailAction: actions.load,
}));
vi.mock("@/lib/admin/catalog/actions", () => ({ updateVariantAction: actions.update }));
vi.mock("@/lib/admin/reviews/actions", () => ({ moderateReviewAction: actions.moderate }));
vi.mock("@/lib/admin/taxonomy/actions", () => ({
  createTaxonomyAction: actions.taxonomy,
  updateTaxonomyAction: actions.taxonomy,
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const detail = {
  id: "product-1",
  name: "ATK A9",
  slug: "atk-a9",
  brand: "ATK",
  category: "Mouses",
  status: "PUBLISHED",
  imageUrl: "/mouse.png",
  variants: [
    {
      id: "v1",
      title: "Negro",
      status: "ACTIVE",
      priceCents: 32900,
      compareAtPriceCents: null,
      updatedAt: "2026-10-26T10:00:00.000Z",
      imageUrl: "/black.png",
    },
    {
      id: "v2",
      title: "Blanco",
      status: "ACTIVE",
      priceCents: 34900,
      compareAtPriceCents: null,
      updatedAt: "2026-10-26T10:00:00.000Z",
      imageUrl: "/white.png",
    },
  ],
};

it("only closes the front drawer and retains the scroll lock and parent focus", async () => {
  const closeParent = vi.fn();
  function Nested() {
    const [child, setChild] = useState(false);
    return (
      <SideDrawer labelledBy="parent-title" onClose={closeParent}>
        <h2 id="parent-title">Sección</h2>
        <button onClick={() => setChild(true)}>Elegir productos</button>
        {child && (
          <SideDrawer labelledBy="child-title" onClose={() => setChild(false)}>
            <h2 id="child-title">Productos</h2>
            <button>Aplicar</button>
          </SideDrawer>
        )}
      </SideDrawer>
    );
  }
  document.body.style.overflow = "auto";
  const view = render(<Nested />);
  const trigger = screen.getByRole("button", { name: "Elegir productos" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByRole("dialog", { name: "Productos" })).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: "Sección" })).toBeNull();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(closeParent).not.toHaveBeenCalled();
  expect(document.body.style.overflow).toBe("hidden");
  expect(document.activeElement).toBe(trigger);
  expect(screen.getByRole("dialog", { name: "Sección" })).toBeTruthy();
  view.unmount();
  expect(document.body.style.overflow).toBe("auto");
});

it("previews an offer and saves only its selected variant with the version that was read", async () => {
  actions.load.mockResolvedValue({ success: true, data: structuredClone(detail) });
  actions.update.mockResolvedValue({
    success: true,
    data: {
      variant: {
        id: "v2",
        priceCents: 29900,
        compareAtPriceCents: 34900,
        updatedAt: "2026-10-26T11:00:00Z",
      },
    },
  });
  render(<ProductQuickView productId="product-1" name="ATK A9" />);
  fireEvent.click(screen.getByRole("button", { name: /Vista rápida/ }));
  await screen.findByRole("heading", { name: "Elige la versión" });
  fireEvent.click(screen.getByRole("button", { name: /Blanco/ }));
  fireEvent.change(screen.getByLabelText<HTMLInputElement>("Precio de venta (S/)"), {
    target: { value: "299" },
  });
  fireEvent.change(screen.getByLabelText<HTMLInputElement>("Precio antes, tachado (S/)"), {
    target: { value: "349" },
  });
  expect(within(screen.getByTestId("store-card-preview")).getByText("−14%")).toBeTruthy();
  expect(actions.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Guardar precio" }));
  await waitFor(() =>
    expect(actions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product-1",
        variantId: "v2",
        expectedUpdatedAt: "2026-10-26T10:00:00.000Z",
        pricePen: "299",
        compareAtPricePen: "349",
        mutationRequestId: expect.any(String),
      })
    )
  );
  await screen.findByText(/Precio guardado/);
  expect(screen.getByLabelText<HTMLInputElement>("Precio de venta (S/)").value).toBe("299.00");
});

it("rejects misleading offers and keeps entered prices after a conflict", async () => {
  actions.load.mockResolvedValue({ success: true, data: structuredClone(detail) });
  actions.update.mockResolvedValue({ success: false, error: "Otra persona cambió esta versión." });
  render(<ProductQuickView productId="product-1" name="ATK A9" />);
  fireEvent.click(screen.getByRole("button", { name: /Vista rápida/ }));
  await screen.findByRole("heading", { name: "Elige la versión" });
  fireEvent.change(screen.getByLabelText<HTMLInputElement>("Precio antes, tachado (S/)"), {
    target: { value: "100" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar precio" }));
  expect(screen.getByRole("alert").textContent).toContain("debe ser mayor");
  expect(actions.update).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText<HTMLInputElement>("Precio antes, tachado (S/)"), {
    target: { value: "399" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar precio" }));
  await screen.findByText("Otra persona cambió esta versión.");
  expect(screen.getByLabelText<HTMLInputElement>("Precio antes, tachado (S/)").value).toBe("399");
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("opens a review with all photos and only moderates after an explicit decision", async () => {
  actions.moderate.mockResolvedValue({ success: true });
  render(
    <ReviewQueue
      reviews={[
        {
          id: "r1",
          rating: 5,
          title: "Excelente",
          body: "Llegó muy bien.",
          authorName: "Ana",
          status: "PENDING",
          verifiedPurchase: true,
          createdAt: "2026-10-26T10:00:00Z",
          product: { name: "ATK A9", slug: "atk-a9" },
          photos: [
            { id: "p1", url: "/photo1.png" },
            { id: "p2", url: "/photo2.png" },
          ],
        },
      ]}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /Revisar reseña/ }));
  const drawer = screen.getByTestId("review-drawer");
  fireEvent.click(within(drawer).getByRole("button", { name: "Ver foto 2" }));
  expect(
    within(drawer)
      .getByAltText(/Foto 2 de ATK/)
      .getAttribute("src")
  ).toBe("/photo2.png");
  expect(actions.moderate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Publicar reseña" }));
  await waitFor(() =>
    expect(actions.moderate).toHaveBeenCalledWith({ reviewId: "r1", decision: "APPROVED" })
  );
});

it("previews a category name without changing the list until it is saved", async () => {
  actions.taxonomy.mockResolvedValue({ success: false, error: "La URL ya existe." });
  render(
    <TaxonomyWorkspace
      categories={[
        {
          id: "c1",
          name: "Mouses",
          slug: "mouses",
          status: "PUBLISHED",
          displayOrder: 1,
          productCount: 4,
        },
      ]}
      brands={[]}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Editar Mouses" }));
  fireEvent.change(screen.getByTestId<HTMLInputElement>("category-name-input"), {
    target: { value: "Mouse gaming" },
  });
  expect(
    within(screen.getByTestId("category-drawer")).getByRole("heading", { name: "Mouse gaming" })
  ).toBeTruthy();
  expect(actions.taxonomy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("category-submit"));
  await screen.findByText("La URL ya existe.");
  expect(screen.getByTestId<HTMLInputElement>("category-name-input").value).toBe("Mouse gaming");
});

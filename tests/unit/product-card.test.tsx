import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductCard } from "@/components/catalog";
import { buildCardGallery } from "@/lib/catalog/card-gallery";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";

const BASE: ProductDiscoveryItem = {
  id: "prod-1",
  name: "Mouse QA",
  slug: "mouse-qa",
  subtitle: null,
  brand: { name: "Marca QA", slug: "marca-qa" },
  category: { name: "Mouses", slug: "mouses" },
  primaryMedia: null,
  startingPriceCents: 29900,
};

const image = (objectKey: string) => ({ objectKey, altText: null });

describe("buildCardGallery", () => {
  it("leads with the card image and does not repeat it", () => {
    expect(buildCardGallery(image("a"), [image("b"), image("a"), image("c")])).toEqual([
      image("a"),
      image("b"),
      image("c"),
    ]);
  });

  it("merges a primary that is not part of the gallery and caps at three", () => {
    expect(buildCardGallery(image("p"), [image("a"), image("b"), image("c"), image("d")])).toEqual([
      image("p"),
      image("a"),
      image("b"),
    ]);
  });

  it("returns the gallery alone when there is no card image", () => {
    expect(buildCardGallery(null, [image("a")])).toEqual([image("a")]);
    expect(buildCardGallery(null, null)).toEqual([]);
  });
});

describe("ProductCard", () => {
  it("strikes through a compare-at price only when it is higher", () => {
    const onSale = renderToStaticMarkup(
      <ProductCard product={{ ...BASE, compareAtPriceCents: 34900 }} href="/productos/mouse-qa" />
    );
    expect(onSale).toMatch(/<s[ >]/);
    expect(onSale).toContain("Precio anterior");
    expect(onSale).toContain("S/ 349.00");

    const notLower = renderToStaticMarkup(
      <ProductCard product={{ ...BASE, compareAtPriceCents: 29900 }} href="/productos/mouse-qa" />
    );
    expect(notLower).not.toMatch(/<s[ >]/);
  });

  it("drops the Desde prefix when the product has a single variant", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={{ ...BASE, singleVariantId: "v1" }} href="/productos/mouse-qa" />
    );
    expect(html).not.toContain("Desde");
  });

  it("renders one view indicator per gallery photo, and none for a single photo", () => {
    const three = renderToStaticMarkup(
      <ProductCard
        product={{ ...BASE, gallery: [image("a"), image("b"), image("c")] }}
        href="/productos/mouse-qa"
      />
    );
    expect(three.match(/data-active=/g)).toHaveLength(3);
    expect(three.match(/data-active="true"/g)).toHaveLength(1);

    const one = renderToStaticMarkup(
      <ProductCard product={{ ...BASE, gallery: [image("a")] }} href="/productos/mouse-qa" />
    );
    expect(one).not.toContain("data-active=");
  });

  it("offers quick view and choosing options when linked", () => {
    const html = renderToStaticMarkup(<ProductCard product={BASE} href="/productos/mouse-qa" />);
    expect(html).toContain("Vista rápida de Mouse QA");
    expect(html).toContain("Elegir opciones");
  });

  it("falls back to choosing options when asked to add a product that has several variants", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={BASE} href="/productos/mouse-qa" action="add-to-cart" />
    );
    expect(html).toContain("Elegir opciones");
    expect(html).not.toContain("Agregar al carrito");
  });

  it("swaps specs only when there are at least two", () => {
    const withSpecs = renderToStaticMarkup(
      <ProductCard
        product={{
          ...BASE,
          specs: [
            { key: "polling", label: "Polling rate", value: "8000 Hz" },
            { key: "mcu", label: "MCU", value: "Nordic 54L15" },
            { key: "switches", label: "Switches", value: "Omron" },
          ],
        }}
        href="/productos/mouse-qa"
      />
    );
    expect(withSpecs).toContain("Polling rate");
    expect(withSpecs).toContain("Omron");

    const oneSpec = renderToStaticMarkup(
      <ProductCard
        product={{ ...BASE, specs: [{ key: "mcu", label: "MCU", value: "Nordic" }] }}
        href="/productos/mouse-qa"
      />
    );
    expect(oneSpec).not.toContain("Nordic");
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

const { buildMenuShelves, buildBrandColumns, buildPromoCards, buildProductTiles } =
  await import("@/lib/navigation/menu-catalog");
type MenuCatalogEntry = Parameters<typeof buildMenuShelves>[0][number];

function entry(overrides: Partial<MenuCatalogEntry> = {}): MenuCatalogEntry {
  return {
    productId: "p1",
    name: "Mchose K7 v2 Ultra+ White Gold",
    slug: "mchose-k7-v2-ultra-white-gold",
    subtitle: null,
    priceCents: 39900,
    categoryName: "Mouses",
    categorySlug: "mouses",
    specs: [],
    brandName: "Mchose",
    brandSlug: "mchose",
    objectKey: "products/mchose/k7/abc.webp",
    altText: null,
    compareAtPriceCents: null,
    gallery: [],
    singleVariantId: null,
    ...overrides,
  };
}

const COLLECTIONS = [
  { label: "Gaming Mouse", href: "/categorias/mouses" },
  { label: "MousePad", href: "/categorias/mousepads" },
  { label: "Skates", href: "/categorias/accesorios?tipo_accesorio=skates" },
];

describe("Mega-menu shelves", () => {
  it("builds a shelf only for collections that have published products", () => {
    const shelves = buildMenuShelves([entry()], COLLECTIONS);
    expect(Object.keys(shelves)).toEqual(["/categorias/mouses"]);
    expect(shelves["/categorias/mouses"]?.totalCount).toBe(1);
  });

  it("matches a filtered collection URL to its category", () => {
    const shelves = buildMenuShelves(
      [entry({ productId: "p2", categorySlug: "accesorios", slug: "skate-x" })],
      COLLECTIONS
    );
    expect(shelves["/categorias/accesorios?tipo_accesorio=skates"]?.totalCount).toBe(1);
  });

  it("reports the full count but shows at most four cards", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      entry({ productId: `p${i}`, slug: `producto-${i}` })
    );
    const shelf = buildMenuShelves(many, COLLECTIONS)["/categorias/mouses"];
    expect(shelf?.totalCount).toBe(9);
    expect(shelf?.products).toHaveLength(4);
  });

  it("hands the shared card the same shape the category grid receives", () => {
    const shelf = buildMenuShelves([entry()], COLLECTIONS)["/categorias/mouses"];
    expect(shelf?.products[0]).toMatchObject({
      name: "Mchose K7 v2 Ultra+ White Gold",
      slug: "mchose-k7-v2-ultra-white-gold",
      startingPriceCents: 39900,
      brand: { name: "Mchose", slug: "mchose" },
      category: { name: "Mouses", slug: "mouses" },
    });
  });

  it("leaves a product without a photo imageless instead of substituting one", () => {
    const shelf = buildMenuShelves([entry({ objectKey: null })], COLLECTIONS)["/categorias/mouses"];
    expect(shelf?.products[0]?.primaryMedia).toBeNull();
  });

  it("returns nothing when the catalog is empty", () => {
    expect(buildMenuShelves([], COLLECTIONS)).toEqual({});
  });
});

describe("Brand columns", () => {
  it("groups real products under their real brand, alphabetically", () => {
    const columns = buildBrandColumns(
      [
        entry({ productId: "a", brandName: "Mchose", name: "K7" }),
        entry({ productId: "b", brandName: "ATK", name: "A9", slug: "atk-a9" }),
        entry({ productId: "c", brandName: "ATK", name: "A9 Pro", slug: "atk-a9-pro" }),
      ],
      "mouses"
    );
    expect(columns.map((c) => c.title)).toEqual(["ATK", "Mchose"]);
    expect(columns[0]?.items.map((i) => i.href)).toEqual([
      "/productos/atk-a9",
      "/productos/atk-a9-pro",
    ]);
  });

  it("ignores products from other categories", () => {
    expect(buildBrandColumns([entry({ categorySlug: "mousepads" })], "mouses")).toEqual([]);
  });
});

describe("Promo cards and tiles", () => {
  it("only offers products that have a real photo", () => {
    const cards = buildPromoCards(
      [entry({ productId: "a", objectKey: null }), entry({ productId: "b" })],
      "mouses"
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.title).toBe("Mchose K7 v2 Ultra+ White Gold");
    expect(cards[0]?.image).toContain("products/mchose/k7/abc.webp");
  });

  it("respects the requested limit", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      entry({ productId: `p${i}`, slug: `producto-${i}` })
    );
    expect(buildPromoCards(many, "mouses")).toHaveLength(2);
    expect(buildProductTiles(many, "mouses")).toHaveLength(4);
  });

  it("returns nothing for a category with no published products", () => {
    expect(buildPromoCards([entry()], "teclados")).toEqual([]);
    expect(buildProductTiles([entry()], "teclados")).toEqual([]);
  });
});

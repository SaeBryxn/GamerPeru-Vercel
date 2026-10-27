import { describe, it, expect, vi } from "vitest";
import { buildCatalogCollections, matchCollectionEntries } from "@/lib/navigation/menu-collections";

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
const accessorySchema = {
  id: "schema-accessories",
  categoryId: "accessories",
  schemaVersion: 1,
  fieldDefinitions: [
    {
      key: "accessory_type",
      label: "Tipo",
      dataType: "enum" as const,
      filterable: true,
      filterKind: "ENUM_MULTI" as const,
      publicParam: "tipo_accesorio",
      displayOrder: 0,
      options: [
        { value: "skates", label: "Skates" },
        { value: "keycaps", label: "Keycaps" },
        { value: "grip-tapes", label: "Grip tapes" },
      ],
    },
  ],
};

describe("Mega-menu shelves", () => {
  it("builds a shelf only for collections that have published products", () => {
    const shelves = buildMenuShelves([entry()], COLLECTIONS);
    expect(Object.keys(shelves)).toEqual(["/categorias/mouses"]);
    expect(shelves["/categorias/mouses"]?.totalCount).toBe(1);
  });

  it("matches a filtered collection to its real type instead of every accessory", () => {
    const shelves = buildMenuShelves(
      [
        entry({
          productId: "p2",
          categorySlug: "accesorios",
          slug: "skate-x",
          specificationSchema: accessorySchema,
          specValues: { accessory_type: "skates" },
        }),
        entry({
          productId: "p3",
          categorySlug: "accesorios",
          slug: "keycaps",
          specificationSchema: accessorySchema,
          specValues: { accessory_type: "keycaps" },
        }),
      ],
      COLLECTIONS
    );
    expect(shelves["/categorias/accesorios?tipo_accesorio=skates"]?.totalCount).toBe(1);
    expect(shelves["/categorias/accesorios?tipo_accesorio=skates"]?.products[0]?.slug).toBe(
      "skate-x"
    );
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

describe("Real catalog collections", () => {
  it("adds newly published categories and only represented accessory types", () => {
    const collections = buildCatalogCollections([
      entry({ categorySlug: "monitores", categoryName: "Pantallas", categoryDisplayOrder: 3 }),
      entry({ categoryDisplayOrder: 1 }),
      entry({
        categorySlug: "accesorios",
        categoryName: "Accesorios",
        categoryDisplayOrder: 4,
        specificationSchema: accessorySchema,
        specValues: { accessory_type: "skates" },
      }),
    ]);
    expect(collections.map((c) => c.href)).toEqual([
      "/categorias/mouses",
      "/categorias/monitores",
      "/categorias/accesorios",
      "/categorias/accesorios?tipo_accesorio=skates",
    ]);
    expect(collections.find((c) => c.href === "/categorias/monitores")?.label).toBe("Pantallas");
    expect(collections.some((c) => c.label === "Grip tapes")).toBe(false);
  });
  it("does not turn unsupported or invalid collection filters into unrelated products", () => {
    const items = [
      entry({
        categorySlug: "accesorios",
        specificationSchema: accessorySchema,
        specValues: { accessory_type: "skates" },
      }),
    ];
    expect(
      matchCollectionEntries(items, "/categorias/accesorios?tipo_accesorio=no-existe")
    ).toEqual([]);
    expect(matchCollectionEntries(items, "/categorias/accesorios?otro=skates")).toEqual([]);
    expect(matchCollectionEntries(items, "https://external.test/categorias/accesorios")).toEqual(
      []
    );
    expect(
      matchCollectionEntries(
        [entry({ categorySlug: "accesorios" })],
        "/categorias/accesorios?tipo_accesorio=skates"
      )
    ).toEqual([]);
  });
  it("respects brand and eligible variant prices from the category filters", () => {
    const items = [
      entry({ priceCents: 10000, variantPrices: [10000, 20000] }),
      entry({ productId: "p2", brandSlug: "atk", priceCents: 21000 }),
    ];
    const filtered = matchCollectionEntries(
      items,
      "/categorias/mouses?marca=mchose&precio_min=150&precio_max=250"
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.priceCents).toBe(20000);
  });
});

describe("Brand columns", () => {
  it("groups real products under their real brand, alphabetically", () => {
    const columns = buildBrandColumns(
      [
        entry({ productId: "a", brandName: "Mchose", name: "K7" }),
        entry({ productId: "b", brandName: "ATK", brandSlug: "atk", name: "A9", slug: "atk-a9" }),
        entry({
          productId: "c",
          brandName: "ATK",
          brandSlug: "atk",
          name: "A9 Pro",
          slug: "atk-a9-pro",
        }),
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
    expect(cards[0]?.title).toBe("K7 v2 Ultra+ White Gold");
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

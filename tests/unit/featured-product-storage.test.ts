import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { homeSectionProducts, storefrontMenuProducts, storefrontMenuLinks } from "@/db/schema";
import {
  featuredSlugsByOwner,
  hydrateHomeSelection,
  writeFeaturedProducts,
} from "@/lib/catalog/featured-product-storage";

vi.mock("@/db", () => ({ db: {} }));

function executor(rows: { id: string; slug: string }[]) {
  const inserts: { table: string; values: unknown }[] = [];
  const deletions: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  const database = {
    select: () => chain,
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: async (values: unknown) => {
        inserts.push({ table: getTableName(table), values });
      },
    }),
    delete: (table: Parameters<typeof getTableName>[0]) => ({
      where: async () => {
        deletions.push(getTableName(table));
      },
    }),
  } as never;
  return { database, inserts, deletions };
}

describe("Relaciones de productos destacados", () => {
  it("guarda IDs y el orden elegido, aunque la consulta devuelva otro orden", async () => {
    const { database, inserts } = executor([
      { id: "product-a", slug: "mouse-a" },
      { id: "product-b", slug: "mouse-b" },
    ]);
    expect(
      await writeFeaturedProducts(
        database,
        { entryId: "mouses" },
        { mode: "manual", productSlugs: ["mouse-b", "mouse-a"] },
        "mouses"
      )
    ).toEqual({ mode: "manual", productSlugs: [] });
    expect(inserts).toEqual([
      {
        table: "storefront_menu_products",
        values: [
          { entryId: "mouses", productId: "product-b", displayOrder: 0 },
          { entryId: "mouses", productId: "product-a", displayOrder: 1 },
        ],
      },
    ]);
  });
  it("permite una selección vacía y borra los anteriores sin rellenarla", async () => {
    const { database, inserts, deletions } = executor([]);
    await writeFeaturedProducts(
      database,
      { sectionId: "home-section" },
      { mode: "manual", productSlugs: [] }
    );
    expect(deletions).toEqual(["home_section_products"]);
    expect(inserts).toEqual([]);
  });
  it("rechaza productos inexistentes o de otra categoría antes de borrar", async () => {
    const { database, deletions } = executor([]);
    await expect(
      writeFeaturedProducts(
        database,
        { entryId: "mousepads" },
        { mode: "manual", productSlugs: ["mouse-a"] },
        "mousepads"
      )
    ).rejects.toMatchObject({ code: "INVALID_FEATURED_PRODUCTS" });
    expect(deletions).toEqual([]);
  });
  it("hidrata el slug actual del producto vinculado, conservando el orden", () => {
    const grouped = featuredSlugsByOwner([
      { ownerId: "section", slug: "nuevo-nombre-del-mouse" },
      { ownerId: "section", slug: "mouse-b" },
    ]);
    expect(
      hydrateHomeSelection(
        { title: "Mis mouses", selection: { mode: "manual", productSlugs: [] } },
        grouped.get("section")
      )
    ).toEqual({
      title: "Mis mouses",
      selection: { mode: "manual", productSlugs: ["nuevo-nombre-del-mouse", "mouse-b"] },
    });
  });
  it("cada selección tiene claves foráneas al contenedor y al producto, y RLS", () => {
    for (const table of [homeSectionProducts, storefrontMenuProducts]) {
      const config = getTableConfig(table);
      expect(config.enableRLS).toBe(true);
      expect(config.foreignKeys).toHaveLength(2);
      expect(config.foreignKeys.every((key) => key.onDelete === "cascade")).toBe(true);
      expect(config.uniqueConstraints).toHaveLength(1);
    }
    expect(getTableConfig(storefrontMenuLinks).enableRLS).toBe(true);
    expect(getTableConfig(storefrontMenuLinks).foreignKeys[0]?.onDelete).toBe("cascade");
  });
});

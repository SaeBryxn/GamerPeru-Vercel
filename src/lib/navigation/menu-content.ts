import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { storefrontMenuLinks } from "@/db/schema";
import { cacheCatalogQuery } from "@/lib/catalog/catalog-cache";
import { resolveCatalogReaderMode } from "@/lib/catalog/resolve-reader-mode";
import { readMenuFeaturedProducts } from "@/lib/catalog/featured-product-storage";
import { MenuLinkSchema, type EditableMenuLink } from "./menu-content-schema";

const readLinks = cacheCatalogQuery("menu-editable-links", async () => {
  const rows = await db
    .select()
    .from(storefrontMenuLinks)
    .orderBy(asc(storefrontMenuLinks.displayOrder), asc(storefrontMenuLinks.id));
  const result: Record<string, EditableMenuLink[]> = {};
  for (const row of rows) {
    const { entryId, displayOrder: _order, updatedAt: _updated, ...content } = row;
    const parsed = MenuLinkSchema.safeParse(content);
    if (parsed.success) (result[entryId] ??= []).push(parsed.data);
  }
  return result;
});
const readProducts = cacheCatalogQuery("menu-featured-products", readMenuFeaturedProducts);

export async function getEditableMenuLinks(): Promise<Record<string, EditableMenuLink[]> | null> {
  if (resolveCatalogReaderMode() === "e2e-fixture") return null;
  try {
    return await readLinks();
  } catch {
    return null;
  }
}
export async function getMenuFeaturedProducts() {
  if (resolveCatalogReaderMode() === "e2e-fixture") return null;
  try {
    return await readProducts();
  } catch {
    return null;
  }
}

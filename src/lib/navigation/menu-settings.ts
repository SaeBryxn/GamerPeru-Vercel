import "server-only";
import { ProductSelectionSchema, type ProductSelection } from "@/lib/catalog/curated-products";
import { getMenuFeaturedProducts } from "./menu-content";
import { featuredSlugsByOwner } from "@/lib/catalog/featured-product-storage";
import { db } from "@/db";
import { storefrontMenuEntries } from "@/db/schema";
import { cacheCatalogQuery } from "@/lib/catalog/catalog-cache";
import { resolveCatalogReaderMode } from "@/lib/catalog/resolve-reader-mode";
import { MENU_ENTRY_DESCRIPTORS, isKnownMenuEntry, type MenuEntryDescriptor } from "./menu-entries";

export interface MenuEntrySetting extends MenuEntryDescriptor {
  productSelection?: ProductSelection;
  label?: string;
  href?: string;
  linksConfigured?: boolean;
  isVisible: boolean;
  displayOrder: number;
  /** True while the entry still uses the configuration default (no stored decision yet). */
  isDefault: boolean;
}

/**
 * Resolves every menu entry against stored operator decisions.
 *
 * Reads are fail-soft: if the settings table cannot be reached the storefront still renders its
 * declared defaults rather than losing its navigation.
 */
const readStoredMenuEntries = cacheCatalogQuery("menu-entry-settings", async () =>
  db
    .select({
      entryId: storefrontMenuEntries.entryId,
      productSelection: storefrontMenuEntries.productSelection,
      label: storefrontMenuEntries.label,
      href: storefrontMenuEntries.href,
      linksConfigured: storefrontMenuEntries.linksConfigured,
      isVisible: storefrontMenuEntries.isVisible,
      displayOrder: storefrontMenuEntries.displayOrder,
    })
    .from(storefrontMenuEntries)
);

const readLegacyMenuEntries = cacheCatalogQuery("menu-entry-settings-legacy", async () =>
  db
    .select({
      entryId: storefrontMenuEntries.entryId,
      isVisible: storefrontMenuEntries.isVisible,
      displayOrder: storefrontMenuEntries.displayOrder,
    })
    .from(storefrontMenuEntries)
);

export async function getMenuEntrySettings(): Promise<MenuEntrySetting[]> {
  let stored: {
    entryId: string;
    isVisible: boolean;
    displayOrder: number;
    productSelection?: unknown;
    label?: string | null;
    href?: string | null;
    linksConfigured?: boolean;
  }[] = [];

  // Fixture runs must not inherit whatever the operator configured in the connected database.
  if (resolveCatalogReaderMode() !== "e2e-fixture") {
    try {
      stored = await readStoredMenuEntries();
    } catch {
      try {
        stored = await readLegacyMenuEntries();
      } catch {
        stored = [];
      }
    }
  }

  const relational = featuredSlugsByOwner((await getMenuFeaturedProducts()) ?? []);
  const byId = new Map(
    stored.filter((row) => isKnownMenuEntry(row.entryId)).map((r) => [r.entryId, r])
  );

  return MENU_ENTRY_DESCRIPTORS.map((descriptor) => {
    const row = byId.get(descriptor.id);
    const selection = ProductSelectionSchema.safeParse(row?.productSelection);
    return {
      ...descriptor,
      label: row?.label ?? undefined,
      href: row?.href ?? undefined,
      linksConfigured: row?.linksConfigured ?? false,
      productSelection: selection.success
        ? {
            ...selection.data,
            productSlugs: relational.get(descriptor.id) ?? selection.data.productSlugs,
          }
        : undefined,
      isVisible: row ? row.isVisible : descriptor.defaultVisible,
      displayOrder: row ? row.displayOrder : descriptor.defaultOrder,
      isDefault: !row,
    };
  }).sort((a, b) => a.displayOrder - b.displayOrder || a.adminLabel.localeCompare(b.adminLabel));
}

/** Ids the storefront should render, in the operator's order. */
export async function getVisibleMenuEntryIds(): Promise<string[]> {
  const settings = await getMenuEntrySettings();
  return settings.filter((entry) => entry.isVisible).map((entry) => entry.id);
}

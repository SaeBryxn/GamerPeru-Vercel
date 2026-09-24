import "server-only";
import { db } from "@/db";
import { storefrontMenuEntries } from "@/db/schema";
import { MENU_ENTRY_DESCRIPTORS, isKnownMenuEntry, type MenuEntryDescriptor } from "./menu-entries";

export interface MenuEntrySetting extends MenuEntryDescriptor {
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
export async function getMenuEntrySettings(): Promise<MenuEntrySetting[]> {
  let stored: { entryId: string; isVisible: boolean; displayOrder: number }[] = [];

  try {
    stored = await db
      .select({
        entryId: storefrontMenuEntries.entryId,
        isVisible: storefrontMenuEntries.isVisible,
        displayOrder: storefrontMenuEntries.displayOrder,
      })
      .from(storefrontMenuEntries);
  } catch {
    stored = [];
  }

  const byId = new Map(
    stored.filter((row) => isKnownMenuEntry(row.entryId)).map((r) => [r.entryId, r])
  );

  return MENU_ENTRY_DESCRIPTORS.map((descriptor) => {
    const row = byId.get(descriptor.id);
    return {
      ...descriptor,
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

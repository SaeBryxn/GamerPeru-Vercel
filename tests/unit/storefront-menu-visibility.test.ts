import { describe, it, expect, vi, beforeEach } from "vitest";
import { NAVIGATION_CONFIG } from "@/components/navigation/navigation-data";
import {
  MENU_ENTRY_DESCRIPTORS,
  getMenuEntryDescriptor,
  isKnownMenuEntry,
} from "@/lib/navigation/menu-entries";
import type { MenuEntrySetting } from "@/lib/navigation/menu-settings";

const settingsMock = vi.hoisted(() => ({ value: [] as MenuEntrySetting[] }));
const factsMock = vi.hoisted(() => ({
  byCategory: new Map<
    string,
    { categorySlug: string; publishedProducts: number; brands: unknown[] }
  >(),
  allBrands: [] as { label: string; href: string }[],
}));

vi.mock("@/lib/navigation/menu-settings", () => ({
  getMenuEntrySettings: async () => settingsMock.value,
  getVisibleMenuEntryIds: async () =>
    settingsMock.value.filter((e) => e.isVisible).map((e) => e.id),
}));

vi.mock("@/lib/navigation/catalog-facts", () => ({
  getCatalogNavigationFacts: async () => factsMock,
}));

vi.mock("@/db", () => ({ db: {} }));

function defaultSettings(): MenuEntrySetting[] {
  return MENU_ENTRY_DESCRIPTORS.map((descriptor) => ({
    ...descriptor,
    isVisible: descriptor.defaultVisible,
    displayOrder: descriptor.defaultOrder,
    isDefault: true,
  }));
}

describe("Menu entry registry", () => {
  it("declares one descriptor per top-level navigation entry", () => {
    const navIds = NAVIGATION_CONFIG.primaryNav.map((item) => item.id).sort();
    const descriptorIds = MENU_ENTRY_DESCRIPTORS.map((entry) => entry.id).sort();
    expect(descriptorIds).toEqual(navIds);
  });

  it("starts with keyboards and IEMs hidden because the store does not sell them yet", () => {
    expect(getMenuEntryDescriptor("teclados")?.defaultVisible).toBe(false);
    expect(getMenuEntryDescriptor("audio")?.defaultVisible).toBe(false);
  });

  it("keeps the sections the store does sell visible", () => {
    for (const id of ["productos", "mouses", "mousepads", "soporte", "software"]) {
      expect(getMenuEntryDescriptor(id)?.defaultVisible, id).toBe(true);
    }
  });

  it("rejects unknown entry ids", () => {
    expect(isKnownMenuEntry("teclados")).toBe(true);
    expect(isKnownMenuEntry("no-existe")).toBe(false);
  });

  it("records the destinations that have no page yet", () => {
    expect(getMenuEntryDescriptor("soporte")?.missingDestinations?.length).toBeGreaterThan(0);
    expect(getMenuEntryDescriptor("software")?.missingDestinations?.length).toBeGreaterThan(0);
    expect(getMenuEntryDescriptor("mousepads")?.missingDestinations).toBeUndefined();
  });
});

describe("Resolved storefront navigation", () => {
  beforeEach(() => {
    vi.resetModules();
    settingsMock.value = defaultSettings();
    factsMock.byCategory = new Map();
    factsMock.allBrands = [
      { label: "ATK", href: "/marcas/atk" },
      { label: "Mchose", href: "/marcas/mchose" },
    ];
  });

  async function resolve() {
    const mod = await import("@/lib/navigation/resolve-navigation");
    return mod.getStorefrontNavigation();
  }

  it("omits hidden entries from the top-level menu", async () => {
    const config = await resolve();
    const ids = config.primaryNav.map((item) => item.id);
    expect(ids).not.toContain("teclados");
    expect(ids).not.toContain("audio");
    expect(ids).toEqual(["productos", "mouses", "mousepads", "soporte", "software"]);
  });

  it("removes links pointing at a hidden category from every menu and the footer", async () => {
    const config = await resolve();
    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain("/categorias/teclados");
    expect(serialized).not.toContain("/categorias/audio");
  });

  it("replaces declared brands with brands that exist in the catalog", async () => {
    const config = await resolve();
    const serialized = JSON.stringify(config);
    for (const invented of ["wlmouse", "lamzu", "wooting", "artisan", "moondrop"]) {
      expect(serialized, invented).not.toContain(`/marcas/${invented}`);
    }
    expect(serialized).toContain("/marcas/atk");
  });

  it("restores a hidden entry when the operator turns it back on", async () => {
    settingsMock.value = defaultSettings().map((entry) =>
      entry.id === "teclados" ? { ...entry, isVisible: true, isDefault: false } : entry
    );
    const config = await resolve();
    expect(config.primaryNav.map((item) => item.id)).toContain("teclados");
  });

  it("honours the operator's ordering", async () => {
    settingsMock.value = defaultSettings().map((entry) =>
      entry.id === "mousepads"
        ? { ...entry, displayOrder: -1, isDefault: false }
        : { ...entry, isDefault: false }
    );
    const config = await resolve();
    expect(config.primaryNav[0]?.id).toBe("mousepads");
  });

  it("drops the brand block entirely when the catalog has no published brands", async () => {
    factsMock.allBrands = [];
    const config = await resolve();
    for (const item of config.primaryNav) {
      expect(item.brands ?? []).toEqual([]);
    }
  });
});

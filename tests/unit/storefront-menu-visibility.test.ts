import { describe, it, expect, vi, beforeEach } from "vitest";
import { NAVIGATION_CONFIG } from "@/components/navigation/navigation-data";
import {
  MENU_ENTRY_DESCRIPTORS,
  getMenuEntryDescriptor,
  isKnownMenuEntry,
} from "@/lib/navigation/menu-entries";
import type { EditableMenuLink } from "@/lib/navigation/menu-content-schema";
import type { MenuEntrySetting } from "@/lib/navigation/menu-settings";

const contentMock = vi.hoisted(() => ({
  value: null as Record<string, EditableMenuLink[]> | null,
}));
vi.mock("@/lib/navigation/menu-content", () => ({
  getEditableMenuLinks: async () => contentMock.value,
}));
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

  it("has no menu entry pointing at a page that is not built", () => {
    for (const entry of MENU_ENTRY_DESCRIPTORS) {
      expect(entry.missingDestinations ?? [], entry.id).toEqual([]);
    }
  });
});

describe("Resolved storefront navigation", () => {
  beforeEach(() => {
    vi.resetModules();
    contentMock.value = null;
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

  it("usa enlaces editados, oculta los desactivados y admite una lista vacía", async () => {
    settingsMock.value = settingsMock.value.map((entry) =>
      entry.id === "soporte"
        ? { ...entry, label: "Ayuda", href: "/soporte/contacto", linksConfigured: true }
        : entry
    );
    contentMock.value = {
      soporte: [
        {
          id: "01a1c000-0000-7000-8000-000000000101",
          label: "Habla con nosotros",
          href: "/soporte/contacto",
          sectionTitle: "Ayuda",
          placement: "section",
          icon: null,
          isVisible: true,
        },
        {
          id: "01a1c000-0000-7000-8000-000000000102",
          label: "Oculto",
          href: "/soporte/distribuidores",
          sectionTitle: "Ayuda",
          placement: "section",
          icon: null,
          isVisible: false,
        },
      ],
    };
    const support = (await resolve()).primaryNav.find((entry) => entry.id === "soporte")!;
    expect(support.label).toBe("Ayuda");
    expect(support.href).toBe("/soporte/contacto");
    expect(support.sections).toEqual([
      { title: "Ayuda", items: [{ label: "Habla con nosotros", href: "/soporte/contacto" }] },
    ]);
    contentMock.value = {};
    expect((await resolve()).primaryNav.find((entry) => entry.id === "soporte")?.sections).toEqual(
      []
    );
  });
  it("usa las colecciones editadas en Productos para las pestañas del catálogo", async () => {
    settingsMock.value = settingsMock.value.map((entry) =>
      entry.id === "productos" ? { ...entry, linksConfigured: true } : entry
    );
    contentMock.value = {
      productos: [
        {
          id: "01a1c000-0000-7000-8000-000000000111",
          label: "Mousepads elegidos",
          href: "/categorias/mousepads",
          sectionTitle: "Colecciones",
          placement: "section",
          icon: null,
          isVisible: true,
        },
      ],
    };
    expect((await resolve()).productTypes).toEqual([
      { label: "Mousepads elegidos", href: "/categorias/mousepads" },
    ]);
    contentMock.value = {};
    expect((await resolve()).productTypes).toEqual([]);
  });

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

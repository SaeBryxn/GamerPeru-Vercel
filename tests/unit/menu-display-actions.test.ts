import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultMenuContent } from "@/lib/navigation/menu-content-schema";
import { defaultMenuDisplay } from "@/lib/navigation/menu-display";

const state = vi.hoisted<{
  selection: unknown;
  writes: Record<string, unknown>[];
  allowed: boolean;
}>(() => ({
  selection: null,
  writes: [],
  allowed: true,
}));
vi.mock("@/lib/auth/rbac", () => ({
  getVerifiedAuthContext: async () => ({
    status: "READY",
    authUserId: "admin",
    permissions: new Set(state.allowed ? ["catalog:manage"] : []),
  }),
}));
vi.mock("@/lib/catalog/catalog-cache", () => ({ revalidateStorefrontCatalog: vi.fn() }));
vi.mock("@/lib/catalog/featured-product-storage", () => ({
  writeFeaturedProducts: async (_tx: unknown, _target: unknown, value: { mode: string }) => ({
    mode: value.mode,
    productSlugs: [],
  }),
}));
vi.mock("@/db", () => {
  const chain = { onConflictDoUpdate: async () => {}, onConflictDoNothing: async () => {} };
  const tx = {
    execute: async () => {},
    select: () => ({ from: () => ({ where: async () => [{ selection: state.selection }] }) }),
    insert: () => ({ values: () => chain }),
    delete: () => ({ where: async () => {} }),
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: async () => {
          state.writes.push(value);
        },
      }),
    }),
  };
  return { db: { transaction: async (run: (tx: unknown) => Promise<unknown>) => run(tx) } };
});

const { setMenuProductSelectionAction, updateMenuContentAction } =
  await import("@/lib/admin/menu/actions");

describe("Persistencia de la vista del menú", () => {
  beforeEach(() => {
    state.writes = [];
    state.allowed = true;
    state.selection = null;
  });
  it("guardar nombres y límites conserva la selección manual", async () => {
    state.selection = { mode: "manual", productSlugs: [] };
    const display = {
      ...defaultMenuDisplay(),
      itemsPerBrand: 3,
      productLabels: { "modelo-real": "Corto" },
    };
    const result = await updateMenuContentAction({ ...defaultMenuContent("mouses"), display });
    expect(result.success).toBe(true);
    expect(state.writes).toContainEqual({
      productSelection: { mode: "manual", productSlugs: [], menuDisplay: display },
    });
  });
  it("cambiar productos conserva los límites y nombres guardados", async () => {
    const display = { ...defaultMenuDisplay(), itemsPerBrand: 4 };
    state.selection = { mode: "automatic", productSlugs: [], menuDisplay: display };
    const result = await setMenuProductSelectionAction("mouses", {
      mode: "manual",
      productSlugs: ["modelo-real"],
      menuDisplay: defaultMenuDisplay(),
    });
    expect(result.success).toBe(true);
    expect(state.writes[0]?.productSelection).toEqual({
      mode: "manual",
      productSlugs: [],
      menuDisplay: display,
    });
  });
  it("rechaza ajustes inválidos y personal sin permiso antes de escribir", async () => {
    expect(
      (
        await updateMenuContentAction({
          ...defaultMenuContent("mouses"),
          display: { itemsPerBrand: 500 },
        })
      ).success
    ).toBe(false);
    state.allowed = false;
    expect((await updateMenuContentAction(defaultMenuContent("mouses"))).code).toBe("FORBIDDEN");
    expect(state.writes).toEqual([]);
  });
});

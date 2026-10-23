import { expect, it, vi } from "vitest";
import { inventoryQuerySchema, getAdminInventoryPage } from "@/lib/admin/inventory/page-reader";
import { validateExpectedPhysicalCount } from "@/lib/inventory/validation";
import { computeInventoryAdjustmentFingerprint } from "@/lib/inventory/crypto";
import { getAdminNavigation } from "@/lib/admin/navigation";
const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/auth/rbac", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/inventory/config", () => ({
  getInventoryConfig: () => ({ valid: true, config: { primaryLocationCode: "TEST" } }),
}));
it("limita filtros y páginas y protege la pantalla con permiso de inventario", async () => {
  expect(inventoryQuerySchema.parse({})).toMatchObject({ stock: "all", page: 1 });
  expect(() => inventoryQuerySchema.parse({ page: 0 })).toThrow();
  expect(() => inventoryQuerySchema.parse({ stock: "custom", q: "x".repeat(101) })).toThrow();
  mocks.requirePermission.mockRejectedValueOnce(new Error("FORBIDDEN"));
  await expect(getAdminInventoryPage({})).rejects.toThrow("FORBIDDEN");
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(
    getAdminNavigation(new Set(["catalog:manage"])).some(
      (item) => item.href === "/admin/inventario"
    )
  ).toBe(false);
  expect(
    getAdminNavigation(new Set(["inventory:manage"])).some(
      (item) => item.href === "/admin/inventario"
    )
  ).toBe(true);
});
it("rechaza un conteo basado en stock antiguo y vincula el valor esperado a la idempotencia", () => {
  expect(validateExpectedPhysicalCount(2, 3)).toContain("cambió");
  expect(validateExpectedPhysicalCount(3, 3)).toBeNull();
  expect(validateExpectedPhysicalCount(undefined, 3)).toBeNull();
  const base = {
    variantId: "v",
    commandKind: "PHYSICAL_COUNT",
    countedQuantity: 5,
    reason: "Conteo",
    referenceId: "REF",
    actorId: "actor",
    authorityBindingDigest: "digest",
  };
  expect(computeInventoryAdjustmentFingerprint({ ...base, expectedOnHand: 2 })).not.toBe(
    computeInventoryAdjustmentFingerprint({ ...base, expectedOnHand: 3 })
  );
});

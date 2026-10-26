import { afterEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getInventoryMovementsAction } from "@/lib/admin/inventory/actions";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn() }));
vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/auth/rbac", () => ({ getVerifiedAuthContext: mocks.auth }));
vi.mock("@/lib/catalog/catalog-cache", () => ({ revalidateStorefrontCatalog: vi.fn() }));
vi.mock("@/lib/inventory/service", () => ({
  adjustInventory: vi.fn(),
  getVariantAvailability: vi.fn(),
}));
vi.mock("@/lib/inventory/config", () => ({
  getInventoryConfig: () => ({ valid: true, config: { primaryLocationCode: "PRINCIPAL" } }),
}));
afterEach(() => vi.resetAllMocks());
const id = "00000000-0000-4000-8000-000000000001";

it("protege el historial con permisos y valida la variante antes de consultar", async () => {
  mocks.auth.mockResolvedValue({ status: "READY", permissions: new Set(["catalog:manage"]) });
  expect((await getInventoryMovementsAction(id)).success).toBe(false);
  mocks.auth.mockResolvedValue({ status: "READY", permissions: new Set(["inventory:manage"]) });
  expect((await getInventoryMovementsAction("no-es-uuid")).success).toBe(false);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("limita el historial al almacén configurado y a la variante elegida", async () => {
  mocks.auth.mockResolvedValue({ status: "READY", permissions: new Set(["inventory:manage"]) });
  mocks.execute.mockResolvedValue([{ id: "m", created_at: new Date("2026-10-26T12:00:00Z") }]);
  const result = await getInventoryMovementsAction(id);
  expect(result).toMatchObject({
    success: true,
    data: [{ created_at: "2026-10-26T12:00:00.000Z" }],
  });
  const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0]);
  expect(query.params).toEqual(["PRINCIPAL", id]);
  expect(query.sql).toContain("LIMIT 30");
  expect(query.sql).toContain("ORDER BY e.created_at DESC, e.id DESC");
});

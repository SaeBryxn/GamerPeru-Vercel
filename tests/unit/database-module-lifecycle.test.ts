import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  end: vi.fn(async () => undefined),
  create: vi.fn(() => ({ end: vi.fn(async () => undefined) })),
}));
vi.mock("postgres", () => ({ default: mocks.create }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: (client: unknown) => ({ client }) }));
vi.mock("@/db/schema", () => ({}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});
describe("ciclo del pool entre bundles de desarrollo", () => {
  it("cargar otra ruta no cierra conexiones que pueden tener peticiones activas", async () => {
    vi.stubGlobal("conn", { end: mocks.end });
    vi.stubGlobal("connOwner", Symbol("other-route"));
    vi.resetModules();
    await import("@/db");
    vi.resetModules();
    await import("@/db");
    expect(mocks.end).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
});

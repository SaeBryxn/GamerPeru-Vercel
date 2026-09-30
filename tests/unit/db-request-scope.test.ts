import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const context: { ctx: object; env: Record<string, unknown> } = { ctx: {}, env: {} };
  return { context, postgres: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => mocks.context,
}));
vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({
  // Each drizzle instance remembers its client and exposes a method that relies on `this`.
  drizzle: (client: { url: string }) => ({
    client,
    whoAmI(this: { client: { url: string } }) {
      return this.client.url;
    },
  }),
}));

describe("database client on Cloudflare Workers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    vi.stubEnv("DATABASE_URL", "postgres://pooler.example:6543/postgres");
    mocks.postgres.mockReset();
    mocks.postgres.mockImplementation((url: string) => ({ url }));
    mocks.context = { ctx: {}, env: {} };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("opens one client per request and reuses it within the request", async () => {
    const { db } = await import("@/db");
    const database = db as unknown as { whoAmI(): string };

    database.whoAmI();
    database.whoAmI();
    expect(mocks.postgres).toHaveBeenCalledTimes(1);

    mocks.context = { ctx: {}, env: {} };
    database.whoAmI();
    expect(mocks.postgres).toHaveBeenCalledTimes(2);
  });

  it("binds methods to the request's real client", async () => {
    const { db } = await import("@/db");
    const { whoAmI } = db as unknown as { whoAmI(): string };

    expect(whoAmI()).toBe("postgres://pooler.example:6543/postgres");
  });

  it("prefers a Hyperdrive binding over DATABASE_URL", async () => {
    mocks.context = {
      ctx: {},
      env: { HYPERDRIVE: { connectionString: "postgres://hyperdrive.local:5432/postgres" } },
    };
    const { db } = await import("@/db");

    expect((db as unknown as { whoAmI(): string }).whoAmI()).toBe(
      "postgres://hyperdrive.local:5432/postgres"
    );
  });

  it("never pipelines queries on Workers either", async () => {
    const { db } = await import("@/db");
    (db as unknown as { whoAmI(): string }).whoAmI();

    expect(mocks.postgres).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ max_pipeline: 0, prepare: false })
    );
  });
});

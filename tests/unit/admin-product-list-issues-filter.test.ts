import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminProductList } from "@/lib/admin/catalog/readers";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

const executed = vi.hoisted(() => ({ queries: [] as unknown[] }));

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(async (query: unknown) => {
      executed.queries.push(query);
      return executed.queries.length === 1 ? [{ total: 0 }] : [];
    }),
  },
}));

const ADMIN: VerifiedAuthContextReady = {
  status: "READY",
  authUserId: "admin-1",
  email: null,
  roles: [],
  permissions: new Set(["catalog:manage"]),
};

const dialect = new PgDialect();
const render = (query: unknown) => dialect.sqlToQuery(query as SQL);

describe("Admin product list: restricting to products with pending items", () => {
  beforeEach(() => {
    executed.queries = [];
  });

  it("filters count and page to the given product ids", async () => {
    await getAdminProductList(
      {
        productIds: [
          "018f0000-0000-7000-8000-000000000001",
          "018f0000-0000-7000-8000-000000000002",
        ],
      },
      { authContext: ADMIN }
    );
    for (const query of executed.queries.map(render)) {
      expect(query.sql).toMatch(/p\.id IN \(\$\d+::uuid, \$\d+::uuid\)/);
      expect(query.params).toEqual(
        expect.arrayContaining([
          "018f0000-0000-7000-8000-000000000001",
          "018f0000-0000-7000-8000-000000000002",
        ])
      );
    }
  });

  it("returns nothing when no product has pending items", async () => {
    await getAdminProductList({ productIds: [] }, { authContext: ADMIN });
    expect(render(executed.queries[0]).sql).toContain("FALSE");
  });

  it("does not restrict the list when no ids are given", async () => {
    await getAdminProductList({}, { authContext: ADMIN });
    expect(render(executed.queries[0]).sql).not.toMatch(/p\.id IN/);
  });
});

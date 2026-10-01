import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentWishlistProducts } from "@/lib/wishlist/products";
import * as customerModule from "@/lib/wishlist/customer";
import * as queriesModule from "@/lib/catalog/postgres-queries";
import * as dbModule from "@/db";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/wishlist/customer", () => ({ resolveCurrentCustomerId: vi.fn() }));
vi.mock("@/lib/catalog/postgres-queries", () => ({ buildPublishedProductsByIdsQuery: vi.fn() }));
vi.mock("@/lib/catalog/postgres-reader", () => ({
  toDiscoveryItem: (row: { id: string }) => ({ id: row.id }),
}));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

function savedRows(productIds: string[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(productIds.map((productId) => ({ productId }))),
  };
  vi.mocked(dbModule.db.select).mockReturnValueOnce(chain as never);
}

describe("getCurrentWishlistProducts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends anonymous visitors to sign in", async () => {
    vi.mocked(customerModule.resolveCurrentCustomerId).mockResolvedValue(null);
    await expect(getCurrentWishlistProducts()).resolves.toEqual({ status: "UNAUTHENTICATED" });
  });

  it("returns nothing without querying the catalog when the wishlist is empty", async () => {
    vi.mocked(customerModule.resolveCurrentCustomerId).mockResolvedValue("customer");
    savedRows([]);

    await expect(getCurrentWishlistProducts()).resolves.toEqual({ status: "OK", products: [] });
    expect(queriesModule.buildPublishedProductsByIdsQuery).not.toHaveBeenCalled();
  });

  it("keeps the saved order and drops products that are no longer published", async () => {
    vi.mocked(customerModule.resolveCurrentCustomerId).mockResolvedValue("customer");
    savedRows(["newest", "archived", "oldest"]);
    vi.mocked(queriesModule.buildPublishedProductsByIdsQuery).mockResolvedValue([
      { id: "oldest" },
      { id: "newest" },
    ] as never);

    await expect(getCurrentWishlistProducts()).resolves.toEqual({
      status: "OK",
      products: [{ id: "newest" }, { id: "oldest" }],
    });
  });

  it("reports a read failure without throwing", async () => {
    vi.mocked(customerModule.resolveCurrentCustomerId).mockRejectedValue(new Error("down"));
    await expect(getCurrentWishlistProducts()).resolves.toEqual({ status: "ERROR" });
  });
});

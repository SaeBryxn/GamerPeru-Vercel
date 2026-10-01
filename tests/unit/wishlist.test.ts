import { getTableConfig } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wishlistItems } from "@/db/schema";
import { getWishlistAction, setWishlistItemAction } from "@/lib/wishlist/actions";
import * as claimsModule from "@/lib/auth/claims";
import * as dbModule from "@/db";

vi.mock("@/lib/auth/claims", () => ({ getVerifiedIdentity: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/db", () => ({ db: { select: vi.fn(), insert: vi.fn(), delete: vi.fn() } }));

const PRODUCT_ID = "0190f4c2-7a1b-7c3d-8e4f-5a6b7c8d9e0f";
const CUSTOMER_ID = "0190f4c2-7a1b-7c3d-8e4f-000000000001";

const db = dbModule.db as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

/** Each select() call resolves to the next queued row set, whatever the chain looks like. */
function queueSelects(...results: unknown[][]) {
  for (const rows of results) {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where", "orderBy"]) chain[method] = () => chain;
    chain.limit = () => Promise.resolve(rows);
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    db.select.mockReturnValueOnce(chain);
  }
}

function signedIn() {
  vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValue({
    success: true,
    identity: { authUserId: "auth-user", email: "a@b.pe", claims: {} },
  });
}

describe("wishlist_items schema", () => {
  it("keeps one row per customer and product", () => {
    const config = getTableConfig(wishlistItems);
    expect(config.name).toBe("wishlist_items");
    const unique = config.uniqueConstraints.find(
      (constraint) => constraint.name === "wishlist_items_customer_product_unique"
    );
    expect(unique?.columns.map((column) => column.name)).toEqual(["customer_id", "product_id"]);
    expect(config.foreignKeys.map((fk) => fk.onDelete)).toEqual(["cascade", "cascade"]);
  });
});

describe("wishlist actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
  });

  it("reports anonymous visitors without touching the wishlist", async () => {
    vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValue({
      success: false,
      reason: "no_session",
    });

    await expect(getWishlistAction()).resolves.toEqual({ authenticated: false });
    await expect(setWishlistItemAction({ productId: PRODUCT_ID, saved: true })).resolves.toEqual({
      ok: false,
      reason: "UNAUTHENTICATED",
    });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects malformed input before any lookup", async () => {
    await expect(setWishlistItemAction({ productId: "nope", saved: true })).resolves.toEqual({
      ok: false,
      reason: "INVALID",
    });
    await expect(setWishlistItemAction({ productId: PRODUCT_ID })).resolves.toEqual({
      ok: false,
      reason: "INVALID",
    });
    expect(claimsModule.getVerifiedIdentity).not.toHaveBeenCalled();
  });

  it("lists the saved product ids of the signed-in customer", async () => {
    signedIn();
    queueSelects([{ id: CUSTOMER_ID }], [{ productId: PRODUCT_ID }]);

    await expect(getWishlistAction()).resolves.toEqual({
      authenticated: true,
      productIds: [PRODUCT_ID],
    });
  });

  it("saves a published product idempotently", async () => {
    signedIn();
    queueSelects([{ id: CUSTOMER_ID }], [{ id: PRODUCT_ID }]);
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoNothing }));
    db.insert.mockReturnValue({ values });

    await expect(setWishlistItemAction({ productId: PRODUCT_ID, saved: true })).resolves.toEqual({
      ok: true,
      saved: true,
    });
    expect(values).toHaveBeenCalledWith({ customerId: CUSTOMER_ID, productId: PRODUCT_ID });
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it("refuses to save a product that is not published", async () => {
    signedIn();
    queueSelects([{ id: CUSTOMER_ID }], []);

    await expect(setWishlistItemAction({ productId: PRODUCT_ID, saved: true })).resolves.toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("removes a product without checking its status", async () => {
    signedIn();
    queueSelects([{ id: CUSTOMER_ID }]);
    const where = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where });

    await expect(setWishlistItemAction({ productId: PRODUCT_ID, saved: false })).resolves.toEqual({
      ok: true,
      saved: false,
    });
    expect(where).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANONYMOUS_CART_COOKIE_NAME_DEV,
  ANONYMOUS_CART_COOKIE_NAME_PROD,
  ANONYMOUS_TOKEN_REGEX,
  CART_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/cart/constants";
import {
  clearAnonymousCartCookie,
  generateAnonymousSessionToken,
  getAnonymousTokenFromCookie,
  getCartCookieName,
  resolveCartAuthority,
  setAnonymousCartCookie,
} from "@/lib/cart/session";
import {
  buildCartSnapshot,
  createEmptyCartSnapshot,
  getCurrentCart,
  addCartItemAction,
  updateCartItemQuantityAction,
  removeCartItemAction,
} from "@/lib/cart/service";
import * as actionsModule from "@/lib/cart/actions";
import * as readModule from "@/lib/cart/read";
import {
  validateAddQuantity,
  validateSessionToken,
  validateUpdateQuantity,
  validateVariantId,
} from "@/lib/cart/validation";
import * as claimsModule from "@/lib/auth/claims";
import * as dbModule from "@/db";

// Mock next/headers
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("GP-017 CART4-R1 — Server-Side Cart Runtime Unit Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("1. Anonymous Token & Cookie Contract", () => {
    it("generates a 256-bit entropy base64url token of exactly 43 characters", () => {
      const token = generateAnonymousSessionToken();
      expect(typeof token).toBe("string");
      expect(token).toHaveLength(43);
      expect(ANONYMOUS_TOKEN_REGEX.test(token)).toBe(true);
      expect(validateSessionToken(token)).toBe(true);
    });

    it("generates distinct tokens on consecutive invocations", () => {
      const token1 = generateAnonymousSessionToken();
      const token2 = generateAnonymousSessionToken();
      expect(token1).not.toBe(token2);
    });

    it("validates valid and invalid session tokens", () => {
      expect(validateSessionToken("A".repeat(43))).toBe(true);
      expect(validateSessionToken("a_b-C12345678901234567890123456789012345678")).toBe(true);
      expect(validateSessionToken("")).toBe(false);
      expect(validateSessionToken("short")).toBe(false);
      expect(validateSessionToken("A".repeat(42))).toBe(false);
      expect(validateSessionToken("A".repeat(44))).toBe(false);
      expect(validateSessionToken("A".repeat(42) + "!")).toBe(false);
      expect(validateSessionToken(null)).toBe(false);
      expect(validateSessionToken(undefined)).toBe(false);
      expect(validateSessionToken(12345)).toBe(false);
    });

    it("resolves development and production cookie names based on NODE_ENV", () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(getCartCookieName()).toBe(ANONYMOUS_CART_COOKIE_NAME_DEV);

      vi.stubEnv("NODE_ENV", "production");
      expect(getCartCookieName()).toBe(ANONYMOUS_CART_COOKIE_NAME_PROD);
    });

    it("sets cookie with required security flags and maxAge", async () => {
      vi.stubEnv("NODE_ENV", "development");

      const token = "A".repeat(43);
      await setAnonymousCartCookie(token);

      expect(mockCookieStore.set).toHaveBeenCalledWith(
        ANONYMOUS_CART_COOKIE_NAME_DEV,
        token,
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/",
          maxAge: CART_COOKIE_MAX_AGE_SECONDS,
        })
      );

      vi.stubEnv("NODE_ENV", "production");
      await setAnonymousCartCookie(token);

      expect(mockCookieStore.set).toHaveBeenCalledWith(
        ANONYMOUS_CART_COOKIE_NAME_PROD,
        token,
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: CART_COOKIE_MAX_AGE_SECONDS,
        })
      );
    });

    it("deletes cookie upon clear", async () => {
      await clearAnonymousCartCookie();
      expect(mockCookieStore.delete).toHaveBeenCalledWith(getCartCookieName());
    });

    it("extracts token correctly and flags malformed cookies", async () => {
      mockCookieStore.get.mockReturnValueOnce(undefined);
      const noCookie = await getAnonymousTokenFromCookie();
      expect(noCookie).toEqual({ token: null, isMalformed: false });

      mockCookieStore.get.mockReturnValueOnce({ value: "A".repeat(43) });
      const validCookie = await getAnonymousTokenFromCookie();
      expect(validCookie).toEqual({ token: "A".repeat(43), isMalformed: false });

      mockCookieStore.get.mockReturnValueOnce({ value: "malformed_token!" });
      const malformedCookie = await getAnonymousTokenFromCookie();
      expect(malformedCookie).toEqual({ token: null, isMalformed: true });
    });
  });

  describe("2. Module Architecture & Surface Isolation", () => {
    it("exports ONLY the three authorized mutations from actions.ts", () => {
      expect(Object.keys(actionsModule).sort()).toEqual([
        "addCartItemAction",
        "removeCartItemAction",
        "updateCartItemQuantityAction",
      ]);
      expect("getCurrentCart" in actionsModule).toBe(false);
    });

    it("exports getCurrentCart from server-only read.ts", () => {
      expect(typeof readModule.getCurrentCart).toBe("function");
    });
  });

  describe("3. Validation Rules", () => {
    it("validates RFC 9562 UUID for variantId", () => {
      const validUuid = "019156a2-9b2f-7c1a-8e2b-4e1b2c3d4e5f";
      const validV4 = "123e4567-e89b-12d3-a456-426614174000";

      expect(validateVariantId(validUuid)).toEqual({ success: true, data: validUuid });
      expect(validateVariantId(validV4)).toEqual({ success: true, data: validV4 });

      expect(validateVariantId("not-a-uuid").success).toBe(false);
      expect(validateVariantId("").success).toBe(false);
      expect(validateVariantId(null).success).toBe(false);
      expect(validateVariantId(123).success).toBe(false);
    });

    it("validates add quantity (1..10, defaults to 1)", () => {
      expect(validateAddQuantity(undefined)).toEqual({ success: true, data: 1 });
      expect(validateAddQuantity(null)).toEqual({ success: true, data: 1 });
      expect(validateAddQuantity("")).toEqual({ success: true, data: 1 });
      expect(validateAddQuantity(1)).toEqual({ success: true, data: 1 });
      expect(validateAddQuantity(5)).toEqual({ success: true, data: 5 });
      expect(validateAddQuantity(10)).toEqual({ success: true, data: 10 });
      expect(validateAddQuantity("3")).toEqual({ success: true, data: 3 });

      // Rejections
      expect(validateAddQuantity(0).success).toBe(false);
      expect(validateAddQuantity(-1).success).toBe(false);
      expect(validateAddQuantity(11).success).toBe(false);
      expect(validateAddQuantity(2.5).success).toBe(false);
      expect(validateAddQuantity("abc").success).toBe(false);
    });

    it("validates update quantity (strict integer 1..10, rejects 0)", () => {
      expect(validateUpdateQuantity(1)).toEqual({ success: true, data: 1 });
      expect(validateUpdateQuantity(10)).toEqual({ success: true, data: 10 });
      expect(validateUpdateQuantity("7")).toEqual({ success: true, data: 7 });

      // Quantity 0 is NOT removal; must be rejected
      expect(validateUpdateQuantity(0).success).toBe(false);
      expect(validateUpdateQuantity(-5).success).toBe(false);
      expect(validateUpdateQuantity(15).success).toBe(false);
      expect(validateUpdateQuantity(3.14).success).toBe(false);
      expect(validateUpdateQuantity(undefined).success).toBe(false);
      expect(validateUpdateQuantity(null).success).toBe(false);
      expect(validateUpdateQuantity("").success).toBe(false);
    });
  });

  describe("4. Identity Authority Resolution", () => {
    it("resolves UNAUTHENTICATED when getVerifiedIdentity returns false", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValueOnce({ value: "A".repeat(43) });

      const authority = await resolveCartAuthority();
      expect(authority).toEqual({
        status: "UNAUTHENTICATED",
        guestToken: "A".repeat(43),
        isMalformedGuest: false,
      });
    });

    it("resolves AUTHENTICATED_PROFILE_REQUIRED when JWT exists but customer profile does not", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-user-uuid-1",
          email: "test@gamerperu.com",
          claims: { sub: "auth-user-uuid-1" },
        },
      });

      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValueOnce([]), // No profile found
          }),
        }),
      });
      vi.mocked(dbModule.db.select).mockImplementation(selectMock);

      const authority = await resolveCartAuthority();
      expect(authority).toEqual({
        status: "AUTHENTICATED_PROFILE_REQUIRED",
        authUserId: "auth-user-uuid-1",
      });
    });

    it("resolves AUTHENTICATED_WITH_PROFILE when JWT and profile both exist", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-user-uuid-1",
          email: "test@gamerperu.com",
          claims: { sub: "auth-user-uuid-1" },
        },
      });

      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValueOnce([{ id: "customer-profile-uuid-1" }]),
          }),
        }),
      });
      vi.mocked(dbModule.db.select).mockImplementation(selectMock);
      mockCookieStore.get.mockReturnValueOnce({ value: "B".repeat(43) });

      const authority = await resolveCartAuthority();
      expect(authority).toEqual({
        status: "AUTHENTICATED_WITH_PROFILE",
        customerProfileId: "customer-profile-uuid-1",
        authUserId: "auth-user-uuid-1",
        guestToken: "B".repeat(43),
        isMalformedGuest: false,
      });
    });
  });

  describe("5. DTO Privacy & Snapshot Calculation", () => {
    it("calculates integer minor unit totals and guarantees DTO privacy", () => {
      const hydrationLines = [
        {
          variantId: "variant-1",
          sku: "WLM-BX-BLK",
          priceCents: 59900,
          variantStatus: "ACTIVE",
          attributes: { Color: "Black" },
          productId: "prod-1",
          productSlug: "wlmouse-beast-x",
          productName: "WLMouse Beast X",
          productStatus: "PUBLISHED",
          quantity: 2,
          mediaObjectKey: "catalog/beast-x.png",
          mediaAltText: "Beast X Black",
          mediaWidth: 800,
          mediaHeight: 600,
        },
        {
          variantId: "variant-2",
          sku: "WLM-BX-WHT",
          priceCents: 62900,
          variantStatus: "ACTIVE",
          attributes: { Color: "White" },
          productId: "prod-1",
          productSlug: "wlmouse-beast-x",
          productName: "WLMouse Beast X",
          productStatus: "PUBLISHED",
          quantity: 1,
          mediaObjectKey: null,
          mediaAltText: null,
          mediaWidth: null,
          mediaHeight: null,
        },
      ];

      const snapshot = buildCartSnapshot(hydrationLines);

      expect(snapshot.currency).toBe("PEN");
      expect(snapshot.lineCount).toBe(2);
      expect(snapshot.itemCount).toBe(3);
      expect(snapshot.subtotalCents).toBe(59900 * 2 + 62900 * 1);
      expect(snapshot.hasUnavailableItems).toBe(false);
      expect(snapshot.lines).toHaveLength(2);

      // Line 1 assertions
      expect(snapshot.lines[0]).toEqual({
        variantId: "variant-1",
        sku: "WLM-BX-BLK",
        productSlug: "wlmouse-beast-x",
        productName: "WLMouse Beast X",
        selectedAttributes: { Color: "Black" },
        unitPriceCents: 59900,
        quantity: 2,
        lineSubtotalCents: 119800,
        available: true,
        primaryMedia: expect.objectContaining({
          altText: "Beast X Black",
          width: 800,
          height: 600,
        }),
      });

      // Assert complete absence of private identifiers
      const snapshotJson = JSON.stringify(snapshot);
      expect(snapshotJson).not.toContain("cartId");
      expect(snapshotJson).not.toContain("cartItemId");
      expect(snapshotJson).not.toContain("customerId");
      expect(snapshotJson).not.toContain("authUserId");
      expect(snapshotJson).not.toContain("sessionToken");
      expect(snapshotJson).not.toContain("expiresAt");
    });

    it("marks unavailable items correctly when product is DRAFT or variant is INACTIVE", () => {
      const hydrationLines = [
        {
          variantId: "variant-1",
          sku: "WLM-BX-BLK",
          priceCents: 59900,
          variantStatus: "ACTIVE",
          attributes: {},
          productId: "prod-1",
          productSlug: "wlmouse-beast-x",
          productName: "WLMouse Beast X",
          productStatus: "DRAFT",
          quantity: 1,
          mediaObjectKey: null,
          mediaAltText: null,
          mediaWidth: null,
          mediaHeight: null,
        },
      ];

      const snapshot = buildCartSnapshot(hydrationLines);
      expect(snapshot.hasUnavailableItems).toBe(true);
      expect(snapshot.lines[0]?.available).toBe(false);
    });

    it("creates an empty snapshot with zero lines and clean zeroed state", () => {
      const empty = createEmptyCartSnapshot();
      expect(empty).toEqual({
        currency: "PEN",
        lineCount: 0,
        itemCount: 0,
        subtotalCents: 0,
        hasUnavailableItems: false,
        lines: [],
      });
    });
  });

  describe("6. Passive Read & Typed Read Results", () => {
    it("returns typed PROFILE_REQUIRED when profile is missing", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-user-no-profile",
          email: "user@test.com",
          claims: { sub: "auth-user-no-profile" },
        },
      });

      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(dbModule.db.select).mockImplementation(selectMock);

      const result = await getCurrentCart();
      expect(result).toEqual({
        success: false,
        code: "PROFILE_REQUIRED",
        error: "Debes completar tu perfil para usar el carrito de compras.",
      });
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });

    it("returns success true + empty snapshot and performs 0 mutations for unauthenticated visitor without cookie", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValueOnce(undefined);

      const result = await getCurrentCart();

      expect(result).toEqual({
        success: true,
        cart: createEmptyCartSnapshot(),
      });
      expect(dbModule.db.insert).not.toHaveBeenCalled();
      expect(dbModule.db.update).not.toHaveBeenCalled();
      expect(dbModule.db.delete).not.toHaveBeenCalled();
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });
  });

  describe("7. Cart Actions Fail Closed on PROFILE_REQUIRED", () => {
    const validUuid = "019156a2-9b2f-7c1a-8e2b-4e1b2c3d4e5f";

    beforeEach(() => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValue({
        success: true,
        identity: {
          authUserId: "auth-user-no-profile",
          email: "user@test.com",
          claims: { sub: "auth-user-no-profile" },
        },
      });

      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(dbModule.db.select).mockImplementation(selectMock);
    });

    it("fails closed on addCartItemAction with PROFILE_REQUIRED", async () => {
      const result = await addCartItemAction(null, { variantId: validUuid, quantity: 1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("PROFILE_REQUIRED");
      }
    });

    it("fails closed on updateCartItemQuantityAction with PROFILE_REQUIRED", async () => {
      const result = await updateCartItemQuantityAction(null, {
        variantId: validUuid,
        quantity: 2,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("PROFILE_REQUIRED");
      }
    });

    it("fails closed on removeCartItemAction with PROFILE_REQUIRED", async () => {
      const result = await removeCartItemAction(null, { variantId: validUuid });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("PROFILE_REQUIRED");
      }
    });
  });

  describe("8. Product & Variant Eligibility Enforcement", () => {
    const validUuid = "019156a2-9b2f-7c1a-8e2b-4e1b2c3d4e5f";

    beforeEach(() => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValue({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValue({ value: "A".repeat(43) });
    });

    it("returns ITEM_NOT_FOUND when variant does not exist in catalog", async () => {
      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
      vi.mocked(dbModule.db.select).mockImplementation(selectMock);

      const result = await addCartItemAction(null, { variantId: validUuid, quantity: 1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("ITEM_NOT_FOUND");
      }
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });

    it("rejects addCartItemAction when variant is INACTIVE", async () => {
      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  variantId: validUuid,
                  variantStatus: "INACTIVE",
                  productStatus: "PUBLISHED",
                },
              ]),
            }),
          }),
        }),
      });
      vi.mocked(dbModule.db.select).mockImplementation(selectMock);

      const result = await addCartItemAction(null, { variantId: validUuid, quantity: 1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("PRODUCT_UNAVAILABLE");
      }
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });
  });

  describe("8b. Input Validation & Error Handling", () => {
    it("rejects invalid variantId format on add", async () => {
      const result = await addCartItemAction(null, { variantId: "not-a-uuid", quantity: 1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_INPUT");
      }
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });

    it("rejects quantity > 10 on add", async () => {
      const validUuid = "019156a2-9b2f-7c1a-8e2b-4e1b2c3d4e5f";
      const result = await addCartItemAction(null, { variantId: validUuid, quantity: 11 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_INPUT");
      }
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });

    it("rejects quantity 0 on update", async () => {
      const validUuid = "019156a2-9b2f-7c1a-8e2b-4e1b2c3d4e5f";
      const result = await updateCartItemQuantityAction(null, {
        variantId: validUuid,
        quantity: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_INPUT");
      }
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });
  });

  describe("9. Cookie Sliding & Failed Mutation Guarantees", () => {
    const validUuid = "019156a2-9b2f-7c1a-8e2b-4e1b2c3d4e5f";

    it("A. successful existing anonymous ADD calls setAnonymousCartCookie after DB transaction with 30-day maxAge", async () => {
      const existingToken = "A".repeat(43);
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValue({ value: existingToken });

      // Catalog query mock
      vi.mocked(dbModule.db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  variantId: validUuid,
                  variantStatus: "ACTIVE",
                  productStatus: "PUBLISHED",
                },
              ]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof dbModule.db.select>);

      // Transaction mock
      vi.mocked(dbModule.db.transaction).mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValueOnce([
                    {
                      id: "cart-1",
                      sessionToken: existingToken,
                      expiresAt: new Date(Date.now() + 100000),
                    },
                  ]),
                }),
              }),
              innerJoin: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  leftJoin: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                      orderBy: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockResolvedValue({}),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue({}),
            }),
          }),
          execute: vi.fn().mockResolvedValue([]),
        };
        return callback(
          txMock as unknown as Parameters<Parameters<typeof dbModule.db.transaction>[0]>[0]
        );
      });

      const result = await addCartItemAction(null, { variantId: validUuid, quantity: 1 });
      expect(result.success).toBe(true);

      // Verify cookie was set with 30-day maxAge
      expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.any(String),
        existingToken,
        expect.objectContaining({
          maxAge: CART_COOKIE_MAX_AGE_SECONDS,
          httpOnly: true,
          sameSite: "lax",
        })
      );
    });

    it("B. successful existing anonymous UPDATE calls setAnonymousCartCookie after DB transaction", async () => {
      const existingToken = "B".repeat(43);
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValue({ value: existingToken });

      vi.mocked(dbModule.db.transaction).mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValueOnce([
                    {
                      id: "cart-1",
                      sessionToken: existingToken,
                      expiresAt: new Date(Date.now() + 100000),
                    },
                  ]),
                }),
              }),
              innerJoin: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockReturnValue({
                    for: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValueOnce([
                        {
                          id: "item-1",
                          variantStatus: "ACTIVE",
                          productStatus: "PUBLISHED",
                        },
                      ]),
                    }),
                  }),
                  leftJoin: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                      orderBy: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: "item-1" }]),
              }),
            }),
          }),
          execute: vi.fn().mockResolvedValue([]),
        };
        return callback(
          txMock as unknown as Parameters<Parameters<typeof dbModule.db.transaction>[0]>[0]
        );
      });

      const result = await updateCartItemQuantityAction(null, {
        variantId: validUuid,
        quantity: 3,
      });
      expect(result.success).toBe(true);
      expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.any(String),
        existingToken,
        expect.objectContaining({ maxAge: CART_COOKIE_MAX_AGE_SECONDS })
      );
    });

    it("C. successful existing anonymous REMOVE calls setAnonymousCartCookie after DB transaction", async () => {
      const existingToken = "C".repeat(43);
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValue({ value: existingToken });

      vi.mocked(dbModule.db.transaction).mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValueOnce([
                    {
                      id: "cart-1",
                      sessionToken: existingToken,
                      expiresAt: new Date(Date.now() + 100000),
                    },
                  ]),
                }),
              }),
              innerJoin: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  leftJoin: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                      orderBy: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "item-1" }]), // Deleted!
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue({}),
            }),
          }),
          execute: vi.fn().mockResolvedValue([]),
        };
        return callback(
          txMock as unknown as Parameters<Parameters<typeof dbModule.db.transaction>[0]>[0]
        );
      });

      const result = await removeCartItemAction(null, { variantId: validUuid });
      expect(result.success).toBe(true);
      expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.any(String),
        existingToken,
        expect.objectContaining({ maxAge: CART_COOKIE_MAX_AGE_SECONDS })
      );
    });

    it("D. failed DB transaction does NOT set or slide cookie", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValue({ value: "D".repeat(43) });

      vi.mocked(dbModule.db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  variantId: validUuid,
                  variantStatus: "ACTIVE",
                  productStatus: "PUBLISHED",
                },
              ]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof dbModule.db.select>);

      vi.mocked(dbModule.db.transaction).mockRejectedValueOnce(new Error("DB_CONN_TIMEOUT"));

      const result = await addCartItemAction(null, { variantId: validUuid, quantity: 1 });
      expect(result.success).toBe(false);
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });

    it("E. expired update and remove do NOT set or slide cookie", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValue({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValue({ value: "E".repeat(43) });

      // Mock expired cart
      vi.mocked(dbModule.db.transaction).mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValueOnce([
                    {
                      id: "cart-1",
                      sessionToken: "E".repeat(43),
                      expiresAt: new Date(Date.now() - 100000), // Expired!
                    },
                  ]),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue({}),
            }),
          }),
          execute: vi.fn().mockResolvedValue([]),
        };
        return callback(
          txMock as unknown as Parameters<Parameters<typeof dbModule.db.transaction>[0]>[0]
        );
      });

      const updRes = await updateCartItemQuantityAction(null, {
        variantId: validUuid,
        quantity: 2,
      });
      expect(updRes.success).toBe(false);
      expect(mockCookieStore.set).not.toHaveBeenCalled();

      const remRes = await removeCartItemAction(null, { variantId: validUuid });
      expect(remRes.success).toBe(false);
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });

    it("F. commit-timing proof: DB transaction resolves/commits before cookie write occurs", async () => {
      const existingToken = "T".repeat(43);
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValue({ value: existingToken });

      const executionOrder: string[] = [];

      vi.mocked(dbModule.db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  variantId: validUuid,
                  variantStatus: "ACTIVE",
                  productStatus: "PUBLISHED",
                },
              ]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof dbModule.db.select>);

      vi.mocked(dbModule.db.transaction).mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValueOnce([
                    {
                      id: "cart-1",
                      sessionToken: existingToken,
                      expiresAt: new Date(Date.now() + 100000),
                    },
                  ]),
                }),
              }),
              innerJoin: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  leftJoin: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                      orderBy: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockResolvedValue({}),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue({}),
            }),
          }),
          execute: vi.fn().mockImplementation(async () => {
            executionOrder.push("ADVISORY_LOCK_ACQUIRED");
            return [];
          }),
        };
        const result = await callback(
          txMock as unknown as Parameters<Parameters<typeof dbModule.db.transaction>[0]>[0]
        );
        executionOrder.push("DB_TRANSACTION_COMMITTED");
        return result;
      });

      mockCookieStore.set.mockImplementation(() => {
        executionOrder.push("COOKIE_WRITTEN");
      });

      await addCartItemAction(null, { variantId: validUuid, quantity: 1 });

      expect(executionOrder).toEqual([
        "ADVISORY_LOCK_ACQUIRED",
        "DB_TRANSACTION_COMMITTED",
        "COOKIE_WRITTEN",
      ]);
    });

    it("G. does NOT set/slide cookie on validation failure", async () => {
      const result = await addCartItemAction(null, { variantId: "invalid-uuid", quantity: 1 });
      expect(result.success).toBe(false);
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });

    it("H. does NOT set/slide cookie on remove when line does not exist in cart", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValueOnce({ value: "A".repeat(43) });

      vi.mocked(dbModule.db.transaction).mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValueOnce([
                    {
                      id: "cart-1",
                      sessionToken: "A".repeat(43),
                      expiresAt: new Date(Date.now() + 100000),
                    },
                  ]),
                }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValueOnce([]), // Zero deleted rows!
            }),
          }),
          update: vi.fn(),
          execute: vi.fn().mockResolvedValue([]),
        };
        return callback(
          txMock as unknown as Parameters<Parameters<typeof dbModule.db.transaction>[0]>[0]
        );
      });

      const result = await removeCartItemAction(null, { variantId: validUuid });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("ITEM_NOT_FOUND");
      }
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });
  });

  describe("10. First Authenticated Access Guest Handling Invariants", () => {
    it("preserves guest cookie if merge transaction throws an error", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-user-1",
          email: "user@test.com",
          claims: { sub: "auth-user-1" },
        },
      });

      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([{ id: "customer-profile-uuid-1" }])
              .mockResolvedValueOnce([]),
          }),
        }),
      });
      vi.mocked(dbModule.db.select).mockImplementation(selectMock);
      mockCookieStore.get.mockReturnValueOnce({ value: "G".repeat(43) });

      vi.mocked(dbModule.db.transaction).mockRejectedValueOnce(new Error("DB_LOCK_TIMEOUT"));

      const result = await getCurrentCart();
      expect(result.success).toBe(true);
      expect(mockCookieStore.delete).not.toHaveBeenCalled();
    });
  });
});

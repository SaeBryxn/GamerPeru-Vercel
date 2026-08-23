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

describe("GP-017 CART4 — Server-Side Cart Runtime Unit Suite", () => {
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

  describe("2. Validation Rules", () => {
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

  describe("3. Identity Authority Resolution", () => {
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

  describe("4. DTO Privacy & Snapshot Calculation", () => {
    it("calculates integer minor unit totals and guarantees DTO privacy", () => {
      const hydrationLines = [
        {
          variantId: "variant-1",
          sku: "WLM-BX-BLK",
          priceCents: 59900, // S/ 599.00
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
          priceCents: 62900, // S/ 629.00
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
      expect(snapshot.itemCount).toBe(3); // 2 + 1
      expect(snapshot.subtotalCents).toBe(59900 * 2 + 62900 * 1); // 119800 + 62900 = 182700
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
          productStatus: "DRAFT", // Product is DRAFT!
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

  describe("5. Passive Read Zero-State Invariant", () => {
    it("returns empty snapshot and performs 0 mutations for unauthenticated user without cookie", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValueOnce(undefined);

      const cart = await getCurrentCart();

      expect(cart).toEqual(createEmptyCartSnapshot());
      expect(dbModule.db.insert).not.toHaveBeenCalled();
      expect(dbModule.db.update).not.toHaveBeenCalled();
      expect(dbModule.db.delete).not.toHaveBeenCalled();
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });

    it("returns empty snapshot and performs 0 mutations for malformed cookie", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      mockCookieStore.get.mockReturnValueOnce({ value: "invalid-token-format!" });

      const cart = await getCurrentCart();

      expect(cart).toEqual(createEmptyCartSnapshot());
      expect(dbModule.db.insert).not.toHaveBeenCalled();
      expect(dbModule.db.update).not.toHaveBeenCalled();
      expect(dbModule.db.delete).not.toHaveBeenCalled();
      expect(mockCookieStore.set).not.toHaveBeenCalled();
    });
  });

  describe("6. Cart Actions Fail Closed on PROFILE_REQUIRED", () => {
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
            limit: vi.fn().mockResolvedValue([]), // No profile
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

  describe("7. Input Validation & Error Handling", () => {
    it("rejects invalid variantId format on add", async () => {
      const result = await addCartItemAction(null, { variantId: "not-a-uuid", quantity: 1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_INPUT");
      }
    });

    it("rejects quantity > 10 on add", async () => {
      const validUuid = "019156a2-9b2f-7c1a-8e2b-4e1b2c3d4e5f";
      const result = await addCartItemAction(null, { variantId: validUuid, quantity: 11 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_INPUT");
      }
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
              limit: vi.fn().mockResolvedValue([]), // Empty query
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
    });

    it("rejects addCartItemAction when product is DRAFT", async () => {
      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  variantId: validUuid,
                  variantStatus: "ACTIVE",
                  productStatus: "DRAFT",
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
    });
  });

  describe("9. Session-Fixation & Lazy Merge Cookie Contracts", () => {
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
              .mockResolvedValueOnce([]), // Empty for authCart
          }),
        }),
      });
      vi.mocked(dbModule.db.select).mockImplementation(selectMock);
      mockCookieStore.get.mockReturnValueOnce({ value: "G".repeat(43) });

      // Transaction fails with unexpected DB error
      vi.mocked(dbModule.db.transaction).mockRejectedValueOnce(new Error("DB_LOCK_TIMEOUT"));

      const cart = await getCurrentCart();
      expect(cart).toEqual(createEmptyCartSnapshot());
      // Crucial: Cookie MUST NOT be cleared if transaction fails!
      expect(mockCookieStore.delete).not.toHaveBeenCalled();
    });
  });
});

// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CartProvider,
  useCart,
  CartLauncher,
  CartDrawer,
  CartQuantityControl,
  CartEmptyState,
  CartSummary,
  CartLine,
  CartPageClient,
} from "@/components/cart";
import { ProductCommercePanel } from "@/components/product-detail/product-commerce-panel";
import type {
  CartSnapshot,
  CartLineSnapshot,
  CartReadResult,
  CartActionResult,
} from "@/lib/cart/types";
import type { ProductVariantDetail } from "@/lib/catalog/product-detail-types";

// Mock Server Actions
const mockLoadCurrentCartAction = vi.fn<() => Promise<CartReadResult>>();
const mockAddCartItemAction =
  vi.fn<
    (_prev: unknown, payload: { variantId: string; quantity: number }) => Promise<CartActionResult>
  >();
const mockUpdateCartItemQuantityAction =
  vi.fn<
    (_prev: unknown, payload: { variantId: string; quantity: number }) => Promise<CartActionResult>
  >();
const mockRemoveCartItemAction =
  vi.fn<(_prev: unknown, payload: { variantId: string }) => Promise<CartActionResult>>();

vi.mock("@/lib/cart/bootstrap-action", () => ({
  loadCurrentCartAction: () => mockLoadCurrentCartAction(),
}));

vi.mock("@/lib/cart/actions", () => ({
  addCartItemAction: (_prev: unknown, payload: { variantId: string; quantity: number }) =>
    mockAddCartItemAction(_prev, payload),
  updateCartItemQuantityAction: (
    _prev: unknown,
    payload: { variantId: string; quantity: number }
  ) => mockUpdateCartItemQuantityAction(_prev, payload),
  removeCartItemAction: (_prev: unknown, payload: { variantId: string }) =>
    mockRemoveCartItemAction(_prev, payload),
}));

// Mock Next.js Link and Image
vi.mock("next/link", () => ({
  default: ({ children, href, onClick, ...props }: React.ComponentProps<"a">) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ComponentProps<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

// Mock HTMLDialogElement methods in jsdom
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

const sampleCart: CartSnapshot = {
  itemCount: 3,
  lineCount: 2,
  subtotalCents: 39970,
  currency: "PEN",
  hasUnavailableItems: false,
  lines: [
    {
      variantId: "018f0000-0000-7000-8000-00000000c504",
      sku: "GP-CART-E2E-BLK",
      productName: "Mouse Cart E2E",
      productSlug: "mouse-cart-e2e",
      unitPriceCents: 12990,
      quantity: 2,
      lineSubtotalCents: 25980,
      available: true,
      selectedAttributes: { color: "Negro" },
      primaryMedia: {
        url: "https://example.com/media/hero.png",
        altText: "Mouse Cart E2E Negro",
        width: 1200,
        height: 1200,
      },
    },
    {
      variantId: "018f0000-0000-7000-8000-00000000c505",
      sku: "GP-CART-E2E-WHT",
      productName: "Mouse Cart E2E",
      productSlug: "mouse-cart-e2e",
      unitPriceCents: 13990,
      quantity: 1,
      lineSubtotalCents: 13990,
      available: true,
      selectedAttributes: { color: "Blanco" },
      primaryMedia: {
        url: "https://example.com/media/hero.png",
        altText: "Mouse Cart E2E Blanco",
        width: 1200,
        height: 1200,
      },
    },
  ],
};

const emptyCart: CartSnapshot = {
  itemCount: 0,
  lineCount: 0,
  subtotalCents: 0,
  currency: "PEN",
  hasUnavailableItems: false,
  lines: [],
};

const sampleVariant: ProductVariantDetail = {
  id: "018f0000-0000-7000-8000-00000000c504",
  productId: "018f0000-0000-7000-8000-00000000c503",
  sku: "GP-CART-E2E-BLK",
  title: "Negro / 8K",
  priceCents: 12990,
  compareAtPriceCents: 15990,
  weightGrams: 49,
  displayOrder: 1,
  status: "ACTIVE",
  attributes: { color: "Negro" },
};

function getDialog(testId = "cart-drawer"): HTMLDialogElement {
  return screen.getByTestId<HTMLDialogElement>(testId);
}

function getButton(testId: string): HTMLButtonElement {
  return screen.getByTestId<HTMLButtonElement>(testId);
}

describe("GP-017 / CART5 — Storefront Cart UI Unit Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. CartProvider State Machine & Synchronous Mutation Lock", () => {
    it("transitions from UNINITIALIZED -> LOADING -> READY on mount", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });

      function TestConsumer() {
        const { status, itemCount } = useCart();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="count">{itemCount}</span>
          </div>
        );
      }

      render(
        <CartProvider>
          <TestConsumer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("status").textContent).toBe("READY");
      });

      expect(screen.getByTestId("count").textContent).toBe("3");
      expect(mockLoadCurrentCartAction).toHaveBeenCalledTimes(1);
    });

    it("throws developer error when useCart is used outside CartProvider", () => {
      function NakedConsumer() {
        useCart();
        return <div>naked</div>;
      }

      // Suppress console.error expected from Error boundary during throw test
      const originalError = console.error;
      console.error = vi.fn();

      expect(() => render(<NakedConsumer />)).toThrowError(
        "useCart must be used within CartProvider"
      );

      console.error = originalError;
    });

    it("transitions to PROFILE_REQUIRED when bootstrap returns PROFILE_REQUIRED", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: false,
        code: "PROFILE_REQUIRED",
        error: "Profile required",
      });

      function TestConsumer() {
        const { status } = useCart();
        return <span data-testid="status">{status}</span>;
      }

      render(
        <CartProvider>
          <TestConsumer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("status").textContent).toBe("PROFILE_REQUIRED");
      });
    });

    it("transitions to ERROR on rejection and supports manual retry", async () => {
      mockLoadCurrentCartAction
        .mockRejectedValueOnce(new Error("Network failure"))
        .mockResolvedValueOnce({
          success: true,
          cart: sampleCart,
        });

      function TestConsumer() {
        const { status, retryBootstrap } = useCart();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <button onClick={() => void retryBootstrap()} data-testid="retry-btn">
              Retry
            </button>
          </div>
        );
      }

      render(
        <CartProvider>
          <TestConsumer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("status").textContent).toBe("ERROR");
      });

      // Trigger manual retry
      await act(async () => {
        screen.getByTestId("retry-btn").click();
      });

      await waitFor(() => {
        expect(screen.getByTestId("status").textContent).toBe("READY");
      });

      expect(mockLoadCurrentCartAction).toHaveBeenCalledTimes(2);
    });

    it("synchronously locks concurrent mutations in the same tick", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });
      mockAddCartItemAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });

      let mutationResult1: boolean | undefined;
      let mutationResult2: boolean | undefined;

      function ConcurrencyConsumer() {
        const { addItem } = useCart();
        return (
          <button
            data-testid="dual-mutation-btn"
            onClick={() => {
              void addItem("018f0000-0000-7000-8000-00000000c504", 1).then((res) => {
                mutationResult1 = res;
              });
              void addItem("018f0000-0000-7000-8000-00000000c505", 1).then((res) => {
                mutationResult2 = res;
              });
            }}
          >
            Trigger Concurrent
          </button>
        );
      }

      render(
        <CartProvider>
          <ConcurrencyConsumer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("dual-mutation-btn")).toBeDefined();
      });

      await act(async () => {
        screen.getByTestId("dual-mutation-btn").click();
      });

      await waitFor(() => {
        expect(mutationResult1).toBe(true);
        expect(mutationResult2).toBe(false);
      });

      // Only exactly one server action invocation was started
      expect(mockAddCartItemAction).toHaveBeenCalledTimes(1);
    });

    it("releases mutation lock after failure so subsequent mutations succeed", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });
      mockAddCartItemAction
        .mockRejectedValueOnce(new Error("Network disconnect"))
        .mockResolvedValueOnce({
          success: true,
          cart: sampleCart,
        });

      let result1: boolean | undefined;
      let result2: boolean | undefined;

      function RetryConsumer() {
        const { addItem } = useCart();
        return (
          <div>
            <button
              data-testid="first-add-btn"
              onClick={() => {
                void addItem("018f0000-0000-7000-8000-00000000c504", 1).then((r) => {
                  result1 = r;
                });
              }}
            >
              First Add
            </button>
            <button
              data-testid="second-add-btn"
              onClick={() => {
                void addItem("018f0000-0000-7000-8000-00000000c504", 1).then((r) => {
                  result2 = r;
                });
              }}
            >
              Second Add
            </button>
          </div>
        );
      }

      render(
        <CartProvider>
          <RetryConsumer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("first-add-btn")).toBeDefined();
      });

      // First add fails
      await act(async () => {
        screen.getByTestId("first-add-btn").click();
      });

      await waitFor(() => {
        expect(result1).toBe(false);
      });

      // Second add succeeds because lock was released in finally
      await act(async () => {
        screen.getByTestId("second-add-btn").click();
      });

      await waitFor(() => {
        expect(result2).toBe(true);
      });

      expect(mockAddCartItemAction).toHaveBeenCalledTimes(2);
    });

    it("prevents stale bootstrap from overwriting newer mutation snapshot", async () => {
      let resolveBootstrap!: (val: CartReadResult) => void;
      const slowBootstrapPromise = new Promise<CartReadResult>((resolve) => {
        resolveBootstrap = resolve;
      });
      mockLoadCurrentCartAction.mockReturnValueOnce(slowBootstrapPromise);

      mockAddCartItemAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });

      function TestConsumer() {
        const { status, itemCount, addItem } = useCart();
        return (
          <div>
            <span data-testid="status">{status}</span>
            <span data-testid="count">{itemCount}</span>
            <button
              onClick={() => void addItem("018f0000-0000-7000-8000-00000000c504", 1)}
              data-testid="add-btn"
            >
              Add
            </button>
          </div>
        );
      }

      render(
        <CartProvider>
          <TestConsumer />
        </CartProvider>
      );

      // Trigger mutation while bootstrap is still pending
      await act(async () => {
        screen.getByTestId("add-btn").click();
      });

      await waitFor(() => {
        expect(screen.getByTestId("count").textContent).toBe("3");
        expect(screen.getByTestId("status").textContent).toBe("READY");
      });

      // Resolve older bootstrap with empty cart
      await act(async () => {
        resolveBootstrap({ success: true, cart: emptyCart });
      });

      // Assert newer mutation snapshot was NOT overwritten
      expect(screen.getByTestId("count").textContent).toBe("3");
    });
  });

  describe("2. CartLauncher Component", () => {
    it("hides badge during loading or when itemCount is 0", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: emptyCart,
      });

      render(
        <CartProvider>
          <CartLauncher />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId("cart-badge-count")).toBeNull();
      });
    });

    it("displays itemCount in badge (sum of quantities, not line count)", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart, // 2 lines, 3 items
      });

      render(
        <CartProvider>
          <CartLauncher />
        </CartProvider>
      );

      await waitFor(() => {
        const badge = screen.getByTestId("cart-badge-count");
        expect(badge.textContent).toBe("3");
      });
    });

    it("displays 99+ when itemCount exceeds 99", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: { ...sampleCart, itemCount: 105 },
      });

      render(
        <CartProvider>
          <CartLauncher />
        </CartProvider>
      );

      await waitFor(() => {
        const badge = screen.getByTestId("cart-badge-count");
        expect(badge.textContent).toBe("99+");
      });
    });

    it("intercepts normal click to open Cart Drawer, but allows modifier clicks", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });

      render(
        <CartProvider>
          <CartLauncher />
          <CartDrawer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("cart-launcher-button")).toBeDefined();
      });

      const launcher = screen.getByTestId("cart-launcher-button");

      // Modifier click (Ctrl + Click): CartLauncher allows browser navigation.
      // We capture and prevent default navigation on the window to silence jsdom log.
      const stopNav = (e: MouseEvent) => e.preventDefault();
      window.addEventListener("click", stopNav, { capture: true });
      fireEvent.click(launcher, { ctrlKey: true });
      window.removeEventListener("click", stopNav, { capture: true });
      expect(getDialog().open).toBe(false);

      // Normal click opens drawer
      await act(async () => {
        fireEvent.click(launcher);
      });

      await waitFor(() => {
        expect(getDialog().open).toBe(true);
      });
    });
  });

  describe("3. CartQuantityControl & CartLine", () => {
    it("disables decrement at min (1) and increment at max (10)", () => {
      const onIncrement = vi.fn();
      const onDecrement = vi.fn();

      const { rerender } = render(
        <CartQuantityControl
          quantity={1}
          productName="Mouse Pro"
          onIncrement={onIncrement}
          onDecrement={onDecrement}
        />
      );

      expect(getButton("cart-qty-decrement").disabled).toBe(true);
      expect(getButton("cart-qty-increment").disabled).toBe(false);

      rerender(
        <CartQuantityControl
          quantity={10}
          productName="Mouse Pro"
          onIncrement={onIncrement}
          onDecrement={onDecrement}
        />
      );

      expect(getButton("cart-qty-decrement").disabled).toBe(false);
      expect(getButton("cart-qty-increment").disabled).toBe(true);
    });

    it("renders unavailable line with badge and disables quantity control", () => {
      const firstLine = sampleCart.lines[0];
      if (!firstLine) throw new Error("Missing first line");

      const unavailableLine: CartLineSnapshot = {
        ...firstLine,
        available: false,
      };

      render(<CartLine line={unavailableLine} onUpdateQuantity={vi.fn()} onRemove={vi.fn()} />);

      expect(screen.getByTestId("cart-line-unavailable-badge")).toBeDefined();
      expect(screen.getByTestId("cart-line-unavailable-badge").textContent).toBe("No disponible");
      expect(getButton("cart-qty-increment").disabled).toBe(true);
      expect(getButton("cart-qty-decrement").disabled).toBe(true);
      expect(getButton("cart-line-remove").disabled).toBe(false);
    });
  });

  describe("4. CartSummary & Empty State", () => {
    it("renders formatted subtotal and Yape/Plin notice", () => {
      render(<CartSummary subtotalCents={25980} />);

      expect(screen.getByTestId("cart-subtotal-value").textContent).toBe("S/ 259.80");
      expect(screen.getByTestId("cart-trust-box")).toBeDefined();
      expect(screen.getByTestId("cart-trust-box").textContent).toContain("Yape");
      expect(screen.getByTestId("cart-trust-box").textContent).toContain("Plin");
    });

    it("renders empty state with semantic Link and no nested button", () => {
      render(<CartEmptyState actionHref="/categorias/mouses" actionText="Explorar catálogo" />);

      expect(screen.getByTestId("cart-empty-state")).toBeDefined();
      expect(screen.getByRole("heading", { name: "Tu carrito está vacío" })).toBeDefined();

      const actionLink = screen.getByTestId("cart-empty-action-link");
      expect(actionLink.tagName.toLowerCase()).toBe("a");
      expect(actionLink.getAttribute("href")).toBe("/categorias/mouses");
      expect(actionLink.querySelector("button")).toBeNull();
    });
  });

  describe("5. ProductCommercePanel Add-to-Cart Integration & PROFILE_REQUIRED UX", () => {
    it("submits variant ID and opens drawer on success", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: emptyCart,
      });
      mockAddCartItemAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });

      render(
        <CartProvider>
          <ProductCommercePanel
            product={{
              id: "018f0000-0000-7000-8000-00000000c503",
              name: "Mouse Cart E2E",
              subtitle: null,
            }}
            brand={{ name: "Gamer Perú", slug: "gamer-peru" }}
            variants={[sampleVariant]}
            selectedVariant={sampleVariant}
            onSelectVariant={vi.fn()}
          />
          <CartDrawer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(getButton("pdp-add-to-cart-button").disabled).toBe(false);
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("pdp-add-to-cart-button"));
      });

      await waitFor(() => {
        expect(mockAddCartItemAction).toHaveBeenCalledWith(null, {
          variantId: "018f0000-0000-7000-8000-00000000c504",
          quantity: 1,
        });
      });

      // Verify drawer opens
      await waitFor(() => {
        expect(getDialog().open).toBe(true);
      });
    });

    it("renders PROFILE_REQUIRED notice and completion link on PDP without opening drawer", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: false,
        code: "PROFILE_REQUIRED",
        error: "Profile required",
      });

      render(
        <CartProvider>
          <ProductCommercePanel
            product={{
              id: "018f0000-0000-7000-8000-00000000c503",
              name: "Mouse Cart E2E",
              subtitle: null,
            }}
            brand={{ name: "Gamer Perú", slug: "gamer-peru" }}
            variants={[sampleVariant]}
            selectedVariant={sampleVariant}
            onSelectVariant={vi.fn()}
          />
          <CartDrawer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("pdp-profile-required-box")).toBeDefined();
      });

      const profileLink = screen.getByTestId("pdp-complete-profile-link");
      expect(profileLink.tagName.toLowerCase()).toBe("a");
      expect(profileLink.getAttribute("href")).toBe("/auth/completar-perfil");
      expect(profileLink.querySelector("button")).toBeNull();

      // Drawer must remain closed
      expect(getDialog().open).toBe(false);
    });

    it("shows inline alert and does NOT open drawer when product is unavailable", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: emptyCart,
      });
      mockAddCartItemAction.mockResolvedValueOnce({
        success: false,
        code: "PRODUCT_UNAVAILABLE",
        error: "Product unavailable",
      });

      render(
        <CartProvider>
          <ProductCommercePanel
            product={{
              id: "018f0000-0000-7000-8000-00000000c503",
              name: "Mouse Cart E2E",
              subtitle: null,
            }}
            brand={{ name: "Gamer Perú", slug: "gamer-peru" }}
            variants={[sampleVariant]}
            selectedVariant={sampleVariant}
            onSelectVariant={vi.fn()}
          />
          <CartDrawer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(getButton("pdp-add-to-cart-button").disabled).toBe(false);
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("pdp-add-to-cart-button"));
      });

      await waitFor(() => {
        expect(screen.getByTestId("pdp-add-to-cart-error")).toBeDefined();
        expect(screen.getByTestId("pdp-add-to-cart-error").textContent).toContain(
          "Este producto ya no está disponible."
        );
      });

      // Drawer must NOT be open
      expect(getDialog().open).toBe(false);
    });

    it("disables Add button with 'No disponible' when variant is inactive", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: emptyCart,
      });

      const inactiveVariant: ProductVariantDetail = {
        ...sampleVariant,
        status: "DRAFT" as unknown as "ACTIVE",
      };

      render(
        <CartProvider>
          <ProductCommercePanel
            product={{
              id: "018f0000-0000-7000-8000-00000000c503",
              name: "Mouse Cart E2E",
              subtitle: null,
            }}
            brand={{ name: "Gamer Perú", slug: "gamer-peru" }}
            variants={[inactiveVariant]}
            selectedVariant={inactiveVariant}
            onSelectVariant={vi.fn()}
          />
        </CartProvider>
      );

      await waitFor(() => {
        const btn = getButton("pdp-add-to-cart-button");
        expect(btn.disabled).toBe(true);
        expect(btn.textContent).toContain("No disponible");
      });
    });
  });

  describe("6. Full /carrito Page Client Component", () => {
    it("renders populated items and summary column in two-column layout", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });

      render(
        <CartProvider>
          <CartPageClient />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Tu Carrito de Compras" })).toBeDefined();
        expect(screen.getAllByTestId("cart-line-item")).toHaveLength(2);
        expect(screen.getByTestId("cart-subtotal-value").textContent).toBe("S/ 399.70");
      });

      const continueShoppingLink = screen.getByTestId("cart-page-continue-shopping");
      expect(continueShoppingLink.tagName.toLowerCase()).toBe("a");
      expect(continueShoppingLink.querySelector("button")).toBeNull();
    });

    it("renders empty state when cart is empty", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: emptyCart,
      });

      render(
        <CartProvider>
          <CartPageClient />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("cart-empty-state")).toBeDefined();
      });
    });

    it("renders profile required on full cart page with semantic link and no nested button", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: false,
        code: "PROFILE_REQUIRED",
        error: "Profile required",
      });

      render(
        <CartProvider>
          <CartPageClient />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("cart-page-profile-required")).toBeDefined();
      });

      const profileLink = screen.getByTestId("cart-page-complete-profile");
      expect(profileLink.tagName.toLowerCase()).toBe("a");
      expect(profileLink.getAttribute("href")).toBe("/auth/completar-perfil");
      expect(profileLink.querySelector("button")).toBeNull();
    });

    it("renders error state on full cart page when status is ERROR", async () => {
      mockLoadCurrentCartAction.mockRejectedValueOnce(new Error("Failed"));

      render(
        <CartProvider>
          <CartPageClient />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("cart-page-error")).toBeDefined();
      });
    });
  });

  describe("7. CartDrawer Interactions & Mutation Dispatch", () => {
    it("closes drawer when clicking close button", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });

      render(
        <CartProvider>
          <CartLauncher />
          <CartDrawer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("cart-launcher-button")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("cart-launcher-button"));
      });
      expect(getDialog().open).toBe(true);

      await act(async () => {
        fireEvent.click(screen.getByTestId("cart-drawer-close"));
      });
      expect(getDialog().open).toBe(false);
    });

    it("dispatches updateQuantity when clicking increment in CartLine", async () => {
      const line1 = sampleCart.lines[0];
      const line2 = sampleCart.lines[1];
      if (!line1 || !line2) throw new Error("Missing lines");

      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });
      mockUpdateCartItemQuantityAction.mockResolvedValueOnce({
        success: true,
        cart: {
          ...sampleCart,
          itemCount: 4,
          lines: [{ ...line1, quantity: 3, lineSubtotalCents: 38970 }, line2],
        },
      });

      render(
        <CartProvider>
          <CartLauncher />
          <CartDrawer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("cart-launcher-button")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("cart-launcher-button"));
      });

      const incrementButtons = screen.getAllByTestId("cart-qty-increment");
      const firstIncBtn = incrementButtons[0];
      if (!firstIncBtn) throw new Error("Missing increment button");

      await act(async () => {
        fireEvent.click(firstIncBtn);
      });

      await waitFor(() => {
        expect(mockUpdateCartItemQuantityAction).toHaveBeenCalledWith(null, {
          variantId: "018f0000-0000-7000-8000-00000000c504",
          quantity: 3,
        });
      });
    });

    it("dispatches removeItem when clicking remove button in CartLine", async () => {
      const line2 = sampleCart.lines[1];
      if (!line2) throw new Error("Missing line2");

      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });
      mockRemoveCartItemAction.mockResolvedValueOnce({
        success: true,
        cart: {
          ...sampleCart,
          itemCount: 1,
          lineCount: 1,
          lines: [line2],
        },
      });

      render(
        <CartProvider>
          <CartLauncher />
          <CartDrawer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("cart-launcher-button")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("cart-launcher-button"));
      });

      const removeButtons = screen.getAllByTestId("cart-line-remove");
      const firstRemoveBtn = removeButtons[0];
      if (!firstRemoveBtn) throw new Error("Missing remove button");

      await act(async () => {
        fireEvent.click(firstRemoveBtn);
      });

      await waitFor(() => {
        expect(mockRemoveCartItemAction).toHaveBeenCalledWith(null, {
          variantId: "018f0000-0000-7000-8000-00000000c504",
        });
      });
    });

    it("renders unavailable warning when hasUnavailableItems is true", async () => {
      const line1 = sampleCart.lines[0];
      const line2 = sampleCart.lines[1];
      if (!line1 || !line2) throw new Error("Missing lines");

      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: {
          ...sampleCart,
          hasUnavailableItems: true,
          lines: [{ ...line1, available: false }, line2],
        },
      });

      render(
        <CartProvider>
          <CartLauncher />
          <CartDrawer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("cart-launcher-button")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("cart-launcher-button"));
      });

      expect(screen.getByTestId("cart-unavailable-warning")).toBeDefined();
      expect(screen.getByTestId("cart-unavailable-warning").textContent).toContain(
        "Algunos productos en tu carrito ya no están disponibles."
      );
    });

    it("renders placeholder thumbnail when CartLine has null primaryMedia", () => {
      const line1 = sampleCart.lines[0];
      if (!line1) throw new Error("Missing line1");

      const lineWithoutMedia: CartLineSnapshot = {
        ...line1,
        primaryMedia: null,
      };

      render(<CartLine line={lineWithoutMedia} onUpdateQuantity={vi.fn()} onRemove={vi.fn()} />);

      expect(screen.getByText("GP")).toBeDefined();
    });

    it("renders semantic CTA links in CartDrawer without nested button elements", async () => {
      mockLoadCurrentCartAction.mockResolvedValueOnce({
        success: true,
        cart: sampleCart,
      });

      render(
        <CartProvider>
          <CartLauncher />
          <CartDrawer />
        </CartProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("cart-launcher-button")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("cart-launcher-button"));
      });

      const viewFullPageLink = screen.getByTestId("cart-view-full-page");
      expect(viewFullPageLink.tagName.toLowerCase()).toBe("a");
      expect(viewFullPageLink.getAttribute("href")).toBe("/carrito");
      expect(viewFullPageLink.querySelector("button")).toBeNull();
    });
  });
});

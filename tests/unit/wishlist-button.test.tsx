// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WishlistButton, WishlistProvider } from "@/components/wishlist";
import * as actions from "@/lib/wishlist/actions";

vi.mock("@/lib/wishlist/actions", () => ({
  getWishlistAction: vi.fn(),
  setWishlistItemAction: vi.fn(),
}));

const PRODUCT_ID = "0190f4c2-7a1b-7c3d-8e4f-5a6b7c8d9e0f";

function renderHeart() {
  return render(
    <WishlistProvider>
      <WishlistButton productId={PRODUCT_ID} productName="ATK A9" />
    </WishlistProvider>
  );
}

describe("WishlistButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = "sb-test-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  afterEach(cleanup);

  it("renders nothing outside a WishlistProvider", () => {
    const { container } = render(<WishlistButton productId={PRODUCT_ID} productName="ATK A9" />);
    expect(container.innerHTML).toBe("");
  });

  it("asks anonymous visitors to sign in instead of calling the server", async () => {
    renderHeart();
    const heart = screen.getByRole("button", { name: "Añadir ATK A9 a favoritos" });

    await act(async () => {
      fireEvent.click(heart);
    });

    expect(await screen.findByText("Inicia sesión para guardar tus favoritos.")).toBeTruthy();
    expect(
      // jsdom has no popover API, so the toast layer stays hidden from role queries.
      screen.getByRole("link", { name: "Iniciar sesión", hidden: true }).getAttribute("href")
    ).toBe("/auth/login");
    expect(actions.getWishlistAction).not.toHaveBeenCalled();
    expect(actions.setWishlistItemAction).not.toHaveBeenCalled();
    expect(heart.getAttribute("aria-pressed")).toBe("false");
  });

  it("loads saved state for a session and toggles it with feedback", async () => {
    document.cookie = "sb-test-auth-token=x; path=/";
    vi.mocked(actions.getWishlistAction).mockResolvedValue({ authenticated: true, productIds: [] });
    vi.mocked(actions.setWishlistItemAction).mockResolvedValue({ ok: true, saved: true });

    renderHeart();
    await waitFor(() => expect(actions.getWishlistAction).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Añadir ATK A9 a favoritos" }));
    });

    expect(actions.setWishlistItemAction).toHaveBeenCalledWith({
      productId: PRODUCT_ID,
      saved: true,
    });
    expect(
      screen
        .getByRole("button", { name: "Quitar ATK A9 de favoritos" })
        .getAttribute("aria-pressed")
    ).toBe("true");
    expect(await screen.findByText("ATK A9 se añadió a favoritos.")).toBeTruthy();
  });

  it("rolls back when the server refuses", async () => {
    document.cookie = "sb-test-auth-token=x; path=/";
    vi.mocked(actions.getWishlistAction).mockResolvedValue({ authenticated: true, productIds: [] });
    vi.mocked(actions.setWishlistItemAction).mockResolvedValue({ ok: false, reason: "ERROR" });

    renderHeart();
    await waitFor(() => expect(actions.getWishlistAction).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Añadir ATK A9 a favoritos" }));
    });

    expect(
      screen.getByRole("button", { name: "Añadir ATK A9 a favoritos" }).getAttribute("aria-pressed")
    ).toBe("false");
    expect(
      await screen.findByText("No pudimos actualizar tus favoritos. Inténtalo de nuevo.")
    ).toBeTruthy();
  });
});

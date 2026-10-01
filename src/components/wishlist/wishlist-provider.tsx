"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getWishlistAction, setWishlistItemAction } from "@/lib/wishlist/actions";
import { WishlistToasts, type WishlistToast } from "./wishlist-toasts";

const TOAST_VISIBLE_MS = 3200;

export interface WishlistContextValue {
  /** True once the saved ids are known (or known to be none), so absence means "not saved". */
  isReady: boolean;
  isSaved: (productId: string) => boolean;
  isPending: (productId: string) => boolean;
  toggle: (productId: string, productName: string) => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

/**
 * @supabase/ssr keeps the session in readable `sb-<project>-auth-token` cookies. Checking for one
 * spares anonymous visitors, the bulk of listing traffic, a server round trip on every page.
 */
function hasSessionCookie(): boolean {
  return document.cookie
    .split(";")
    .some((part) => part.trim().split("=")[0]?.includes("-auth-token"));
}

/**
 * Holds the signed-in customer's saved product ids for every heart on the page. Listing pages are
 * cached for everyone, so the state loads here in the browser, once per visit, and toggles apply
 * optimistically with a rollback if the server refuses.
 */
export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [toasts, setToasts] = useState<WishlistToast[]>([]);
  const [isReady, setIsReady] = useState(false);
  const isAuthenticatedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!hasSessionCookie()) {
      isAuthenticatedRef.current = false;
      setIsReady(true);
      return;
    }
    let cancelled = false;
    void getWishlistAction().then((state) => {
      if (cancelled) return;
      isAuthenticatedRef.current = state.authenticated;
      if (state.authenticated) setSavedIds(new Set(state.productIds));
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const notify = useCallback((toast: Omit<WishlistToast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-1), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, TOAST_VISIBLE_MS);
  }, []);

  const setMembership = useCallback((productId: string, saved: boolean) => {
    setSavedIds((current) => {
      const next = new Set(current);
      if (saved) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }, []);

  const setPending = useCallback((productId: string, pending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }, []);

  const toggle = useCallback(
    async (productId: string, productName: string) => {
      if (isAuthenticatedRef.current === false && !hasSessionCookie()) {
        notify({
          tone: "info",
          message: "Inicia sesión para guardar tus favoritos.",
          action: { label: "Iniciar sesión", href: "/auth/login" },
        });
        return;
      }

      const nextSaved = !savedIds.has(productId);
      setMembership(productId, nextSaved);
      setPending(productId, true);

      const result = await setWishlistItemAction({ productId, saved: nextSaved });
      setPending(productId, false);

      if (result.ok) {
        isAuthenticatedRef.current = true;
        notify({
          tone: "success",
          message: result.saved
            ? `${productName} se añadió a favoritos.`
            : `${productName} se quitó de favoritos.`,
        });
        return;
      }

      setMembership(productId, !nextSaved);
      if (result.reason === "UNAUTHENTICATED") {
        isAuthenticatedRef.current = false;
        notify({
          tone: "info",
          message: "Inicia sesión para guardar tus favoritos.",
          action: { label: "Iniciar sesión", href: "/auth/login" },
        });
      } else if (result.reason === "NOT_FOUND") {
        notify({ tone: "error", message: "Este producto ya no está disponible." });
      } else {
        notify({
          tone: "error",
          message: "No pudimos actualizar tus favoritos. Inténtalo de nuevo.",
        });
      }
    },
    [notify, savedIds, setMembership, setPending]
  );

  const value: WishlistContextValue = {
    isReady,
    isSaved: (productId) => savedIds.has(productId),
    isPending: (productId) => pendingIds.has(productId),
    toggle,
  };

  return (
    <WishlistContext.Provider value={value}>
      {children}
      <WishlistToasts toasts={toasts} />
    </WishlistContext.Provider>
  );
}

/** For components that also render outside the storefront (admin previews), where it is null. */
export function useOptionalWishlist(): WishlistContextValue | null {
  return useContext(WishlistContext);
}

export function useWishlist(): WishlistContextValue {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used within a WishlistProvider.");
  return context;
}

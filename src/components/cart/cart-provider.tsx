"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  addCartItemAction,
  removeCartItemAction,
  updateCartItemQuantityAction,
} from "@/lib/cart/actions";
import { loadCurrentCartAction } from "@/lib/cart/bootstrap-action";
import type { CartSnapshot } from "@/lib/cart/types";
import { CANONICAL_CART_CURRENCY, CART_HINT_COOKIE_NAME } from "@/lib/cart/constants";

const BOOTSTRAPPED_KEY = "gp-cart-bootstrapped";

const EMPTY_CART: CartSnapshot = {
  currency: CANONICAL_CART_CURRENCY,
  lineCount: 0,
  itemCount: 0,
  subtotalCents: 0,
  hasUnavailableItems: false,
  lines: [],
};

/**
 * Whether this page view can know, without asking the server, that there is no cart: no session
 * (signed-in carts live on the account), no guest-cart hint, and a previous visit already did one
 * real read (so carts created before the hint existed got it). Each skipped read is a Worker
 * request saved on every page view of a visitor who never added anything.
 */
function knowsCartIsEmpty(): boolean {
  try {
    const names = document.cookie.split(";").map((part) => part.trim().split("=")[0] ?? "");
    const signedIn = names.some((name) => name.includes("-auth-token"));
    const hasGuestCart = names.includes(CART_HINT_COOKIE_NAME);
    return !signedIn && !hasGuestCart && window.localStorage.getItem(BOOTSTRAPPED_KEY) === "1";
  } catch {
    return false;
  }
}

export type CartStatus = "UNINITIALIZED" | "LOADING" | "READY" | "PROFILE_REQUIRED" | "ERROR";

export interface OpenDrawerOptions {
  returnFocusTo?: HTMLElement | null;
}

export interface CartContextValue {
  status: CartStatus;
  snapshot: CartSnapshot | null;
  itemCount: number;
  isDrawerOpen: boolean;
  isMutating: boolean;
  pendingVariantIds: Set<string>;
  lastError: string | null;
  announcement: string | null;
  openDrawer: (options?: OpenDrawerOptions) => void;
  closeDrawer: () => void;
  addItem: (
    variantId: string,
    quantity?: number,
    accessoryVariantIds?: string[]
  ) => Promise<boolean>;
  updateQuantity: (variantId: string, quantity: number) => Promise<boolean>;
  removeItem: (variantId: string) => Promise<boolean>;
  retryBootstrap: () => Promise<void>;
  openerElementRef: React.MutableRefObject<HTMLElement | null>;
}

const CartContext = createContext<CartContextValue | null>(null);

export interface CartProviderProps {
  children: React.ReactNode;
}

export function CartProvider({ children }: CartProviderProps): React.JSX.Element {
  const [status, setStatus] = useState<CartStatus>("UNINITIALIZED");
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [pendingVariantIds, setPendingVariantIds] = useState<Set<string>>(new Set());
  const [lastError, setLastError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const requestGenerationRef = useRef<number>(0);
  const mutationLockRef = useRef<boolean>(false);
  const openerElementRef = useRef<HTMLElement | null>(null);

  // Announce to screen readers
  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  // 1. Single Bootstrap on Mount
  const bootstrap = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    setStatus("LOADING");
    setLastError(null);

    if (knowsCartIsEmpty()) {
      setSnapshot(EMPTY_CART);
      setStatus("READY");
      return;
    }

    try {
      const result = await loadCurrentCartAction();
      try {
        window.localStorage.setItem(BOOTSTRAPPED_KEY, "1");
      } catch {
        // Without storage every visit simply keeps reading the cart.
      }

      // Discard older bootstrap response if a newer request/mutation took over
      if (generation !== requestGenerationRef.current) {
        return;
      }

      if (result.success) {
        setSnapshot(result.cart);
        setStatus("READY");
      } else if (result.code === "PROFILE_REQUIRED") {
        setSnapshot(null);
        setStatus("PROFILE_REQUIRED");
      } else {
        setSnapshot(null);
        setStatus("ERROR");
        setLastError("No se pudo cargar el carrito.");
      }
    } catch {
      if (generation === requestGenerationRef.current) {
        setSnapshot(null);
        setStatus("ERROR");
        setLastError("Error de conexión al cargar el carrito.");
      }
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // 2. Open / Close Drawer
  const openDrawer = useCallback((options?: OpenDrawerOptions) => {
    if (options?.returnFocusTo) {
      openerElementRef.current = options.returnFocusTo;
    }
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    requestAnimationFrame(() => {
      if (openerElementRef.current && typeof openerElementRef.current.focus === "function") {
        openerElementRef.current.focus();
      }
    });
  }, []);

  // 3. Add Item Mutation
  const addItem = useCallback(
    async (variantId: string, quantity = 1, accessoryVariantIds?: string[]): Promise<boolean> => {
      if (mutationLockRef.current) return false;
      mutationLockRef.current = true;

      const generation = ++requestGenerationRef.current;
      setIsMutating(true);
      setPendingVariantIds((prev) => new Set(prev).add(variantId));
      setLastError(null);

      try {
        const result = await addCartItemAction(null, {
          variantId,
          quantity,
          ...(accessoryVariantIds?.length ? { accessoryVariantIds } : {}),
        });

        if (generation !== requestGenerationRef.current) {
          return false;
        }

        if (result.success) {
          setSnapshot(result.cart);
          setStatus("READY");
          announce("Producto añadido al carrito");
          return true;
        } else if (result.code === "PROFILE_REQUIRED") {
          setStatus("PROFILE_REQUIRED");
          setLastError("Debes completar tu perfil para utilizar el carrito.");
          return false;
        } else if (result.code === "PRODUCT_UNAVAILABLE") {
          setLastError(
            accessoryVariantIds?.length
              ? "Un producto o accesorio ya no está disponible. Revisa tu selección; no se añadió ningún producto."
              : "Este producto ya no está disponible."
          );
          return false;
        } else if (result.code === "ITEM_NOT_FOUND") {
          setLastError("El producto seleccionado no fue encontrado.");
          return false;
        } else {
          setLastError("No se pudo añadir el producto al carrito.");
          return false;
        }
      } catch {
        if (generation === requestGenerationRef.current) {
          setLastError("Error de conexión al añadir producto.");
        }
        return false;
      } finally {
        mutationLockRef.current = false;
        setIsMutating(false);
        setPendingVariantIds((prev) => {
          const next = new Set(prev);
          next.delete(variantId);
          return next;
        });
      }
    },
    [announce]
  );

  // 4. Update Quantity Mutation
  const updateQuantity = useCallback(
    async (variantId: string, quantity: number): Promise<boolean> => {
      if (mutationLockRef.current) return false;
      mutationLockRef.current = true;

      const generation = ++requestGenerationRef.current;
      setIsMutating(true);
      setPendingVariantIds((prev) => new Set(prev).add(variantId));
      setLastError(null);

      try {
        const result = await updateCartItemQuantityAction(null, { variantId, quantity });

        if (generation !== requestGenerationRef.current) {
          return false;
        }

        if (result.success) {
          setSnapshot(result.cart);
          setStatus("READY");
          announce("Cantidad de producto actualizada");
          return true;
        } else if (result.code === "PROFILE_REQUIRED") {
          setStatus("PROFILE_REQUIRED");
          setLastError("Debes completar tu perfil para utilizar el carrito.");
          return false;
        } else {
          setLastError("No se pudo actualizar la cantidad.");
          return false;
        }
      } catch {
        if (generation === requestGenerationRef.current) {
          setLastError("Error de conexión al actualizar cantidad.");
        }
        return false;
      } finally {
        mutationLockRef.current = false;
        setIsMutating(false);
        setPendingVariantIds((prev) => {
          const next = new Set(prev);
          next.delete(variantId);
          return next;
        });
      }
    },
    [announce]
  );

  // 5. Remove Item Mutation
  const removeItem = useCallback(
    async (variantId: string): Promise<boolean> => {
      if (mutationLockRef.current) return false;
      mutationLockRef.current = true;

      const generation = ++requestGenerationRef.current;
      setIsMutating(true);
      setPendingVariantIds((prev) => new Set(prev).add(variantId));
      setLastError(null);

      try {
        const result = await removeCartItemAction(null, { variantId });

        if (generation !== requestGenerationRef.current) {
          return false;
        }

        if (result.success) {
          setSnapshot(result.cart);
          setStatus("READY");
          announce("Producto eliminado del carrito");
          return true;
        } else if (result.code === "PROFILE_REQUIRED") {
          setStatus("PROFILE_REQUIRED");
          setLastError("Debes completar tu perfil para utilizar el carrito.");
          return false;
        } else {
          setLastError("No se pudo eliminar el producto.");
          return false;
        }
      } catch {
        if (generation === requestGenerationRef.current) {
          setLastError("Error de conexión al eliminar producto.");
        }
        return false;
      } finally {
        mutationLockRef.current = false;
        setIsMutating(false);
        setPendingVariantIds((prev) => {
          const next = new Set(prev);
          next.delete(variantId);
          return next;
        });
      }
    },
    [announce]
  );

  const itemCount = snapshot?.itemCount ?? 0;

  const value: CartContextValue = {
    status,
    snapshot,
    itemCount,
    isDrawerOpen,
    isMutating,
    pendingVariantIds,
    lastError,
    announcement,
    openDrawer,
    closeDrawer,
    addItem,
    updateQuantity,
    removeItem,
    retryBootstrap: bootstrap,
    openerElementRef,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
      {announcement && (
        <div role="status" aria-live="polite" className="sr-only" data-testid="cart-live-announcer">
          {announcement}
        </div>
      )}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}

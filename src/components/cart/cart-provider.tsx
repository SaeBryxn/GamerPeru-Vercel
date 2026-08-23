"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  addCartItemAction,
  removeCartItemAction,
  updateCartItemQuantityAction,
} from "@/lib/cart/actions";
import { loadCurrentCartAction } from "@/lib/cart/bootstrap-action";
import type { CartSnapshot } from "@/lib/cart/types";

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
  addItem: (variantId: string, quantity?: number) => Promise<boolean>;
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

    try {
      const result = await loadCurrentCartAction();

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
    async (variantId: string, quantity = 1): Promise<boolean> => {
      if (isMutating) return false;

      const generation = ++requestGenerationRef.current;
      setIsMutating(true);
      setPendingVariantIds((prev) => new Set(prev).add(variantId));
      setLastError(null);

      try {
        const result = await addCartItemAction(null, { variantId, quantity });

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
          setLastError("Este producto ya no está disponible.");
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
        setIsMutating(false);
        setPendingVariantIds((prev) => {
          const next = new Set(prev);
          next.delete(variantId);
          return next;
        });
      }
    },
    [isMutating, announce]
  );

  // 4. Update Quantity Mutation
  const updateQuantity = useCallback(
    async (variantId: string, quantity: number): Promise<boolean> => {
      if (isMutating) return false;

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
        setIsMutating(false);
        setPendingVariantIds((prev) => {
          const next = new Set(prev);
          next.delete(variantId);
          return next;
        });
      }
    },
    [isMutating, announce]
  );

  // 5. Remove Item Mutation
  const removeItem = useCallback(
    async (variantId: string): Promise<boolean> => {
      if (isMutating) return false;

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
        setIsMutating(false);
        setPendingVariantIds((prev) => {
          const next = new Set(prev);
          next.delete(variantId);
          return next;
        });
      }
    },
    [isMutating, announce]
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

const defaultCartContextValue: CartContextValue = {
  status: "UNINITIALIZED",
  snapshot: null,
  itemCount: 0,
  isDrawerOpen: false,
  isMutating: false,
  pendingVariantIds: new Set(),
  lastError: null,
  announcement: null,
  openDrawer: () => {},
  closeDrawer: () => {},
  addItem: async () => false,
  updateQuantity: async () => false,
  removeItem: async () => false,
  retryBootstrap: async () => {},
  openerElementRef: { current: null },
};

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  return context ?? defaultCartContextValue;
}

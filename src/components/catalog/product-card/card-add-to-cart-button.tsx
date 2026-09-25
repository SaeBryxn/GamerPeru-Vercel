"use client";

import React from "react";
import { DomeButton } from "@/components/ui";
import { useCart } from "@/components/cart/cart-provider";
import styles from "./product-card.module.css";

export interface CardAddToCartButtonProps {
  variantId: string;
  productName: string;
  className?: string;
  /** Runs after the add settles and before the drawer opens, e.g. to dismiss a quick view. */
  onBeforeDrawer?: () => void;
}

/**
 * Adds a single-variant product straight from a card. The drawer opens whatever the outcome: on
 * success it shows the new line, otherwise it carries the reason (sign-in, profile, stock).
 */
export function CardAddToCartButton({
  variantId,
  productName,
  className,
  onBeforeDrawer,
}: CardAddToCartButtonProps): React.JSX.Element {
  const { addItem, openDrawer, isMutating, pendingVariantIds } = useCart();
  const isPending = pendingVariantIds.has(variantId);

  return (
    <DomeButton
      tone="dark"
      className={[styles.actionButton, className].filter(Boolean).join(" ")}
      aria-label={`Agregar ${productName} al carrito`}
      disabled={isMutating}
      aria-busy={isPending}
      onClick={async (event) => {
        const opener = event.currentTarget;
        await addItem(variantId, 1);
        onBeforeDrawer?.();
        openDrawer({ returnFocusTo: opener.isConnected ? opener : null });
      }}
    >
      {isPending ? "Agregando…" : "Agregar al carrito"}
    </DomeButton>
  );
}

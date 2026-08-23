"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Icon } from "@/components/ui";
import { useCart } from "./cart-provider";
import styles from "./cart-launcher.module.css";

export interface CartLauncherProps {
  label?: string;
  className?: string;
  "data-testid"?: string;
}

export function CartLauncher({
  label = "Carrito de compras",
  className,
  "data-testid": testId = "cart-launcher-button",
}: CartLauncherProps): React.JSX.Element {
  const { status, itemCount, openDrawer } = useCart();
  const linkRef = useRef<HTMLAnchorElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Preserve browser modifier clicks (new tab / new window)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }

    e.preventDefault();
    openDrawer({ returnFocusTo: linkRef.current });
  };

  const showBadge = status === "READY" && itemCount > 0;
  const accessibleLabel = showBadge
    ? `${label}, ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`
    : label;

  const classNames = [styles.launcherLink, className].filter(Boolean).join(" ");

  return (
    <Link
      ref={linkRef}
      href="/carrito"
      onClick={handleClick}
      className={classNames}
      aria-label={accessibleLabel}
      data-testid={testId}
    >
      <Icon icon={ShoppingCart} size="lg" aria-hidden="true" />
      {showBadge && (
        <span className={styles.badge} aria-hidden="true" data-testid="cart-badge-count">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </Link>
  );
}

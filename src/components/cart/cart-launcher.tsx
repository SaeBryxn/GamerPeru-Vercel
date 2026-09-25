"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ShoppingCart } from "lucide-react";
import { Icon } from "@/components/ui";
import { CountPulse } from "./count-pulse";
import { useCart } from "./cart-provider";
import styles from "./cart-launcher.module.css";

const MotionLink = motion.create(Link);

// Hovering the cart gives the badge one soft beat, a nudge toward checkout.
const BADGE_VARIANTS: Variants = {
  rest: { scale: 1 },
  hover: { scale: [1, 1.18, 1], transition: { duration: 0.45, ease: "easeOut" } },
};

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
    <MotionLink
      ref={linkRef}
      href="/carrito"
      onClick={handleClick}
      className={classNames}
      aria-label={accessibleLabel}
      data-testid={testId}
      initial="rest"
      animate="rest"
      whileHover="hover"
    >
      <Icon icon={ShoppingCart} size="lg" aria-hidden="true" />
      {showBadge && (
        <motion.span
          className={styles.badgeAnchor}
          variants={BADGE_VARIANTS}
          aria-hidden="true"
          data-testid="cart-badge-count"
        >
          <CountPulse
            value={itemCount}
            label={itemCount > 99 ? "99+" : undefined}
            className={styles.badge}
          />
        </motion.span>
      )}
    </MotionLink>
  );
}

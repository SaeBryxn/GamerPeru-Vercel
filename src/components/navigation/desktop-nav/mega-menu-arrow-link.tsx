"use client";

import React from "react";
import Link from "@/components/app-link";
import { ArrowRight } from "lucide-react";
import { m, type Variants } from "framer-motion";
import { Icon, type IconSize } from "@/components/ui";
import styles from "./mega-menu-arrow-link.module.css";

const MotionLink = m.create(Link);

/**
 * Hover state shared by every arrow in the mega-menus: the arrow turns to
 * point straight down and dips slightly. Exported so whole-card links can drive
 * their own arrow with the same m.
 */
export const ARROW_VARIANTS: Variants = {
  rest: { rotate: 0, y: 0 },
  hover: { rotate: 90, y: 2, transition: { type: "spring", stiffness: 380, damping: 22 } },
};

export interface ArrowProps {
  size?: IconSize;
}

/** Arrow that follows the nearest ancestor animating the "rest"/"hover" variants. */
export function MegaMenuArrow({ size = "sm" }: ArrowProps) {
  return (
    <m.span className={styles.arrow} variants={ARROW_VARIANTS}>
      <Icon icon={ArrowRight} size={size} aria-hidden="true" />
    </m.span>
  );
}

export interface MegaMenuArrowLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  arrowSize?: IconSize;
  /** Spans the container with the label left and the arrow pushed right. */
  fullWidth?: boolean;
  onClick?: () => void;
}

/**
 * Text link with a trailing arrow: at rest the label has no underline and the
 * arrow points right; on hover or keyboard focus the label underlines (CSS)
 * and the arrow rotates down (Framer Motion).
 */
export function MegaMenuArrowLink({
  href,
  children,
  className,
  arrowSize = "sm",
  fullWidth = false,
  onClick,
}: MegaMenuArrowLinkProps) {
  return (
    <MotionLink
      href={href}
      className={[styles.arrowLink, fullWidth ? styles.fullWidth : "", className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileFocus="hover"
    >
      <span className={styles.label}>{children}</span>
      <MegaMenuArrow size={arrowSize} />
    </MotionLink>
  );
}

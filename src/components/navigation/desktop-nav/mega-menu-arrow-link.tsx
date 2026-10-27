"use client";

import React from "react";
import Link from "@/components/app-link";
import { ArrowRight } from "lucide-react";
import { Icon, type IconSize } from "@/components/ui";
import { SweepUnderline } from "@/components/ui/sweep-underline";
import styles from "./mega-menu-arrow-link.module.css";

export interface ArrowProps {
  size?: IconSize;
}

/** CSS follows the owning link's hover/focus and reverses from its current rotation. */
export function MegaMenuArrow({ size = "sm" }: ArrowProps) {
  return (
    <span className={styles.arrow} data-menu-arrow aria-hidden="true">
      <Icon icon={ArrowRight} size={size} aria-hidden="true" />
    </span>
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
 * and the arrow rotates down with a reversible CSS transition.
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
    <Link
      href={href}
      className={[styles.arrowLink, fullWidth ? styles.fullWidth : "", className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      <SweepUnderline trigger="link">{children}</SweepUnderline>
      <MegaMenuArrow size={arrowSize} />
    </Link>
  );
}

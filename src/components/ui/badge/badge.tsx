import React from "react";
import styles from "./badge.module.css";

export type BadgeVariant = "neutral" | "brand" | "subtle";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

export function Badge({ variant = "neutral", className, children, ...rest }: BadgeProps) {
  const variantClass =
    variant === "brand"
      ? styles.badgeBrand
      : variant === "subtle"
        ? styles.badgeSubtle
        : styles.badgeNeutral;

  const classNames = [styles.badge, variantClass, className].filter(Boolean).join(" ");

  return (
    <span className={classNames} {...rest}>
      {children}
    </span>
  );
}

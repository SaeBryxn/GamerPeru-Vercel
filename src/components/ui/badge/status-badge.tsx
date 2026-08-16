import React from "react";
import styles from "./badge.module.css";

export type StatusBadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusBadgeVariant;
  withDot?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function StatusBadge({
  variant = "neutral",
  withDot = true,
  icon,
  className,
  children,
  ...rest
}: StatusBadgeProps) {
  const variantClass =
    variant === "success"
      ? styles.statusSuccess
      : variant === "warning"
        ? styles.statusWarning
        : variant === "danger"
          ? styles.statusDanger
          : variant === "info"
            ? styles.statusInfo
            : styles.statusNeutral;

  const classNames = [styles.statusBadge, variantClass, className].filter(Boolean).join(" ");

  return (
    <span className={classNames} {...rest}>
      {icon ? (
        <span aria-hidden="true">{icon}</span>
      ) : withDot ? (
        <span className={styles.dot} aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </span>
  );
}

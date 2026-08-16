import React from "react";
import styles from "./badge.module.css";

export interface SpecPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  inverted?: boolean;
  children: React.ReactNode;
}

export function SpecPill({ inverted = false, className, children, ...rest }: SpecPillProps) {
  const classNames = [styles.specPill, inverted ? styles.specPillInverted : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classNames} {...rest}>
      {children}
    </span>
  );
}

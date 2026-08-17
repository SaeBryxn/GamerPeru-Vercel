import React from "react";
import Link from "next/link";
import styles from "./brand-mark.module.css";

export interface BrandMarkProps {
  label?: string;
  href?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function BrandMark({
  label = "Gamer Perú",
  href = "/",
  className,
  style,
  onClick,
}: BrandMarkProps) {
  const classNames = [styles.brandMark, className].filter(Boolean).join(" ");

  return (
    <Link
      href={href}
      className={classNames}
      style={style}
      aria-label={`${label} — Inicio`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={styles.accentDot} aria-hidden="true">
        .
      </span>
    </Link>
  );
}

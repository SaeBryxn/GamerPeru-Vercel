import React from "react";
import styles from "./card.module.css";

export type CardSurface = "canvas" | "card" | "secondary" | "dark" | "dark-card";
export type CardPadding = "none" | "sm" | "md" | "lg";
export type CardElevation = "none" | "low" | "mid" | "high";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: CardSurface;
  padding?: CardPadding;
  elevation?: CardElevation;
  children: React.ReactNode;
}

export function Card({
  surface = "card",
  padding = "md",
  elevation = "none",
  className,
  children,
  ...rest
}: CardProps) {
  const surfaceClass =
    surface === "canvas"
      ? styles.canvas
      : surface === "secondary"
        ? styles.secondary
        : surface === "dark"
          ? styles.dark
          : surface === "dark-card"
            ? styles.darkCard
            : styles.cardSurface;

  const paddingClass =
    padding === "none"
      ? styles.paddingNone
      : padding === "sm"
        ? styles.paddingSm
        : padding === "lg"
          ? styles.paddingLg
          : styles.paddingMd;

  const elevationClass =
    elevation === "low"
      ? styles.elevationLow
      : elevation === "mid"
        ? styles.elevationMid
        : elevation === "high"
          ? styles.elevationHigh
          : styles.elevationNone;

  const classNames = [styles.card, surfaceClass, paddingClass, elevationClass, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames} {...rest}>
      {children}
    </div>
  );
}

import React from "react";
import styles from "./container.module.css";

export type ContainerSize = "default" | "prose" | "full" | "admin";

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: ContainerSize;
  children: React.ReactNode;
}

export function Container({ size = "default", className, children, ...rest }: ContainerProps) {
  const sizeClass =
    size === "prose"
      ? styles.prose
      : size === "full"
        ? styles.full
        : size === "admin"
          ? styles.admin
          : styles.default;

  const classNames = [styles.container, sizeClass, className].filter(Boolean).join(" ");

  return (
    <div className={classNames} {...rest}>
      {children}
    </div>
  );
}

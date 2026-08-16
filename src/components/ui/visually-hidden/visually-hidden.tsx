import React from "react";
import styles from "./visually-hidden.module.css";

export interface VisuallyHiddenProps extends React.HTMLAttributes<HTMLSpanElement> {
  as?: "span" | "div";
  children: React.ReactNode;
}

export function VisuallyHidden({
  as: Component = "span",
  className,
  children,
  ...rest
}: VisuallyHiddenProps) {
  const classNames = [styles.visuallyHidden, className].filter(Boolean).join(" ");

  return (
    <Component className={classNames} {...rest}>
      {children}
    </Component>
  );
}

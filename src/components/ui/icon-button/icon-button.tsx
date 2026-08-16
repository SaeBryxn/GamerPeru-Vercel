import React from "react";
import styles from "./icon-button.module.css";

export type IconButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  variant?: IconButtonVariant;
  children: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    "aria-label": ariaLabel,
    variant = "ghost",
    type = "button",
    disabled,
    className,
    children,
    ...rest
  },
  ref
) {
  const classNames = [styles.iconButton, styles[variant], className].filter(Boolean).join(" ");

  return (
    <button
      ref={ref}
      type={type}
      aria-label={ariaLabel}
      disabled={disabled}
      aria-disabled={disabled ? "true" : undefined}
      className={classNames}
      {...rest}
    >
      <span className={styles.glyphSlot} aria-hidden="true">
        {children}
      </span>
    </button>
  );
});

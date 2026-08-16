import React from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { Icon, type IconSize } from "../icon";
import styles from "./icon-button.module.css";

export type IconButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  variant?: IconButtonVariant;
  icon?: LucideIcon | React.ComponentType<LucideProps>;
  iconSize?: IconSize;
  children?: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    "aria-label": ariaLabel,
    variant = "ghost",
    icon,
    iconSize = "md",
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
      disabled={Boolean(disabled)}
      aria-disabled={disabled ? "true" : undefined}
      className={classNames}
      {...rest}
    >
      <span className={styles.glyphSlot} aria-hidden="true">
        {icon ? <Icon icon={icon} size={iconSize} aria-hidden="true" /> : children}
      </span>
    </button>
  );
});

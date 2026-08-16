import React from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { Icon } from "../icon";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  loading?: boolean;
  leadingIcon?: LucideIcon | React.ComponentType<LucideProps>;
  trailingIcon?: LucideIcon | React.ComponentType<LucideProps>;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    fullWidth = false,
    loading = false,
    leadingIcon,
    trailingIcon,
    type = "button",
    disabled,
    className,
    children,
    ...rest
  },
  ref
) {
  const classNames = [styles.button, styles[variant], fullWidth ? styles.fullWidth : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      disabled={Boolean(disabled ?? loading)}
      aria-busy={loading ? "true" : undefined}
      aria-disabled={(disabled ?? loading) ? "true" : undefined}
      className={classNames}
      {...rest}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : leadingIcon ? (
        <span className={styles.iconSlot} aria-hidden="true">
          <Icon icon={leadingIcon} size="md" aria-hidden="true" />
        </span>
      ) : null}

      <span>{children}</span>

      {!loading && trailingIcon ? (
        <span className={styles.iconSlot} aria-hidden="true">
          <Icon icon={trailingIcon} size="md" aria-hidden="true" />
        </span>
      ) : null}
    </button>
  );
});

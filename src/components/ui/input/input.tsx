import React from "react";
import styles from "./input.module.css";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { hasError = false, className, type = "text", ...rest },
  ref
) {
  const classNames = [styles.input, hasError ? styles.hasError : "", className]
    .filter(Boolean)
    .join(" ");

  return <input ref={ref} type={type} className={classNames} {...rest} />;
});

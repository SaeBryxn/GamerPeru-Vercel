import React, { useId } from "react";
import { Input, type InputProps } from "./input";
import styles from "./input.module.css";

export interface TextFieldProps extends Omit<InputProps, "hasError"> {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  containerClassName?: string;
  /** Keeps the label for assistive technology while the placeholder carries it visually. */
  hideLabel?: boolean;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    id: customId,
    label,
    description,
    error,
    required,
    disabled,
    containerClassName,
    hideLabel = false,
    className,
    "aria-describedby": customDescribedBy,
    ...rest
  },
  ref
) {
  const generatedId = useId();
  const inputId = customId ?? `field-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  const describedBy = [errorId, descriptionId, customDescribedBy].filter(Boolean).join(" ");

  const hasError = Boolean(error);

  return (
    <div className={[styles.container, containerClassName].filter(Boolean).join(" ")}>
      <label htmlFor={inputId} className={hideLabel ? styles.visuallyHidden : styles.label}>
        {label}
        {required && !hideLabel ? (
          <span className={styles.requiredIndicator} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div className={styles.inputWrapper}>
        <Input
          ref={ref}
          id={inputId}
          required={required}
          disabled={disabled}
          hasError={hasError}
          aria-invalid={hasError ? "true" : undefined}
          aria-describedby={describedBy || undefined}
          className={className}
          {...rest}
        />
      </div>

      {description ? (
        <div id={descriptionId} className={styles.description}>
          {description}
        </div>
      ) : null}

      {error ? (
        <div id={errorId} role="alert" className={styles.errorMessage}>
          {error}
        </div>
      ) : null}
    </div>
  );
});

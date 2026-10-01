import React, { useId } from "react";
import styles from "./inquiry-fields.module.css";

interface FieldShellProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby": string | undefined;
    className: string | undefined;
  }) => React.ReactNode;
}

/** Label, sunken control and error line, wired for assistive technology. */
function FieldShell({ label, error, required, hint, className, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {!required && <span className={styles.optional}> (opcional)</span>}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        className: error ? `${styles.control} ${styles.controlError}` : styles.control,
      })}
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

type BaseProps = { label: string; error?: string; hint?: string; className?: string };

export function InquiryInput({
  label,
  error,
  hint,
  className,
  required,
  ...rest
}: BaseProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} className={className}>
      {(control) => <input {...rest} {...control} required={required} />}
    </FieldShell>
  );
}

export function InquiryTextarea({
  label,
  error,
  hint,
  className,
  required,
  ...rest
}: BaseProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} className={className}>
      {(control) => (
        <textarea
          rows={5}
          {...rest}
          {...control}
          className={[control.className, styles.textarea].join(" ")}
          required={required}
        />
      )}
    </FieldShell>
  );
}

export function InquirySelect({
  label,
  error,
  hint,
  className,
  required,
  options,
  placeholder,
  ...rest
}: BaseProps &
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    options: readonly string[];
    placeholder: string;
  }) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} className={className}>
      {(control) => (
        <select
          defaultValue=""
          {...rest}
          {...control}
          className={[control.className, styles.select].join(" ")}
          required={required}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

/** Off-screen field people never see or fill; the server treats a filled one as automated. */
export function InquiryBotGuards() {
  return (
    <div className={styles.trap} aria-hidden="true">
      <label>
        Sitio web
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

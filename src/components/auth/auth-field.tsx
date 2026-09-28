import React from "react";
import { TextField, type TextFieldProps } from "@/components/ui/input/text-field";

/**
 * Auth forms show a placeholder instead of a visible label. The label is still rendered for
 * screen readers, and the placeholder falls back to it so each field names itself.
 */
export function AuthField({ placeholder, label, ...rest }: Omit<TextFieldProps, "hideLabel">) {
  return (
    <TextField
      {...rest}
      label={label}
      placeholder={placeholder ?? (typeof label === "string" ? label : undefined)}
      hideLabel
    />
  );
}

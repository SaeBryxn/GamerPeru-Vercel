"use client";

import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { TextField, type TextFieldProps } from "@/components/ui/input/text-field";
import styles from "./auth.module.css";

/** Auth fields keep their label visible, so the name of a field never disappears while typing. */
export function AuthField(props: Omit<TextFieldProps, "hideLabel">) {
  return <TextField {...props} />;
}

/** Password field with a toggle to check what was typed before submitting. */
export function PasswordField(props: Omit<TextFieldProps, "hideLabel" | "type" | "endAdornment">) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      endAdornment={
        <button
          type="button"
          className={styles.passwordToggle}
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-controls={props.id}
          // Short on purpose: tests and assistive tech find the field itself by "Contraseña".
          aria-label={visible ? "Ocultar" : "Mostrar"}
          title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          disabled={props.disabled}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      }
    />
  );
}

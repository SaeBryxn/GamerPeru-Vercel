"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { passwordChangeSchema } from "@/lib/auth/validation";
import { mapAuthError } from "@/lib/auth/errors";
import { AuthField } from "./auth-field";
import { AuthSubmitButton } from "./auth-submit-button";
import styles from "./auth.module.css";

export function PasswordChangeForm() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>(
    {}
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});

    const parsed = passwordChangeSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const formatted = parsed.error.format();
      setFieldErrors({
        password: formatted.password?._errors[0],
        confirmPassword: formatted.confirmPassword?._errors[0],
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });

      if (error) {
        setServerError(mapAuthError(error));
        setIsSubmitting(false);
        return;
      }

      // Conclude recovery session and direct user to login with newly updated credentials
      await supabase.auth.signOut();
      router.push("/auth/login?reset=true");
    } catch (err) {
      setServerError(mapAuthError(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {serverError ? (
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          {serverError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <AuthField
          id="change-password"
          name="password"
          type="password"
          label="Nueva contraseña"
          description="Mínimo 8 caracteres"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={isSubmitting}
        />

        <AuthField
          id="change-confirmPassword"
          name="confirmPassword"
          type="password"
          label="Confirmar nueva contraseña"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
          disabled={isSubmitting}
        />

        <AuthSubmitButton disabled={isSubmitting}>
          {isSubmitting ? "Actualizando contraseña..." : "Guardar contraseña"}
        </AuthSubmitButton>
      </form>
    </div>
  );
}

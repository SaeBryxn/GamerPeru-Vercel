"use client";

import React, { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { recoveryRequestSchema } from "@/lib/auth/validation";
import { mapAuthError } from "@/lib/auth/errors";
import { AuthField } from "./auth-field";
import { AuthSubmitButton } from "./auth-submit-button";
import styles from "./auth.module.css";

export function RecoveryRequestForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    setFieldError(undefined);

    const parsed = recoveryRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.format().email?._errors[0]);
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);

      if (error) {
        // Only surface rate-limiting errors directly; all other errors must be non-enumerating
        const msg = (error.message || "").toLowerCase();
        if (
          msg.includes("rate limit") ||
          msg.includes("too many requests") ||
          error.status === 429
        ) {
          setServerError(mapAuthError(error));
          setIsSubmitting(false);
          return;
        }
      }

      // Non-enumerating success response for both existing and unknown emails
      setIsSuccess(true);
      setIsSubmitting(false);
    } catch {
      // Non-enumerating fallback
      setIsSuccess(true);
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div>
        <div role="status" className={`${styles.alert} ${styles.alertInfo}`}>
          Si existe una cuenta asociada a <strong>{email}</strong>, recibirás un correo electrónico
          con instrucciones para restablecer tu contraseña en los próximos minutos.
        </div>

        <div className={styles.footerLinks}>
          <Link href="/auth/login" className={styles.link}>
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {serverError ? (
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          {serverError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <AuthField
          id="recovery-email"
          name="email"
          type="email"
          label="Correo electrónico"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError}
          disabled={isSubmitting}
        />

        <AuthSubmitButton disabled={isSubmitting}>
          {isSubmitting ? "Enviando instrucciones..." : "Recuperar contraseña"}
        </AuthSubmitButton>
      </form>

      <div className={styles.footerLinks}>
        <Link href="/auth/login" className={styles.link}>
          Volver a iniciar sesión
        </Link>
      </div>
    </div>
  );
}

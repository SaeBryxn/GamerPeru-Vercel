"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { loginSchema } from "@/lib/auth/validation";
import { mapAuthError } from "@/lib/auth/errors";
import { TextField } from "@/components/ui/input/text-field";
import { Button } from "@/components/ui/button";
import styles from "./auth.module.css";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isConfirmed = searchParams.get("confirmed") === "true";
  const isReset = searchParams.get("reset") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const formatted = parsed.error.format();
      setFieldErrors({
        email: formatted.email?._errors[0],
        password: formatted.password?._errors[0],
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (error) {
        setServerError(mapAuthError(error));
        setIsSubmitting(false);
        return;
      }

      if (data.session) {
        router.push("/");
        router.refresh();
      } else {
        router.push("/");
      }
    } catch (err) {
      setServerError(mapAuthError(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {isConfirmed ? (
        <div role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          Tu cuenta ha sido confirmada exitosamente. Ya puedes iniciar sesión.
        </div>
      ) : null}

      {isReset ? (
        <div role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          Tu contraseña ha sido actualizada exitosamente. Inicia sesión con tu nueva contraseña.
        </div>
      ) : null}

      {serverError ? (
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          {serverError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <TextField
          id="login-email"
          name="email"
          type="email"
          label="Correo electrónico"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={isSubmitting}
        />

        <TextField
          id="login-password"
          name="password"
          type="password"
          label="Contraseña"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={isSubmitting}
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={isSubmitting}
          className={styles.submitButton}
        >
          {isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
        </Button>
      </form>

      <div className={styles.footerLinks}>
        <Link href="/auth/olvide-password" className={styles.link}>
          ¿Olvidaste tu contraseña?
        </Link>
        <p>
          ¿No tienes una cuenta?{" "}
          <Link href="/auth/registro" className={styles.link}>
            Regístrate aquí
          </Link>
        </p>
      </div>
    </div>
  );
}

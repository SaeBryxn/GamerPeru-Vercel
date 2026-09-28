"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { loginSchema } from "@/lib/auth/validation";
import { mapAuthError } from "@/lib/auth/errors";
import { initiateGoogleOAuth } from "@/lib/auth/google-oauth";
import { TextField } from "@/components/ui/input/text-field";
import { AUTH_ITEM_VARIANTS, AUTH_LIST_VARIANTS } from "./auth-motion";
import styles from "./auth.module.css";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isConfirmed = searchParams.get("confirmed") === "true";
  const isReset = searchParams.get("reset") === "true";
  const isSignedOut = searchParams.get("signed_out") === "true";
  const hasOAuthError = searchParams.get("oauth_error") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const handleGoogleLogin = async () => {
    setServerError(null);
    setIsGoogleSubmitting(true);

    const { error } = await initiateGoogleOAuth();
    if (error) {
      setServerError(error);
      setIsGoogleSubmitting(false);
    }
  };

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
        router.push("/auth/completar-perfil");
        router.refresh();
      } else {
        router.push("/auth/completar-perfil");
      }
    } catch (err) {
      setServerError(mapAuthError(err));
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isGoogleSubmitting;
  const successMessage = isConfirmed
    ? "Tu cuenta ha sido confirmada exitosamente. Ya puedes iniciar sesión."
    : isReset
      ? "Tu contraseña ha sido actualizada exitosamente. Inicia sesión con tu nueva contraseña."
      : isSignedOut
        ? "Sesión cerrada correctamente."
        : null;
  const errorMessage =
    serverError ??
    (hasOAuthError ? "No pudimos iniciar sesión con Google. Inténtalo nuevamente." : null);

  return (
    <motion.div variants={AUTH_LIST_VARIANTS} initial="hidden" animate="visible">
      {successMessage || errorMessage ? (
        <motion.div variants={AUTH_ITEM_VARIANTS} className={styles.alerts}>
          {successMessage ? (
            <div role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
              <CheckCircle2 className={styles.alertIcon} aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          ) : null}
          {errorMessage ? (
            <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
              {errorMessage}
            </div>
          ) : null}
        </motion.div>
      ) : null}

      <motion.div variants={AUTH_ITEM_VARIANTS}>
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isBusy}
          className={styles.googleButton}
          aria-label="Continuar con Google"
        >
          <GoogleIcon className={styles.googleIcon} />
          <span>{isGoogleSubmitting ? "Conectando con Google..." : "Continuar con Google"}</span>
        </button>
      </motion.div>

      <motion.div variants={AUTH_ITEM_VARIANTS} className={styles.divider}>
        o
      </motion.div>

      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <motion.div variants={AUTH_ITEM_VARIANTS}>
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
            disabled={isBusy}
          />
        </motion.div>

        <motion.div variants={AUTH_ITEM_VARIANTS}>
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
            disabled={isBusy}
          />
        </motion.div>

        <motion.button
          type="submit"
          variants={AUTH_ITEM_VARIANTS}
          disabled={isBusy}
          className={styles.primaryButton}
          whileHover={isBusy ? undefined : { scale: 1.01 }}
          whileTap={isBusy ? undefined : { scale: 0.98 }}
        >
          {isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
        </motion.button>
      </form>

      <motion.div variants={AUTH_ITEM_VARIANTS} className={styles.footerLinks}>
        <Link href="/auth/olvide-password" className={styles.link}>
          ¿Olvidaste tu contraseña?
        </Link>
        <p>
          ¿No tienes una cuenta?{" "}
          <Link href="/auth/registro" className={styles.link}>
            Regístrate aquí
          </Link>
        </p>
      </motion.div>
    </motion.div>
  );
}

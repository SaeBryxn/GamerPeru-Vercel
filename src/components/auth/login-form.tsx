"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import { CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { loginSchema } from "@/lib/auth/validation";
import { mapAuthError } from "@/lib/auth/errors";
import { initiateGoogleOAuth } from "@/lib/auth/google-oauth";
import { AuthField } from "./auth-field";
import { AuthSubmitButton } from "./auth-submit-button";
import { AUTH_ITEM_VARIANTS, AUTH_LIST_VARIANTS } from "./auth-motion";
import { GoogleIcon } from "./google-icon";
import styles from "./auth.module.css";

/** Long enough to read the greeting; the destination is prefetched meanwhile. */
const WELCOME_PAUSE_MS = 1400;
const POST_LOGIN_PATH = "/auth/completar-perfil";

/** First name from signup metadata or the Google identity, else the email's local part. */
function greetingName(user: User): string {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const candidates = [metadata?.first_name, metadata?.given_name, metadata?.full_name];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().split(/s+/)[0] ?? candidate.trim();
    }
  }
  return user.email?.split("@")[0] ?? "";
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
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    []
  );

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

      setWelcomeName(greetingName(data.user));
      router.prefetch(POST_LOGIN_PATH);
      redirectTimer.current = setTimeout(() => {
        router.push(POST_LOGIN_PATH);
        router.refresh();
      }, WELCOME_PAUSE_MS);
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
    <>
      {/*
        Portaled to <body>: the auth column animates with a transform, which would otherwise
        make this fixed layer size itself to the column instead of the viewport.
      */}
      {welcomeName !== null
        ? createPortal(
            <motion.div
              className={styles.welcome}
              role="status"
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <motion.p
                className={styles.welcomeTitle}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              >
                {welcomeName ? `Bienvenido, ${welcomeName}` : "Bienvenido"}
              </motion.p>
              <motion.p
                className={styles.welcomeHint}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
              >
                Preparando tu cuenta…
              </motion.p>
            </motion.div>,
            document.body
          )
        : null}

      <motion.div
        variants={AUTH_LIST_VARIANTS}
        initial="hidden"
        animate="visible"
        aria-hidden={welcomeName !== null ? true : undefined}
        inert={welcomeName !== null ? true : undefined}
      >
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
            <AuthField
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
            <AuthField
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

          <AuthSubmitButton disabled={isBusy} variants={AUTH_ITEM_VARIANTS}>
            {isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
          </AuthSubmitButton>
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
    </>
  );
}

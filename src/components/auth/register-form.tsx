"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { signupSchema } from "@/lib/auth/validation";
import { mapAuthError } from "@/lib/auth/errors";
import { initiateGoogleOAuth } from "@/lib/auth/google-oauth";
import { TextField } from "@/components/ui/input/text-field";
import { Button } from "@/components/ui/button";
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

export function RegisterForm() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const handleGoogleRegister = async () => {
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

    const parsed = signupSchema.safeParse({
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      const formatted = parsed.error.format();
      setFieldErrors({
        firstName: formatted.firstName?._errors[0],
        lastName: formatted.lastName?._errors[0],
        email: formatted.email?._errors[0],
        password: formatted.password?._errors[0],
        confirmPassword: formatted.confirmPassword?._errors[0],
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: {
            first_name: parsed.data.firstName,
            last_name: parsed.data.lastName,
          },
        },
      });

      if (error) {
        setServerError(mapAuthError(error));
        setIsSubmitting(false);
        return;
      }

      if (data.user) {
        router.push("/auth/verificar");
      }
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

      <button
        type="button"
        onClick={handleGoogleRegister}
        disabled={isSubmitting || isGoogleSubmitting}
        className={styles.googleButton}
        aria-label="Continuar con Google"
      >
        <GoogleIcon className={styles.googleIcon} />
        <span>{isGoogleSubmitting ? "Conectando con Google..." : "Continuar con Google"}</span>
      </button>

      <div className={styles.divider}>o</div>

      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <div className={styles.nameRow}>
          <TextField
            id="register-firstName"
            name="firstName"
            type="text"
            label="Nombre"
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={fieldErrors.firstName}
            disabled={isSubmitting || isGoogleSubmitting}
          />

          <TextField
            id="register-lastName"
            name="lastName"
            type="text"
            label="Apellido"
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={fieldErrors.lastName}
            disabled={isSubmitting || isGoogleSubmitting}
          />
        </div>

        <TextField
          id="register-email"
          name="email"
          type="email"
          label="Correo electrónico"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={isSubmitting || isGoogleSubmitting}
        />

        <TextField
          id="register-password"
          name="password"
          type="password"
          label="Contraseña"
          description="Mínimo 8 caracteres"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={isSubmitting || isGoogleSubmitting}
        />

        <TextField
          id="register-confirmPassword"
          name="confirmPassword"
          type="password"
          label="Confirmar contraseña"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
          disabled={isSubmitting || isGoogleSubmitting}
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={isSubmitting || isGoogleSubmitting}
          className={styles.submitButton}
        >
          {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
        </Button>
      </form>

      <div className={styles.footerLinks}>
        <p>
          ¿Ya tienes una cuenta?{" "}
          <Link href="/auth/login" className={styles.link}>
            Inicia sesión aquí
          </Link>
        </p>
      </div>
    </div>
  );
}

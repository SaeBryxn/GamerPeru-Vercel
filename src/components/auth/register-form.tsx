"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { signupSchema } from "@/lib/auth/validation";
import { mapAuthError } from "@/lib/auth/errors";
import { TextField } from "@/components/ui/input/text-field";
import { Button } from "@/components/ui/button";
import styles from "./auth.module.css";

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
            disabled={isSubmitting}
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
            disabled={isSubmitting}
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
          disabled={isSubmitting}
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
          disabled={isSubmitting}
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
          disabled={isSubmitting}
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={isSubmitting}
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

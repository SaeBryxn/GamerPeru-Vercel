"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Circle } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { signupSchema } from "@/lib/auth/validation";
import { mapAuthError } from "@/lib/auth/errors";
import { initiateGoogleOAuth } from "@/lib/auth/google-oauth";
import { AuthField, PasswordField } from "./auth-field";
import { AuthSubmitButton } from "./auth-submit-button";
import { AUTH_ITEM_VARIANTS, AUTH_LIST_VARIANTS } from "./auth-motion";
import { GoogleIcon } from "./google-icon";
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

  const isBusy = isSubmitting || isGoogleSubmitting;

  return (
    <motion.div variants={AUTH_LIST_VARIANTS} initial="hidden" animate="visible">
      {serverError ? (
        <motion.div variants={AUTH_ITEM_VARIANTS} className={styles.alerts}>
          <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
            {serverError}
          </div>
        </motion.div>
      ) : null}

      <motion.div variants={AUTH_ITEM_VARIANTS}>
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
      </motion.div>

      <motion.div variants={AUTH_ITEM_VARIANTS} className={styles.divider}>
        o
      </motion.div>

      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <motion.div variants={AUTH_ITEM_VARIANTS} className={styles.nameRow}>
          <AuthField
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

          <AuthField
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
        </motion.div>

        <motion.div variants={AUTH_ITEM_VARIANTS}>
          <AuthField
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
        </motion.div>

        <motion.div variants={AUTH_ITEM_VARIANTS}>
          <PasswordField
            id="register-password"
            name="password"
            label="Contraseña"
            description={
              <ul className={styles.requirements} aria-live="polite">
                <li
                  className={`${styles.requirement} ${password.length >= 8 ? styles.requirementMet : ""}`}
                >
                  {password.length >= 8 ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Circle size={14} aria-hidden="true" />
                  )}
                  Mínimo 8 caracteres
                  {password.length >= 8 ? <span className={styles.srOnly}> (cumplido)</span> : null}
                </li>
                <li
                  className={`${styles.requirement} ${
                    password.length > 0 && password === confirmPassword ? styles.requirementMet : ""
                  }`}
                >
                  {password.length > 0 && password === confirmPassword ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Circle size={14} aria-hidden="true" />
                  )}
                  Las dos contraseñas coinciden
                </li>
              </ul>
            }
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            disabled={isSubmitting || isGoogleSubmitting}
          />
        </motion.div>

        <motion.div variants={AUTH_ITEM_VARIANTS}>
          <PasswordField
            id="register-confirmPassword"
            name="confirmPassword"
            label="Confirmar contraseña"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={fieldErrors.confirmPassword}
            disabled={isSubmitting || isGoogleSubmitting}
          />
        </motion.div>

        <motion.p variants={AUTH_ITEM_VARIANTS} className={styles.legalNote}>
          Al crear tu cuenta aceptas los{" "}
          <Link href="/legal/terminos" className={styles.link} target="_blank">
            Términos de servicio
          </Link>{" "}
          y la{" "}
          <Link href="/legal/privacidad" className={styles.link} target="_blank">
            Política de privacidad
          </Link>
          .
        </motion.p>

        <AuthSubmitButton disabled={isBusy} variants={AUTH_ITEM_VARIANTS}>
          {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
        </AuthSubmitButton>
      </form>

      <motion.div variants={AUTH_ITEM_VARIANTS} className={styles.footerLinks}>
        <p>
          ¿Ya tienes una cuenta?{" "}
          <Link href="/auth/login" className={styles.link}>
            Inicia sesión aquí
          </Link>
        </p>
      </motion.div>
    </motion.div>
  );
}

"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { verifyConfirmationOtpAction, type VerifyOtpState } from "@/lib/auth/actions";
import { AuthSubmitButton } from "./auth-submit-button";
import styles from "./auth.module.css";

export interface ConfirmFormProps {
  tokenHash: string;
  type: "email" | "recovery";
}

const initialState: VerifyOtpState = {
  success: false,
  error: null,
};

export function ConfirmForm({ tokenHash, type }: ConfirmFormProps) {
  const [state, formAction, isPending] = useActionState(verifyConfirmationOtpAction, initialState);

  const isEmail = type === "email";
  const buttonLabel = isPending
    ? "Verificando..."
    : isEmail
      ? "Confirmar mi cuenta"
      : "Continuar con recuperación";

  return (
    <div>
      {state?.error ? (
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          {state.error}
        </div>
      ) : null}

      <div className={styles.alert + " " + styles.alertInfo}>
        {isEmail
          ? "Haz clic en el botón a continuación para confirmar tu correo y activar tu cuenta."
          : "Haz clic en el botón a continuación para continuar con el restablecimiento de tu contraseña."}
      </div>

      <form action={formAction} className={styles.form}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />

        <AuthSubmitButton disabled={isPending}>{buttonLabel}</AuthSubmitButton>
      </form>

      <div className={styles.footerLinks}>
        <Link href="/auth/login" className={styles.link}>
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}

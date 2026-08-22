"use client";

import React, { useActionState } from "react";
import { signOutAction, type SignOutState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import styles from "./logout-button.module.css";

const initialState: SignOutState = {
  success: false,
  error: null,
};

export function LogoutButton() {
  const [state, formAction, isPending] = useActionState(async (prevState: SignOutState | null) => {
    return await signOutAction(prevState);
  }, initialState);

  return (
    <form action={formAction} className={styles.form}>
      {state?.error ? (
        <div role="alert" className={styles.error}>
          {state.error}
        </div>
      ) : null}
      <Button type="submit" variant="secondary" disabled={isPending} className={styles.button}>
        {isPending ? "Cerrando sesión..." : "Cerrar sesión"}
      </Button>
    </form>
  );
}

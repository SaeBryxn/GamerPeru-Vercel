"use client";

import React, { useActionState } from "react";
import { LogOut } from "lucide-react";
import { signOutAction, type SignOutState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import styles from "./logout-button.module.css";

const initialState: SignOutState = {
  success: false,
  error: null,
};

interface LogoutButtonProps {
  /**
   * `link`: a quiet destructive text action for menus. `ghost`: a compact outlined button for
   * toolbars, collapsing to its icon on phones.
   */
  appearance?: "button" | "link" | "ghost";
}

export function LogoutButton({ appearance = "button" }: LogoutButtonProps) {
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
      {appearance === "ghost" ? (
        <button
          type="submit"
          disabled={isPending}
          className={styles.ghostButton}
          aria-label="Cerrar sesión"
        >
          <LogOut size={16} aria-hidden="true" />
          <span className={styles.ghostLabel}>
            {isPending ? "Cerrando sesión..." : "Cerrar sesión"}
          </span>
        </button>
      ) : appearance === "link" ? (
        <button type="submit" disabled={isPending} className={styles.linkButton}>
          <LogOut size={16} aria-hidden="true" />
          <span>{isPending ? "Cerrando sesión..." : "Cerrar sesión"}</span>
        </button>
      ) : (
        <Button type="submit" variant="secondary" disabled={isPending} className={styles.button}>
          {isPending ? "Cerrando sesión..." : "Cerrar sesión"}
        </Button>
      )}
    </form>
  );
}

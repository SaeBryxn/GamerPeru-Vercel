"use client";
import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import styles from "./dashboard-header.module.css";

export function DashboardRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={styles.refresh}
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw size={15} aria-hidden="true" />
      {pending ? "Actualizando…" : "Actualizar datos"}
    </button>
  );
}

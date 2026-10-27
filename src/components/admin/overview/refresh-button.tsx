"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import styles from "./period-controls.module.css";

/** Re-reads the page on the server; the numbers update in place without a full reload. */
export function RefreshButton() {
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
      <RefreshCw size={16} aria-hidden="true" className={pending ? styles.spinning : undefined} />
      <span>{pending ? "Actualizando…" : "Actualizar"}</span>
    </button>
  );
}

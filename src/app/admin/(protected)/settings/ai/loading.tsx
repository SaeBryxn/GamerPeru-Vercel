import { LoaderCircle } from "lucide-react";
import styles from "@/components/admin/ai-admin.module.css";

export default function AiSettingsLoading() {
  return (
    <div className={styles.loadingState} role="status">
      <LoaderCircle className={styles.spinner} aria-hidden="true" /> Cargando configuración segura
      de IA…
    </div>
  );
}

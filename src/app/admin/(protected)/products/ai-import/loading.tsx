import { LoaderCircle } from "lucide-react";
import styles from "@/components/admin/ai-admin.module.css";

export default function AiImportLoading() {
  return (
    <div className={styles.loadingState} role="status">
      <LoaderCircle className={styles.spinner} aria-hidden="true" />
      <span>Cargando el asistente de productos…</span>
    </div>
  );
}

import type { Metadata } from "next";
import styles from "@/components/account/account.module.css";

export const metadata: Metadata = {
  title: "Programa de referidos | Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default function ReferidosPage() {
  return (
    <div className={styles.sectionStack}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Programa de referidos</h1>
        <span className={styles.badgeComingSoon}>Próximamente</span>
      </div>

      <div className={`${styles.card} ${styles.emptyState}`}>
        <p className={styles.cardText}>
          Muy pronto podrás acceder desde aquí al programa de referidos de Gamer Perú.
        </p>
      </div>
    </div>
  );
}

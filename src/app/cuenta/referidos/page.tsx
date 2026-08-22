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
    <div>
      <div className={styles.sectionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            Programa de referidos
          </h1>
          <span className={styles.badgeComingSoon}>Próximamente</span>
        </div>
      </div>

      <div className={styles.contentCard}>
        <p className={styles.teaserDesc}>
          Muy pronto podrás acceder desde aquí al programa de referidos de Gamer Perú.
        </p>
      </div>
    </div>
  );
}

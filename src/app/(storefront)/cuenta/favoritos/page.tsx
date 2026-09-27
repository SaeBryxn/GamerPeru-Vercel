import type { Metadata } from "next";
import styles from "@/components/account/account.module.css";

export const metadata: Metadata = {
  title: "Lista de favoritos | Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default function FavoritosPage() {
  return (
    <div className={styles.sectionStack}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Lista de favoritos</h1>
        <span className={styles.badgeComingSoon}>Próximamente</span>
      </div>

      <div className={`${styles.card} ${styles.emptyState}`}>
        <p className={styles.cardText}>
          Aquí podrás guardar y consultar tus productos favoritos cuando esta funcionalidad esté
          habilitada.
        </p>
      </div>
    </div>
  );
}

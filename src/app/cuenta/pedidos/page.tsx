import type { Metadata } from "next";
import styles from "@/components/account/account.module.css";

export const metadata: Metadata = {
  title: "Mis pedidos | Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default function PedidosPage() {
  return (
    <div>
      <div className={styles.sectionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            Mis pedidos
          </h1>
          <span className={styles.badgeComingSoon}>Próximamente</span>
        </div>
      </div>

      <div className={styles.contentCard}>
        <p className={styles.teaserDesc}>
          Aquí podrás consultar el estado y seguimiento de tus pedidos cuando el flujo de compra
          esté habilitado.
        </p>
      </div>
    </div>
  );
}

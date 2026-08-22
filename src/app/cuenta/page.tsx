import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomerProfile } from "@/lib/account/profile";
import { Button } from "@/components/ui/button";
import styles from "@/components/account/account.module.css";

export const dynamic = "force-dynamic";

export default async function CuentaPage() {
  const profileState = await getCurrentCustomerProfile();

  if (profileState.status === "UNAUTHENTICATED") {
    redirect("/auth/login");
  }

  if (profileState.status === "NEEDS_PROFILE_COMPLETION") {
    redirect("/auth/completar-perfil");
  }

  if (profileState.status !== "READY") {
    return null;
  }

  const profile = profileState.profile;
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const documentDisplay =
    profile.documentType && profile.documentNumber
      ? `${profile.documentType}: ${profile.documentNumber}`
      : "No registrado";
  const phoneDisplay = profile.phone ?? "No registrado";
  const emailDisplay = profile.email ?? "No registrado";

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Mi cuenta</h1>
      </div>

      <div className={styles.overviewGrid}>
        <div className={styles.contentCard}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Datos personales</h2>
            <Link href="/cuenta/perfil">
              <Button variant="secondary">Editar</Button>
            </Link>
          </div>

          <div className={styles.profileSummaryList}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Nombre completo</span>
              <span className={styles.summaryValue}>{fullName}</span>
            </div>

            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Correo de acceso</span>
              <span className={styles.summaryValue}>{emailDisplay}</span>
            </div>

            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Teléfono</span>
              <span className={styles.summaryValue}>{phoneDisplay}</span>
            </div>

            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Documento</span>
              <span className={styles.summaryValue}>{documentDisplay}</span>
            </div>
          </div>
        </div>

        <div className={styles.teaserCard}>
          <h2 className={styles.teaserTitle}>
            <span>Direcciones</span>
            <span className={styles.badgeComingSoon}>Próximamente</span>
          </h2>
          <p className={styles.teaserDesc}>
            Administra tus direcciones de entrega para compras rápidas y seguras.
          </p>
        </div>

        <div className={styles.teaserCard}>
          <h2 className={styles.teaserTitle}>
            <span>Mis pedidos</span>
            <span className={styles.badgeComingSoon}>Próximamente</span>
          </h2>
          <p className={styles.teaserDesc}>
            Consulta el estado y seguimiento de tus pedidos realizados.
          </p>
        </div>

        <div className={styles.teaserCard}>
          <h2 className={styles.teaserTitle}>
            <span>Lista de favoritos</span>
            <span className={styles.badgeComingSoon}>Próximamente</span>
          </h2>
          <p className={styles.teaserDesc}>Guarda los productos que deseas comprar más adelante.</p>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { ShieldCheck, CheckCircle, Info } from "lucide-react";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const context = await getVerifiedAuthContext();
  const email = context.status === "READY" ? context.email : null;
  const roles = context.status === "READY" ? context.roles : [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Panel de Administración</h1>
          <p className={styles.subtitle}>
            Base operativa y de autorización de Gamer Perú (GP-022).
          </p>
        </div>

        <div className={styles.userBanner}>
          <ShieldCheck className={styles.bannerIcon} aria-hidden="true" />
          <div>
            <div className={styles.bannerEmail}>{email ?? "Personal Autorizado"}</div>
            <div className={styles.bannerRoles}>
              {roles.map((r) => (
                <span key={r} className={styles.roleTag}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <CheckCircle className={styles.cardIcon} aria-hidden="true" />
            <h2 className={styles.cardTitle}>Estado de la Plataforma</h2>
          </div>
          <p className={styles.cardText}>
            La infraestructura base de autenticación, control de acceso por roles (RBAC) y
            navegación administrativa se encuentra operativa y protegida en el servidor.
          </p>
          <ul className={styles.statusList}>
            <li>Autorización criptográfica de sesión validada.</li>
            <li>Resolución estricta de permisos contra PostgreSQL.</li>
            <li>Protección contra navegación y mutaciones no autorizadas.</li>
          </ul>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <Info className={styles.cardIconInfo} aria-hidden="true" />
            <h2 className={styles.cardTitle}>Módulos en Preparación</h2>
          </div>
          <p className={styles.cardText}>
            Los módulos operativos de métricas comerciales, catálogo, pedidos, verificación de pagos
            e inventario se habilitarán progresivamente en los siguientes hitos de la hoja de ruta.
          </p>
          <ul className={styles.statusList}>
            <li>GP-023: Dashboard y Métricas Comerciales</li>
            <li>GP-024: Administración de Catálogo y Productos</li>
            <li>GP-027: Gestión de Pedidos y Envíos</li>
            <li>GP-028: Cola de Verificación de Pagos Yape / Plin</li>
            <li>GP-029: Gestión de Inventario y Recepción</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

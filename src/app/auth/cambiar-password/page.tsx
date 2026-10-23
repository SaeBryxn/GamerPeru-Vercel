import type { Metadata } from "next";
import Link from "@/components/app-link";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordChangeForm } from "@/components/auth/password-change-form";
import styles from "@/components/auth/auth.module.css";

export const metadata: Metadata = {
  title: "Cambiar contraseña | Gamer Perú",
  description: "Establece una nueva contraseña segura para tu cuenta de Gamer Perú.",
};

export default async function ChangePasswordPage() {
  const verified = await getVerifiedIdentity();

  if (!verified.success) {
    return (
      <AuthCard
        title="Sesión no válida"
        subtitle="No se encontró una sesión de recuperación activa."
      >
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          Tu sesión de recuperación ha expirado o no es válida. Por favor, solicita un nuevo enlace
          de recuperación de contraseña.
        </div>

        <div className={styles.footerLinks}>
          <Link href="/auth/olvide-password" className={styles.link}>
            Solicitar recuperación de contraseña
          </Link>
          <Link href="/auth/login" className={styles.link}>
            Volver a Iniciar sesión
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nueva contraseña" subtitle="Ingresa y confirma tu nueva contraseña de acceso.">
      <PasswordChangeForm />
    </AuthCard>
  );
}

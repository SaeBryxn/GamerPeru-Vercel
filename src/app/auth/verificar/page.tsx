import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import styles from "@/components/auth/auth.module.css";

export const metadata: Metadata = {
  title: "Revisa tu correo | Gamer Perú",
  description: "Confirma tu cuenta a través del enlace enviado a tu correo electrónico.",
};

export default function VerifyNoticePage() {
  return (
    <AuthCard title="Revisa tu correo" subtitle="Casi listo para comenzar a jugar.">
      <div role="status" className={`${styles.alert} ${styles.alertInfo}`}>
        Hemos enviado un enlace de confirmación a tu correo electrónico. Por favor, abre el enlace
        para activar tu cuenta antes de iniciar sesión.
      </div>

      <div className={styles.footerLinks}>
        <p>¿Ya confirmaste tu correo?</p>
        <Link href="/auth/login" className={styles.link}>
          Iniciar sesión
        </Link>
      </div>
    </AuthCard>
  );
}

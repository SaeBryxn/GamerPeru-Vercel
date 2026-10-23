import type { Metadata } from "next";
import Link from "@/components/app-link";
import { AuthCard } from "@/components/auth/auth-card";
import { ConfirmForm } from "@/components/auth/confirm-form";
import styles from "@/components/auth/auth.module.css";

export const metadata: Metadata = {
  title: "Confirmar verificación | Gamer Perú",
  description: "Verifica y activa tu cuenta de forma segura en Gamer Perú.",
};

interface ConfirmPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const params = await searchParams;
  const rawTokenHash = params.token_hash;
  const rawType = params.type;

  const tokenHash = typeof rawTokenHash === "string" ? rawTokenHash.trim() : "";
  const type = typeof rawType === "string" ? rawType.trim() : "";

  const isValidType = type === "email" || type === "recovery";
  const isValidPayload = Boolean(tokenHash && isValidType);

  if (!isValidPayload) {
    return (
      <AuthCard
        title="Enlace no válido"
        subtitle="No se pudo procesar la solicitud de verificación."
      >
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          El enlace de verificación está incompleto o no es válido. Por favor, solicita un nuevo
          enlace.
        </div>

        <div className={styles.footerLinks}>
          <Link href="/auth/login" className={styles.link}>
            Ir a Iniciar sesión
          </Link>
          <Link href="/auth/olvide-password" className={styles.link}>
            Solicitar recuperación de contraseña
          </Link>
        </div>
      </AuthCard>
    );
  }

  const isEmail = type === "email";

  return (
    <AuthCard
      title={isEmail ? "Confirmar cuenta" : "Recuperación de contraseña"}
      subtitle={
        isEmail
          ? "Confirma tu dirección de correo electrónico para activar tu cuenta."
          : "Continúa para restablecer tu contraseña de forma segura."
      }
    >
      <ConfirmForm tokenHash={tokenHash} type={type as "email" | "recovery"} />
    </AuthCard>
  );
}

import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { RecoveryRequestForm } from "@/components/auth/recovery-request-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña | Gamer Perú",
  description: "Solicita un enlace seguro para restablecer la contraseña de tu cuenta.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Recuperar contraseña"
      subtitle="Ingresa el correo asociado a tu cuenta para recibir las instrucciones."
    >
      <RecoveryRequestForm />
    </AuthCard>
  );
}

import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Crear cuenta | Gamer Perú",
  description:
    "Crea tu cuenta en Gamer Perú para acceder a periféricos gaming de alto rendimiento.",
};

export default function RegisterPage() {
  return (
    <AuthCard title="Crear cuenta" subtitle="Únete a la comunidad de Gamer Perú en pocos pasos.">
      <RegisterForm />
    </AuthCard>
  );
}

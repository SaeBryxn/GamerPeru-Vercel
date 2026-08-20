import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión | Gamer Perú",
  description: "Ingresa a tu cuenta de Gamer Perú para ver tus compras y gestionar tu perfil.",
};

export default function LoginPage() {
  return (
    <AuthCard title="Iniciar sesión" subtitle="Ingresa tus credenciales para acceder a Gamer Perú.">
      <Suspense fallback={<div>Cargando formulario...</div>}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}

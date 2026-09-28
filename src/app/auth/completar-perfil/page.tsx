import { redirect } from "next/navigation";
import { ensureCustomerProfile } from "@/lib/auth/profile";
import { AuthCard } from "@/components/auth/auth-card";
import { ProfileCompletionForm } from "@/components/auth/profile-completion-form";

export const dynamic = "force-dynamic";

export default async function CompletarPerfilPage() {
  const result = await ensureCustomerProfile();

  if (result.status === "UNAUTHENTICATED") {
    redirect("/auth/login");
  }

  if (result.status === "READY") {
    redirect("/");
  }

  if (result.status === "ERROR") {
    redirect("/auth/login?oauth_error=true");
  }

  return (
    <AuthCard
      title="Completa tu perfil"
      subtitle="Ingresa tu nombre y apellido para continuar en Gamer Perú."
    >
      <ProfileCompletionForm />
    </AuthCard>
  );
}

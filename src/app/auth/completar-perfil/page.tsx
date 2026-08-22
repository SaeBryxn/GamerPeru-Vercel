import { redirect } from "next/navigation";
import { ensureCustomerProfile } from "@/lib/auth/profile";
import { AuthCard } from "@/components/auth/auth-card";
import { ProfileCompletionForm } from "@/components/auth/profile-completion-form";
import styles from "@/components/auth/auth.module.css";

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
    <main className={styles.pageContainer}>
      <AuthCard
        title="Completa tu perfil"
        subtitle="Ingresa tu nombre y apellido para continuar en Gamer Perú."
      >
        <ProfileCompletionForm />
      </AuthCard>
    </main>
  );
}

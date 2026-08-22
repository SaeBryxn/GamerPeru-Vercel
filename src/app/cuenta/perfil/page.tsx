import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomerProfile } from "@/lib/account/profile";
import { toProfileFormDTO } from "@/lib/account/types";
import { ProfileForm } from "@/components/account/profile-form";
import styles from "@/components/account/account.module.css";

export const metadata: Metadata = {
  title: "Perfil | Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
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

  const formDTO = toProfileFormDTO(profileState.profile);

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Mi perfil</h1>
      </div>

      <ProfileForm initialProfile={formDTO} />
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import { LogoutButton } from "@/components/auth/logout-button";
import styles from "./cuenta.module.css";

export const metadata: Metadata = {
  title: "Mi cuenta | Gamer Perú",
  description: "Panel de administración de cuenta de usuario en Gamer Perú.",
};

export const dynamic = "force-dynamic";

export default async function CuentaPage() {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    redirect("/auth/login");
  }

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Mi cuenta</h1>
        <p className={styles.subtitle}>
          Sesión iniciada como <strong>{verified.identity.email}</strong>
        </p>
        <div className={styles.actions}>
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}

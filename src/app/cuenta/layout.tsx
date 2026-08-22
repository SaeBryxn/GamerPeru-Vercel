import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomerProfile } from "@/lib/account/profile";
import { AccountShell } from "@/components/account/account-shell";

export const metadata: Metadata = {
  title: "Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  const profileState = await getCurrentCustomerProfile();

  if (profileState.status === "UNAUTHENTICATED") {
    redirect("/auth/login");
  }

  if (profileState.status === "NEEDS_PROFILE_COMPLETION") {
    redirect("/auth/completar-perfil");
  }

  if (profileState.status === "ERROR") {
    return (
      <div style={{ maxWidth: "800px", margin: "3rem auto", padding: "0 1rem" }}>
        <h1>Error</h1>
        <p>{profileState.error}</p>
      </div>
    );
  }

  return <AccountShell profile={profileState.profile}>{children}</AccountShell>;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomerProfile } from "@/lib/account/profile";
import { getCurrentCustomerOrders } from "@/lib/account/orders";
import { AccountShell } from "@/components/account/account-shell";
import styles from "@/components/account/account.module.css";

export const metadata: Metadata = {
  title: "Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  const [profileState, ordersState] = await Promise.all([
    getCurrentCustomerProfile(),
    getCurrentCustomerOrders(),
  ]);

  if (profileState.status === "UNAUTHENTICATED") {
    redirect("/auth/login");
  }

  if (profileState.status === "NEEDS_PROFILE_COMPLETION") {
    redirect("/auth/completar-perfil");
  }

  if (profileState.status === "ERROR") {
    return (
      <main id="main-content" className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.card} role="alert">
            <h1 className={styles.title}>No pudimos abrir tu cuenta</h1>
            <p className={styles.cardText}>{profileState.error}</p>
          </div>
        </div>
      </main>
    );
  }

  // The badge is a courtesy: if orders fail to load, the account still opens without it.
  const ordersInTransit =
    ordersState.status === "READY"
      ? ordersState.orders.filter((order) => order.status.isInTransit).length
      : 0;

  return (
    <AccountShell displayEmail={profileState.profile.email} ordersInTransit={ordersInTransit}>
      {children}
    </AccountShell>
  );
}

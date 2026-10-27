import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomerProfile } from "@/lib/account/profile";
import { getCurrentCustomerOrders } from "@/lib/account/orders";
import { getVerifiedAuthContext, hasAdminShellAccess } from "@/lib/auth/rbac";
import { AccountShell } from "@/components/account/account-shell";
import styles from "@/components/account/account.module.css";
import { getCurrentCustomerAppearance } from "@/lib/account/appearance-reader";

export const metadata: Metadata = {
  title: "Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  const [profileState, ordersState, authContext] = await Promise.all([
    getCurrentCustomerProfile(),
    getCurrentCustomerOrders(),
    getVerifiedAuthContext(),
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

  // The counters are a courtesy: if orders fail to load, the account still opens without them.
  const orders = ordersState.status === "READY" ? ordersState.orders : [];
  const ordersInTransit = orders.filter((order) => order.status.isInTransit).length;
  const { appearance } = await getCurrentCustomerAppearance();

  return (
    <AccountShell
      firstName={profileState.profile.firstName || null}
      displayName={appearance.displayName}
      avatarSeed={appearance.avatarSeed}
      accent={appearance.accent}
      displayEmail={profileState.profile.email}
      memberSince={profileState.profile.createdAt}
      orderCount={orders.length}
      ordersInTransit={ordersInTransit}
      showAdminLink={hasAdminShellAccess(authContext)}
    >
      {children}
    </AccountShell>
  );
}

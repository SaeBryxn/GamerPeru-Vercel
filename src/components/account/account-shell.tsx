import React from "react";
import Link from "next/link";
import { LayoutDashboard, Package, Truck } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { AccountNavigation } from "./account-navigation";
import { AccountSection, AccountTransitionProvider } from "./account-transition";
import styles from "./account.module.css";

const MEMBER_SINCE_FORMAT = new Intl.DateTimeFormat("es-PE", {
  month: "long",
  year: "numeric",
  timeZone: "America/Lima",
});

interface AccountShellProps {
  firstName: string | null;
  displayEmail: string | null;
  memberSince: Date | null;
  orderCount: number;
  ordersInTransit: number;
  /** Staff can reach the admin from here; /admin still authorizes every request itself. */
  showAdminLink?: boolean;
  children: React.ReactNode;
}

export function AccountShell({
  firstName,
  displayEmail,
  memberSince,
  orderCount,
  ordersInTransit,
  showAdminLink = false,
  children,
}: AccountShellProps) {
  return (
    <main id="main-content" className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroIdentity}>
            <span className={styles.heroAvatar} aria-hidden="true">
              {(firstName ?? displayEmail ?? "G").charAt(0).toUpperCase()}
            </span>
            <div>
              <p className={styles.eyebrow}>Mi cuenta</p>
              <p className={styles.shellTitle}>Hola, {firstName ?? "de nuevo"}</p>
              <p className={styles.shellEmail}>
                {[
                  displayEmail,
                  memberSince && `Cliente desde ${MEMBER_SINCE_FORMAT.format(memberSince)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className={styles.heroAside}>
            <dl className={styles.heroStats}>
              <div className={styles.heroStat}>
                <dt>
                  <Package size={14} aria-hidden="true" />
                  Pedidos
                </dt>
                <dd>{orderCount}</dd>
              </div>
              <div
                className={`${styles.heroStat} ${ordersInTransit > 0 ? styles.heroStatLive : ""}`}
              >
                <dt>
                  <Truck size={14} aria-hidden="true" />
                  En camino
                </dt>
                <dd>{ordersInTransit}</dd>
              </div>
            </dl>
            <div className={styles.shellActions}>
              {showAdminLink ? (
                <Link href="/admin" className={styles.adminLink} data-testid="account-admin-link">
                  <LayoutDashboard className={styles.adminLinkIcon} aria-hidden="true" />
                  Ir al panel de administración
                </Link>
              ) : null}
              <div className={styles.mobileLogout}>
                <LogoutButton appearance="link" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <AccountTransitionProvider>
          <div className={styles.layout}>
            <AccountNavigation ordersInTransit={ordersInTransit} />
            <div className={styles.content}>
              <AccountSection>{children}</AccountSection>
            </div>
          </div>
        </AccountTransitionProvider>
      </div>
    </main>
  );
}

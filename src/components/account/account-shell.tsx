import React from "react";
import Link from "@/components/app-link";
import { LayoutDashboard, Package, Truck } from "lucide-react";
import { Blobatar } from "@blobatar/react";
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
  displayName?: string;
  avatarSeed?: string;
  accent?: "red" | "neutral";
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
  displayName,
  avatarSeed,
  accent = "red",
  displayEmail,
  memberSince,
  orderCount,
  ordersInTransit,
  showAdminLink = false,
  children,
}: AccountShellProps) {
  const greeting = displayName?.trim() ? displayName : (firstName ?? "de nuevo");
  const avatarName = avatarSeed?.trim() ? avatarSeed : (displayEmail ?? firstName ?? "cliente");
  return (
    <main id="main-content" className={styles.page}>
      <header className={styles.hero} data-accent={accent}>
        <div className={styles.heroInner}>
          <div className={styles.heroIdentity}>
            {/* Personal choice first; the existing stable seed remains the default. */}
            <span className={styles.heroAvatar} aria-hidden="true">
              <Blobatar name={avatarName} size={64} alt="" className={styles.heroAvatarImage} />
            </span>
            <div>
              <p className={styles.eyebrow}>Mi cuenta</p>
              <p className={styles.shellTitle}>Hola, {greeting}</p>
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

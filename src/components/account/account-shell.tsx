import React from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { AccountNavigation } from "./account-navigation";
import { AccountSection, AccountTransitionProvider } from "./account-transition";
import styles from "./account.module.css";

interface AccountShellProps {
  displayEmail: string | null;
  ordersInTransit: number;
  children: React.ReactNode;
}

export function AccountShell({ displayEmail, ordersInTransit, children }: AccountShellProps) {
  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.shellHeader}>
          <div>
            <p className={styles.eyebrow}>Gamer Perú</p>
            <p className={styles.shellTitle}>Mi cuenta</p>
            {displayEmail ? <p className={styles.shellEmail}>{displayEmail}</p> : null}
          </div>
          <div className={styles.mobileLogout}>
            <LogoutButton appearance="link" />
          </div>
        </header>

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

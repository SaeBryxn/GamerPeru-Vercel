import React from "react";
import { AccountNavigation } from "./account-navigation";
import styles from "./account.module.css";

interface AccountShellProps {
  displayName: string;
  displayEmail: string | null;
  children: React.ReactNode;
}

export function AccountShell({ displayName, displayEmail, children }: AccountShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.userMeta}>
          <span>Hola,</span>
          <span className={styles.userName}>{displayName || "Cliente"}</span>
          {displayEmail ? <span className={styles.userEmail}>({displayEmail})</span> : null}
        </div>
      </header>

      <div className={styles.layoutGrid}>
        <aside>
          <AccountNavigation />
        </aside>

        <main className={styles.mainContent}>
          <div className={styles.contentCard}>{children}</div>
        </main>
      </div>
    </div>
  );
}

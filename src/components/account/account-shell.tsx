import React from "react";
import type { CustomerProfileView } from "@/lib/account/types";
import { AccountNavigation } from "./account-navigation";
import styles from "./account.module.css";

interface AccountShellProps {
  profile: CustomerProfileView;
  children: React.ReactNode;
}

export function AccountShell({ profile, children }: AccountShellProps) {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.userMeta}>
          <span>Hola,</span>
          <span className={styles.userName}>{fullName || "Cliente"}</span>
          <span className={styles.userEmail}>({profile.email})</span>
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

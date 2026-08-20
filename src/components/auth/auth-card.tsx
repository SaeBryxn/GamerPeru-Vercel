import React from "react";
import styles from "./auth.module.css";

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <main className={styles.pageContainer}>
      <div className={styles.authCard}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </header>

        {children}

        {footer ? <div className={styles.footerLinks}>{footer}</div> : null}
      </div>
    </main>
  );
}

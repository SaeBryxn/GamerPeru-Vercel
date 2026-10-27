import React from "react";
import styles from "./page-header.module.css";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Controls on the right: period selector, refresh, the screen's main action. */
  actions?: React.ReactNode;
}

/** Title, one line of context and the screen's controls, the same on every admin screen. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className={styles.root}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

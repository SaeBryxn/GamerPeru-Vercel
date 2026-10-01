import React from "react";
import { TrustStrip } from "@/components/home/trust-strip/trust-strip";
import { SUPPORT_TRUST_ITEMS } from "@/content/support/trust";
import { PageHero, type PageHeroProps } from "./page-hero";
import styles from "./support-shell.module.css";

export interface SupportShellProps {
  hero: PageHeroProps;
  /** Sticky side column (about 30% on desktop); stacks after the content on mobile. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Page frame for support and legal pages: a wide container with the massive left-aligned
 * header, the content beside an optional sticky column, and the trust band before the footer.
 */
export function SupportShell({ hero, aside, children }: SupportShellProps) {
  return (
    <main id="main-content">
      <div className={styles.container}>
        <PageHero {...hero} />
        {aside ? (
          <div className={styles.asymmetric}>
            <div className={styles.content}>{children}</div>
            <aside className={styles.aside}>{aside}</aside>
          </div>
        ) : (
          children
        )}
      </div>
      <TrustStrip items={SUPPORT_TRUST_ITEMS} />
    </main>
  );
}

/** Sticky side card: a short heading, a line of context and its content (usually a form). */
export function SupportAsideCard({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.asideCard}>
      <h2 className={styles.asideTitle}>{title}</h2>
      <p className={styles.asideText}>{text}</p>
      {children}
    </div>
  );
}

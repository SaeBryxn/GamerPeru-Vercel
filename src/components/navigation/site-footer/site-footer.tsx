import React from "react";
import Link from "@/components/app-link";
import { BrandGlyph, Container } from "@/components/ui";
import { LEGAL_ENTITY_NAME, LEGAL_LINKS } from "@/config/legal-links";
import { ACTIVE_SOCIAL_LINKS } from "@/config/social-links";
import { BrandMark } from "../brand-mark";
import type { FooterColumn } from "../types";
import styles from "./site-footer.module.css";

export interface SiteFooterProps {
  columns?: FooterColumn[];
  className?: string;
}

/** Payment methods the store accepts, drawn as brand-colored badges. */
const PAYMENT_METHODS = [
  { id: "yape", label: "Yape" },
  { id: "plin", label: "Plin" },
] as const;

/**
 * Dark footer: brand and social profiles on the left, link columns beside it, and a bottom bar
 * with the legal line on the left and accepted payment methods on the right. A red glow fades
 * down from the top edge.
 */
export function SiteFooter({ columns = [], className }: SiteFooterProps) {
  const classNames = [styles.siteFooter, className].filter(Boolean).join(" ");

  return (
    <footer className={classNames} aria-label="Pie de página">
      <Container size="full">
        <div className={styles.footerGrid}>
          <div className={styles.brandColumn}>
            <BrandMark style={{ color: "var(--color-text-dark-primary)" }} />

            <ul className={styles.socialList} aria-label="Redes sociales de Gamer Perú">
              {ACTIVE_SOCIAL_LINKS.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.href}
                    className={styles.socialLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${link.label} de Gamer Perú`}
                  >
                    <BrandGlyph id={link.id} size={18} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {columns.map((column) => (
            <nav key={column.title} className={styles.footerColumn} aria-label={column.title}>
              <h3 className={styles.columnTitle}>{column.title}</h3>
              <ul className={styles.linkList}>
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={styles.footerLink}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className={styles.bottomBar}>
          <div className={styles.legal}>
            <p className={styles.copyright}>{`© 2026 ${LEGAL_ENTITY_NAME}`}</p>
            <ul className={styles.legalList} aria-label="Información legal">
              {LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  {link.href ? (
                    <Link href={link.href} className={styles.legalLink}>
                      {link.label}
                    </Link>
                  ) : (
                    <span className={styles.legalPending}>{link.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.payments}>
            <span className={styles.paymentsLabel}>Pagos en soles</span>
            <ul className={styles.paymentList} aria-label="Métodos de pago aceptados">
              {PAYMENT_METHODS.map((method) => (
                <li key={method.id} className={styles.paymentBadge} data-method={method.id}>
                  {method.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </footer>
  );
}

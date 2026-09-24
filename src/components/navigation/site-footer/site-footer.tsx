import React from "react";
import Link from "next/link";
import { BrandGlyph, Container } from "@/components/ui";
import { SOCIAL_LINKS } from "@/config/social-links";
import { BrandMark } from "../brand-mark";
import type { FooterColumn } from "../types";
import styles from "./site-footer.module.css";

export interface SiteFooterProps {
  columns?: FooterColumn[];
  className?: string;
}

/** Dark footer: brand and social profiles on the left, link columns beside it. */
export function SiteFooter({ columns = [], className }: SiteFooterProps) {
  const classNames = [styles.siteFooter, className].filter(Boolean).join(" ");

  return (
    <footer className={classNames} aria-label="Pie de página">
      <Container size="full">
        <div className={styles.footerGrid}>
          <div className={styles.brandColumn}>
            <BrandMark style={{ color: "var(--color-text-dark-primary)" }} />

            {/* Profiles without a configured URL stay visible but inert. */}
            <ul className={styles.socialList} aria-label="Redes sociales de Gamer Perú">
              {SOCIAL_LINKS.map((link) =>
                link.href ? (
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
                ) : (
                  <li key={link.id} aria-hidden="true">
                    <span className={`${styles.socialLink} ${styles.socialLinkPending}`}>
                      <BrandGlyph id={link.id} size={18} />
                    </span>
                  </li>
                )
              )}
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
          <span>© 2026 Gamer Perú. Todos los derechos reservados.</span>
          <span className={styles.paymentNote}>
            Pagos con <strong className={styles.paymentBadge}>YAPE</strong> o{" "}
            <strong className={styles.paymentBadge}>PLIN</strong> en soles (PEN / S/).
          </span>
        </div>
      </Container>
    </footer>
  );
}

import React from "react";
import Link from "next/link";
import { Container } from "@/components/ui";
import { BrandMark } from "../brand-mark";
import type { FooterColumn } from "../types";
import styles from "./site-footer.module.css";

export interface SiteFooterProps {
  columns?: FooterColumn[];
  className?: string;
}

export function SiteFooter({ columns = [], className }: SiteFooterProps) {
  const classNames = [styles.siteFooter, className].filter(Boolean).join(" ");

  return (
    <footer className={classNames} aria-label="Pie de página">
      <Container size="default">
        <div className={styles.footerGrid}>
          {/* Column 1: Brand Story */}
          <div className={styles.footerColumn}>
            <BrandMark style={{ color: "var(--color-text-dark-primary)" }} />
            <p className={styles.brandDescription}>
              Plataforma peruana multimarca especializada en periféricos y equipamiento para gaming
              de alto rendimiento y esports.
            </p>
          </div>

          {/* Column 2 & 3: Dynamic Footer Navigation Columns (Catalog & Customer Support) */}
          {columns.map((column, idx) => (
            <div key={idx} className={styles.footerColumn}>
              <h3 className={styles.columnTitle}>{column.title}</h3>
              <ul className={styles.linkList}>
                {column.links.map((link, linkIdx) => (
                  <li key={linkIdx}>
                    <Link href={link.href} className={styles.footerLink}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Column 4: Payment & Trust Information */}
          <div className={styles.footerColumn}>
            <h3 className={styles.columnTitle}>Métodos de Pago</h3>
            <div className={styles.paymentSection}>
              <div className={styles.paymentBadges} aria-label="Métodos de pago aceptados">
                <span className={styles.paymentBadge}>YAPE</span>
                <span className={styles.paymentBadge}>PLIN</span>
              </div>
              <p className={styles.trustNote}>Pagos en moneda nacional (PEN / S/).</p>
            </div>
          </div>
        </div>

        {/* Bottom Sub-bar */}
        <div className={styles.bottomBar}>
          <span>© 2026 Gamer Perú. Todos los derechos reservados.</span>
          <span>Periféricos de Alto Rendimiento · Perú</span>
        </div>
      </Container>
    </footer>
  );
}

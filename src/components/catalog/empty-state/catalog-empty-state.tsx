import React from "react";
import Link from "@/components/app-link";
import styles from "./catalog-empty-state.module.css";

export interface CatalogEmptyStateProps {
  title?: string;
  message?: string;
  ctaText?: string;
  ctaHref?: string;
}

/**
 * CatalogEmptyState Component
 *
 * Renders a premium, truthful empty-state well when an authoritative published
 * category or brand contains 0 matching published products.
 */
export function CatalogEmptyState({
  title = "Próximamente en Gamer Perú",
  message = "Estamos preparando el catálogo para esta sección.",
  ctaText = "Ver categorías",
  ctaHref = "/#categorias",
}: CatalogEmptyStateProps): React.JSX.Element {
  return (
    <div className={styles.container} data-testid="catalog-empty-state" role="status">
      <div className={styles.iconWrapper} aria-hidden="true">
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      </div>

      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>

      <Link href={ctaHref} className={styles.cta}>
        {ctaText}
      </Link>
    </div>
  );
}

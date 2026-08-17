import React from "react";
import Link from "next/link";
import styles from "./discovery-header.module.css";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface DiscoveryHeaderProps {
  title: string;
  description?: string | null;
  breadcrumbs: BreadcrumbItem[];
  totalProducts: number;
  unsupportedFilterNotice?: boolean;
}

/**
 * Format grammatical product count string in Spanish.
 */
function formatProductCount(count: number): string {
  if (count === 1) {
    return "1 producto";
  }
  return `${count} productos`;
}

/**
 * DiscoveryHeader Component
 *
 * Editorial collection header rendering semantic H1, breadcrumb trail,
 * product count, and truthful notice if unsupported future filter parameters exist.
 */
export function DiscoveryHeader({
  title,
  description,
  breadcrumbs,
  totalProducts,
  unsupportedFilterNotice = false,
}: DiscoveryHeaderProps): React.JSX.Element {
  return (
    <header className={styles.header}>
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className={styles.breadcrumb}>
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <li key={crumb.label} className={styles.breadcrumbItem}>
                  {crumb.href && !isLast ? (
                    <Link href={crumb.href} className={styles.breadcrumbLink}>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={styles.breadcrumbCurrent}
                      aria-current={isLast ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && <span className={styles.breadcrumbSeparator}>/</span>}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <h1 className={styles.title}>{title}</h1>

      {description && <p className={styles.description}>{description}</p>}

      {unsupportedFilterNotice && (
        <div className={styles.unsupportedNotice} role="status">
          <span>
            Este filtro aún no está disponible. Mostrando todos los productos de esta categoría.
          </span>
        </div>
      )}

      <div className={styles.toolbar}>
        <span className={styles.productCount} data-testid="product-count">
          {formatProductCount(totalProducts)}
        </span>
      </div>
    </header>
  );
}

import React from "react";
import Link from "@/components/app-link";
import styles from "./pagination.module.css";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl?: string;
  basePath?: string;
  getPageUrl?: (page: number) => string;
}

export function getPaginationPageItems(
  currentPage: number,
  totalPages: number
): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: Math.max(0, totalPages) }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
}

export function Pagination({
  currentPage,
  totalPages,
  baseUrl,
  basePath,
  getPageUrl,
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const effectiveBaseUrl = baseUrl ?? basePath ?? "";

  const buildPageUrl = (page: number) => {
    if (getPageUrl) {
      return getPageUrl(page);
    }
    if (page <= 1) {
      return effectiveBaseUrl;
    }
    const separator = effectiveBaseUrl.includes("?") ? "&" : "?";
    return `${effectiveBaseUrl}${separator}page=${page}`;
  };

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;
  const pageItems = getPaginationPageItems(currentPage, totalPages);

  return (
    <nav className={styles.nav} aria-label="Paginación del catálogo" data-testid="pagination">
      <ul className={styles.list}>
        <li className={styles.item}>
          {hasPrev ? (
            <Link
              href={buildPageUrl(currentPage - 1)}
              className={styles.link}
              aria-label="Página anterior"
            >
              Anterior
            </Link>
          ) : (
            <span className={styles.disabledLink} aria-disabled="true">
              Anterior
            </span>
          )}
        </li>

        {pageItems.map((item, index) => {
          if (item === "ellipsis") {
            return (
              <li key={`ellipsis-${index}`} className={styles.item}>
                <span className={styles.ellipsis} aria-hidden="true">
                  &hellip;
                </span>
              </li>
            );
          }

          const isCurrent = item === currentPage;
          return (
            <li key={`page-${item}`} className={styles.item}>
              {isCurrent ? (
                <span
                  className={`${styles.link} ${styles.current}`}
                  aria-current="page"
                  aria-label={`Página ${item}, página actual`}
                >
                  {item}
                </span>
              ) : (
                <Link
                  href={buildPageUrl(item)}
                  className={styles.link}
                  aria-label={`Ir a página ${item}`}
                >
                  {item}
                </Link>
              )}
            </li>
          );
        })}

        <li className={styles.item}>
          {hasNext ? (
            <Link
              href={buildPageUrl(currentPage + 1)}
              className={styles.link}
              aria-label="Página siguiente"
            >
              Siguiente
            </Link>
          ) : (
            <span className={styles.disabledLink} aria-disabled="true">
              Siguiente
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}

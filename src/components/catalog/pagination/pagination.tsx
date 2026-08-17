import React from "react";
import Link from "next/link";
import styles from "./pagination.module.css";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl?: string;
  basePath?: string;
}

/**
 * Computes a deterministic bounded list of page numbers and ellipsis markers.
 * Max items returned is at most 7 for any totalPages count.
 */
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

/**
 * Gamer Perú — Accessible Bounded Catalog Pagination Component
 *
 * Renders crawlable links with compact windowed pagination for large catalogs.
 *
 * Invariants:
 * 1. Base URL represents page 1 (canonical clean URL).
 * 2. Subsequent pages render `?page=N`.
 * 3. Previous/Next buttons use disabled spans when at boundaries.
 * 4. Current page uses `aria-current="page"`.
 * 5. Ellipsis separators use `aria-hidden="true"` and are non-interactive.
 * 6. Minimum 44x44px interaction targets on all interactive controls.
 */
export function Pagination({ currentPage, totalPages, baseUrl, basePath }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const effectiveBaseUrl = baseUrl ?? basePath ?? "";

  const buildPageUrl = (page: number) => {
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
                  …
                </span>
              </li>
            );
          }

          const pageNum = item;
          const isCurrent = pageNum === currentPage;

          return (
            <li key={pageNum} className={styles.item}>
              {isCurrent ? (
                <span
                  className={styles.currentPage}
                  aria-current="page"
                  aria-label={`Página actual, página ${pageNum}`}
                >
                  {pageNum}
                </span>
              ) : (
                <Link
                  href={buildPageUrl(pageNum)}
                  className={styles.pageLink}
                  aria-label={`Ir a página ${pageNum}`}
                >
                  {pageNum}
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

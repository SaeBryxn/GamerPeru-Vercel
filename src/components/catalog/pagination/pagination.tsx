import React from "react";
import Link from "next/link";
import styles from "./pagination.module.css";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
}

function buildPageUrl(basePath: string, page: number): string {
  if (page <= 1) {
    return basePath;
  }
  return `${basePath}?page=${page}`;
}

/**
 * Server-rendered, accessible discovery pagination component.
 */
export function Pagination({
  currentPage,
  totalPages,
  basePath,
}: PaginationProps): React.JSX.Element | null {
  if (totalPages <= 1) {
    return null;
  }

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  // Generate compact page number array
  const pages: number[] = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(i);
  }

  return (
    <nav aria-label="Paginación" className={styles.nav} data-testid="pagination">
      <ul className={styles.list}>
        {/* Previous Button */}
        <li className={styles.item}>
          {hasPrev ? (
            <Link
              href={buildPageUrl(basePath, currentPage - 1)}
              className={styles.link}
              aria-label="Ir a la página anterior"
            >
              Anterior
            </Link>
          ) : (
            <span className={styles.disabledLink} aria-disabled="true">
              Anterior
            </span>
          )}
        </li>

        {/* Page Numbers */}
        {pages.map((p) => {
          const isCurrent = p === currentPage;
          return (
            <li key={p} className={styles.item}>
              {isCurrent ? (
                <span
                  className={styles.currentPage}
                  aria-current="page"
                  aria-label={`Página ${p}, página actual`}
                >
                  {p}
                </span>
              ) : (
                <Link
                  href={buildPageUrl(basePath, p)}
                  className={styles.pageLink}
                  aria-label={`Ir a la página ${p}`}
                >
                  {p}
                </Link>
              )}
            </li>
          );
        })}

        {/* Next Button */}
        <li className={styles.item}>
          {hasNext ? (
            <Link
              href={buildPageUrl(basePath, currentPage + 1)}
              className={styles.link}
              aria-label="Ir a la página siguiente"
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

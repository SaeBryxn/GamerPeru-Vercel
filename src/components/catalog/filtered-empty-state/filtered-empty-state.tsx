import React from "react";
import Link from "next/link";
import { FilterX } from "lucide-react";
import styles from "./filtered-empty-state.module.css";

export interface FilteredEmptyStateProps {
  clearHref: string;
}

export function FilteredEmptyState({ clearHref }: FilteredEmptyStateProps) {
  return (
    <div className={styles.container} data-testid="filtered-empty-state">
      <div className={styles.iconWrapper} aria-hidden="true">
        <FilterX size={28} />
      </div>
      <h2 className={styles.title}>No encontramos productos con estos filtros.</h2>
      <p className={styles.description}>
        Prueba ajustando o limpiando los filtros seleccionados para ver más resultados del catálogo.
      </p>
      <div className={styles.actions}>
        <Link
          href={clearHref}
          className={styles.primaryAction}
          data-testid="filtered-empty-clear-button"
        >
          Limpiar filtros
        </Link>
      </div>
    </div>
  );
}

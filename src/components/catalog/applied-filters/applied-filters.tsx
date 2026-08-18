"use client";

import React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { AppliedFilterChip } from "@/lib/discovery-filters/types";
import styles from "./applied-filters.module.css";

export interface AppliedFiltersProps {
  chips: AppliedFilterChip[];
  clearAllHref: string;
}

export function AppliedFilters({ chips, clearAllHref }: AppliedFiltersProps) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className={styles.container} aria-label="Filtros aplicados">
      {chips.map((chip) => (
        <div key={chip.id} className={styles.chip}>
          <span>{chip.label}</span>
          <Link
            href={chip.removeHref}
            className={styles.removeButton}
            aria-label={`Quitar ${chip.label}`}
            data-testid={`remove-filter-${chip.id}`}
          >
            <X size={14} aria-hidden="true" />
          </Link>
        </div>
      ))}

      {chips.length > 1 && (
        <Link
          href={clearAllHref}
          className={styles.clearAllLink}
          data-testid="clear-all-filters-link"
        >
          Limpiar todos
        </Link>
      )}
    </div>
  );
}

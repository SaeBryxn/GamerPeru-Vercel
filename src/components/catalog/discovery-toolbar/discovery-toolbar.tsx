"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { DomeButton, Icon, VisuallyHidden } from "@/components/ui";
import { serializeDiscoveryUrl } from "@/lib/discovery-filters/url";
import type {
  DiscoveryFilterState,
  DiscoverySort,
  DiscoverySurface,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";
import { SortDropdown } from "../sort-dropdown/sort-dropdown";
import styles from "./discovery-toolbar.module.css";

export interface DiscoveryToolbarProps {
  basePath: string;
  totalProducts: number;
  filterState: DiscoveryFilterState;
  surface: DiscoverySurface;
  validatedSchema: ValidatedSpecificationSchema | null;
  searchQuery?: string;
  onOpenFilterDrawer: () => void;
}

export function DiscoveryToolbar({
  basePath,
  totalProducts,
  filterState,
  surface,
  validatedSchema,
  searchQuery,
  onOpenFilterDrawer,
}: DiscoveryToolbarProps) {
  const router = useRouter();

  // Count active filters (brands, categories, price, technical fields)
  let activeFiltersCount = 0;
  activeFiltersCount += filterState.brands.length;
  activeFiltersCount += filterState.categories.length;
  if (filterState.price.minCents !== null || filterState.price.maxCents !== null) {
    activeFiltersCount += 1;
  }
  activeFiltersCount += Object.keys(filterState.technical).length;

  const countText =
    surface === "search" && searchQuery
      ? `${totalProducts} ${totalProducts === 1 ? "resultado" : "resultados"}`
      : `${totalProducts} ${totalProducts === 1 ? "producto" : "productos"}`;

  const handleSortChange = (nextSort: DiscoverySort) => {
    const nextState: DiscoveryFilterState = {
      ...filterState,
      sort: nextSort,
      page: 1, // changing sort resets page to 1
    };

    const targetUrl = serializeDiscoveryUrl(basePath, nextState, surface, validatedSchema, {
      searchQuery,
    });
    router.push(targetUrl);
  };

  return (
    <section className={styles.toolbar} aria-label="Herramientas de catálogo">
      <div className={styles.leftGroup}>
        <DomeButton
          tone="light"
          className={styles.filterButton}
          onClick={onOpenFilterDrawer}
          aria-label={
            activeFiltersCount > 0
              ? `Mostrar filtros (${activeFiltersCount} aplicados)`
              : "Mostrar filtros"
          }
          data-testid="filter-launcher-button"
        >
          <Icon icon={SlidersHorizontal} size="sm" aria-hidden="true" />
          <span>Mostrar filtros</span>
          {activeFiltersCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {activeFiltersCount}
            </span>
          )}
        </DomeButton>

        {/* The page header shows the count; this keeps changes announced. */}
        <VisuallyHidden aria-live="polite">{countText}</VisuallyHidden>
      </div>

      <SortDropdown
        surface={surface}
        value={filterState.sort}
        onChange={handleSortChange}
        hasQuery={Boolean(searchQuery)}
      />
    </section>
  );
}

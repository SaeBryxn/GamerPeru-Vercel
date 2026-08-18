"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { serializeDiscoveryUrl } from "@/lib/discovery-filters/url";
import type {
  DiscoveryFilterState,
  DiscoverySort,
  DiscoverySurface,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";
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
    surface === "search"
      ? `${totalProducts} ${totalProducts === 1 ? "resultado" : "resultados"}`
      : `${totalProducts} ${totalProducts === 1 ? "producto" : "productos"}`;

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSort = (e.target.value === "" ? null : e.target.value) as DiscoverySort;
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

  const currentSortValue = filterState.sort ?? "";

  return (
    <section className={styles.toolbar} aria-label="Herramientas de catálogo">
      <div className={styles.leftGroup}>
        <button
          type="button"
          onClick={onOpenFilterDrawer}
          className={styles.filterButton}
          aria-label={
            activeFiltersCount > 0
              ? `Abrir filtros (${activeFiltersCount} filtros aplicados)`
              : "Abrir filtros"
          }
          data-testid="filter-launcher-button"
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          <span>Filtros</span>
          {activeFiltersCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {activeFiltersCount}
            </span>
          )}
        </button>

        <span className={styles.resultCount} aria-live="polite">
          {countText}
        </span>
      </div>

      <div className={styles.rightGroup}>
        <label htmlFor="catalog-sort-select" className={styles.sortLabel}>
          Ordenar por:
        </label>
        <div className={styles.sortSelectWrapper}>
          <select
            id="catalog-sort-select"
            value={currentSortValue}
            onChange={handleSortChange}
            className={styles.sortSelect}
            aria-label="Ordenar productos"
            data-testid="catalog-sort-select"
          >
            {surface === "search" ? (
              <>
                <option value="">Más relevantes</option>
                <option value="recientes">Más recientes</option>
              </>
            ) : (
              <option value="">Más recientes</option>
            )}
            <option value="precio-menor">Precio: menor a mayor</option>
            <option value="precio-mayor">Precio: mayor a menor</option>
            <option value="nombre-asc">Nombre: A a Z</option>
            <option value="nombre-desc">Nombre: Z a A</option>
          </select>
        </div>
      </div>
    </section>
  );
}

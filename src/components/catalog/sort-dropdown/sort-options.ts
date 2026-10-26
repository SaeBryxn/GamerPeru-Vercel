import type { DiscoverySort, DiscoverySurface } from "@/lib/discovery-filters/types";

export interface SortOption {
  value: DiscoverySort;
  label: string;
}

const SHARED_SORT_OPTIONS: SortOption[] = [
  { value: "nombre-asc", label: "Alfabéticamente, A-Z" },
  { value: "nombre-desc", label: "Alfabéticamente, Z-A" },
  { value: "precio-menor", label: "Precio, menor a mayor" },
  { value: "precio-mayor", label: "Precio, mayor a menor" },
];

/**
 * Sort choices the catalog readers actually implement. The default (null)
 * means relevance on a typed search and the storefront's default ordering
 * elsewhere, including the full catalog listing (search surface, no query).
 */
export function getSortOptions(surface: DiscoverySurface, hasQuery = true): SortOption[] {
  if (surface === "search" && hasQuery) {
    return [
      { value: null, label: "Más relevantes" },
      ...SHARED_SORT_OPTIONS,
      { value: "recientes", label: "Fecha, más recientes" },
    ];
  }
  return [{ value: null, label: "Destacados" }, ...SHARED_SORT_OPTIONS];
}

export function getSortLabel(
  surface: DiscoverySurface,
  sort: DiscoverySort,
  hasQuery = true
): string {
  const options = getSortOptions(surface, hasQuery);
  return (options.find((option) => option.value === sort) ?? options[0])?.label ?? "";
}

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
 * means relevance on search and the storefront's default ordering elsewhere.
 */
export function getSortOptions(surface: DiscoverySurface): SortOption[] {
  if (surface === "search") {
    return [
      { value: null, label: "Más relevantes" },
      ...SHARED_SORT_OPTIONS,
      { value: "recientes", label: "Fecha, más recientes" },
    ];
  }
  return [{ value: null, label: "Destacados" }, ...SHARED_SORT_OPTIONS];
}

export function getSortLabel(surface: DiscoverySurface, sort: DiscoverySort): string {
  const options = getSortOptions(surface);
  return (options.find((option) => option.value === sort) ?? options[0])?.label ?? "";
}

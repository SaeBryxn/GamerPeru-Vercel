"use client";

import React, { useState } from "react";
import type {
  AppliedFilterChip,
  DiscoveryFacets,
  DiscoveryFilterState,
  DiscoverySurface,
} from "@/lib/discovery-filters/types";
import { AppliedFilters } from "../applied-filters/applied-filters";
import { DiscoveryToolbar } from "../discovery-toolbar/discovery-toolbar";
import { FilterDrawer } from "../filter-drawer/filter-drawer";

export interface DiscoveryShellProps {
  basePath: string;
  totalProducts: number;
  filterState: DiscoveryFilterState;
  facets: DiscoveryFacets;
  surface: DiscoverySurface;
  searchQuery?: string;
  appliedChips: AppliedFilterChip[];
  clearAllHref: string;
}

export function DiscoveryShell({
  basePath,
  totalProducts,
  filterState,
  facets,
  surface,
  searchQuery,
  appliedChips,
  clearAllHref,
}: DiscoveryShellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <DiscoveryToolbar
        basePath={basePath}
        totalProducts={totalProducts}
        filterState={filterState}
        surface={surface}
        validatedSchema={facets.technicalSchema}
        searchQuery={searchQuery}
        onOpenFilterDrawer={() => setIsDrawerOpen(true)}
      />

      <AppliedFilters chips={appliedChips} clearAllHref={clearAllHref} />

      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        basePath={basePath}
        filterState={filterState}
        facets={facets}
        surface={surface}
        searchQuery={searchQuery}
      />
    </>
  );
}

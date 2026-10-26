import React from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  CatalogEmptyState,
  DiscoveryHeader,
  DiscoveryShell,
  FilteredEmptyState,
  Pagination,
  ProductGrid,
} from "@/components/catalog";
import styles from "@/components/catalog/catalog-page.module.css";
import {
  getCachedCatalogFacetOptions,
  getCachedCategoryDiscoveryFacets,
  getCachedCategorySchema,
} from "@/lib/catalog/cached-queries";
import { getCatalogReader } from "@/lib/catalog/reader";
import { CATALOG_PAGE_SIZE } from "@/lib/catalog/types";
import type {
  DiscoveryFacets,
  DiscoveryFilterState,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";
import {
  buildAppliedFilterChips,
  parseDiscoveryUrl,
  reconstructIncomingDiscoveryUrl,
  serializeDiscoveryUrl,
} from "@/lib/discovery-filters/url";

const BASE_PATH = "/productos";

interface CatalogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Resolves the filter state of the full catalog listing. It uses the search surface, which
 * filters by brand and category alike; the specification filters only appear once a single
 * category is selected, because every category has its own schema.
 */
async function resolveCatalogState(
  searchParams: Record<string, string | string[] | undefined>
): Promise<{
  filterState: DiscoveryFilterState;
  schema: ValidatedSpecificationSchema | null;
  facets: DiscoveryFacets;
}> {
  const base = await getCachedCatalogFacetOptions();
  const allowed = {
    allowedBrands: new Set(base.brands.map((b) => b.slug)),
    allowedCategories: new Set(base.categories.map((c) => c.slug)),
  };

  const rawState = parseDiscoveryUrl(searchParams, "search", null, allowed);
  const singleCategory =
    rawState.categories.length === 1
      ? base.categories.find((c) => c.slug === rawState.categories[0])
      : undefined;

  if (!singleCategory) {
    return {
      filterState: rawState,
      schema: null,
      facets: { ...base, technicalSchema: null, technicalFacets: [] },
    };
  }

  const schema = await getCachedCategorySchema(singleCategory.id);
  const categoryFacets = await getCachedCategoryDiscoveryFacets(singleCategory.id, schema);
  return {
    filterState: parseDiscoveryUrl(searchParams, "search", schema, allowed),
    schema,
    facets: {
      ...base,
      technicalSchema: categoryFacets.technicalSchema,
      technicalFacets: categoryFacets.technicalFacets,
    },
  };
}

export async function generateMetadata({ searchParams }: CatalogPageProps): Promise<Metadata> {
  const { filterState, schema } = await resolveCatalogState(await searchParams);

  const canonicalPath = serializeDiscoveryUrl(BASE_PATH, filterState, "search", schema, {
    preservePage: true,
  });
  const canonicalUrl = `https://gamerperu.com${canonicalPath}`;

  const isFilteredOrSorted =
    filterState.brands.length > 0 ||
    filterState.categories.length > 0 ||
    filterState.price.minCents !== null ||
    filterState.price.maxCents !== null ||
    Object.keys(filterState.technical).length > 0 ||
    filterState.sort !== null ||
    filterState.page > 1;

  const title = "Productos | Gamer Perú";
  const description =
    "Todo el catálogo de Gamer Perú: mouses, mousepads y periféricos gaming de alto rendimiento con garantía local y envíos a todo el Perú.";

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "Gamer Perú",
      locale: "es_PE",
      type: "website",
    },
    robots: isFilteredOrSorted ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function CatalogPage({
  searchParams,
}: CatalogPageProps): Promise<React.JSX.Element> {
  const resolvedSearchParams = await searchParams;
  const { filterState, schema, facets } = await resolveCatalogState(resolvedSearchParams);

  const canonicalPath = serializeDiscoveryUrl(BASE_PATH, filterState, "search", schema, {
    preservePage: true,
  });
  if (reconstructIncomingDiscoveryUrl(BASE_PATH, resolvedSearchParams) !== canonicalPath) {
    redirect(canonicalPath);
  }

  const paginated = await getCatalogReader().getPublishedProducts(
    { page: filterState.page, pageSize: CATALOG_PAGE_SIZE },
    filterState,
    schema
  );

  if (paginated.totalItems === 0) {
    if (filterState.page > 1) notFound();
  } else if (filterState.page > paginated.totalPages) {
    notFound();
  }

  const isFiltered =
    filterState.brands.length > 0 ||
    filterState.categories.length > 0 ||
    filterState.price.minCents !== null ||
    filterState.price.maxCents !== null ||
    Object.keys(filterState.technical).length > 0;

  const appliedChips = buildAppliedFilterChips(BASE_PATH, filterState, "search", facets);

  const breadcrumbs = [{ label: "Inicio", href: "/" }, { label: "Productos" }];

  const getPageUrl = (page: number) => {
    return serializeDiscoveryUrl(BASE_PATH, filterState, "search", schema, {
      overridePage: page,
    });
  };

  return (
    <main id="main-content" className={styles.container} data-seamless-header="">
      <DiscoveryHeader
        title="Productos"
        description="Catálogo completo de periféricos gaming de alto rendimiento."
        breadcrumbs={breadcrumbs}
        totalProducts={paginated.totalItems}
        visuallyHidden
      />

      <DiscoveryShell
        basePath={BASE_PATH}
        totalProducts={paginated.totalItems}
        filterState={filterState}
        facets={facets}
        surface="search"
        appliedChips={appliedChips}
        clearAllHref={BASE_PATH}
      />

      {paginated.items.length > 0 ? (
        <>
          <ProductGrid products={paginated.items} />
          <Pagination
            currentPage={paginated.page}
            totalPages={paginated.totalPages}
            getPageUrl={getPageUrl}
          />
        </>
      ) : isFiltered ? (
        <FilteredEmptyState clearHref={BASE_PATH} />
      ) : (
        <CatalogEmptyState />
      )}
    </main>
  );
}

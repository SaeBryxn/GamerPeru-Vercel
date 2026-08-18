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
import { publicEnv } from "@/config/public-env";
import { getCachedBrand } from "@/lib/catalog/cached-queries";
import { getCatalogReader } from "@/lib/catalog/get-reader";
import { CATALOG_PAGE_SIZE } from "@/lib/catalog/pagination";
import {
  buildAppliedFilterChips,
  parseDiscoveryUrl,
  reconstructIncomingDiscoveryUrl,
  serializeDiscoveryUrl,
} from "@/lib/discovery-filters/url";

export const dynamic = "force-dynamic";

interface BrandPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: BrandPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const brand = await getCachedBrand(slug);

  if (!brand) {
    return {
      title: "Marca no encontrada | Gamer Perú",
      robots: { index: false, follow: false },
    };
  }

  const reader = getCatalogReader();
  const rawState = parseDiscoveryUrl(resolvedSearchParams, "brand", null);

  // If exactly one category is selected on Brand, resolve its schema
  let schema = null;
  if (rawState.categories.length === 1) {
    const singleCat = await reader.getPublishedCategoryBySlug(rawState.categories[0]!);
    if (singleCat) {
      schema = await reader.getCategorySpecificationSchema(singleCat.id);
    }
  }

  const filterState = parseDiscoveryUrl(resolvedSearchParams, "brand", schema);

  const title = `${brand.name} | Gamer Perú`;
  const description = brand.description ?? `Catálogo de ${brand.name} en Gamer Perú.`;

  const canonicalPath = serializeDiscoveryUrl(`/marcas/${slug}`, filterState, "brand", schema, {
    preservePage: true,
  });
  const canonicalUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}${canonicalPath}`;

  const isFilteredOrSorted =
    filterState.categories.length > 0 ||
    filterState.price.minCents !== null ||
    filterState.price.maxCents !== null ||
    Object.keys(filterState.technical).length > 0 ||
    filterState.sort !== null;

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
      type: "website",
    },
    robots: isFilteredOrSorted ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function BrandPage({
  params,
  searchParams,
}: BrandPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const brand = await getCachedBrand(slug);

  if (!brand) {
    notFound();
  }

  const reader = getCatalogReader();
  const rawState = parseDiscoveryUrl(resolvedSearchParams, "brand", null);

  // If exactly one category is selected on Brand, resolve its schema
  let schema = null;
  const selectedCatSlug = rawState.categories.length === 1 ? rawState.categories[0]! : null;
  if (selectedCatSlug) {
    const singleCat = await reader.getPublishedCategoryBySlug(selectedCatSlug);
    if (singleCat) {
      schema = await reader.getCategorySpecificationSchema(singleCat.id);
    }
  }

  const filterState = parseDiscoveryUrl(resolvedSearchParams, "brand", schema);

  // Canonical URL normalization check
  const canonicalPath = serializeDiscoveryUrl(`/marcas/${slug}`, filterState, "brand", schema, {
    preservePage: true,
  });

  const currentRawPath = reconstructIncomingDiscoveryUrl(`/marcas/${slug}`, resolvedSearchParams);

  if (currentRawPath !== canonicalPath) {
    redirect(canonicalPath);
  }

  // Fetch facets and filtered products in parallel
  const [facets, paginated] = await Promise.all([
    reader.getBrandDiscoveryFacets(brand.id, selectedCatSlug),
    reader.getPublishedProductsByBrand(
      brand.id,
      { page: filterState.page, pageSize: CATALOG_PAGE_SIZE },
      filterState,
      schema
    ),
  ]);

  // Out of bounds validation
  if (paginated.totalItems === 0) {
    if (filterState.page > 1) {
      notFound();
    }
  } else if (filterState.page > paginated.totalPages) {
    notFound();
  }

  const isFiltered =
    filterState.categories.length > 0 ||
    filterState.price.minCents !== null ||
    filterState.price.maxCents !== null ||
    Object.keys(filterState.technical).length > 0;

  const appliedChips = buildAppliedFilterChips(`/marcas/${slug}`, filterState, "brand", facets);

  const cleanBrandUrl = `/marcas/${slug}`;

  const breadcrumbs = [
    { label: "Inicio", href: "/" },
    { label: "Marcas", href: "/#marcas" },
    { label: brand.name },
  ];

  const paginationBaseUrl = serializeDiscoveryUrl(`/marcas/${slug}`, filterState, "brand", schema, {
    overridePage: 1,
  });

  return (
    <main id="main-content" className={styles.container}>
      <DiscoveryHeader
        title={brand.name}
        description={brand.description}
        breadcrumbs={breadcrumbs}
        totalProducts={paginated.totalItems}
      />

      <DiscoveryShell
        basePath={`/marcas/${slug}`}
        totalProducts={paginated.totalItems}
        filterState={filterState}
        facets={facets}
        surface="brand"
        appliedChips={appliedChips}
        clearAllHref={cleanBrandUrl}
      />

      {paginated.items.length > 0 ? (
        <>
          <ProductGrid products={paginated.items} showBrandLink={false} />
          <Pagination
            currentPage={paginated.page}
            totalPages={paginated.totalPages}
            baseUrl={paginationBaseUrl}
          />
        </>
      ) : isFiltered ? (
        <FilteredEmptyState clearHref={cleanBrandUrl} />
      ) : (
        <CatalogEmptyState />
      )}
    </main>
  );
}

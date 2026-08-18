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
import { getCachedCategory } from "@/lib/catalog/cached-queries";
import { getCatalogReader } from "@/lib/catalog/get-reader";
import { CATALOG_PAGE_SIZE } from "@/lib/catalog/pagination";
import { translateLegacyCategoryUrl } from "@/lib/discovery-filters/legacy-aliases";
import {
  buildAppliedFilterChips,
  parseDiscoveryUrl,
  reconstructIncomingDiscoveryUrl,
  serializeDiscoveryUrl,
} from "@/lib/discovery-filters/url";

export const dynamic = "force-dynamic";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const category = await getCachedCategory(slug);

  if (!category) {
    return {
      title: "Categoría no encontrada | Gamer Perú",
      robots: { index: false, follow: false },
    };
  }

  const reader = getCatalogReader();
  const schema = await reader.getCategorySpecificationSchema(category.id);
  const filterState = parseDiscoveryUrl(resolvedSearchParams, "category", schema);

  const title = `${category.name} | Gamer Perú`;
  const description = category.description ?? `Catálogo de ${category.name} en Gamer Perú.`;

  const canonicalPath = serializeDiscoveryUrl(
    `/categorias/${slug}`,
    filterState,
    "category",
    schema,
    { preservePage: true }
  );
  const canonicalUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}${canonicalPath}`;

  const isFilteredOrSorted =
    filterState.brands.length > 0 ||
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

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  // 1. Check for legacy URL aliases (e.g. ?tipo=ultraligeros -> ?peso_max=45)
  const legacyCheck = translateLegacyCategoryUrl(slug, resolvedSearchParams);
  if (legacyCheck.hasLegacyParams && legacyCheck.targetPath && legacyCheck.translatedParams) {
    const reader = getCatalogReader();
    const targetCat = await getCachedCategory(slug);
    const schema = targetCat ? await reader.getCategorySpecificationSchema(targetCat.id) : null;
    const translatedState = parseDiscoveryUrl(legacyCheck.translatedParams, "category", schema);
    const destinationUrl = serializeDiscoveryUrl(
      legacyCheck.targetPath,
      translatedState,
      "category",
      schema,
      { overridePage: 1 }
    );
    redirect(destinationUrl);
  }

  const category = await getCachedCategory(slug);
  if (!category) {
    notFound();
  }

  const reader = getCatalogReader();
  const schema = await reader.getCategorySpecificationSchema(category.id);
  const filterState = parseDiscoveryUrl(resolvedSearchParams, "category", schema);

  // 2. Canonical URL normalization check
  const canonicalPath = serializeDiscoveryUrl(
    `/categorias/${slug}`,
    filterState,
    "category",
    schema,
    { preservePage: true }
  );

  // Reconstruct current request path to compare with canonical representation
  const currentRawPath = reconstructIncomingDiscoveryUrl(
    `/categorias/${slug}`,
    resolvedSearchParams
  );

  // If the incoming URL is not canonical, issue redirect
  if (currentRawPath !== canonicalPath) {
    redirect(canonicalPath);
  }

  // 3. Fetch facets and filtered products in parallel
  const [facets, paginated] = await Promise.all([
    reader.getCategoryDiscoveryFacets(category.id, schema),
    reader.getPublishedProductsByCategory(
      category.id,
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
    filterState.brands.length > 0 ||
    filterState.price.minCents !== null ||
    filterState.price.maxCents !== null ||
    Object.keys(filterState.technical).length > 0;

  const appliedChips = buildAppliedFilterChips(
    `/categorias/${slug}`,
    filterState,
    "category",
    facets
  );

  const cleanCategoryUrl = `/categorias/${slug}`;

  const breadcrumbs = [
    { label: "Inicio", href: "/" },
    { label: "Categorías", href: "/#categorias" },
    { label: category.name },
  ];

  // Base path for pagination preserving current filter & sort state
  const paginationBaseUrl = serializeDiscoveryUrl(
    `/categorias/${slug}`,
    filterState,
    "category",
    schema,
    { overridePage: 1 }
  );

  return (
    <main id="main-content" className={styles.container}>
      <DiscoveryHeader
        title={category.name}
        description={category.description}
        breadcrumbs={breadcrumbs}
        totalProducts={paginated.totalItems}
      />

      <DiscoveryShell
        basePath={`/categorias/${slug}`}
        totalProducts={paginated.totalItems}
        filterState={filterState}
        facets={facets}
        surface="category"
        appliedChips={appliedChips}
        clearAllHref={cleanCategoryUrl}
      />

      {paginated.items.length > 0 ? (
        <>
          <ProductGrid products={paginated.items} />
          <Pagination
            currentPage={paginated.page}
            totalPages={paginated.totalPages}
            baseUrl={paginationBaseUrl}
          />
        </>
      ) : isFiltered ? (
        <FilteredEmptyState clearHref={cleanCategoryUrl} />
      ) : (
        <CatalogEmptyState />
      )}
    </main>
  );
}

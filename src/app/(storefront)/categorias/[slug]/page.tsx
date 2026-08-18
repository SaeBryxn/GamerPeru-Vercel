import React from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import {
  CatalogEmptyState,
  DiscoveryHeader,
  DiscoveryShell,
  FilteredEmptyState,
  Pagination,
  ProductGrid,
} from "@/components/catalog";
import styles from "@/components/catalog/catalog-page.module.css";
import { getCatalogReader } from "@/lib/catalog/reader";
import { getCachedCategory } from "@/lib/catalog/postgres-reader";
import { CATALOG_PAGE_SIZE } from "@/lib/catalog/types";
import { translateLegacyCategoryUrl } from "@/lib/discovery-filters/legacy-aliases";
import {
  buildAppliedFilterChips,
  parseDiscoveryUrl,
  reconstructIncomingDiscoveryUrl,
  serializeDiscoveryUrl,
} from "@/lib/discovery-filters/url";

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
      description: "La categoría solicitada no existe o no está disponible.",
    };
  }

  const reader = getCatalogReader();
  const schema = await reader.getCategorySpecificationSchema(category.id);
  const filterState = parseDiscoveryUrl(resolvedSearchParams, "category", schema);

  const canonicalPath = serializeDiscoveryUrl(
    `/categorias/${slug}`,
    filterState,
    "category",
    schema,
    { preservePage: true }
  );
  const canonicalUrl = `https://gamerperu.com${canonicalPath}`;

  const isFilteredOrSorted =
    filterState.brands.length > 0 ||
    filterState.price.minCents !== null ||
    filterState.price.maxCents !== null ||
    Object.keys(filterState.technical).length > 0 ||
    filterState.sort !== null;

  return {
    title: `${category.name} | Gamer Perú`,
    description: `Explora nuestra selección de ${category.name.toLowerCase()} para esports de alto rendimiento en Perú. Envíos a todo el país.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${category.name} | Gamer Perú`,
      description: `Explora nuestra selección de ${category.name.toLowerCase()} para esports de alto rendimiento en Perú.`,
      url: canonicalUrl,
      siteName: "Gamer Perú",
      locale: "es_PE",
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

  const legacyCheck = translateLegacyCategoryUrl(slug, resolvedSearchParams);
  if (legacyCheck.hasLegacyParams && legacyCheck.targetPath && legacyCheck.translatedParams) {
    const reader = getCatalogReader();
    const targetCategorySlug = legacyCheck.targetCategorySlug ?? slug;
    const targetCat = await getCachedCategory(targetCategorySlug);
    if (!targetCat) {
      notFound();
    }
    const schema = await reader.getCategorySpecificationSchema(targetCat.id);
    const translatedState = parseDiscoveryUrl(legacyCheck.translatedParams, "category", schema);
    const destinationUrl = serializeDiscoveryUrl(
      legacyCheck.targetPath,
      translatedState,
      "category",
      schema,
      { overridePage: 1 }
    );
    permanentRedirect(destinationUrl);
  }

  const category = await getCachedCategory(slug);
  if (!category) {
    notFound();
  }

  const reader = getCatalogReader();
  const schema = await reader.getCategorySpecificationSchema(category.id);
  const facets = await reader.getCategoryDiscoveryFacets(category.id, schema);
  const allowedBrands = new Set(facets.brands.map((b) => b.slug));

  const filterState = parseDiscoveryUrl(resolvedSearchParams, "category", schema, {
    allowedBrands,
  });

  const canonicalPath = serializeDiscoveryUrl(
    `/categorias/${slug}`,
    filterState,
    "category",
    schema,
    { preservePage: true }
  );

  const currentRawPath = reconstructIncomingDiscoveryUrl(
    `/categorias/${slug}`,
    resolvedSearchParams
  );

  if (currentRawPath !== canonicalPath) {
    redirect(canonicalPath);
  }

  const paginated = await reader.getPublishedProductsByCategory(
    category.id,
    { page: filterState.page, pageSize: CATALOG_PAGE_SIZE },
    filterState,
    schema
  );

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

  const getPageUrl = (page: number) => {
    return serializeDiscoveryUrl(`/categorias/${slug}`, filterState, "category", schema, {
      overridePage: page,
    });
  };

  return (
    <main id="main-content" className={styles.container}>
      <DiscoveryHeader
        title={category.name}
        description={
          category.description ??
          `Catálogo completo de ${category.name.toLowerCase()} para gaming competitivo.`
        }
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
            getPageUrl={getPageUrl}
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

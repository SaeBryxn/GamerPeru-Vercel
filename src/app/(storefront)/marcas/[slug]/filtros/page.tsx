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
  getCachedBrand,
  getCachedBrandCategoryFacetOptions,
  getCachedCategorySchema,
} from "@/lib/catalog/cached-queries";
import { getCatalogReader } from "@/lib/catalog/reader";
import { CATALOG_PAGE_SIZE } from "@/lib/catalog/types";
import type {
  CategoryFacetOption,
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
      description: "La marca solicitada no existe o no está disponible.",
    };
  }

  const categoryFacetOptions = await getCachedBrandCategoryFacetOptions(brand.id);
  const allowedCategories = new Set(categoryFacetOptions.map((c: CategoryFacetOption) => c.slug));
  const rawState = parseDiscoveryUrl(resolvedSearchParams, "brand", null, { allowedCategories });

  let schema: ValidatedSpecificationSchema | null = null;
  let filterState = rawState;

  if (rawState.categories.length === 1) {
    const singleCat = categoryFacetOptions.find(
      (c: CategoryFacetOption) => c.slug === rawState.categories[0]
    );
    if (singleCat) {
      schema = await getCachedCategorySchema(singleCat.id);
    }
    filterState = parseDiscoveryUrl(resolvedSearchParams, "brand", schema, { allowedCategories });
  }

  const canonicalPath = serializeDiscoveryUrl(`/marcas/${slug}`, filterState, "brand", schema, {
    preservePage: true,
  });
  const canonicalUrl = `https://gamerperu.com${canonicalPath}`;

  const isFilteredOrSorted =
    filterState.categories.length > 0 ||
    filterState.price.minCents !== null ||
    filterState.price.maxCents !== null ||
    Object.keys(filterState.technical).length > 0 ||
    filterState.sort !== null ||
    filterState.page > 1;

  const title = `${brand.name} | Gamer Perú`;
  const description =
    brand.description ??
    `Explora el catálogo oficial de ${brand.name} en Gamer Perú. Periféricos gaming de alto rendimiento con garantía local y envíos a todo el Perú.`;

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
  const categoryFacetOptions = await getCachedBrandCategoryFacetOptions(brand.id);
  const allowedCategories = new Set(categoryFacetOptions.map((c: CategoryFacetOption) => c.slug));

  const rawState = parseDiscoveryUrl(resolvedSearchParams, "brand", null, { allowedCategories });

  let schema: ValidatedSpecificationSchema | null = null;
  let facets: DiscoveryFacets;

  if (rawState.categories.length === 1) {
    const selectedCatSlug = rawState.categories[0]!;
    const singleCat = categoryFacetOptions.find(
      (c: CategoryFacetOption) => c.slug === selectedCatSlug
    );
    if (singleCat) {
      schema = await getCachedCategorySchema(singleCat.id);
    }
    const filterState: DiscoveryFilterState = parseDiscoveryUrl(
      resolvedSearchParams,
      "brand",
      schema,
      { allowedCategories }
    );
    facets = await reader.getBrandDiscoveryFacets(
      brand.id,
      categoryFacetOptions,
      singleCat ? singleCat.id : null,
      schema
    );

    const canonicalPath = serializeDiscoveryUrl(`/marcas/${slug}`, filterState, "brand", schema, {
      preservePage: true,
    });
    const currentRawPath = reconstructIncomingDiscoveryUrl(`/marcas/${slug}`, resolvedSearchParams);
    if (currentRawPath !== canonicalPath) {
      redirect(canonicalPath);
    }

    const paginated = await reader.getPublishedProductsByBrand(
      brand.id,
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

    const getPageUrl = (page: number) => {
      return serializeDiscoveryUrl(`/marcas/${slug}`, filterState, "brand", schema, {
        overridePage: page,
      });
    };

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
              getPageUrl={getPageUrl}
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

  const filterState = rawState;
  facets = {
    brands: [],
    categories: categoryFacetOptions,
    technicalSchema: null,
    technicalFacets: [],
  };

  const canonicalPath = serializeDiscoveryUrl(`/marcas/${slug}`, filterState, "brand", null, {
    preservePage: true,
  });
  const currentRawPath = reconstructIncomingDiscoveryUrl(`/marcas/${slug}`, resolvedSearchParams);
  if (currentRawPath !== canonicalPath) {
    redirect(canonicalPath);
  }

  const paginated = await reader.getPublishedProductsByBrand(
    brand.id,
    { page: filterState.page, pageSize: CATALOG_PAGE_SIZE },
    filterState,
    null
  );

  if (paginated.totalItems === 0) {
    if (filterState.page > 1) notFound();
  } else if (filterState.page > paginated.totalPages) {
    notFound();
  }

  const isFiltered =
    filterState.categories.length > 0 ||
    filterState.price.minCents !== null ||
    filterState.price.maxCents !== null;

  const appliedChips = buildAppliedFilterChips(`/marcas/${slug}`, filterState, "brand", facets);
  const cleanBrandUrl = `/marcas/${slug}`;

  const breadcrumbs = [
    { label: "Inicio", href: "/" },
    { label: "Marcas", href: "/#marcas" },
    { label: brand.name },
  ];

  const getPageUrl = (page: number) => {
    return serializeDiscoveryUrl(`/marcas/${slug}`, filterState, "brand", null, {
      overridePage: page,
    });
  };

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
            getPageUrl={getPageUrl}
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

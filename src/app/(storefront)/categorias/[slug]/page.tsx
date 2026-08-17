import React from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CatalogEmptyState, DiscoveryHeader, Pagination, ProductGrid } from "@/components/catalog";
import styles from "@/components/catalog/catalog-page.module.css";
import { publicEnv } from "@/config/public-env";
import { getCachedCategory } from "@/lib/catalog/cached-queries";
import { getCatalogReader } from "@/lib/catalog/get-reader";
import { CATALOG_PAGE_SIZE, parsePageParam } from "@/lib/catalog/pagination";

export const dynamic = "force-dynamic";

const RECOGNIZED_FUTURE_FILTER_PARAMS = ["tipo", "sub", "formato", "superficie", "tamano"] as const;

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

  const { page } = parsePageParam(resolvedSearchParams.page);
  const hasUnsupportedFilter = RECOGNIZED_FUTURE_FILTER_PARAMS.some(
    (param) => resolvedSearchParams[param] !== undefined
  );

  const title = `${category.name} | Gamer Perú`;
  const description = category.description ?? `Catálogo de ${category.name} en Gamer Perú.`;

  const canonicalPath = page > 1 ? `/categorias/${slug}?page=${page}` : `/categorias/${slug}`;
  const canonicalUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}${canonicalPath}`;

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
    robots: hasUnsupportedFilter ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const category = await getCachedCategory(slug);

  if (!category) {
    notFound();
  }

  const { page, isInvalid, isExplicitPageOne } = parsePageParam(resolvedSearchParams.page);

  // Canonicalize ?page=1 and invalid pagination params to base clean URL
  if (isExplicitPageOne || isInvalid) {
    redirect(`/categorias/${slug}`);
  }

  const hasUnsupportedFilter = RECOGNIZED_FUTURE_FILTER_PARAMS.some(
    (param) => resolvedSearchParams[param] !== undefined
  );

  const reader = getCatalogReader();
  const paginated = await reader.getPublishedProductsByCategory(category.id, {
    page,
    pageSize: CATALOG_PAGE_SIZE,
  });

  // Out of bounds validation
  if (paginated.totalItems === 0) {
    if (page > 1) {
      notFound();
    }
  } else if (page > paginated.totalPages) {
    notFound();
  }

  const breadcrumbs = [
    { label: "Inicio", href: "/" },
    { label: "Categorías", href: "/#categorias" },
    { label: category.name },
  ];

  return (
    <main id="main-content" className={styles.container}>
      <DiscoveryHeader
        title={category.name}
        description={category.description}
        breadcrumbs={breadcrumbs}
        totalProducts={paginated.totalItems}
        unsupportedFilterNotice={hasUnsupportedFilter}
      />

      {paginated.items.length > 0 ? (
        <>
          <ProductGrid products={paginated.items} />
          <Pagination
            currentPage={paginated.page}
            totalPages={paginated.totalPages}
            basePath={`/categorias/${slug}`}
          />
        </>
      ) : (
        <CatalogEmptyState />
      )}
    </main>
  );
}

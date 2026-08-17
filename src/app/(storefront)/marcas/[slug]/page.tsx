import React from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CatalogEmptyState, DiscoveryHeader, Pagination, ProductGrid } from "@/components/catalog";
import styles from "@/components/catalog/catalog-page.module.css";
import { publicEnv } from "@/config/public-env";
import { getCachedBrand } from "@/lib/catalog/cached-queries";
import { getCatalogReader } from "@/lib/catalog/get-reader";
import { CATALOG_PAGE_SIZE, parsePageParam } from "@/lib/catalog/pagination";

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

  const { page } = parsePageParam(resolvedSearchParams.page);
  const title = `${brand.name} | Gamer Perú`;
  const description = brand.description ?? `Catálogo de ${brand.name} en Gamer Perú.`;

  const canonicalPath = page > 1 ? `/marcas/${slug}?page=${page}` : `/marcas/${slug}`;
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
    robots: { index: true, follow: true },
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

  const { page, isInvalid, isExplicitPageOne } = parsePageParam(resolvedSearchParams.page);

  // Canonicalize ?page=1 and invalid pagination params to base clean URL
  if (isExplicitPageOne || isInvalid) {
    redirect(`/marcas/${slug}`);
  }

  const reader = getCatalogReader();
  const paginated = await reader.getPublishedProductsByBrand(brand.id, {
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
    { label: "Marcas", href: "/#marcas" },
    { label: brand.name },
  ];

  return (
    <main id="main-content" className={styles.container}>
      <DiscoveryHeader
        title={brand.name}
        description={brand.description}
        breadcrumbs={breadcrumbs}
        totalProducts={paginated.totalItems}
      />

      {paginated.items.length > 0 ? (
        <>
          <ProductGrid products={paginated.items} showBrandLink={false} />
          <Pagination
            currentPage={paginated.page}
            totalPages={paginated.totalPages}
            basePath={`/marcas/${slug}`}
          />
        </>
      ) : (
        <CatalogEmptyState />
      )}
    </main>
  );
}

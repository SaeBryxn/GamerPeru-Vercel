import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Search } from "lucide-react";
import { DiscoveryShell, FilteredEmptyState, Pagination, ProductGrid } from "@/components/catalog";
import { Container } from "@/components/ui";
import { getCatalogReader } from "@/lib/catalog/get-reader";
import {
  buildAppliedFilterChips,
  parseDiscoveryUrl,
  reconstructIncomingDiscoveryUrl,
  serializeDiscoveryUrl,
} from "@/lib/discovery-filters/url";

import { getSearchReader } from "@/lib/search/get-reader";
import { getQueryCodePointLength, parseSearchQueryParam } from "@/lib/search/normalization";
import { DEFAULT_SEARCH_PAGE_SIZE, MIN_SEARCH_QUERY_LENGTH } from "@/lib/search/types";
import styles from "./buscar.module.css";

export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const q = parseSearchQueryParam(params.q);

  if (!q) {
    return {
      title: "Buscar Periféricos Gaming | Gamer Perú",
      description:
        "Encuentra mouses ultraligeros, teclados mecánicos, mousepads y audio de alto rendimiento en Gamer Perú.",
      robots: {
        index: true,
        follow: true,
      },
      alternates: {
        canonical: "/buscar",
      },
    };
  }

  const catalogReader = getCatalogReader();
  const rawState = parseDiscoveryUrl(params, "search", null);

  let schema = null;
  if (rawState.categories.length === 1) {
    const singleCat = await catalogReader.getPublishedCategoryBySlug(rawState.categories[0]!);
    if (singleCat) {
      schema = await catalogReader.getCategorySpecificationSchema(singleCat.id);
    }
  }

  const filterState = parseDiscoveryUrl(params, "search", schema);
  const canonicalPath = serializeDiscoveryUrl("/buscar", filterState, "search", schema, {
    searchQuery: q,
    preservePage: true,
  });

  const titleSuffix = filterState.page > 1 ? ` (Página ${filterState.page})` : "";

  return {
    title: `Búsqueda: ${q}${titleSuffix} | Gamer Perú`,
    description: `Resultados de búsqueda para ${q} en Gamer Perú.`,
    robots: {
      index: false,
      follow: true,
    },
    alternates: {
      canonical: canonicalPath,
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const rawQParam = params.q;
  const q = parseSearchQueryParam(rawQParam);

  if (rawQParam !== undefined && !q) {
    redirect("/buscar");
  }

  if (!q) {
    return (
      <main id="main-content" className={styles.searchPage}>
        <Container>
          <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
            <Link href="/" className={styles.breadcrumbLink}>
              Inicio
            </Link>
            <span aria-hidden="true">/</span>
            <span className={styles.breadcrumbCurrent} aria-current="page">
              Búsqueda
            </span>
          </nav>

          <div className={styles.headerSection}>
            <h1 className={styles.pageTitle}>Búsqueda</h1>
            <div className={styles.formContainer}>
              <form method="GET" action="/buscar" className={styles.searchForm}>
                <div className={styles.inputWrapper}>
                  <span className={styles.searchIcon} aria-hidden="true">
                    <Search size={20} />
                  </span>
                  <input
                    type="search"
                    name="q"
                    placeholder="Buscar periféricos, marcas o categorías..."
                    className={styles.searchInput}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    maxLength={100}
                    aria-label="Término de búsqueda"
                  />
                </div>
                <button type="submit" className={styles.searchSubmitButton}>
                  Buscar
                </button>
              </form>
            </div>
          </div>

          <div className={styles.guidanceContainer}>
            <h2 className={styles.guidanceTitle}>Catálogo Gamer Perú</h2>
            <p className={styles.guidanceText}>
              Encuentra tus periféricos gaming preferidos escribiendo el nombre, modelo, marca o
              categoría.
            </p>
          </div>
        </Container>
      </main>
    );
  }

  if (getQueryCodePointLength(q) < MIN_SEARCH_QUERY_LENGTH) {
    return (
      <main id="main-content" className={styles.searchPage}>
        <Container>
          <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
            <Link href="/" className={styles.breadcrumbLink}>
              Inicio
            </Link>
            <span aria-hidden="true">/</span>
            <span className={styles.breadcrumbCurrent} aria-current="page">
              Búsqueda
            </span>
          </nav>

          <div className={styles.headerSection}>
            <h1 className={styles.pageTitle}>Búsqueda</h1>
            <div className={styles.formContainer}>
              <form method="GET" action="/buscar" className={styles.searchForm}>
                <div className={styles.inputWrapper}>
                  <span className={styles.searchIcon} aria-hidden="true">
                    <Search size={20} />
                  </span>
                  <input
                    type="search"
                    name="q"
                    defaultValue={q}
                    placeholder="Buscar periféricos, marcas o categorías..."
                    className={styles.searchInput}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    maxLength={100}
                    aria-label="Término de búsqueda"
                  />
                </div>
                <button type="submit" className={styles.searchSubmitButton}>
                  Buscar
                </button>
              </form>
            </div>
          </div>

          <div className={styles.guidanceContainer}>
            <h2 className={styles.guidanceTitle}>Búsqueda rápida</h2>
            <p className={styles.guidanceText}>Escribe al menos 2 caracteres para buscar.</p>
          </div>
        </Container>
      </main>
    );
  }

  const catalogReader = getCatalogReader();
  const rawState = parseDiscoveryUrl(params, "search", null);

  // If exactly one category is selected on Search, resolve its schema
  let schema = null;
  const selectedCatSlug = rawState.categories.length === 1 ? rawState.categories[0]! : null;
  if (selectedCatSlug) {
    const singleCat = await catalogReader.getPublishedCategoryBySlug(selectedCatSlug);
    if (singleCat) {
      schema = await catalogReader.getCategorySpecificationSchema(singleCat.id);
    }
  }

  const filterState = parseDiscoveryUrl(params, "search", schema);

  // Canonical URL check
  const canonicalPath = serializeDiscoveryUrl("/buscar", filterState, "search", schema, {
    searchQuery: q,
    preservePage: true,
  });

  const currentRawPath = reconstructIncomingDiscoveryUrl("/buscar", params);

  if (currentRawPath !== canonicalPath) {
    redirect(canonicalPath);
  }

  const searchReader = getSearchReader();
  const [facets, entityMatches, productResults] = await Promise.all([
    searchReader.getSearchDiscoveryFacets(q, selectedCatSlug),
    searchReader.searchMatchingEntities(q),
    searchReader.searchProducts(
      q,
      { page: filterState.page, pageSize: DEFAULT_SEARCH_PAGE_SIZE },
      filterState,
      schema
    ),
  ]);

  if (productResults.totalPages > 0 && filterState.page > productResults.totalPages) {
    notFound();
  }

  if (productResults.totalItems === 0 && filterState.page > 1) {
    notFound();
  }

  const hasEntities = entityMatches.brands.length > 0 || entityMatches.categories.length > 0;
  const isZeroState = productResults.totalItems === 0;
  const isFiltered =
    filterState.brands.length > 0 ||
    filterState.categories.length > 0 ||
    filterState.price.minCents !== null ||
    filterState.price.maxCents !== null ||
    Object.keys(filterState.technical).length > 0;

  const appliedChips = buildAppliedFilterChips("/buscar", filterState, "search", facets, q);

  const cleanSearchUrl = `/buscar?q=${encodeURIComponent(q)}`;

  const paginationBaseUrl = serializeDiscoveryUrl("/buscar", filterState, "search", schema, {
    searchQuery: q,
    overridePage: 1,
  });

  return (
    <main id="main-content" className={styles.searchPage}>
      <Container>
        <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
          <Link href="/" className={styles.breadcrumbLink}>
            Inicio
          </Link>
          <span aria-hidden="true">/</span>
          <span className={styles.breadcrumbCurrent} aria-current="page">
            Búsqueda
          </span>
        </nav>

        <div className={styles.headerSection}>
          <h1 className={styles.pageTitle}>Búsqueda</h1>
          <div className={styles.formContainer}>
            <form method="GET" action="/buscar" className={styles.searchForm}>
              <div className={styles.inputWrapper}>
                <span className={styles.searchIcon} aria-hidden="true">
                  <Search size={20} />
                </span>
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Buscar periféricos, marcas o categorías..."
                  className={styles.searchInput}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  maxLength={100}
                  aria-label="Término de búsqueda"
                />
              </div>
              <button type="submit" className={styles.searchSubmitButton}>
                Buscar
              </button>
            </form>
          </div>

          {!isZeroState && (
            <p className={styles.resultSummary} aria-live="polite">
              {productResults.totalItems}{" "}
              {productResults.totalItems === 1 ? "resultado" : "resultados"} para &ldquo;{q}&rdquo;
            </p>
          )}
        </div>

        {hasEntities && (
          <section className={styles.entitySection} aria-label="Sugerencias de navegación">
            {entityMatches.brands.length > 0 && (
              <div className={styles.entityGroup}>
                <span className={styles.entityGroupTitle}>Marcas:</span>
                <div className={styles.entityPills}>
                  {entityMatches.brands.map((brand) => (
                    <Link
                      key={brand.slug}
                      href={`/marcas/${brand.slug}`}
                      className={styles.entityPill}
                    >
                      {brand.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {entityMatches.categories.length > 0 && (
              <div className={styles.entityGroup}>
                <span className={styles.entityGroupTitle}>Categorías:</span>
                <div className={styles.entityPills}>
                  {entityMatches.categories.map((category) => (
                    <Link
                      key={category.slug}
                      href={`/categorias/${category.slug}`}
                      className={styles.entityPill}
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <DiscoveryShell
          basePath="/buscar"
          totalProducts={productResults.totalItems}
          filterState={filterState}
          facets={facets}
          surface="search"
          searchQuery={q}
          appliedChips={appliedChips}
          clearAllHref={cleanSearchUrl}
        />

        {productResults.items.length > 0 ? (
          <>
            <ProductGrid products={productResults.items} />
            <Pagination
              currentPage={productResults.page}
              totalPages={productResults.totalPages}
              baseUrl={paginationBaseUrl}
            />
          </>
        ) : isFiltered ? (
          <FilteredEmptyState clearHref={cleanSearchUrl} />
        ) : isZeroState ? (
          <div className={styles.guidanceContainer}>
            <h2 className={styles.guidanceTitle}>Sin resultados</h2>
            <p className={styles.guidanceText}>No encontramos resultados para &ldquo;{q}&rdquo;.</p>
            <div className={styles.zeroStateActions}>
              <Link href="/buscar" className={styles.secondaryActionLink}>
                Limpiar búsqueda
              </Link>
              <Link href="/" className={styles.primaryActionLink}>
                Volver al inicio
              </Link>
            </div>
          </div>
        ) : null}
      </Container>
    </main>
  );
}

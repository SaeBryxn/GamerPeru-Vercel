import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Container } from "@/components/ui";
import { DiscoveryShell } from "@/components/catalog/discovery-shell/discovery-shell";
import { FilteredEmptyState } from "@/components/catalog/filtered-empty-state/filtered-empty-state";
import { Pagination } from "@/components/catalog/pagination/pagination";
import { ProductGrid } from "@/components/catalog/product-grid/product-grid";
import { getCachedCategorySchema } from "@/lib/catalog/cached-queries";
import type {
  BrandFacetOption,
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
import {
  getCachedSearchBaseFacetOptions,
  getCachedSearchMatchingEntities,
} from "@/lib/search/cached-queries";
import {
  getQueryCodePointLength,
  normalizeSearchQuery,
  parseSearchQueryParam,
} from "@/lib/search/normalization";
import { getSearchReader } from "@/lib/search/reader";
import {
  DEFAULT_SEARCH_PAGE_SIZE,
  MIN_SEARCH_QUERY_LENGTH,
  type SearchBrandSuggestion,
  type SearchCategorySuggestion,
} from "@/lib/search/types";
import styles from "./buscar.module.css";

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const rawQParam = params.q;
  const q = parseSearchQueryParam(rawQParam);

  if (!q) {
    return {
      title: "Buscar Periféricos Gaming | Gamer Perú",
      description:
        "Busca mouses, teclados, mousepads y periféricos gamer de alto rendimiento en Gamer Perú.",
      robots: { index: true, follow: true },
      alternates: {
        canonical: "/buscar",
      },
    };
  }

  if (getQueryCodePointLength(q) < MIN_SEARCH_QUERY_LENGTH) {
    return {
      title: `Búsqueda: ${q} | Gamer Perú`,
      description: `Resultados de búsqueda para "${q}" en Gamer Perú.`,
      robots: { index: false, follow: true },
      alternates: {
        canonical: `/buscar?q=${encodeURIComponent(q)}`,
      },
    };
  }

  const cleanQuery = normalizeSearchQuery(q);
  const baseFacets = await getCachedSearchBaseFacetOptions(cleanQuery);
  const allowedBrands = new Set(baseFacets.brands.map((b: BrandFacetOption) => b.slug));
  const allowedCategories = new Set(baseFacets.categories.map((c: CategoryFacetOption) => c.slug));

  const rawState = parseDiscoveryUrl(params, "search", null, {
    allowedBrands,
    allowedCategories,
  });

  let schema: ValidatedSpecificationSchema | null = null;
  let filterState = rawState;

  if (rawState.categories.length === 1) {
    const singleCat = baseFacets.categories.find(
      (c: CategoryFacetOption) => c.slug === rawState.categories[0]
    );
    if (singleCat) {
      schema = await getCachedCategorySchema(singleCat.id);
    }
    filterState = parseDiscoveryUrl(params, "search", schema, {
      allowedBrands,
      allowedCategories,
    });
  }

  const canonicalPath = serializeDiscoveryUrl("/buscar", filterState, "search", schema, {
    searchQuery: q,
    preservePage: true,
  });

  const pageNum = filterState.page;
  const title =
    pageNum > 1 ? `Búsqueda: ${q} (Página ${pageNum}) | Gamer Perú` : `Búsqueda: ${q} | Gamer Perú`;

  const description = `Resultados de búsqueda para "${q}" en Gamer Perú. Encuentra periféricos para esports con garantía local y envíos a todo el Perú.`;

  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: {
      canonical: canonicalPath,
    },
  };
}

export default async function SearchPage({
  searchParams,
}: SearchPageProps): Promise<React.JSX.Element> {
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

  const cleanQuery = normalizeSearchQuery(q);
  const searchReader = getSearchReader();

  const [baseFacets, entityMatches] = await Promise.all([
    getCachedSearchBaseFacetOptions(cleanQuery),
    getCachedSearchMatchingEntities(cleanQuery),
  ]);

  const allowedBrands = new Set<string>(baseFacets.brands.map((b: BrandFacetOption) => b.slug));
  const allowedCategories = new Set<string>(
    baseFacets.categories.map((c: CategoryFacetOption) => c.slug)
  );

  const rawState = parseDiscoveryUrl(params, "search", null, {
    allowedBrands,
    allowedCategories,
  });

  let schema: ValidatedSpecificationSchema | null = null;
  let facets: DiscoveryFacets;
  let filterState: DiscoveryFilterState;

  if (rawState.categories.length === 1) {
    const selectedCatSlug = rawState.categories[0]!;
    const singleCat = baseFacets.categories.find(
      (c: CategoryFacetOption) => c.slug === selectedCatSlug
    );
    if (singleCat) {
      schema = await getCachedCategorySchema(singleCat.id);
    }
    filterState = parseDiscoveryUrl(params, "search", schema, {
      allowedBrands,
      allowedCategories,
    });
    facets = await searchReader.getSearchDiscoveryFacets(
      cleanQuery,
      baseFacets.brands,
      baseFacets.categories,
      singleCat ? singleCat.id : null,
      schema
    );
  } else {
    filterState = rawState;
    facets = {
      brands: baseFacets.brands,
      categories: baseFacets.categories,
      technicalSchema: null,
      technicalFacets: [],
    };
  }

  const canonicalPath = serializeDiscoveryUrl("/buscar", filterState, "search", schema, {
    searchQuery: q,
    preservePage: true,
  });

  const currentRawPath = reconstructIncomingDiscoveryUrl("/buscar", params);

  if (currentRawPath !== canonicalPath) {
    redirect(canonicalPath);
  }

  const productResults = await searchReader.searchProducts(
    cleanQuery,
    { page: filterState.page, pageSize: DEFAULT_SEARCH_PAGE_SIZE },
    filterState,
    schema
  );

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

  const appliedChips = buildAppliedFilterChips("/buscar", filterState, "search", facets, {
    searchQuery: q,
  });

  const cleanSearchUrl = `/buscar?q=${encodeURIComponent(q)}`;

  const getPageUrl = (page: number) => {
    return serializeDiscoveryUrl("/buscar", filterState, "search", schema, {
      searchQuery: q,
      overridePage: page,
    });
  };

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
          <div className={styles.entitiesSection}>
            {entityMatches.categories.length > 0 && (
              <div className={styles.entityGroup}>
                <span className={styles.entityGroupLabel}>Categorías sugeridas:</span>
                <div className={styles.entityChips}>
                  {entityMatches.categories.map((cat: SearchCategorySuggestion) => (
                    <Link
                      key={cat.slug}
                      href={`/categorias/${cat.slug}`}
                      className={styles.entityChip}
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {entityMatches.brands.length > 0 && (
              <div className={styles.entityGroup}>
                <span className={styles.entityGroupLabel}>Marcas sugeridas:</span>
                <div className={styles.entityChips}>
                  {entityMatches.brands.map((brand: SearchBrandSuggestion) => (
                    <Link
                      key={brand.slug}
                      href={`/marcas/${brand.slug}`}
                      className={styles.entityChip}
                    >
                      {brand.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
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

        {!isZeroState ? (
          <>
            <ProductGrid products={productResults.items} />
            <Pagination
              currentPage={productResults.page}
              totalPages={productResults.totalPages}
              getPageUrl={getPageUrl}
            />
          </>
        ) : isFiltered ? (
          <FilteredEmptyState onClearFiltersHref={cleanSearchUrl} />
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateTitle}>
              No encontramos resultados para &ldquo;{q}&rdquo;
            </p>
            <p className={styles.emptyStateMessage}>
              Revisa la ortografía o intenta buscar con términos más generales.
            </p>
            <div className={styles.zeroStateActions}>
              <Link href="/buscar" className={styles.primaryActionLink}>
                Limpiar búsqueda
              </Link>
              <Link href="/" className={styles.secondaryActionLink}>
                Volver al inicio
              </Link>
            </div>
          </div>
        )}
      </Container>
    </main>
  );
}

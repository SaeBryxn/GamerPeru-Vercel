import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Container } from "@/components/ui";
import { ProductGrid, Pagination } from "@/components/catalog";
import { getSearchReader } from "@/lib/search/get-reader";
import {
  isSyntacticallyValidPage,
  normalizeSearchQuery,
  parsePageParam,
  parseSearchQueryParam,
} from "@/lib/search/normalization";
import {
  DEFAULT_SEARCH_PAGE_SIZE,
  MAX_SEARCH_QUERY_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
} from "@/lib/search/types";
import styles from "./buscar.module.css";

export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const q = parseSearchQueryParam(params.q);
  const page = parsePageParam(params.page);

  // 1. Bare /buscar landing metadata (Indexable)
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

  // 2. Query search result metadata (Noindex, follow)
  const canonicalQuery = encodeURIComponent(q);
  const canonicalUrl =
    page > 1 ? `/buscar?q=${canonicalQuery}&page=${page}` : `/buscar?q=${canonicalQuery}`;

  const titleSuffix = page > 1 ? ` (Página ${page})` : "";

  return {
    title: `Búsqueda: ${q}${titleSuffix} | Gamer Perú`,
    description: `Resultados de búsqueda para ${q} en Gamer Perú.`,
    robots: {
      index: false,
      follow: true,
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const rawQParam = params.q;
  const rawPageParam = params.page;

  const q = parseSearchQueryParam(rawQParam);
  const page = parsePageParam(rawPageParam);
  const isPageValid = isSyntacticallyValidPage(rawPageParam);

  // Canonical Redirect 1: Empty query parameter (/buscar?q= or /buscar?q=%20) -> /buscar
  if (rawQParam !== undefined && q === "") {
    redirect("/buscar");
  }

  // Canonical Redirect 2: page=1 or invalid page parameter -> canonical URL without page parameter
  if (rawPageParam !== undefined && (!isPageValid || page === 1)) {
    redirect(q ? `/buscar?q=${encodeURIComponent(q)}` : "/buscar");
  }

  // Canonical Redirect 3: Overlength raw query -> redirect to truncated 100-character canonical query
  if (typeof rawQParam === "string" && Array.from(rawQParam).length > MAX_SEARCH_QUERY_LENGTH) {
    const truncated = normalizeSearchQuery(rawQParam);
    redirect(
      page > 1
        ? `/buscar?q=${encodeURIComponent(truncated)}&page=${page}`
        : `/buscar?q=${encodeURIComponent(truncated)}`
    );
  }

  // ---------------------------------------------------------------------------
  // Case A: Bare /buscar Landing
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Case B: 1-Character Query (/buscar?q=x) — ZERO Search DB Queries
  // ---------------------------------------------------------------------------
  if (q.length < MIN_SEARCH_QUERY_LENGTH) {
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

  // ---------------------------------------------------------------------------
  // Case C: Valid Query (q.length >= 2) — Database Search
  // ---------------------------------------------------------------------------
  const reader = getSearchReader();
  const [productResults, entityMatches] = await Promise.all([
    reader.searchProducts(q, { page, pageSize: DEFAULT_SEARCH_PAGE_SIZE }),
    reader.searchMatchingEntities(q),
  ]);

  // Out of bounds check: page > totalPages when products exist
  if (productResults.totalPages > 0 && page > productResults.totalPages) {
    notFound();
  }

  // Out of bounds check: page > 1 when zero products exist
  if (productResults.totalItems === 0 && page > 1) {
    notFound();
  }

  const hasEntities = entityMatches.brands.length > 0 || entityMatches.categories.length > 0;
  const isZeroState = productResults.totalItems === 0;

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

        {/* Bounded Matched Brands & Categories Section */}
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

        {/* Zero Results State */}
        {isZeroState ? (
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
        ) : (
          /* Populated Product Grid & Pagination */
          <>
            <ProductGrid products={productResults.items} />

            {productResults.totalPages > 1 && (
              <div className={styles.paginationContainer}>
                <Pagination
                  currentPage={page}
                  totalPages={productResults.totalPages}
                  baseUrl={`/buscar?q=${encodeURIComponent(q)}`}
                />
              </div>
            )}
          </>
        )}
      </Container>
    </main>
  );
}

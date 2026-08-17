import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./predictive-results.module.css";

export interface PredictiveProductDTO {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  brand: {
    name: string;
    slug: string;
  };
  startingPriceCents: number;
  primaryMedia: {
    src: string | null;
    altText: string | null;
    width: number | null;
    height: number | null;
  } | null;
}

export interface PredictiveResultsProps {
  query: string;
  products: PredictiveProductDTO[];
  brands: Array<{ name: string; slug: string }>;
  categories: Array<{ name: string; slug: string }>;
  isLoading: boolean;
  hasError: boolean;
  onLinkClick?: () => void;
}

export function PredictiveResults({
  query,
  products,
  brands,
  categories,
  isLoading,
  hasError,
  onLinkClick,
}: PredictiveResultsProps) {
  const cleanQuery = query.trim();

  // 1. Empty state (no input yet)
  if (cleanQuery.length === 0) {
    return (
      <div className={styles.guidanceBox}>
        <p className={styles.guidanceTitle}>Búsqueda de Catálogo</p>
        <p className={styles.guidanceText}>
          Comienza a escribir para buscar periféricos, marcas o categorías.
        </p>
      </div>
    );
  }

  // 2. Short query state (1 character)
  if (cleanQuery.length === 1) {
    return (
      <div className={styles.guidanceBox}>
        <p className={styles.guidanceTitle}>Búsqueda rápida</p>
        <p className={styles.guidanceText}>Escribe al menos 2 caracteres para buscar.</p>
      </div>
    );
  }

  // 3. Error state
  if (hasError) {
    return (
      <div className={styles.errorBox}>
        <p className={styles.errorText}>
          No pudimos cargar las sugerencias. Presiona Enter para buscar.
        </p>
      </div>
    );
  }

  // 4. Loading state
  if (isLoading && products.length === 0 && brands.length === 0 && categories.length === 0) {
    return (
      <div className={styles.loadingIndicator} aria-live="polite">
        <span>Buscando sugerencias...</span>
      </div>
    );
  }

  const hasAnyResults = products.length > 0 || brands.length > 0 || categories.length > 0;

  // 5. Zero results state
  if (!hasAnyResults && !isLoading) {
    return (
      <div className={styles.guidanceBox}>
        <p className={styles.guidanceTitle}>Sin resultados</p>
        <p className={styles.guidanceText}>
          No encontramos resultados para &ldquo;{cleanQuery}&rdquo;.
        </p>
      </div>
    );
  }

  // 6. Suggestion sections
  return (
    <div className={styles.container}>
      {/* Brands Section */}
      {brands.length > 0 && (
        <section className={styles.section} aria-label="Marcas sugeridas">
          <h3 className={styles.sectionTitle}>Marcas</h3>
          <ul className={styles.entityList}>
            {brands.map((brand) => (
              <li key={brand.slug} className={styles.entityItem}>
                <Link
                  href={`/marcas/${brand.slug}`}
                  className={styles.entityLink}
                  onClick={onLinkClick}
                >
                  {brand.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Categories Section */}
      {categories.length > 0 && (
        <section className={styles.section} aria-label="Categorías sugeridas">
          <h3 className={styles.sectionTitle}>Categorías</h3>
          <ul className={styles.entityList}>
            {categories.map((cat) => (
              <li key={cat.slug} className={styles.entityItem}>
                <Link
                  href={`/categorias/${cat.slug}`}
                  className={styles.entityLink}
                  onClick={onLinkClick}
                >
                  {cat.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Products Section — Non-clickable row until GP-014 */}
      {products.length > 0 && (
        <section className={styles.section} aria-label="Productos sugeridos">
          <h3 className={styles.sectionTitle}>Productos</h3>
          <ul className={styles.productList}>
            {products.map((product) => (
              <li key={product.id} className={styles.productItem}>
                <div className={styles.productMediaWrapper}>
                  {product.primaryMedia?.src ? (
                    <Image
                      src={product.primaryMedia.src}
                      alt={product.primaryMedia.altText ?? product.name}
                      width={product.primaryMedia.width ?? 56}
                      height={product.primaryMedia.height ?? 56}
                      className={styles.productImage}
                    />
                  ) : (
                    <div className={styles.mediaFallback}>
                      <Package size={24} aria-hidden="true" />
                    </div>
                  )}
                </div>

                <div className={styles.productInfo}>
                  <Link
                    href={`/marcas/${product.brand.slug}`}
                    className={styles.productBrandLink}
                    onClick={onLinkClick}
                  >
                    {product.brand.name}
                  </Link>
                  <span className={styles.productName}>{product.name}</span>
                  <span className={styles.productPrice}>
                    {formatCurrency(product.startingPriceCents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

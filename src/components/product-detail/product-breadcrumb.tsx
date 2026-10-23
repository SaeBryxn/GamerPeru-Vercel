import React from "react";
import Link from "@/components/app-link";
import styles from "./product-breadcrumb.module.css";

export interface ProductBreadcrumbProps {
  category: {
    name: string;
    slug: string;
  };
  productName: string;
}

/**
 * Server Component: ProductBreadcrumb
 *
 * Renders an accessible semantic navigation breadcrumb:
 * Inicio -> /categorias/[slug] -> [productName]
 */
export function ProductBreadcrumb({
  category,
  productName,
}: ProductBreadcrumbProps): React.JSX.Element {
  return (
    <nav className={styles.breadcrumbNav} aria-label="Breadcrumb">
      <ol className={styles.breadcrumbList}>
        <li className={styles.breadcrumbItem}>
          <Link href="/" className={styles.breadcrumbLink}>
            Inicio
          </Link>
          <span className={styles.separator} aria-hidden="true">
            /
          </span>
        </li>
        <li className={styles.breadcrumbItem}>
          <Link href={`/categorias/${category.slug}`} className={styles.breadcrumbLink}>
            {category.name}
          </Link>
          <span className={styles.separator} aria-hidden="true">
            /
          </span>
        </li>
        <li className={styles.breadcrumbItem}>
          <span className={styles.currentLeaf} aria-current="page" title={productName}>
            {productName}
          </span>
        </li>
      </ol>
    </nav>
  );
}

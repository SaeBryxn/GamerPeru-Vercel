import React from "react";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import { ProductCard } from "../product-card/product-card";
import styles from "./product-grid.module.css";

export interface ProductGridProps {
  products: ProductDiscoveryItem[];
  showBrandLink?: boolean;
}

/**
 * ProductGrid Component
 *
 * Renders the product discovery collection inside an accessible <ul> list
 * adapting from 2 columns on mobile to 4 columns on large desktop.
 */
export function ProductGrid({
  products,
  showBrandLink = true,
}: ProductGridProps): React.JSX.Element {
  return (
    <ul className={styles.gridList} data-testid="product-grid">
      {products.map((product) => (
        <li key={product.id} className={styles.gridItem}>
          <ProductCard
            product={product}
            href={`/productos/${product.slug}`}
            showBrandLink={showBrandLink}
          />
        </li>
      ))}
    </ul>
  );
}

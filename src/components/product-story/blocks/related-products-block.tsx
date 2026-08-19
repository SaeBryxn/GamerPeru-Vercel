import React from "react";
import type { RelatedProductsPayload } from "@/lib/catalog/story-validation";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import { ProductGrid } from "@/components/catalog/product-grid/product-grid";
import styles from "./related-products-block.module.css";

export interface RelatedProductsBlockProps {
  payload: RelatedProductsPayload;
  productsMap?: ReadonlyMap<string, ProductDiscoveryItem>;
  currentProductId: string;
}

export function RelatedProductsBlock({
  payload,
  productsMap,
  currentProductId,
}: RelatedProductsBlockProps): React.JSX.Element | null {
  // Fail-closed policy: only explicit productSlugs are hydrated in DB3C
  if (!payload.productSlugs || payload.productSlugs.length === 0 || !productsMap) {
    return null;
  }

  const seenIds = new Set<string>();
  const resolvedProducts: ProductDiscoveryItem[] = [];

  for (const slug of payload.productSlugs) {
    const product = productsMap.get(slug.trim());
    if (!product) continue;
    if (product.id === currentProductId) continue;
    if (seenIds.has(product.id)) continue;

    seenIds.add(product.id);
    resolvedProducts.push(product);
  }

  if (resolvedProducts.length === 0) {
    return null;
  }

  const title = payload.title ?? "Productos Complementarios";

  return (
    <section className={styles.section} data-testid="story-related-products-block">
      <h2 className={styles.title} data-testid="related-products-title">
        {title}
      </h2>
      <ProductGrid products={resolvedProducts} />
    </section>
  );
}

import React from "react";
import { ProductGrid } from "@/components/catalog/product-grid/product-grid";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import styles from "./pdp-complementary-products.module.css";

/** "Completa tu setup": products from the categories that go with this one, under the hero. */
export function PdpComplementaryProducts({
  products,
}: {
  products: ProductDiscoveryItem[];
}): React.JSX.Element | null {
  if (products.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="pdp-complementary-title">
      <h2 id="pdp-complementary-title" className={styles.title}>
        Completa tu setup
      </h2>
      <ProductGrid products={products} />
    </section>
  );
}

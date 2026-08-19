import React from "react";
import { buildProductStructuredData, serializeJsonLd } from "@/lib/catalog/pdp-seo";
import type { ProductDetailEntity } from "@/lib/catalog/product-detail-types";

export interface ProductJsonLdProps {
  product: ProductDetailEntity;
}

/**
 * Server Component: ProductJsonLd
 *
 * Renders safe Schema.org JSON-LD structured data (@graph with Product, BreadcrumbList, FAQPage)
 * for the Product Detail Page.
 */
export function ProductJsonLd({ product }: ProductJsonLdProps): React.JSX.Element | null {
  const graph = buildProductStructuredData(product);

  if (!graph) {
    return null;
  }

  const serialized = serializeJsonLd(graph);

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialized }} />;
}

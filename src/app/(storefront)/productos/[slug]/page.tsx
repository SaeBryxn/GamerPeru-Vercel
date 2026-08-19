import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCachedProduct, getCachedStoryRelatedProducts } from "@/lib/catalog/cached-queries";
import { buildProductMetadata } from "@/lib/catalog/pdp-seo";
import {
  CommerceHeroContainer,
  HardwareSpecifications,
  ProductBreadcrumb,
  ProductJsonLd,
  type CommerceHeroProjection,
} from "@/components/product-detail";
import { ProductStoryRenderer } from "@/components/product-story";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import styles from "./page.module.css";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCachedProduct(slug);

  if (!product || product.variants.length === 0) {
    notFound();
  }

  return buildProductMetadata(product);
}

export default async function ProductDetailPage({
  params,
}: ProductPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const product = await getCachedProduct(slug);

  if (!product || product.variants.length === 0) {
    notFound();
  }

  // Narrow Client Component projection: strictly excludes specifications and story
  const heroProjection: CommerceHeroProjection = {
    product: {
      id: product.id,
      name: product.name,
      subtitle: product.subtitle,
    },
    brand: {
      name: product.brand.name,
      slug: product.brand.slug,
    },
    variants: product.variants,
    primaryMedia: product.primaryMedia,
    media: product.media,
  };

  // Single-query page-level RelatedProducts hydration for Story cross-sell
  let relatedProductsMap: Map<string, ProductDiscoveryItem> | undefined;

  if (product.story?.blocks && product.story.blocks.length > 0) {
    const rawSlugs: string[] = [];
    for (const block of product.story.blocks) {
      if (block.type === "related_products" && block.payload.productSlugs) {
        rawSlugs.push(...block.payload.productSlugs);
      }
    }

    const uniqueSlugs = Array.from(
      new Set(rawSlugs.map((s) => s.trim()).filter((s) => Boolean(s) && s !== product.slug))
    );

    if (uniqueSlugs.length > 0) {
      const hydratedProducts = await getCachedStoryRelatedProducts(uniqueSlugs, product.id);
      relatedProductsMap = new Map(hydratedProducts.map((p) => [p.slug, p]));
    }
  }

  return (
    <main className={styles.pageWrapper} data-testid="product-detail-page">
      <ProductJsonLd product={product} />

      <ProductBreadcrumb category={product.category} productName={product.name} />

      <CommerceHeroContainer projection={heroProjection} />

      {product.specifications && <HardwareSpecifications specifications={product.specifications} />}

      {product.story && (
        <ProductStoryRenderer
          story={product.story}
          currentProductId={product.id}
          productName={product.name}
          relatedProductsMap={relatedProductsMap}
        />
      )}
    </main>
  );
}

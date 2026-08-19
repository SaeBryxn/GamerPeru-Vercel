import React from "react";
import { notFound } from "next/navigation";
import { getCachedProduct } from "@/lib/catalog/cached-queries";
import {
  CommerceHeroContainer,
  HardwareSpecifications,
  ProductBreadcrumb,
  type CommerceHeroProjection,
} from "@/components/product-detail";
import styles from "./page.module.css";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
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

  return (
    <main className={styles.pageWrapper} data-testid="product-detail-page">
      <ProductBreadcrumb category={product.category} productName={product.name} />

      <CommerceHeroContainer projection={heroProjection} />

      {product.specifications && <HardwareSpecifications specifications={product.specifications} />}
    </main>
  );
}

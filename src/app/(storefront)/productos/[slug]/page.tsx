import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCachedProduct, getCachedStoryRelatedProducts } from "@/lib/catalog/cached-queries";
import { buildProductMetadata } from "@/lib/catalog/pdp-seo";
import {
  CommerceHeroContainer,
  ProductJsonLd,
  buildSpecRows,
  type CommerceHeroProjection,
} from "@/components/product-detail";
import { PdpTechnicalDetails } from "@/components/product-detail/pdp-technical-details";
import { EMPTY_PRODUCT_PDP_CONFIG, projectPdpVariants } from "@/lib/catalog/product-pdp-config";
import { getPreviewExtras } from "@/components/product-detail/pdp-preview-extras";
import { resolveCatalogReaderMode } from "@/lib/catalog/resolve-reader-mode";
import { ProductStoryRenderer } from "@/components/product-story";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import styles from "./page.module.css";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

// Must be a literal for static analysis; keep in step with CATALOG_REVALIDATE_SECONDS. Admin
// catalog writes revalidate on demand, so this only bounds staleness when nothing invalidates.
export const revalidate = 300;

/** No product is prerendered at build: each page is generated on first visit, then cached (ISR). */
export function generateStaticParams(): { slug: string }[] {
  return [];
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

  const pdpConfig = product.pdpConfig ?? EMPTY_PRODUCT_PDP_CONFIG;

  // Narrow Client Component projection: strictly excludes specifications and story
  const heroProjection: CommerceHeroProjection = {
    product: {
      id: product.id,
      name: product.name,
      subtitle: product.subtitle,
      pdpConfig: {
        rating: pdpConfig.rating,
        gift: pdpConfig.gift,
        support: pdpConfig.support,
        highlightsEnabled: pdpConfig.highlightsEnabled,
      },
    },
    brand: {
      name: product.brand.name,
      slug: product.brand.slug,
    },
    variants: projectPdpVariants(product.variants, pdpConfig),
    primaryMedia: product.primaryMedia,
    media: product.media,
  };

  const specRows = product.specifications ? buildSpecRows(product.specifications) : [];
  // One template for every category (mouses, teclados, mousepads, audio…);
  // only the showcase extras vary with the product type.
  const previewExtras =
    resolveCatalogReaderMode() === "dev-preview" ? getPreviewExtras(product.category.slug) : null;

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
    <main className={styles.page} data-testid="product-detail-page">
      <div className={styles.pageWrapper}>
        <ProductJsonLd product={product} />

        <CommerceHeroContainer
          projection={heroProjection}
          specHighlights={specRows}
          accessories={pdpConfig.accessories.enabled ? product.accessories : undefined}
          details={
            <PdpTechnicalDetails
              config={pdpConfig}
              specRows={specRows}
              previewContents={previewExtras?.packageContents}
            />
          }
        />
      </div>

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

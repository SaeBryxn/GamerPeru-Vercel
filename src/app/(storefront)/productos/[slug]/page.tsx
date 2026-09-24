import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCachedProduct, getCachedStoryRelatedProducts } from "@/lib/catalog/cached-queries";
import { buildProductMetadata } from "@/lib/catalog/pdp-seo";
import {
  CommerceHeroContainer,
  HardwareSpecifications,
  PdpAccordion,
  ProductJsonLd,
  buildSpecRows,
  type CommerceHeroProjection,
  type PdpAccordionItem,
} from "@/components/product-detail";
import { getPreviewExtras } from "@/components/product-detail/pdp-preview-extras";
import { resolveCatalogReaderMode } from "@/lib/catalog/resolve-reader-mode";
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

  const specRows = product.specifications ? buildSpecRows(product.specifications) : [];
  // One template for every category (mouses, teclados, mousepads, audio…);
  // only the showcase extras vary with the product type.
  const previewExtras =
    resolveCatalogReaderMode() === "dev-preview" ? getPreviewExtras(product.category.slug) : null;

  // Accordion sections only render when they have real content to show.
  const dimensionRows = specRows.filter((row) =>
    /largo|ancho|alto|length|width|height|dimens|peso|weight/i.test(`${row.key} ${row.label}`)
  );
  const accordionItems: PdpAccordionItem[] = [];
  if (dimensionRows.length > 0) {
    accordionItems.push({
      id: "dimensiones",
      title: "Dimensiones",
      content: (
        <ul key="dimensiones">
          {dimensionRows.map((row) => (
            <li key={row.key}>
              {row.label}: {row.formattedValue}
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (product.specifications && specRows.length > 0) {
    accordionItems.push({
      id: "especificaciones",
      title: "Especificaciones",
      content: (
        <HardwareSpecifications key="especificaciones" specifications={product.specifications} />
      ),
    });
  }
  if (previewExtras && previewExtras.packageContents.length > 0) {
    accordionItems.push({
      id: "contenido",
      title: "Contenido del paquete",
      content: (
        <ul key="contenido">
          {previewExtras.packageContents.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ),
    });
  }

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

      <CommerceHeroContainer
        projection={heroProjection}
        specHighlights={specRows}
        accessories={
          previewExtras && previewExtras.accessories.length > 0
            ? previewExtras.accessories
            : undefined
        }
        details={
          accordionItems.length > 0 ? (
            <PdpAccordion key="pdp-details" items={accordionItems} />
          ) : undefined
        }
      />

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

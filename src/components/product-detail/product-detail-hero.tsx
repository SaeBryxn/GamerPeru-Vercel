"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";
import type { ProductVariantDetail } from "@/lib/catalog/product-detail-types";
import type { FormattedSpecRow } from "./hardware-specifications";
import type { PdpAccessory } from "./pdp-accessories";
import type { CommerceHeroProjection } from "./types";
import {
  buildEligibleGallery,
  ProductMediaGallery,
  resolveDefaultFocusedIndex,
} from "./product-media-gallery";
import { ProductCommercePanel } from "./product-commerce-panel";
import { buildVariantHref, findVariantFromSearch } from "./variant-url";
import styles from "./product-detail-hero.module.css";

export interface ProductDetailHeroProps {
  projection: CommerceHeroProjection;
  specHighlights?: FormattedSpecRow[];
  accessories?: PdpAccessory[];
  details?: React.ReactNode;
}

/**
 * Deterministic default variant resolution:
 * 1. displayOrder ASC
 * 2. priceCents ASC
 * 3. id ASC (lexicographical)
 */
export function resolveCanonicalDefaultVariant(
  variants: ProductVariantDetail[]
): ProductVariantDetail {
  if (variants.length === 0) {
    throw new Error("Cannot resolve default variant from empty variant array");
  }

  const sorted = [...variants].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    if (a.priceCents !== b.priceCents) {
      return a.priceCents - b.priceCents;
    }
    return a.id.localeCompare(b.id);
  });

  const first = sorted[0];
  if (!first) {
    throw new Error("Cannot resolve default variant");
  }
  return first;
}

export function ProductDetailHero({
  projection,
  specHighlights,
  accessories,
  details,
}: ProductDetailHeroProps): React.JSX.Element {
  const { product, brand, variants, primaryMedia, media } = projection;

  const defaultVariant = useMemo(() => resolveCanonicalDefaultVariant(variants), [variants]);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariantDetail>(defaultVariant);

  // Each color has its own link (?color=blanco), as on other brand stores. The page itself stays
  // one cached document: reading the query on the server would render it on every request, so the
  // link is applied here after hydration and kept in sync without a navigation.
  useEffect(() => {
    const linked = findVariantFromSearch(variants, window.location.search);
    if (linked) setSelectedVariant(linked);
  }, [variants]);

  const selectVariant = useCallback((variant: ProductVariantDetail) => {
    setSelectedVariant(variant);
    window.history.replaceState(
      window.history.state,
      "",
      buildVariantHref(window.location.href, variant)
    );
  }, []);

  // The photo the gallery opens on for this variant, reused as the sticky bar's thumbnail.
  const thumbnailKey = useMemo(() => {
    const gallery = buildEligibleGallery(media, primaryMedia, selectedVariant.id);
    const index = resolveDefaultFocusedIndex(
      gallery,
      primaryMedia,
      selectedVariant.id,
      selectedVariant.thumbnailMediaAssetId
    );
    return index >= 0 ? (gallery[index]?.asset.objectKey ?? null) : null;
  }, [media, primaryMedia, selectedVariant.id, selectedVariant.thumbnailMediaAssetId]);

  return (
    <MotionConfig reducedMotion="user">
      <section
        className={styles.heroLayout}
        data-testid="product-detail-hero"
        aria-label="Información y compra del producto"
      >
        <div className={styles.galleryColumn}>
          <ProductMediaGallery
            media={media}
            primaryMedia={primaryMedia}
            selectedVariant={selectedVariant}
            productName={product.name}
            brandName={brand.name}
          />
        </div>

        <div className={styles.commerceColumn}>
          <ProductCommercePanel
            product={product}
            brand={brand}
            variants={variants}
            media={media}
            selectedVariant={selectedVariant}
            onSelectVariant={selectVariant}
            thumbnailKey={thumbnailKey}
            specHighlights={specHighlights}
            accessories={accessories}
            details={details}
          />
        </div>
      </section>
    </MotionConfig>
  );
}

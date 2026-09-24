"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { DomeLink } from "@/components/ui";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import type { ProductCardSpec } from "@/lib/catalog/card-specs";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { formatCurrency } from "@/lib/utils/currency";
import { ProductCardFallback } from "./product-card-fallback";
import { SpecSwapBar, type ProductSpecPair, type SpecIconName } from "./spec-swap-bar";
import styles from "./product-card.module.css";

const SPEC_ICON_ORDER: SpecIconName[] = ["crosshair", "chip", "material", "switch"];

/**
 * Splits the product's own specifications into the two pairs the swap bar animates between.
 * Returns null below four values: a half-empty strip reads as missing data, so the card simply
 * omits it until the spec sheet is filled.
 */
function toSpecPair(specs: ProductCardSpec[] | undefined): ProductSpecPair | null {
  if (!specs || specs.length < 4) return null;

  const [first, second, third, fourth] = specs;
  if (!first || !second || !third || !fourth) return null;

  const withIcon = (spec: ProductCardSpec, index: number) => ({
    icon: SPEC_ICON_ORDER[index] ?? "chip",
    title: spec.label,
    value: spec.value,
  });

  return {
    rest: [withIcon(first, 0), withIcon(second, 1)],
    active: [withIcon(third, 2), withIcon(fourth, 3)],
  };
}

export interface ProductCardProps {
  product: ProductDiscoveryItem;
  href?: string;
  showBrandLink?: boolean;
}

/**
 * ProductCard Component
 *
 * Core discovery grid item exhibiting quiet product dominance.
 *
 * Invariants:
 * 1. Product media and title are non-interactive by default in GP-011 (no broken PDP links).
 * 2. When `href` is supplied, media and title render legitimate navigation links without
 *    nesting or conflicting with the Brand link, and the hover "Elegir opciones" action
 *    (which also leads to the PDP) is shown.
 * 3. Brand name links to `/marcas/[slug]` unless `showBrandLink=false` (e.g. on Brand page).
 * 4. Image aspect ratio is strictly 4:5.
 * 5. Prices are rendered in neutral dark Plus Jakarta Sans typography.
 * 6. Hovering (or focusing into) the card swaps the spec bar pair with a horizontal swish.
 */
export function ProductCard({
  product,
  href,
  showBrandLink = true,
}: ProductCardProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const isActive = isHovered || hasFocusWithin;

  const specPair = toSpecPair(product.specs);
  const mediaUrl = resolvePublicMediaUrl(product.primaryMedia?.objectKey);
  const altText = product.primaryMedia?.altText ?? `${product.brand.name} ${product.name}`;

  const mediaContent = mediaUrl ? (
    <Image
      src={mediaUrl}
      alt={altText}
      fill
      sizes="(max-width: 480px) 50vw, (max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
      className={styles.image}
    />
  ) : (
    <ProductCardFallback />
  );

  return (
    <article
      className={`${styles.card} ${href ? styles.interactiveCard : ""}`}
      data-testid="product-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setHasFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasFocusWithin(false);
      }}
    >
      <div className={styles.mediaStage}>
        {href ? (
          <Link href={href} className={styles.mediaLink} tabIndex={-1} aria-hidden="true">
            {mediaContent}
          </Link>
        ) : (
          mediaContent
        )}

        {href && (
          <span className={styles.actionSlot}>
            <DomeLink
              href={href}
              tone="dark"
              className={styles.actionButton}
              aria-label={`Elegir opciones de ${product.name}`}
            >
              Elegir opciones
            </DomeLink>
          </span>
        )}
      </div>

      <div className={styles.info}>
        {showBrandLink ? (
          <span className={styles.brand}>
            <Link href={`/marcas/${product.brand.slug}`} className={styles.brandLink}>
              {product.brand.name}
            </Link>
          </span>
        ) : (
          <span className={styles.brand}>{product.brand.name}</span>
        )}

        <h2 className={styles.title}>
          {href ? (
            <Link href={href} className={styles.titleLink}>
              {product.name}
            </Link>
          ) : (
            product.name
          )}
        </h2>

        <div className={styles.priceBlock}>
          <span className={styles.pricePrefix}>Desde</span>
          <span className={styles.priceValue}>{formatCurrency(product.startingPriceCents)}</span>
        </div>

        {specPair && <SpecSwapBar specs={specPair} active={isActive} />}
      </div>
    </article>
  );
}

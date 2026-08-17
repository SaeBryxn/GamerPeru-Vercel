import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { formatCurrency } from "@/lib/utils/currency";
import { ProductCardFallback } from "./product-card-fallback";
import styles from "./product-card.module.css";

export interface ProductCardProps {
  product: ProductDiscoveryItem;
  href?: string;
  showBrandLink?: boolean;
}

/**
 * ProductCard Component
 *
 * Core discovery grid item exhibiting WLMOUSE-like quiet product dominance.
 *
 * Invariants:
 * 1. Product media and title are non-interactive by default in GP-011 (no broken PDP links).
 * 2. Accepts an optional `href?: string` prop for future PDP activation (GP-014).
 * 3. Brand name links to `/marcas/[slug]` unless `showBrandLink=false` (e.g. on Brand page).
 * 4. Image aspect ratio is strictly 4:5.
 * 5. Prices are rendered in neutral dark Plus Jakarta Sans typography.
 */
export function ProductCard({
  product,
  href,
  showBrandLink = true,
}: ProductCardProps): React.JSX.Element {
  const mediaUrl = resolvePublicMediaUrl(product.primaryMedia?.objectKey);
  const altText = product.primaryMedia?.altText ?? `${product.brand.name} ${product.name}`;

  return (
    <article
      className={`${styles.card} ${href ? styles.interactiveCard : ""}`}
      data-testid="product-card"
    >
      <div className={styles.mediaStage}>
        {mediaUrl ? (
          <Image
            src={mediaUrl}
            alt={altText}
            fill
            sizes="(max-width: 480px) 50vw, (max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className={styles.image}
          />
        ) : (
          <ProductCardFallback />
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

        <h2 className={styles.title}>{product.name}</h2>

        <div className={styles.priceBlock}>
          <span className={styles.pricePrefix}>Desde</span>
          <span className={styles.priceValue}>{formatCurrency(product.startingPriceCents)}</span>
        </div>
      </div>
    </article>
  );
}

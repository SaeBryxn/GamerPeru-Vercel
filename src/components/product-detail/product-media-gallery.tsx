"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
import type { ProductMediaItem, ProductVariantDetail } from "@/lib/catalog/product-detail-types";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import styles from "./product-media-gallery.module.css";

export interface ProductMediaGalleryProps {
  media: ProductMediaItem[];
  primaryMedia: ProductMediaItem | null;
  selectedVariant: ProductVariantDetail;
  productName: string;
  brandName: string;
}

/**
 * Builds the canonical eligible and deduplicated gallery set for the selected variant.
 *
 * Rules:
 * 1. Collect media rows where `variantId === null` or `variantId === selectedVariant.id`.
 * 2. Exclude rows belonging to other variants (`variantId !== null && variantId !== selectedVariant.id`).
 * 3. Evaluate `primaryMedia`: safe only if `variantId === null` or `variantId === selectedVariant.id`.
 * 4. Deduplicate deterministically by `mediaAssetId`.
 * 5. Sort by `displayOrder ASC`.
 */
export function buildEligibleGallery(
  media: ProductMediaItem[],
  primaryMedia: ProductMediaItem | null,
  selectedVariantId: string
): ProductMediaItem[] {
  const seenAssetIds = new Set<string>();
  const items: ProductMediaItem[] = [];

  // 1. Safe primaryMedia check
  const isPrimarySafe =
    primaryMedia !== null &&
    (primaryMedia.variantId === null || primaryMedia.variantId === selectedVariantId);

  if (isPrimarySafe && primaryMedia) {
    seenAssetIds.add(primaryMedia.mediaAssetId);
    items.push(primaryMedia);
  }

  // 2. Filter eligible media rows
  for (const item of media) {
    const isEligible = item.variantId === null || item.variantId === selectedVariantId;
    if (isEligible && !seenAssetIds.has(item.mediaAssetId)) {
      seenAssetIds.add(item.mediaAssetId);
      items.push(item);
    }
  }

  // 3. Sort deterministically by displayOrder
  return items.sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Resolves the initial or default focused media index given the eligible gallery.
 *
 * Precedence:
 * 1. First selected-variant-specific media (`variantId === selectedVariantId`)
 * 2. safePrimaryMedia (if eligible and exists)
 * 3. First global media (`variantId === null`)
 * 4. Fallback index (-1 or 0)
 */
export function resolveDefaultFocusedIndex(
  gallery: ProductMediaItem[],
  primaryMedia: ProductMediaItem | null,
  selectedVariantId: string
): number {
  if (gallery.length === 0) {
    return -1;
  }

  // 1. First selected-variant-specific media
  const variantIndex = gallery.findIndex((m) => m.variantId === selectedVariantId);
  if (variantIndex !== -1) {
    return variantIndex;
  }

  // 2. safePrimaryMedia
  const isPrimarySafe =
    primaryMedia !== null &&
    (primaryMedia.variantId === null || primaryMedia.variantId === selectedVariantId);

  if (isPrimarySafe && primaryMedia) {
    const primaryIndex = gallery.findIndex((m) => m.mediaAssetId === primaryMedia.mediaAssetId);
    if (primaryIndex !== -1) {
      return primaryIndex;
    }
  }

  // 3. First global media
  const globalIndex = gallery.findIndex((m) => m.variantId === null);
  if (globalIndex !== -1) {
    return globalIndex;
  }

  // 4. Default to first item
  return 0;
}

export function ProductMediaGallery({
  media,
  primaryMedia,
  selectedVariant,
  productName,
  brandName,
}: ProductMediaGalleryProps): React.JSX.Element {
  const eligibleGallery = useMemo(
    () => buildEligibleGallery(media, primaryMedia, selectedVariant.id),
    [media, primaryMedia, selectedVariant.id]
  );

  const [activeIndex, setActiveIndex] = useState(() =>
    resolveDefaultFocusedIndex(eligibleGallery, primaryMedia, selectedVariant.id)
  );
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Sync focus on variant change
  useEffect(() => {
    const nextIndex = resolveDefaultFocusedIndex(eligibleGallery, primaryMedia, selectedVariant.id);
    setActiveIndex(nextIndex);
  }, [eligibleGallery, primaryMedia, selectedVariant.id]);

  const activeMedia =
    activeIndex >= 0 && activeIndex < eligibleGallery.length ? eligibleGallery[activeIndex] : null;
  const activeMediaUrl = resolvePublicMediaUrl(activeMedia?.asset.objectKey);
  const activeAltText =
    activeMedia?.asset.altText ??
    `${brandName} ${productName} - ${selectedVariant.title} - Vista ${activeIndex + 1}`;

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (index + 1) % eligibleGallery.length;
      setActiveIndex(next);
      buttonRefs.current[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (index - 1 + eligibleGallery.length) % eligibleGallery.length;
      setActiveIndex(prev);
      buttonRefs.current[prev]?.focus();
    }
  };

  return (
    <div className={styles.galleryContainer} data-testid="product-media-gallery">
      <div className={styles.mainStage} data-testid="gallery-main-stage">
        {activeMediaUrl ? (
          <Image
            src={activeMediaUrl}
            alt={activeAltText}
            fill
            priority
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 58vw, 800px"
            className={styles.mainImage}
          />
        ) : (
          <div className={styles.fallbackStage} data-testid="gallery-fallback">
            <Package size={48} aria-hidden="true" />
            <span className={styles.fallbackText}>
              {brandName} {productName}
            </span>
          </div>
        )}
      </div>

      {eligibleGallery.length > 1 && (
        <ul
          className={styles.thumbnailList}
          aria-label="Vistas disponibles del producto"
          data-testid="gallery-thumbnails"
        >
          {eligibleGallery.map((item, index) => {
            const url = resolvePublicMediaUrl(item.asset.objectKey);
            const isCurrent = index === activeIndex;
            const thumbAlt =
              item.asset.altText ?? `Miniatura ${index + 1} de ${eligibleGallery.length}`;

            return (
              <li key={item.mediaAssetId} className={styles.thumbnailItem}>
                <button
                  ref={(el) => {
                    buttonRefs.current[index] = el;
                  }}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className={`${styles.thumbnailButton} ${isCurrent ? styles.thumbnailButtonActive : ""}`}
                  aria-label={`Ver imagen ${index + 1} de ${eligibleGallery.length}`}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  {url ? (
                    <Image
                      src={url}
                      alt={thumbAlt}
                      fill
                      sizes="64px"
                      className={styles.thumbnailImage}
                    />
                  ) : (
                    <Package size={20} aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

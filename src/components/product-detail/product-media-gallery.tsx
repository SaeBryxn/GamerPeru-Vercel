"use client";

import React, { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Package, Video } from "lucide-react";
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

export type GalleryMediaType = "image" | "video" | "unsupported";

export type SwipeDirection = "next" | "prev" | "none";

export interface ResolveSwipeParams {
  deltaX: number;
  deltaY: number;
  itemCount: number;
  minDistance?: number;
}

/**
 * Classifies public media assets based on trusted MIME metadata.
 */
export function getGalleryMediaType(mimeType: string | null | undefined): GalleryMediaType {
  if (!mimeType || typeof mimeType !== "string") {
    return "unsupported";
  }
  const lower = mimeType.toLowerCase().trim();
  if (lower.startsWith("image/")) {
    return "image";
  }
  if (lower.startsWith("video/")) {
    return "video";
  }
  return "unsupported";
}

export function isSupportedGalleryMime(mimeType: string | null | undefined): boolean {
  const type = getGalleryMediaType(mimeType);
  return type === "image" || type === "video";
}

/**
 * Builds the canonical eligible and deduplicated gallery set for the selected variant.
 *
 * Rules:
 * 1. Variant eligibility: media rows where `variantId === null` or `variantId === selectedVariantId`.
 * 2. safePrimaryMedia: included if `primaryMedia !== null`, variant eligible, and supported MIME.
 * 3. MIME filtering: Omit unsupported DOCUMENT/arbitrary MIME assets from the PDP gallery.
 * 4. Deduplicate deterministically by `mediaAssetId`.
 * 5. Sort deterministically by `displayOrder ASC`.
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
    (primaryMedia.variantId === null || primaryMedia.variantId === selectedVariantId) &&
    isSupportedGalleryMime(primaryMedia.asset?.mimeType);

  if (isPrimarySafe && primaryMedia) {
    seenAssetIds.add(primaryMedia.mediaAssetId);
    items.push(primaryMedia);
  }

  // 2. Filter eligible media rows
  for (const item of media) {
    const isVariantEligible = item.variantId === null || item.variantId === selectedVariantId;
    const isMimeSupported = isSupportedGalleryMime(item.asset?.mimeType);

    if (isVariantEligible && isMimeSupported && !seenAssetIds.has(item.mediaAssetId)) {
      seenAssetIds.add(item.mediaAssetId);
      items.push(item);
    }
  }

  // 3. Sort deterministically by displayOrder
  return items.sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Resolves the canonical default focused media index given the eligible gallery.
 *
 * Precedence:
 * 1. First selected-variant-specific media (`variantId === selectedVariantId`)
 * 2. safePrimaryMedia (if eligible and supported)
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
    (primaryMedia.variantId === null || primaryMedia.variantId === selectedVariantId) &&
    isSupportedGalleryMime(primaryMedia.asset?.mimeType);

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

/**
 * Resolves the canonical initial LCP mediaAssetId for the initial selected variant.
 * Only the initial visible IMAGE candidate receives high/priority loading.
 * Returns null if the initial visible asset is VIDEO or if no valid image is resolved.
 */
export function resolveInitialLcpMediaAssetId(
  gallery: ProductMediaItem[],
  primaryMedia: ProductMediaItem | null,
  initialVariantId: string
): string | null {
  const initialIndex = resolveDefaultFocusedIndex(gallery, primaryMedia, initialVariantId);
  if (initialIndex < 0 || initialIndex >= gallery.length) {
    return null;
  }

  const initialItem = gallery[initialIndex];
  if (!initialItem) {
    return null;
  }

  const mediaType = getGalleryMediaType(initialItem.asset?.mimeType);
  if (mediaType === "image") {
    return initialItem.mediaAssetId;
  }

  return null;
}

/**
 * Pure gesture resolver for horizontal stage swipe navigation.
 * Requirements:
 * - Horizontal movement must dominate (|deltaX| > |deltaY|)
 * - Movement must meet or exceed minDistance threshold (default: 40px)
 * - Trivial taps, vertical scrolling, and <=1 item galleries return 'none'
 */
export function resolveSwipeDirection({
  deltaX,
  deltaY,
  itemCount,
  minDistance = 40,
}: ResolveSwipeParams): SwipeDirection {
  if (itemCount <= 1) {
    return "none";
  }

  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX < minDistance || absX <= absY) {
    return "none";
  }

  return deltaX < 0 ? "next" : "prev";
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

  // Synchronous variant-scoped focus state
  const [userSelectedIndex, setUserSelectedIndex] = useState<number | null>(null);
  const [prevVariantId, setPrevVariantId] = useState(selectedVariant.id);

  // When selectedVariant changes, synchronously reset manual user override during render
  if (prevVariantId !== selectedVariant.id) {
    setPrevVariantId(selectedVariant.id);
    setUserSelectedIndex(null);
  }

  const defaultIndex = useMemo(
    () => resolveDefaultFocusedIndex(eligibleGallery, primaryMedia, selectedVariant.id),
    [eligibleGallery, primaryMedia, selectedVariant.id]
  );

  const activeIndex =
    userSelectedIndex !== null &&
    userSelectedIndex >= 0 &&
    userSelectedIndex < eligibleGallery.length
      ? userSelectedIndex
      : defaultIndex;

  // Initial LCP asset ID computed once on initial render
  const [initialLcpAssetId] = useState<string | null>(() =>
    resolveInitialLcpMediaAssetId(eligibleGallery, primaryMedia, selectedVariant.id)
  );

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeMedia =
    activeIndex >= 0 && activeIndex < eligibleGallery.length ? eligibleGallery[activeIndex] : null;
  const activeMediaUrl = resolvePublicMediaUrl(activeMedia?.asset.objectKey);
  const activeMediaType = getGalleryMediaType(activeMedia?.asset.mimeType);

  // Pointer / Touch Swipe State for horizontal gallery navigation on IMAGE stage only
  const pointerStartRef = useRef<{ x: number; y: number; id: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only track swipe on images to avoid competing with video native controls
    if (activeMediaType !== "image") return;
    if (!e.isPrimary) return;
    pointerStartRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeMediaType !== "image") {
      pointerStartRef.current = null;
      return;
    }
    if (!pointerStartRef.current || pointerStartRef.current.id !== e.pointerId) return;

    const deltaX = e.clientX - pointerStartRef.current.x;
    const deltaY = e.clientY - pointerStartRef.current.y;
    pointerStartRef.current = null;

    const swipeDir = resolveSwipeDirection({
      deltaX,
      deltaY,
      itemCount: eligibleGallery.length,
    });

    if (swipeDir === "next") {
      const next = (activeIndex + 1) % eligibleGallery.length;
      setUserSelectedIndex(next);
      buttonRefs.current[next]?.focus();
    } else if (swipeDir === "prev") {
      const prev = (activeIndex - 1 + eligibleGallery.length) % eligibleGallery.length;
      setUserSelectedIndex(prev);
      buttonRefs.current[prev]?.focus();
    }
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
  };

  const activeAltText =
    activeMedia?.asset.altText ??
    `${brandName} ${productName} - ${selectedVariant.title} - Vista ${activeIndex + 1}`;

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (index + 1) % eligibleGallery.length;
      setUserSelectedIndex(next);
      buttonRefs.current[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (index - 1 + eligibleGallery.length) % eligibleGallery.length;
      setUserSelectedIndex(prev);
      buttonRefs.current[prev]?.focus();
    }
  };

  const isLcpImage = Boolean(
    activeMedia && activeMedia.mediaAssetId === initialLcpAssetId && activeMediaType === "image"
  );

  const stageClassName = `${styles.mainStage} ${
    activeMediaType === "video" ? styles.mainStageVideo : styles.mainStageImage
  }`;

  return (
    <div className={styles.galleryContainer} data-testid="product-media-gallery">
      <div
        className={stageClassName}
        data-testid="gallery-main-stage"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {activeMediaUrl && activeMediaType === "image" ? (
          <Image
            src={activeMediaUrl}
            alt={activeAltText}
            fill
            priority={isLcpImage}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 58vw, 800px"
            className={styles.mainImage}
          />
        ) : activeMediaUrl && activeMediaType === "video" ? (
          <video
            src={activeMediaUrl}
            controls
            playsInline
            preload="metadata"
            className={styles.mainVideo}
            aria-label={activeAltText}
            data-testid="gallery-video-player"
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
            const itemType = getGalleryMediaType(item.asset.mimeType);
            const isVideo = itemType === "video";
            const thumbAlt =
              item.asset.altText ??
              `${isVideo ? "Video" : "Miniatura"} ${index + 1} de ${eligibleGallery.length}`;

            return (
              <li key={item.mediaAssetId} className={styles.thumbnailItem}>
                <button
                  ref={(el) => {
                    buttonRefs.current[index] = el;
                  }}
                  type="button"
                  onClick={() => setUserSelectedIndex(index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className={`${styles.thumbnailButton} ${isCurrent ? styles.thumbnailButtonActive : ""}`}
                  aria-label={`Ver ${isVideo ? "video" : "imagen"} ${index + 1} de ${eligibleGallery.length}`}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  {isVideo ? (
                    <div className={styles.thumbnailVideoIcon}>
                      <Video size={20} aria-hidden="true" />
                      <span className={styles.thumbnailVideoLabel}>Video</span>
                    </div>
                  ) : url ? (
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

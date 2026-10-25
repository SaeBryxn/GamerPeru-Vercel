"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import Link from "@/components/app-link";
import { AnimatePresence, m, type Transition, type Variants } from "framer-motion";
import type { ProductCardImage } from "@/lib/catalog/types";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { ProductCardFallback } from "./product-card-fallback";
import { ViewDot } from "./view-dot";
import styles from "./product-card.module.css";

const IMAGE_SIZES =
  "(max-width: 480px) 50vw, (max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw";

// direction +1: the next photo enters from the right and the current one leaves to the left.
const SWIPE_VARIANTS: Variants = {
  enter: (direction: number) => ({ x: direction > 0 ? "100%" : "-100%" }),
  center: { x: "0%" },
  exit: (direction: number) => ({ x: direction > 0 ? "-100%" : "100%" }),
};

const SWIPE_TRANSITION: Transition = { duration: 0.42, ease: [0.22, 1, 0.36, 1] };

const TAB_VARIANTS: Variants = {
  hidden: { y: "100%" },
  shown: { y: "0%" },
};

const TAB_TRANSITION: Transition = { type: "spring", stiffness: 480, damping: 36, mass: 0.7 };

// A horizontal travel past this, clearly wider than it is tall, reads as a swipe rather than a tap.
const SWIPE_MIN_DISTANCE = 40;
const SWIPE_DOMINANCE = 1.2;

export interface ScrubGalleryProps {
  images: readonly ProductCardImage[];
  href?: string;
  altFallback: string;
  /** Whether the whole card is hovered or focused; raises the indicator tab. */
  isActive: boolean;
  /**
   * Whether a finger swipe across the photo changes it. Left off inside horizontal rails, where
   * the same gesture has to scroll the rail.
   */
  swipe?: boolean;
  /** Overlays drawn above the photos. Passed as elements so a scrub never re-renders them. */
  children?: React.ReactNode;
}

/**
 * The card's photo stage. Owns the scrub position so that moving the pointer re-renders only the
 * photos and the indicators, never the rest of the card: the overlays arrive as `children`, whose
 * element identity is unchanged by the stage's own state.
 */
export function ScrubGallery({
  images,
  href,
  altFallback,
  isActive,
  swipe = false,
  children,
}: ScrubGalleryProps): React.JSX.Element {
  const [[index, direction], setPosition] = useState<[number, number]>([0, 0]);
  const indexRef = useRef(0);
  // Other photos are only requested once a pointer shows interest in the card.
  const [hasEngaged, setHasEngaged] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // A swipe ends with a click on the photo link; that click must not open the product.
  const didSwipe = useRef(false);
  const canSwipe = swipe && images.length > 1;

  const goTo = (next: number) => {
    const current = indexRef.current;
    if (next === current) return;
    indexRef.current = next;
    setPosition([next, next > current ? 1 : -1]);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || images.length < 2) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    goTo(Math.min(images.length - 1, Math.max(0, Math.floor(ratio * images.length))));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canSwipe || event.pointerType === "mouse") return;
    touchStart.current = { x: event.clientX, y: event.clientY };
    didSwipe.current = false;
    setHasEngaged(true);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) return;
    didSwipe.current = true;
    const next = indexRef.current + (dx < 0 ? 1 : -1);
    goTo(Math.min(images.length - 1, Math.max(0, next)));
  };

  const current = images[index];
  const currentUrl = resolvePublicMediaUrl(current?.objectKey);

  const photos = currentUrl ? (
    <div className={styles.imageStack}>
      <AnimatePresence initial={false} custom={direction}>
        <m.div
          key={current?.objectKey}
          className={styles.imageLayer}
          custom={direction}
          variants={SWIPE_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={SWIPE_TRANSITION}
        >
          <Image
            src={currentUrl}
            alt={index === 0 ? (current?.altText ?? altFallback) : ""}
            fill
            sizes={IMAGE_SIZES}
            className={styles.image}
          />
        </m.div>
      </AnimatePresence>

      {/* Same sizes as the visible photo, so the browser caches exactly the files a swipe needs. */}
      {hasEngaged && (
        <div className={styles.preload} aria-hidden="true">
          {images.map((image, i) => {
            const url = i === index ? null : resolvePublicMediaUrl(image.objectKey);
            return url ? (
              <Image key={image.objectKey} src={url} alt="" fill sizes={IMAGE_SIZES} />
            ) : null;
          })}
        </div>
      )}
    </div>
  ) : (
    <ProductCardFallback />
  );

  return (
    <div
      className={styles.mediaStage}
      style={canSwipe ? { touchAction: "pan-y" } : undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        touchStart.current = null;
      }}
      onClickCapture={(event) => {
        if (!didSwipe.current) return;
        didSwipe.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHasEngaged(true);
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") goTo(0);
      }}
    >
      {href ? (
        <Link href={href} className={styles.mediaLink} tabIndex={-1} aria-hidden="true">
          {photos}
        </Link>
      ) : (
        photos
      )}

      {children}

      {images.length > 1 && (
        <m.div
          className={styles.dotsTab}
          variants={TAB_VARIANTS}
          initial={false}
          animate={isActive || canSwipe ? "shown" : "hidden"}
          transition={TAB_TRANSITION}
          aria-hidden="true"
        >
          {images.map((image, i) => (
            <ViewDot key={image.objectKey} isActive={i === index} />
          ))}
        </m.div>
      )}
    </div>
  );
}

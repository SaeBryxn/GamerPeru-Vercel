"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, type Transition, type Variants } from "framer-motion";
import { Eye } from "lucide-react";
import { DomeButton, DomeLink } from "@/components/ui";
import { WishlistButton } from "@/components/wishlist";
import type { ProductCardImage, ProductDiscoveryItem } from "@/lib/catalog/types";
import { formatCurrency } from "@/lib/utils/currency";
import { CardAddToCartButton } from "./card-add-to-cart-button";
import { QuickViewDialog } from "./quick-view-dialog";
import { ScrubGallery } from "./scrub-gallery";
import { SpecSwapBar } from "./spec-swap-bar";
import { useCanHover } from "@/components/ui/use-can-hover";
import styles from "./product-card.module.css";

const OVERLAY_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0 },
};

const OVERLAY_TRANSITION: Transition = { type: "spring", stiffness: 520, damping: 34, mass: 0.6 };

/** What the overlaid action does: open the product to pick options, or add it outright. */
export type ProductCardAction = "choose-options" | "add-to-cart";

export interface ProductCardProps {
  product: ProductDiscoveryItem;
  href?: string;
  showBrandLink?: boolean;
  /**
   * `add-to-cart` adds the product directly when it sells a single variant; a product with
   * options still leads to its page, since there is nothing to add until one is chosen.
   */
  action?: ProductCardAction;
  /** Swipe through the photos on touch. Off inside horizontal rails, which need the gesture. */
  gallerySwipe?: boolean;
}

/** The card's photos: its gallery when the reader provides one, otherwise the single card image. */
function cardImages(product: ProductDiscoveryItem): ProductCardImage[] {
  if (product.gallery && product.gallery.length > 0) return product.gallery;
  return product.primaryMedia
    ? [{ objectKey: product.primaryMedia.objectKey, altText: product.primaryMedia.altText }]
    : [];
}

/**
 * ProductCard
 *
 * The single discovery card used by category and brand grids and by the mega-menu shelves.
 *
 * Invariants:
 * 1. Without `href` the media and title are not links; the overlays only exist with `href`.
 * 2. Brand name links to `/marcas/[slug]` unless `showBrandLink=false`.
 * 3. Moving a mouse across the photo scrubs through up to three views; on touch a swipe across it
 *    does the same (outside rails), and the overlays stay visible where there is no hover.
 * 4. The compare-at price is shown only when it is higher than the current price.
 * 5. Activating the card swaps the spec strip to its second pair.
 */
export function ProductCard({
  product,
  href,
  showBrandLink = true,
  action = "choose-options",
  gallerySwipe = true,
}: ProductCardProps): React.JSX.Element {
  const canHover = useCanHover();
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);

  // The quick view renders inside the card, so pointer and focus there must not count as the card.
  const isActive = !isQuickViewOpen && (isHovered || hasFocusWithin);
  // Without hover the quick view stays reachable, but the central action is left out: on a narrow
  // touch card it would cover the photo, and tapping the card already opens the product.
  const showQuickView = isActive || !canHover;
  const images = cardImages(product);
  const altFallback = `${product.brand.name} ${product.name}`;

  const compareAt = product.compareAtPriceCents ?? null;
  const isOnSale = compareAt !== null && compareAt > product.startingPriceCents;
  const hasSinglePrice = Boolean(product.singleVariantId);

  const primaryAction =
    action === "add-to-cart" && product.singleVariantId ? (
      <CardAddToCartButton variantId={product.singleVariantId} productName={product.name} />
    ) : (
      <DomeLink
        href={href ?? "#"}
        tone="dark"
        className={styles.actionButton}
        aria-label={`Elegir opciones de ${product.name}`}
      >
        Elegir opciones
      </DomeLink>
    );

  const overlays = href ? (
    <>
      <motion.div
        className={styles.quickViewSlot}
        variants={OVERLAY_VARIANTS}
        initial={false}
        animate={showQuickView ? "shown" : "hidden"}
        transition={OVERLAY_TRANSITION}
        style={{ pointerEvents: showQuickView ? "auto" : "none" }}
      >
        <DomeButton
          tone="light"
          domeRise="-75%"
          className={styles.quickViewButton}
          aria-label={`Vista rápida de ${product.name}`}
          aria-haspopup="dialog"
          onClick={(event) => {
            // Inside the mega-menu a click would otherwise bubble up and close the panel.
            event.stopPropagation();
            setIsHovered(false);
            setIsQuickViewOpen(true);
          }}
        >
          <Eye size={18} aria-hidden="true" />
        </DomeButton>
      </motion.div>

      <motion.div
        className={styles.actionSlot}
        variants={OVERLAY_VARIANTS}
        initial={false}
        animate={isActive ? "shown" : "hidden"}
        transition={OVERLAY_TRANSITION}
        style={{ pointerEvents: isActive ? "auto" : "none" }}
      >
        {primaryAction}
      </motion.div>
    </>
  ) : null;

  return (
    <article
      className={`${styles.card} ${href ? styles.interactiveCard : ""}`}
      data-testid="product-card"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || isQuickViewOpen) return;
        setIsHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse" || isQuickViewOpen) return;
        setIsHovered(false);
      }}
      onFocus={() => setHasFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasFocusWithin(false);
      }}
    >
      <ScrubGallery
        images={images}
        href={href}
        altFallback={altFallback}
        isActive={isActive}
        swipe={gallerySwipe && !canHover}
      >
        <div className={styles.wishlistSlot}>
          <WishlistButton productId={product.id} productName={product.name} />
        </div>
        {overlays}
      </ScrubGallery>

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
          {!hasSinglePrice && <span className={styles.pricePrefix}>Desde</span>}
          <span
            className={isOnSale ? `${styles.priceValue} ${styles.priceSale}` : styles.priceValue}
          >
            {formatCurrency(product.startingPriceCents)}
          </span>
          {isOnSale && (
            <s className={styles.compareAt}>
              <span className={styles.srOnly}>Precio anterior: </span>
              {formatCurrency(compareAt)}
            </s>
          )}
        </div>
      </div>

      {product.specs && <SpecSwapBar specs={product.specs} active={isActive} />}

      {href && isQuickViewOpen && (
        <QuickViewDialog
          product={product}
          href={href}
          images={images}
          onClose={() => setIsQuickViewOpen(false)}
        />
      )}
    </article>
  );
}

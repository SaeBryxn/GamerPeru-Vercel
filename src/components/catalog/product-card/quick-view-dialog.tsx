"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { CloseButton, DomeLink } from "@/components/ui";
import { WishlistButton } from "@/components/wishlist";
import type { ProductCardImage, ProductDiscoveryItem } from "@/lib/catalog/types";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { formatCurrency } from "@/lib/utils/currency";
import { CardAddToCartButton } from "./card-add-to-cart-button";
import { ProductCardFallback } from "./product-card-fallback";
import { ViewDot } from "./view-dot";
import styles from "./quick-view-dialog.module.css";

const PANEL_ENTER = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;
const PANEL_EXIT = { duration: 0.18, ease: [0.4, 0, 1, 1] } as const;

export interface QuickViewDialogProps {
  product: ProductDiscoveryItem;
  href: string;
  images: ProductCardImage[];
  onClose: () => void;
}

/**
 * A glance at a product without leaving the listing: its photos, price, specs and the same primary
 * action as the card. Mounted only while open; the native modal dialog provides the focus trap and
 * Escape handling, and the dialog closes once the exit animation finishes.
 */
export function QuickViewDialog({
  product,
  href,
  images,
  onClose,
}: QuickViewDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [isVisible, setIsVisible] = useState(true);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const requestClose = () => setIsVisible(false);

  const compareAt = product.compareAtPriceCents ?? null;
  const isOnSale = compareAt !== null && compareAt > product.startingPriceCents;
  const activeUrl = resolvePublicMediaUrl(images[activeImage]?.objectKey);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        // Links still bubble so a surrounding menu closes on navigation; everything else stays here.
        if (!(event.target as Element).closest("a")) event.stopPropagation();
        if (event.target === event.currentTarget) requestClose();
      }}
      data-testid="quick-view-dialog"
    >
      <AnimatePresence
        onExitComplete={() => {
          dialogRef.current?.close();
          onClose();
        }}
      >
        {isVisible && (
          <>
            <motion.div
              className={styles.backdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: PANEL_EXIT }}
              transition={{ duration: 0.2 }}
              onClick={requestClose}
              aria-hidden="true"
            />
            <motion.div
              className={styles.panel}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98, transition: PANEL_EXIT }}
              transition={PANEL_ENTER}
            >
              <div className={styles.closeSlot}>
                <CloseButton aria-label="Cerrar vista rápida" onClick={requestClose} />
              </div>

              <div className={styles.gallery}>
                <div className={styles.stage}>
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.div
                      key={activeImage}
                      className={styles.stageImage}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.22 }}
                    >
                      {activeUrl ? (
                        <Image
                          src={activeUrl}
                          alt={images[activeImage]?.altText ?? product.name}
                          fill
                          sizes="(max-width: 768px) 100vw, 440px"
                          className={styles.image}
                        />
                      ) : (
                        <ProductCardFallback />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {images.length > 1 && (
                  <div className={styles.thumbs}>
                    {images.map((image, index) => (
                      <button
                        key={image.objectKey}
                        type="button"
                        className={styles.dotButton}
                        aria-label={`Ver imagen ${index + 1} de ${images.length}`}
                        aria-pressed={index === activeImage}
                        onClick={() => setActiveImage(index)}
                      >
                        <ViewDot isActive={index === activeImage} size={8} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.details}>
                <p className={styles.brand}>{product.brand.name}</p>
                <h2 id={titleId} className={styles.title}>
                  {product.name}
                </h2>
                {product.subtitle && <p className={styles.subtitle}>{product.subtitle}</p>}

                <div className={styles.priceBlock}>
                  {!product.singleVariantId && <span className={styles.pricePrefix}>Desde</span>}
                  <span className={isOnSale ? `${styles.price} ${styles.priceSale}` : styles.price}>
                    {formatCurrency(product.startingPriceCents)}
                  </span>
                  {isOnSale && (
                    <s className={styles.compareAt}>
                      <span className={styles.srOnly}>Precio anterior: </span>
                      {formatCurrency(compareAt)}
                    </s>
                  )}
                </div>

                {product.specs && product.specs.length > 0 && (
                  <dl className={styles.specs}>
                    {product.specs.map((spec) => (
                      <div key={spec.key} className={styles.specItem}>
                        <dt>{spec.label}</dt>
                        <dd>{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                <div className={styles.actions}>
                  <div className={styles.actionRow}>
                    {product.singleVariantId ? (
                      <CardAddToCartButton
                        variantId={product.singleVariantId}
                        productName={product.name}
                        className={styles.primaryAction}
                        onBeforeDrawer={() => {
                          dialogRef.current?.close();
                          onClose();
                        }}
                      />
                    ) : (
                      <DomeLink href={href} tone="dark" className={styles.primaryAction}>
                        Elegir opciones
                      </DomeLink>
                    )}
                    <WishlistButton
                      productId={product.id}
                      productName={product.name}
                      variant="inline"
                    />
                  </div>
                  <Link href={href} className={styles.detailsLink}>
                    Ver detalles del producto
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </dialog>
  );
}

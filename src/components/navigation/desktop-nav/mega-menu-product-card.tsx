"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { DomeButton, LiquidIcon } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import type { MegaMenuProduct } from "../types";
import { useImageScrub } from "./use-image-scrub";
import styles from "./desktop-nav.module.css";

// Must match --info-dots-row in desktop-nav.module.css.
const DOTS_ROW_HEIGHT = 32;
const INFO_COLLAPSED = `inset(${DOTS_ROW_HEIGHT}px 0px 0px 0px round 12px)`;
const INFO_EXPANDED = "inset(0px 0px 0px 0px round 12px)";

// Quick enough to track the cursor, soft enough to read as a slide.
const SWISH_TRANSITION = { type: "spring", stiffness: 260, damping: 32, mass: 0.8 } as const;

export interface MegaMenuProductCardProps {
  product: MegaMenuProduct;
  /** Entrance variants driven by the parent shelf stagger. */
  variants?: Variants;
  onNavigate: () => void;
}

export function MegaMenuProductCard({ product, variants, onNavigate }: MegaMenuProductCardProps) {
  // An image that fails to load collapses to the card surface instead of a broken-image icon.
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(() => new Set());
  const images = product.images.filter((src) => !failedImages.has(src));

  const { index, onMouseMove, onMouseLeave } = useImageScrub(images.length);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const isActive = isHovered || hasFocusWithin;

  return (
    <motion.article
      className={styles.productCard}
      variants={variants}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setHasFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasFocusWithin(false);
      }}
    >
      <div className={styles.productMedia} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
        {/* Duplicate of the title link for pointer users; hidden from AT to avoid a redundant stop. */}
        <Link
          href={product.href}
          className={styles.productMediaLink}
          tabIndex={-1}
          aria-hidden="true"
          onClick={onNavigate}
        >
          {/*
            All angles stay mounted side by side as a track, each offset by its
            distance from the active index, so a zone change slides in from the
            matching side instead of cutting, with no fetch delay.
          */}
          {images.map((src, imageIndex) => (
            <motion.span
              key={src}
              className={styles.productSlide}
              initial={false}
              animate={{ x: `${(imageIndex - index) * 100}%` }}
              transition={SWISH_TRANSITION}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="(min-width: 1536px) 20vw, 25vw"
                className={styles.productImage}
                onError={() => setFailedImages((prev) => new Set(prev).add(src))}
              />
            </motion.span>
          ))}
        </Link>
        <span className={styles.quickViewSlot}>
          <DomeButton
            tone="light"
            domeRise="-72%"
            className={styles.quickViewButton}
            aria-label={`Vista rápida de ${product.title}`}
            onClick={() => console.log("quick-view", product.id)}
          >
            <LiquidIcon active={isActive} size={18} />
          </DomeButton>
        </span>
      </div>

      {/*
        The info box overlaps the image by the dots row. At rest that row is
        clipped away; on hover the clip opens upward, so the box appears to grow
        and reveal the dots, with the cart action floating just above.
      */}
      <div className={styles.productInfoArea}>
        <span className={styles.addToCartSlot}>
          <DomeButton
            tone="dark"
            className={styles.addToCartButton}
            onClick={() => console.log("add-to-cart", product.id)}
          >
            Agregar al carrito
          </DomeButton>
        </span>

        <motion.div
          className={styles.productInfo}
          initial={false}
          animate={{ clipPath: isActive ? INFO_EXPANDED : INFO_COLLAPSED }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
        >
          <span className={styles.scrubDots} aria-hidden="true">
            {images.length > 1 &&
              images.map((src, imageIndex) => (
                <span
                  key={src}
                  className={[styles.scrubDot, imageIndex === index ? styles.scrubDotActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                />
              ))}
          </span>
          <h3 className={styles.productTitle}>
            <Link href={product.href} className={styles.productLink} onClick={onNavigate}>
              {product.title}
            </Link>
          </h3>
          <p className={styles.productPrice}>{formatCurrency(product.priceCents)}</p>
        </motion.div>
      </div>
    </motion.article>
  );
}

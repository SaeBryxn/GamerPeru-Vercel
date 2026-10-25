"use client";

import React from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Heart } from "lucide-react";
import { ProductCard } from "@/components/catalog/product-card/product-card";
import { DomeLink } from "@/components/ui";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import accountStyles from "@/components/account/account.module.css";
import { useOptionalWishlist } from "./wishlist-provider";
import styles from "./wishlist-grid.module.css";

/**
 * The saved products, as the same cards the catalog uses. Un-hearting a card removes it right
 * away instead of waiting for a reload; until the client state is loaded, the server list stands.
 */
export function WishlistGrid({ products }: { products: ProductDiscoveryItem[] }) {
  const wishlist = useOptionalWishlist();
  const reduceMotion = useReducedMotion();
  const visible =
    wishlist?.isReady === true
      ? products.filter((product) => wishlist.isSaved(product.id))
      : products;

  if (visible.length === 0) {
    return (
      <div className={`${accountStyles.card} ${accountStyles.emptyState}`}>
        <span className={accountStyles.emptyIcon}>
          <Heart size={24} aria-hidden="true" />
        </span>
        <h2 className={accountStyles.cardTitle}>Aún no tienes favoritos</h2>
        <p className={accountStyles.cardText}>
          Toca el corazón de cualquier producto para guardarlo aquí y volver a él cuando quieras.
        </p>
        <DomeLink href="/buscar" tone="dark" className={accountStyles.domeSmall}>
          Explorar la tienda
        </DomeLink>
      </div>
    );
  }

  return (
    <ul className={styles.grid} data-testid="wishlist-grid">
      <AnimatePresence initial={false}>
        {visible.map((product) => (
          <m.li
            key={product.id}
            className={styles.item}
            layout={!reduceMotion}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <ProductCard product={product} href={`/productos/${product.slug}`} />
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

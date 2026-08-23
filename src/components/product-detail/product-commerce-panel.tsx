"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { AlertCircle, ShoppingCart } from "lucide-react";
import { useCart } from "@/components/cart";
import { Button, Icon } from "@/components/ui";
import type { ProductVariantDetail } from "@/lib/catalog/product-detail-types";
import { formatCurrency } from "@/lib/utils/currency";
import { VariantSelector } from "./variant-selector";
import styles from "./product-commerce-panel.module.css";

export interface ProductCommercePanelProps {
  product: {
    id: string;
    name: string;
    subtitle: string | null;
  };
  brand: {
    name: string;
    slug: string;
  };
  variants: ProductVariantDetail[];
  selectedVariant: ProductVariantDetail;
  onSelectVariant: (variant: ProductVariantDetail) => void;
}

export function ProductCommercePanel({
  product,
  brand,
  variants,
  selectedVariant,
  onSelectVariant,
}: ProductCommercePanelProps): React.JSX.Element {
  const { isMutating, pendingVariantIds, addItem, openDrawer, lastError } = useCart();
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const isPending = isMutating || pendingVariantIds.has(selectedVariant.id);
  const isAvailable = selectedVariant.status === "ACTIVE";

  const handleAddToCart = async () => {
    const success = await addItem(selectedVariant.id, 1);
    if (success) {
      openDrawer({ returnFocusTo: addButtonRef.current });
    }
  };

  const showCompareAt =
    selectedVariant.compareAtPriceCents !== null &&
    selectedVariant.compareAtPriceCents > selectedVariant.priceCents;

  const discountPercent = showCompareAt
    ? Math.round(
        ((selectedVariant.compareAtPriceCents! - selectedVariant.priceCents) /
          selectedVariant.compareAtPriceCents!) *
          100
      )
    : null;

  return (
    <div className={styles.panelContainer} data-testid="product-commerce-panel">
      {/* Brand Header Link */}
      <Link href={`/marcas/${brand.slug}`} className={styles.brandLink}>
        {brand.name}
      </Link>

      {/* Product Title & Subtitle */}
      <h1 className={styles.title}>{product.name}</h1>
      {product.subtitle && <p className={styles.subtitle}>{product.subtitle}</p>}

      {/* Pricing Cluster */}
      <div className={styles.priceCluster} data-testid="price-cluster">
        <span className={styles.sellingPrice} data-testid="selling-price">
          {formatCurrency(selectedVariant.priceCents)}
        </span>

        {showCompareAt && (
          <span className={styles.compareAtPrice} data-testid="compare-at-price">
            {formatCurrency(selectedVariant.compareAtPriceCents!)}
          </span>
        )}

        {discountPercent !== null && discountPercent > 0 && (
          <span className={styles.discountBadge} data-testid="discount-badge">
            -{discountPercent}%
          </span>
        )}
      </div>

      {/* Meta Row: SKU & Weight */}
      <div className={styles.metaRow}>
        <span className={styles.skuTag} data-testid="variant-sku">
          SKU: {selectedVariant.sku}
        </span>
        {selectedVariant.weightGrams !== null && (
          <span className={styles.weightTag} data-testid="variant-weight">
            Peso: {selectedVariant.weightGrams} g
          </span>
        )}
      </div>

      {/* Interactive Variant Selectors */}
      <VariantSelector
        variants={variants}
        selectedVariant={selectedVariant}
        onSelectVariant={onSelectVariant}
      />

      {/* Primary Add-to-Cart Action */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
        <Button
          ref={addButtonRef}
          variant="primary"
          fullWidth
          onClick={handleAddToCart}
          disabled={!isAvailable || isPending}
          data-testid="pdp-add-to-cart-button"
        >
          <Icon icon={ShoppingCart} size="md" aria-hidden="true" style={{ marginRight: "8px" }} />
          {!isAvailable ? "No disponible" : isPending ? "Añadiendo..." : "Añadir al carrito"}
        </Button>

        {lastError && !isPending && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              borderRadius: "4px",
              backgroundColor: "rgba(255, 77, 79, 0.1)",
              border: "1px solid #ff4d4f",
              color: "#ff4d4f",
              fontSize: "13px",
            }}
            data-testid="pdp-add-to-cart-error"
          >
            <Icon icon={AlertCircle} size="sm" aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>{lastError}</span>
          </div>
        )}
      </div>

      {/* Static Payment Trust Box */}
      <div className={styles.paymentTrustBox} data-testid="payment-trust-box">
        <p className={styles.paymentTrustTitle}>Pago Seguro en Soles</p>
        <p className={styles.paymentTrustText}>
          Verificación manual mediante <strong>Yape</strong> o <strong>Plin</strong> al coordinar tu
          pedido con Gamer Perú.
        </p>
      </div>
    </div>
  );
}

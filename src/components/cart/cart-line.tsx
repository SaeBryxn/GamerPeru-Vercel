"use client";

import React from "react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { Icon } from "@/components/ui";
import type { CartLineSnapshot } from "@/lib/cart/types";
import { formatCurrency } from "@/lib/utils/currency";
import { CartQuantityControl } from "./cart-quantity-control";
import styles from "./cart-line.module.css";

export interface CartLineProps {
  line: CartLineSnapshot;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
  disabled?: boolean;
  className?: string;
}

export function CartLine({
  line,
  onUpdateQuantity,
  onRemove,
  disabled = false,
  className,
}: CartLineProps): React.JSX.Element {
  const mediaUrl = line.primaryMedia?.url;

  const attributesText = Object.entries(line.selectedAttributes)
    .map(([key, val]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${val}`)
    .join(" · ");

  return (
    <div
      className={[styles.lineContainer, !line.available && styles.lineUnavailable, className]
        .filter(Boolean)
        .join(" ")}
      data-testid="cart-line-item"
      data-variant-id={line.variantId}
    >
      {/* Thumbnail */}
      <div className={styles.thumbnailWrapper}>
        {mediaUrl ? (
          <Image
            src={mediaUrl}
            alt={line.primaryMedia?.altText ?? line.productName}
            width={72}
            height={72}
            className={styles.thumbnailImage}
          />
        ) : (
          <div className={styles.placeholderThumbnail} aria-hidden="true">
            <span>GP</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className={styles.infoCol}>
        <div className={styles.titleRow}>
          <h3 className={styles.productName}>{line.productName}</h3>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className={styles.removeButton}
            aria-label={`Eliminar ${line.productName} del carrito`}
            data-testid="cart-line-remove"
          >
            <Icon icon={Trash2} size="sm" aria-hidden="true" />
          </button>
        </div>

        {attributesText && <p className={styles.attributesText}>{attributesText}</p>}

        {!line.available && (
          <span className={styles.unavailableBadge} data-testid="cart-line-unavailable-badge">
            No disponible
          </span>
        )}

        <div className={styles.priceAndQtyRow}>
          <div className={styles.unitPrice}>{formatCurrency(line.unitPriceCents)}</div>

          <CartQuantityControl
            quantity={line.quantity}
            productName={line.productName}
            onIncrement={() => onUpdateQuantity(line.quantity + 1)}
            onDecrement={() => onUpdateQuantity(line.quantity - 1)}
            disabled={disabled || !line.available}
          />

          <div className={styles.lineSubtotal} data-testid="cart-line-subtotal">
            {formatCurrency(line.lineSubtotalCents)}
          </div>
        </div>
      </div>
    </div>
  );
}

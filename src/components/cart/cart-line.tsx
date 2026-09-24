"use client";

import React from "react";
import Image from "next/image";
import { formatCurrency } from "@/lib/utils/currency";
import type { CartLineSnapshot } from "@/lib/cart/types";
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

  // Variant attributes read as one quiet line under the title ("Mini / Negro").
  const variantText = Object.values(line.selectedAttributes).join(" / ");

  return (
    <div
      className={[styles.lineContainer, !line.available && styles.lineUnavailable, className]
        .filter(Boolean)
        .join(" ")}
      data-testid="cart-line-item"
      data-variant-id={line.variantId}
    >
      <div className={styles.thumbnailWrapper}>
        {mediaUrl ? (
          <Image
            src={mediaUrl}
            alt={line.primaryMedia?.altText ?? line.productName}
            width={88}
            height={88}
            className={styles.thumbnailImage}
          />
        ) : (
          <div className={styles.placeholderThumbnail} aria-hidden="true">
            <span>GP</span>
          </div>
        )}
      </div>

      <div className={styles.infoCol}>
        <h3 className={styles.productName}>{line.productName}</h3>
        {variantText && <p className={styles.variantText}>{variantText}</p>}
        <p className={styles.unitPrice}>{formatCurrency(line.unitPriceCents)}</p>

        {!line.available && (
          <span className={styles.unavailableBadge} data-testid="cart-line-unavailable-badge">
            No disponible
          </span>
        )}
      </div>

      <div className={styles.actionsCol}>
        <CartQuantityControl
          quantity={line.quantity}
          productName={line.productName}
          onIncrement={() => onUpdateQuantity(line.quantity + 1)}
          onDecrement={() => onUpdateQuantity(line.quantity - 1)}
          disabled={disabled || !line.available}
        />

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className={styles.removeButton}
          aria-label={`Quitar ${line.productName} del carrito`}
          data-testid="cart-line-remove"
        >
          Quitar
        </button>

        <span className={styles.lineSubtotal} data-testid="cart-line-subtotal">
          {formatCurrency(line.lineSubtotalCents)}
        </span>
      </div>
    </div>
  );
}

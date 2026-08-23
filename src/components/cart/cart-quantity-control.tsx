"use client";

import React from "react";
import { Minus, Plus } from "lucide-react";
import { Icon } from "@/components/ui";
import styles from "./cart-quantity-control.module.css";

export interface CartQuantityControlProps {
  quantity: number;
  productName: string;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  min?: number;
  max?: number;
}

export function CartQuantityControl({
  quantity,
  productName,
  onIncrement,
  onDecrement,
  disabled = false,
  min = 1,
  max = 10,
}: CartQuantityControlProps): React.JSX.Element {
  const isMin = quantity <= min;
  const isMax = quantity >= max;

  return (
    <div className={styles.container} role="group" aria-label={`Cantidad para ${productName}`}>
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled || isMin}
        className={styles.button}
        aria-label={`Disminuir cantidad de ${productName}`}
        data-testid="cart-qty-decrement"
      >
        <Icon icon={Minus} size="sm" aria-hidden="true" />
      </button>

      <span className={styles.quantity} aria-live="polite" data-testid="cart-qty-value">
        {quantity}
      </span>

      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled || isMax}
        className={styles.button}
        aria-label={`Aumentar cantidad de ${productName}`}
        data-testid="cart-qty-increment"
      >
        <Icon icon={Plus} size="sm" aria-hidden="true" />
      </button>
    </div>
  );
}

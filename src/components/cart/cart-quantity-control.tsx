"use client";

import React from "react";
import { m } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
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
      <m.span
        key={quantity}
        className={styles.quantity}
        aria-live="polite"
        data-testid="cart-qty-value"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      >
        {quantity}
      </m.span>

      <div className={styles.steppers}>
        <m.button
          type="button"
          onClick={onIncrement}
          disabled={disabled || isMax}
          className={styles.stepper}
          aria-label={`Aumentar cantidad de ${productName}`}
          data-testid="cart-qty-increment"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
        >
          <ChevronUp size={13} aria-hidden="true" />
        </m.button>
        <m.button
          type="button"
          onClick={onDecrement}
          disabled={disabled || isMin}
          className={styles.stepper}
          aria-label={`Disminuir cantidad de ${productName}`}
          data-testid="cart-qty-decrement"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
        >
          <ChevronDown size={13} aria-hidden="true" />
        </m.button>
      </div>
    </div>
  );
}

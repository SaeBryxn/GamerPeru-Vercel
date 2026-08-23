"use client";

import React from "react";
import { ShieldCheck } from "lucide-react";
import { Icon } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./cart-summary.module.css";

export interface CartSummaryProps {
  subtotalCents: number;
  className?: string;
}

export function CartSummary({ subtotalCents, className }: CartSummaryProps): React.JSX.Element {
  return (
    <div className={[styles.summaryContainer, className].filter(Boolean).join(" ")}>
      <div className={styles.subtotalRow}>
        <span className={styles.subtotalLabel}>Subtotal</span>
        <span className={styles.subtotalValue} data-testid="cart-subtotal-value">
          {formatCurrency(subtotalCents)}
        </span>
      </div>

      <div className={styles.trustBox} data-testid="cart-trust-box">
        <div className={styles.trustHeader}>
          <Icon icon={ShieldCheck} size="md" className={styles.trustIcon} aria-hidden="true" />
          <span className={styles.trustTitle}>Pago Seguro en Soles (PEN)</span>
        </div>
        <p className={styles.trustText}>
          La verificación de pago mediante <strong>Yape</strong> o <strong>Plin</strong> se coordina
          al confirmar tu pedido con Gamer Perú.
        </p>
      </div>
    </div>
  );
}

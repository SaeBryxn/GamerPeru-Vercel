"use client";

import React, { useState, useTransition } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { setVariantStockAction } from "@/lib/admin/inventory/actions";
import type { VariantStockRow } from "@/lib/admin/inventory/readers";
import styles from "./variant-stock-cell.module.css";

export interface VariantStockCellProps {
  productId: string;
  variantId: string;
  stock: VariantStockRow;
  canManage: boolean;
}

/**
 * Stock of one variant, edited in place. Writing goes through the inventory
 * engine as a physical count, so the change lands in the ledger.
 */
export function VariantStockCell({
  productId,
  variantId,
  stock,
  canManage,
}: VariantStockCellProps) {
  const [current, setCurrent] = useState(stock);
  const [draft, setDraft] = useState(String(stock.onHand));
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = draft.trim() !== String(current.onHand);

  const save = () => {
    const quantity = Number(draft);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("Usa un número entero de 0 o más.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setVariantStockAction({ productId, variantId, quantity });
      if (!result.success || !result.data) {
        setError(result.error ?? "No se pudo guardar.");
        return;
      }
      setCurrent({ variantId, ...result.data });
      setDraft(String(result.data.onHand));
      setSavedAt(Date.now());
    });
  };

  if (!canManage) {
    return (
      <span className={styles.readOnly} data-testid={`variant-stock-${variantId}`}>
        {current.onHand}
      </span>
    );
  }

  return (
    <div className={styles.cell}>
      <div className={styles.row}>
        <input
          type="number"
          min={0}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          className={styles.input}
          aria-label="Unidades en stock"
          disabled={isPending}
          data-testid={`variant-stock-input-${variantId}`}
        />
        <AnimatePresence initial={false}>
          {(isDirty || isPending) && (
            <m.button
              type="button"
              onClick={save}
              className={styles.saveButton}
              disabled={isPending}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.15 }}
              whileTap={{ scale: 0.96 }}
              data-testid={`variant-stock-save-${variantId}`}
            >
              {isPending ? (
                <Loader2 size={13} className={styles.spinner} aria-hidden="true" />
              ) : (
                "Guardar"
              )}
            </m.button>
          )}
        </AnimatePresence>
      </div>

      <span className={styles.meta}>
        {current.reserved > 0 || current.allocated > 0
          ? `${current.available} disponibles · ${current.reserved + current.allocated} comprometidas`
          : `${current.available} disponibles`}
      </span>

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}

      {!error && savedAt !== null && !isDirty && (
        <m.span
          key={savedAt}
          className={styles.saved}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Check size={12} aria-hidden="true" /> Guardado
        </m.span>
      )}
    </div>
  );
}

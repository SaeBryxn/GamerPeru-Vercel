"use client";
import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InventoryPageRow } from "@/lib/admin/inventory/page-reader";
import { setVariantStockAction } from "@/lib/admin/inventory/actions";
export function InventoryCountForm({ row }: { row: InventoryPageRow }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(row.on_hand));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    setQuantity(String(row.on_hand));
  }, [row.on_hand]);
  return (
    <details>
      <summary>Registrar conteo</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            try {
              const result = await setVariantStockAction({
                productId: row.product_id,
                variantId: row.variant_id,
                quantity: Number(quantity),
                expectedOnHand: row.on_hand,
                reason,
              });
              setMessage(
                result.success
                  ? Number(quantity) === row.on_hand
                    ? "El conteo coincide con el stock actual; no se generó un movimiento."
                    : "Conteo guardado y movimiento registrado."
                  : (result.error ?? "No se pudo guardar.")
              );
              if (result.success) {
                setReason("");
                router.refresh();
              }
            } catch {
              setMessage("No se pudo conectar. Actualiza antes de reintentar.");
            }
          });
        }}
      >
        <label>
          Unidades físicas
          <input
            type="number"
            min={0}
            step={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
            disabled={pending}
          />
        </label>
        <label>
          Motivo
          <input
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            disabled={pending}
          />
        </label>
        <button type="submit" disabled={pending || !reason.trim() || !quantity.trim()}>
          Guardar conteo
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}

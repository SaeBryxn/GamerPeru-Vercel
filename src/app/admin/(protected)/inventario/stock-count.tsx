"use client";
import React, { useEffect, useId, useRef, useState, useTransition } from "react";
import { AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
import type { InventoryPageRow } from "@/lib/admin/inventory/page-reader";
import { setVariantStockAction } from "@/lib/admin/inventory/actions";
import styles from "./inventory.module.css";

export function InventoryCountForm({ row }: { row: InventoryPageRow }) {
  const router = useRouter();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(row.on_hand));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    setQuantity(String(row.on_hand));
  }, [row.on_hand]);
  const close = () => {
    if (!pending) setOpen(false);
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.secondaryButton}
        aria-haspopup="dialog"
        onClick={() => {
          setQuantity(String(row.on_hand));
          setReason("");
          setMessage("");
          setOpen(true);
        }}
      >
        Registrar conteo
      </button>
      <AnimatePresence onExitComplete={() => triggerRef.current?.focus()}>
        {open && (
          <SideDrawer labelledBy={titleId} onClose={close} busy={pending}>
            <DrawerHeader
              titleId={titleId}
              title="Registrar conteo"
              eyebrow={row.sku}
              onClose={close}
              busy={pending}
            />
            <form
              className={styles.countForm}
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
              <p className={styles.countContext}>
                <strong>{row.product_name}</strong>
                <br />
                {row.title}
                <br />
                Ingresa el total que contaste físicamente. Las reservas y las unidades asignadas se
                mantienen separadas.
              </p>
              <dl className={styles.countSummary}>
                <div>
                  <dt>Físico actual</dt>
                  <dd>{row.on_hand}</dd>
                </div>
                <div>
                  <dt>Reservado</dt>
                  <dd>{row.reserved}</dd>
                </div>
                <div>
                  <dt>Asignado</dt>
                  <dd>{row.allocated}</dd>
                </div>
              </dl>
              <label>
                Unidades físicas
                <input
                  className={styles.input}
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
                <textarea
                  className={styles.input}
                  maxLength={500}
                  value={reason}
                  placeholder="Ej.: conteo de almacén del día"
                  onChange={(event) => setReason(event.target.value)}
                  required
                  disabled={pending}
                />
              </label>
              {message && (
                <p className={styles.message} role="status">
                  {message}
                </p>
              )}
              <div className={styles.countActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={close}
                  disabled={pending}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={pending || !reason.trim() || !quantity.trim()}
                >
                  {pending ? "Guardando…" : "Guardar conteo"}
                </button>
              </div>
            </form>
          </SideDrawer>
        )}
      </AnimatePresence>
    </>
  );
}

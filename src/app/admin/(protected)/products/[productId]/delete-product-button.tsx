"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { deleteProductAction } from "@/lib/admin/catalog/actions";
import type { CatalogStatus } from "@/lib/admin/catalog/types";
import styles from "./product-editor.module.css";

interface DeleteProductButtonProps {
  productId: string;
  productName: string;
  status: CatalogStatus;
  updatedAt: Date | string;
  /** Taking a live product down needs publish permission; without it the button explains why. */
  canDeleteLive: boolean;
}

/**
 * Permanent delete, behind a confirmation that names what goes. The server refuses products
 * that were ever ordered (they must be archived) and its message is shown as is.
 */
export function DeleteProductButton({
  productId,
  productName,
  status,
  updatedAt,
  canDeleteLive,
}: DeleteProductButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = status === "PUBLISHED" && !canDeleteLive;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteProductAction({
        productId,
        expectedUpdatedAt: new Date(updatedAt).toISOString(),
      });
      if (result.success) {
        router.replace("/admin/products");
        router.refresh();
        return;
      }
      setError(result.error ?? "No se pudo eliminar el producto.");
    } catch {
      setError("Error de conexión al eliminar. Puedes reintentar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.deleteButton}
        disabled={blocked || busy}
        title={
          blocked ? "Eliminar un producto en la tienda requiere permiso de publicación." : undefined
        }
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="btn-delete-product"
      >
        <Trash2 size={14} aria-hidden="true" />
        <span>Eliminar</span>
      </button>
      <ConfirmationDialog
        open={open}
        title={`Eliminar «${productName}»`}
        description={
          status === "PUBLISHED"
            ? "Se retirará de la tienda y se borrará para siempre junto con sus variantes, fotos vinculadas, ficha técnica, historia y existencias. No se puede deshacer."
            : "Se borrará para siempre junto con sus variantes, fotos vinculadas, ficha técnica, historia y existencias. No se puede deshacer."
        }
        confirmLabel={busy ? "Eliminando…" : "Eliminar para siempre"}
        busy={busy}
        tone="danger"
        onConfirm={confirm}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <p className={styles.deleteNote}>
          Si el producto ya tiene pedidos no se podrá eliminar: en ese caso archívalo para retirarlo
          de la tienda sin perder el historial.
        </p>
        {error && (
          <p className={styles.deleteError} role="alert" data-testid="delete-product-error">
            {error}
          </p>
        )}
      </ConfirmationDialog>
    </>
  );
}

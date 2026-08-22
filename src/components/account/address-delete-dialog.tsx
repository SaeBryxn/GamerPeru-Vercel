"use client";

import React, { useRef, type RefObject } from "react";
import type { CustomerAddressDTO } from "@/lib/account/types";
import { useModalFocus } from "./use-modal-focus";
import styles from "./address.module.css";

interface AddressDeleteDialogProps {
  address: CustomerAddressDTO;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export function AddressDeleteDialog({
  address,
  onConfirm,
  onCancel,
  isPending,
  returnFocusRef,
  fallbackFocusRef,
}: AddressDeleteDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const { modalRef } = useModalFocus<HTMLDivElement>({
    isOpen: true,
    onClose: onCancel,
    isPending,
    initialFocusRef: cancelButtonRef,
    returnFocusRef,
    fallbackFocusRef,
  });

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onCancel();
        }
      }}
    >
      <div
        ref={modalRef}
        className={styles.modalContent}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-desc"
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          <h2 id="delete-dialog-title" className={styles.modalTitle}>
            ¿Eliminar dirección?
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onCancel}
            disabled={isPending}
            aria-label="Cerrar confirmación"
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <p
            id="delete-dialog-desc"
            className={styles.emptyDesc}
            style={{ textAlign: "left", maxWidth: "none" }}
          >
            ¿Estás seguro de que deseas eliminar la dirección para{" "}
            <strong>{address.recipientName}</strong> (
            <em>
              {address.streetAddress}, {address.district}
            </em>
            )?
          </p>

          {address.isDefault && (
            <div
              className={`${styles.statusMessage} ${styles.statusError}`}
              style={{ marginTop: "1rem", marginBottom: 0 }}
              role="note"
            >
              Esta dirección está establecida como tu dirección predeterminada. Al eliminarla, tu
              cuenta no tendrá ninguna dirección predeterminada asignada.
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button
            ref={cancelButtonRef}
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.destructiveButton}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Eliminando..." : "Eliminar dirección"}
          </button>
        </div>
      </div>
    </div>
  );
}

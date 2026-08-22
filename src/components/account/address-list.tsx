"use client";

import React, { useState, useTransition } from "react";
import type { CustomerAddressDTO, AddressActionValidationErrors } from "@/lib/account/types";
import {
  createCustomerAddressAction,
  updateCustomerAddressAction,
  setDefaultCustomerAddressAction,
  deleteCustomerAddressAction,
} from "@/lib/account/address-actions";
import { AddressCard } from "./address-card";
import { AddressForm } from "./address-form";
import { AddressDeleteDialog } from "./address-delete-dialog";
import styles from "./address.module.css";

interface AddressListProps {
  addresses: CustomerAddressDTO[];
  defaultShippingAddressId: string | null;
}

export function AddressList({ addresses }: AddressListProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddressDTO | null>(null);
  const [deletingAddress, setDeletingAddress] = useState<CustomerAddressDTO | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpenCreate = () => {
    setEditingAddress(null);
    setIsFormOpen(true);
    setStatusMessage(null);
  };

  const handleOpenEdit = (address: CustomerAddressDTO) => {
    setEditingAddress(address);
    setIsFormOpen(true);
    setStatusMessage(null);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingAddress(null);
  };

  const handleSaveAddress = async (
    formData: FormData
  ): Promise<{ success: boolean; errors?: AddressActionValidationErrors }> => {
    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          const res = editingAddress
            ? await updateCustomerAddressAction(null, formData)
            : await createCustomerAddressAction(null, formData);

          if (res.success) {
            setStatusMessage({ type: "success", text: res.message });
            handleCloseForm();
            resolve({ success: true });
          } else {
            resolve({ success: false, errors: res.errors });
          }
        } catch {
          resolve({
            success: false,
            errors: { form: "Ocurrió un error inesperado al procesar la solicitud." },
          });
        }
      });
    });
  };

  const handleSetDefault = (addressId: string) => {
    setStatusMessage(null);
    startTransition(async () => {
      try {
        const res = await setDefaultCustomerAddressAction(null, { addressId });
        if (res.success) {
          setStatusMessage({ type: "success", text: res.message });
        } else {
          setStatusMessage({
            type: "error",
            text: res.errors.form ?? "No se pudo establecer como predeterminada.",
          });
        }
      } catch {
        setStatusMessage({
          type: "error",
          text: "Ocurrió un error inesperado al actualizar la dirección predeterminada.",
        });
      }
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deletingAddress) return;
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        try {
          const res = await deleteCustomerAddressAction(null, {
            addressId: deletingAddress.id,
          });
          if (res.success) {
            setStatusMessage({ type: "success", text: res.message });
            setDeletingAddress(null);
          } else {
            setStatusMessage({
              type: "error",
              text: res.errors.form ?? "No se pudo eliminar la dirección.",
            });
            setDeletingAddress(null);
          }
        } catch {
          setStatusMessage({
            type: "error",
            text: "Ocurrió un error inesperado al eliminar la dirección.",
          });
          setDeletingAddress(null);
        }
        resolve();
      });
    });
  };

  return (
    <div>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Direcciones de entrega</h1>
        <button
          type="button"
          className={styles.addButton}
          onClick={handleOpenCreate}
          disabled={isPending}
        >
          <span aria-hidden="true">＋</span>
          <span>Agregar dirección</span>
        </button>
      </div>

      {statusMessage && (
        <div
          className={`${styles.statusMessage} ${
            statusMessage.type === "success" ? styles.statusSuccess : styles.statusError
          }`}
          role={statusMessage.type === "success" ? "status" : "alert"}
          aria-live="polite"
        >
          <span aria-hidden="true">{statusMessage.type === "success" ? "✓" : "⚠"}</span>
          <span>{statusMessage.text}</span>
        </div>
      )}

      {addresses.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>No tienes direcciones guardadas</h2>
          <p className={styles.emptyDesc}>
            Guarda tus direcciones de entrega para agilizar tus futuras compras en Gamer Perú.
          </p>
          <button
            type="button"
            className={styles.addButton}
            onClick={handleOpenCreate}
            disabled={isPending}
          >
            <span aria-hidden="true">＋</span>
            <span>Agregar mi primera dirección</span>
          </button>
        </div>
      ) : (
        <div className={styles.addressGrid} role="list" aria-label="Lista de direcciones">
          {addresses.map((address) => (
            <div key={address.id} role="listitem">
              <AddressCard
                address={address}
                onEdit={handleOpenEdit}
                onDelete={(addr) => setDeletingAddress(addr)}
                onSetDefault={handleSetDefault}
                isPending={isPending}
              />
            </div>
          ))}
        </div>
      )}

      {isFormOpen && (
        <AddressForm
          initialAddress={editingAddress}
          onSave={handleSaveAddress}
          onCancel={handleCloseForm}
          isPending={isPending}
        />
      )}

      {deletingAddress && (
        <AddressDeleteDialog
          address={deletingAddress}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingAddress(null)}
          isPending={isPending}
        />
      )}
    </div>
  );
}

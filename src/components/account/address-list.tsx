"use client";

import React, { useState, useRef, useTransition } from "react";
import { AlertTriangle, CheckCircle2, MapPin, Plus } from "lucide-react";
import { DomeButton } from "@/components/ui";
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

  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const addAddressButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleOpenCreate = (invoker?: HTMLElement) => {
    returnFocusRef.current =
      invoker ?? (document.activeElement as HTMLElement | null) ?? addAddressButtonRef.current;
    setEditingAddress(null);
    setIsFormOpen(true);
    setStatusMessage(null);
  };

  const handleOpenEdit = (address: CustomerAddressDTO, invoker?: HTMLElement) => {
    returnFocusRef.current = invoker ?? (document.activeElement as HTMLElement | null);
    setEditingAddress(address);
    setIsFormOpen(true);
    setStatusMessage(null);
  };

  const handleOpenDelete = (address: CustomerAddressDTO, invoker?: HTMLElement) => {
    returnFocusRef.current = invoker ?? (document.activeElement as HTMLElement | null);
    setDeletingAddress(address);
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
        <h1 ref={pageHeadingRef} className={styles.title} tabIndex={-1}>
          Direcciones de entrega
        </h1>
        <button
          ref={addAddressButtonRef}
          type="button"
          className={styles.outlineButton}
          onClick={(e) => handleOpenCreate(e.currentTarget)}
          disabled={isPending}
        >
          <Plus size={14} aria-hidden="true" className={styles.buttonIcon} />
          Agregar dirección
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
          {statusMessage.type === "success" ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <AlertTriangle size={16} aria-hidden="true" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {addresses.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon} aria-hidden="true">
            <MapPin size={24} />
          </div>
          <h2 className={styles.emptyTitle}>No tienes direcciones guardadas</h2>
          <p className={styles.emptyDesc}>
            Guarda tus direcciones de entrega para agilizar tus futuras compras en Gamer Perú.
          </p>
          <DomeButton
            type="button"
            tone="dark"
            className={styles.addDome}
            onClick={(e) => handleOpenCreate(e.currentTarget)}
            disabled={isPending}
          >
            <Plus size={16} aria-hidden="true" className={styles.buttonIcon} />
            Agregar mi primera dirección
          </DomeButton>
        </div>
      ) : (
        <div className={styles.addressGrid} role="list" aria-label="Lista de direcciones">
          {addresses.map((address) => (
            <div key={address.id} role="listitem">
              <AddressCard
                address={address}
                onEdit={handleOpenEdit}
                onDelete={handleOpenDelete}
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
          returnFocusRef={returnFocusRef}
          fallbackFocusRef={addAddressButtonRef}
        />
      )}

      {deletingAddress && (
        <AddressDeleteDialog
          address={deletingAddress}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingAddress(null)}
          isPending={isPending}
          returnFocusRef={returnFocusRef}
          fallbackFocusRef={pageHeadingRef}
        />
      )}
    </div>
  );
}

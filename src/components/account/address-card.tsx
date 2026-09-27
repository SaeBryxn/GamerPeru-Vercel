"use client";

import React from "react";
import { Phone, Star } from "lucide-react";
import { DomeButton } from "@/components/ui";
import type { CustomerAddressDTO } from "@/lib/account/types";
import styles from "./address.module.css";

interface AddressCardProps {
  address: CustomerAddressDTO;
  onEdit: (address: CustomerAddressDTO, invoker?: HTMLElement) => void;
  onDelete: (address: CustomerAddressDTO, invoker?: HTMLElement) => void;
  onSetDefault: (addressId: string) => void;
  isPending?: boolean;
}

export function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  isPending = false,
}: AddressCardProps) {
  const fullAddressLine = address.apartmentSuite
    ? `${address.streetAddress}, ${address.apartmentSuite}`
    : address.streetAddress;

  const locationLine = `${address.district}, ${address.province}, ${address.department}${
    address.postalCode ? ` (${address.postalCode})` : ""
  }`;

  return (
    <article
      className={`${styles.addressCard} ${address.isDefault ? styles.addressCardDefault : ""}`}
      aria-label={`Dirección para ${address.recipientName}`}
    >
      <div className={styles.cardHeader}>
        <h3 className={styles.recipientName}>{address.recipientName}</h3>
        {address.isDefault && (
          <span className={styles.defaultBadge} aria-label="Dirección predeterminada">
            <Star size={11} fill="currentColor" aria-hidden="true" />
            Predeterminada
          </span>
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.addressLine}>{fullAddressLine}</div>
        <div className={styles.locationLine}>{locationLine}</div>
        <div className={styles.phoneLine}>
          <Phone size={13} aria-hidden="true" />
          <span>{address.phone}</span>
        </div>
        {address.referenceNotes && (
          <div className={styles.referenceNotes}>{address.referenceNotes}</div>
        )}
      </div>

      <div className={styles.cardActions}>
        <div>
          {!address.isDefault && (
            <button
              type="button"
              className={styles.setDefaultButton}
              onClick={() => onSetDefault(address.id)}
              disabled={isPending}
              aria-label={`Establecer dirección de ${address.recipientName} como predeterminada`}
            >
              Establecer como predeterminada
            </button>
          )}
        </div>

        <div className={styles.actionGroup}>
          <DomeButton
            type="button"
            tone="light"
            className={styles.editDome}
            onClick={(e) => onEdit(address, e.currentTarget)}
            disabled={isPending}
            aria-label={`Editar dirección de ${address.recipientName}`}
          >
            Editar dirección
          </DomeButton>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={(e) => onDelete(address, e.currentTarget)}
            disabled={isPending}
            aria-label={`Eliminar dirección de ${address.recipientName}`}
          >
            Eliminar
          </button>
        </div>
      </div>
    </article>
  );
}

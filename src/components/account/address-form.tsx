"use client";

import React, { useState, useRef, type RefObject } from "react";
import type { CustomerAddressDTO, AddressActionValidationErrors } from "@/lib/account/types";
import {
  PERU_DEPARTMENTS,
  districtSuggestions,
  findPeruDepartment,
  provinceSuggestions,
} from "@/lib/account/peru-locations";
import { useModalFocus } from "./use-modal-focus";
import styles from "./address.module.css";

interface AddressFormProps {
  initialAddress?: CustomerAddressDTO | null;
  onSave: (
    formData: FormData
  ) => Promise<{ success: boolean; errors?: AddressActionValidationErrors }>;
  onCancel: () => void;
  isPending: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export function AddressForm({
  initialAddress,
  onSave,
  onCancel,
  isPending,
  returnFocusRef,
  fallbackFocusRef,
}: AddressFormProps) {
  const isEditing = Boolean(initialAddress);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<AddressActionValidationErrors>({});
  // Only drive the province and district suggestions; the inputs stay uncontrolled.
  const [department, setDepartment] = useState(initialAddress?.department ?? "");
  const [province, setProvince] = useState(initialAddress?.province ?? "");

  const { modalRef } = useModalFocus<HTMLDivElement>({
    isOpen: true,
    onClose: onCancel,
    isPending,
    initialFocusRef: firstInputRef,
    returnFocusRef,
    fallbackFocusRef,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});
    const formData = new FormData(e.currentTarget);
    const result = await onSave(formData);
    if (!result.success && result.errors) {
      setErrors(result.errors);
    }
  };

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-modal-title"
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          <h2 id="address-modal-title" className={styles.modalTitle}>
            {isEditing ? "Editar dirección" : "Agregar nueva dirección"}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onCancel}
            disabled={isPending}
            aria-label="Cerrar formulario de dirección"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.modalBody}>
            {errors.form && (
              <div className={`${styles.statusMessage} ${styles.statusError}`} role="alert">
                {errors.form}
              </div>
            )}

            {isEditing && <input type="hidden" name="addressId" value={initialAddress?.id} />}

            <div className={styles.formGrid}>
              {/* Recipient Name */}
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label htmlFor="address-recipientName" className={styles.label}>
                  Nombre del destinatario *
                </label>
                <input
                  ref={firstInputRef}
                  id="address-recipientName"
                  name="recipientName"
                  type="text"
                  defaultValue={initialAddress?.recipientName ?? ""}
                  className={`${styles.input} ${errors.recipientName ? styles.inputError : ""}`}
                  aria-invalid={Boolean(errors.recipientName)}
                  aria-describedby={errors.recipientName ? "error-recipientName" : undefined}
                  maxLength={150}
                  required
                />
                {errors.recipientName && (
                  <span id="error-recipientName" className={styles.fieldError} role="alert">
                    {errors.recipientName}
                  </span>
                )}
              </div>

              {/* Phone */}
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label htmlFor="address-phone" className={styles.label}>
                  Teléfono de contacto *
                </label>
                <input
                  id="address-phone"
                  name="phone"
                  type="tel"
                  defaultValue={initialAddress?.phone ?? ""}
                  className={`${styles.input} ${errors.phone ? styles.inputError : ""}`}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? "error-phone" : undefined}
                  maxLength={20}
                  required
                />
                {errors.phone && (
                  <span id="error-phone" className={styles.fieldError} role="alert">
                    {errors.phone}
                  </span>
                )}
              </div>

              {/* Street Address */}
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label htmlFor="address-streetAddress" className={styles.label}>
                  Dirección (Calle, Av., Jr., Nro.) *
                </label>
                <input
                  id="address-streetAddress"
                  name="streetAddress"
                  type="text"
                  defaultValue={initialAddress?.streetAddress ?? ""}
                  className={`${styles.input} ${errors.streetAddress ? styles.inputError : ""}`}
                  aria-invalid={Boolean(errors.streetAddress)}
                  aria-describedby={errors.streetAddress ? "error-streetAddress" : undefined}
                  maxLength={255}
                  required
                />
                {errors.streetAddress && (
                  <span id="error-streetAddress" className={styles.fieldError} role="alert">
                    {errors.streetAddress}
                  </span>
                )}
              </div>

              {/* Apartment / Suite */}
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label htmlFor="address-apartmentSuite" className={styles.label}>
                  Dpto. / Interior / Oficina (opcional)
                </label>
                <input
                  id="address-apartmentSuite"
                  name="apartmentSuite"
                  type="text"
                  defaultValue={initialAddress?.apartmentSuite ?? ""}
                  className={`${styles.input} ${errors.apartmentSuite ? styles.inputError : ""}`}
                  aria-invalid={Boolean(errors.apartmentSuite)}
                  aria-describedby={errors.apartmentSuite ? "error-apartmentSuite" : undefined}
                  maxLength={100}
                />
                {errors.apartmentSuite && (
                  <span id="error-apartmentSuite" className={styles.fieldError} role="alert">
                    {errors.apartmentSuite}
                  </span>
                )}
              </div>

              {/* Department */}
              <div className={styles.formGroup}>
                <label htmlFor="address-department" className={styles.label}>
                  Departamento *
                </label>
                <select
                  id="address-department"
                  name="department"
                  defaultValue={findPeruDepartment(initialAddress?.department ?? "") ?? ""}
                  onChange={(event) => setDepartment(event.target.value)}
                  className={`${styles.input} ${errors.department ? styles.inputError : ""}`}
                  aria-invalid={Boolean(errors.department)}
                  aria-describedby={errors.department ? "error-department" : undefined}
                  required
                >
                  <option value="">Elige un departamento</option>
                  {PERU_DEPARTMENTS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {errors.department && (
                  <span id="error-department" className={styles.fieldError} role="alert">
                    {errors.department}
                  </span>
                )}
              </div>

              {/* Province */}
              <div className={styles.formGroup}>
                <label htmlFor="address-province" className={styles.label}>
                  Provincia *
                </label>
                <input
                  id="address-province"
                  name="province"
                  type="text"
                  defaultValue={initialAddress?.province ?? ""}
                  onChange={(event) => setProvince(event.target.value)}
                  className={`${styles.input} ${errors.province ? styles.inputError : ""}`}
                  aria-invalid={Boolean(errors.province)}
                  aria-describedby={errors.province ? "error-province" : undefined}
                  maxLength={100}
                  list="address-province-options"
                  autoComplete="address-level2"
                  required
                />
                <datalist id="address-province-options">
                  {provinceSuggestions(department).map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                {errors.province && (
                  <span id="error-province" className={styles.fieldError} role="alert">
                    {errors.province}
                  </span>
                )}
              </div>

              {/* District */}
              <div className={styles.formGroup}>
                <label htmlFor="address-district" className={styles.label}>
                  Distrito *
                </label>
                <input
                  id="address-district"
                  name="district"
                  type="text"
                  defaultValue={initialAddress?.district ?? ""}
                  className={`${styles.input} ${errors.district ? styles.inputError : ""}`}
                  aria-invalid={Boolean(errors.district)}
                  aria-describedby={errors.district ? "error-district" : undefined}
                  maxLength={100}
                  list="address-district-options"
                  autoComplete="address-level3"
                  required
                />
                <datalist id="address-district-options">
                  {districtSuggestions(department, province).map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                {errors.district && (
                  <span id="error-district" className={styles.fieldError} role="alert">
                    {errors.district}
                  </span>
                )}
              </div>

              {/* Postal Code */}
              <div className={styles.formGroup}>
                <label htmlFor="address-postalCode" className={styles.label}>
                  Código postal (opcional)
                </label>
                <input
                  id="address-postalCode"
                  name="postalCode"
                  type="text"
                  defaultValue={initialAddress?.postalCode ?? ""}
                  className={`${styles.input} ${errors.postalCode ? styles.inputError : ""}`}
                  aria-invalid={Boolean(errors.postalCode)}
                  aria-describedby={errors.postalCode ? "error-postalCode" : undefined}
                  maxLength={20}
                />
                {errors.postalCode && (
                  <span id="error-postalCode" className={styles.fieldError} role="alert">
                    {errors.postalCode}
                  </span>
                )}
              </div>

              {/* Reference Notes */}
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label htmlFor="address-referenceNotes" className={styles.label}>
                  Referencias de entrega (opcional)
                </label>
                <textarea
                  id="address-referenceNotes"
                  name="referenceNotes"
                  defaultValue={initialAddress?.referenceNotes ?? ""}
                  className={`${styles.input} ${styles.textarea} ${
                    errors.referenceNotes ? styles.inputError : ""
                  }`}
                  aria-invalid={Boolean(errors.referenceNotes)}
                  aria-describedby={errors.referenceNotes ? "error-referenceNotes" : undefined}
                  placeholder="Ej: Frente al parque, portón blanco, timbre 201"
                />
                {errors.referenceNotes && (
                  <span id="error-referenceNotes" className={styles.fieldError} role="alert">
                    {errors.referenceNotes}
                  </span>
                )}
              </div>

              {/* Set as default: CREATE renders interactive checkbox; EDIT default renders static notice */}
              {!isEditing && (
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label className={styles.checkboxContainer}>
                    <input
                      type="checkbox"
                      name="setAsDefault"
                      value="true"
                      defaultChecked={false}
                      className={styles.checkbox}
                    />
                    <span className={styles.checkboxLabel}>
                      Establecer como dirección de entrega predeterminada
                    </span>
                  </label>
                </div>
              )}

              {isEditing && initialAddress?.isDefault && (
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <div className={styles.defaultNotice} role="note">
                    <span className={styles.defaultBadge} aria-hidden="true">
                      Predeterminada
                    </span>
                    <span className={styles.defaultNoticeText}>
                      Esta es tu dirección de entrega predeterminada.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
              disabled={isPending}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.submitButton} disabled={isPending}>
              {isPending ? "Guardando..." : isEditing ? "Guardar cambios" : "Guardar dirección"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

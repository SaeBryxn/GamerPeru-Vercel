"use client";

import React, { useState, useTransition } from "react";
import type { ProfileFormDTO, UpdateProfileValidationErrors } from "@/lib/account/types";
import { updateCustomerProfileAction } from "@/lib/account/actions";
import { CANONICAL_DOCUMENT_TYPES } from "@/lib/account/validation";
import { TextField } from "@/components/ui/input/text-field";
import { Button } from "@/components/ui/button";
import styles from "./profile-form.module.css";

interface ProfileFormProps {
  initialProfile: ProfileFormDTO;
  /** Runs after a successful save, e.g. to refresh a summary built from the same data. */
  onSaved?: () => void;
}

export function ProfileForm({ initialProfile, onSaved }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(initialProfile.firstName);
  const [lastName, setLastName] = useState(initialProfile.lastName);
  const [phone, setPhone] = useState(initialProfile.phone ?? "");
  const [documentType, setDocumentType] = useState<string>(initialProfile.documentType ?? "");
  const [documentNumber, setDocumentNumber] = useState(initialProfile.documentNumber ?? "");

  const [fieldErrors, setFieldErrors] = useState<UpdateProfileValidationErrors>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFieldErrors({});
    setStatusMessage(null);
    setFormError(null);

    const formData = new FormData();
    formData.append("firstName", firstName);
    formData.append("lastName", lastName);
    formData.append("phone", phone);
    formData.append("documentType", documentType);
    formData.append("documentNumber", documentNumber);

    startTransition(async () => {
      const result = await updateCustomerProfileAction(null, formData);
      if (result.success) {
        setStatusMessage(result.message);
        setFirstName(result.fields.firstName);
        setLastName(result.fields.lastName);
        setPhone(result.fields.phone ?? "");
        setDocumentType(result.fields.documentType ?? "");
        setDocumentNumber(result.fields.documentNumber ?? "");
        onSaved?.();
      } else {
        if (result.errors.form) {
          setFormError(result.errors.form);
        }
        setFieldErrors(result.errors);
      }
    });
  };

  return (
    <div>
      {statusMessage ? (
        <div role="status" aria-live="polite" className={`${styles.alert} ${styles.alertSuccess}`}>
          {statusMessage}
        </div>
      ) : null}

      {formError ? (
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          {formError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="profile-email" className={styles.label}>
            Correo electrónico
          </label>
          <input
            id="profile-email"
            type="email"
            value={initialProfile.email ?? ""}
            readOnly
            disabled
            className={styles.readonlyInput}
            aria-describedby="profile-email-help"
          />
          <p id="profile-email-help" className={styles.helpText}>
            El correo electrónico está vinculado a tu cuenta de acceso y no es editable aquí.
          </p>
        </div>

        <div className={styles.row}>
          <TextField
            id="profile-firstName"
            name="firstName"
            label="Nombres"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={fieldErrors.firstName}
            required
            autoComplete="given-name"
            maxLength={100}
          />

          <TextField
            id="profile-lastName"
            name="lastName"
            label="Apellidos"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={fieldErrors.lastName}
            required
            autoComplete="family-name"
            maxLength={100}
          />
        </div>

        <div className={styles.fieldGroup}>
          <TextField
            id="profile-phone"
            name="phone"
            label="Teléfono / Celular (opcional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={fieldErrors.phone}
            type="tel"
            autoComplete="tel"
            maxLength={20}
            description="Para coordinar la entrega de tus pedidos."
          />
        </div>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Documento de identidad (opcional)</legend>

          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label htmlFor="profile-documentType" className={styles.label}>
                Tipo de documento
              </label>
              <select
                id="profile-documentType"
                name="documentType"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className={`${styles.select} ${fieldErrors.documentType ? styles.selectError : ""}`}
                aria-invalid={Boolean(fieldErrors.documentType)}
                aria-describedby={
                  fieldErrors.documentType ? "profile-documentType-error" : undefined
                }
              >
                <option value="">Selecciona un tipo...</option>
                {CANONICAL_DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {fieldErrors.documentType ? (
                <p id="profile-documentType-error" className={styles.errorMessage}>
                  {fieldErrors.documentType}
                </p>
              ) : null}
            </div>

            <TextField
              id="profile-documentNumber"
              name="documentNumber"
              label="Número de documento"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              error={fieldErrors.documentNumber}
              maxLength={20}
              autoComplete="off"
            />
          </div>
        </fieldset>

        <div className={styles.actions}>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando cambios..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}

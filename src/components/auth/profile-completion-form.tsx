"use client";

import React, { useState } from "react";
import { profileCompletionSchema } from "@/lib/auth/validation";
import { completeCustomerProfileAction } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/input/text-field";
import { Button } from "@/components/ui/button";
import styles from "./auth.module.css";

export function ProfileCompletionForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});

    const parsed = profileCompletionSchema.safeParse({ firstName, lastName });
    if (!parsed.success) {
      const formatted = parsed.error.format();
      setFieldErrors({
        firstName: formatted.firstName?._errors[0],
        lastName: formatted.lastName?._errors[0],
      });
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("firstName", parsed.data.firstName);
    formData.append("lastName", parsed.data.lastName);

    try {
      const res = await completeCustomerProfileAction(null, formData);
      if (res && !res.success && res.error) {
        setServerError(res.error);
        setIsSubmitting(false);
      }
    } catch {
      // If Next.js redirect thrown, let it navigate
    }
  };

  return (
    <div>
      {serverError ? (
        <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
          {serverError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <TextField
          id="profile-firstName"
          name="firstName"
          type="text"
          label="Nombre"
          autoComplete="given-name"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          error={fieldErrors.firstName}
          disabled={isSubmitting}
        />

        <TextField
          id="profile-lastName"
          name="lastName"
          type="text"
          label="Apellido"
          autoComplete="family-name"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          error={fieldErrors.lastName}
          disabled={isSubmitting}
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={isSubmitting}
          className={styles.submitButton}
        >
          {isSubmitting ? "Guardando perfil..." : "Continuar"}
        </Button>
      </form>
    </div>
  );
}

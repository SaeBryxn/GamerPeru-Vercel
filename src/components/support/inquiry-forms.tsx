"use client";

import React, { useActionState, useEffect, useRef } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { CircleAlert, CircleCheck } from "lucide-react";
import { DomeButton } from "@/components/ui";
import {
  submitContactInquiryAction,
  submitDistributorInquiryAction,
} from "@/lib/support/inquiry-actions";
import {
  BUSINESS_TYPES,
  CONTACT_TOPICS,
  type InquiryFormState,
} from "@/lib/support/inquiry-schema";
import { InquiryBotGuards, InquiryInput, InquirySelect, InquiryTextarea } from "./inquiry-fields";
import styles from "./inquiry-forms.module.css";

const INITIAL_STATE: InquiryFormState = { status: "idle" };

/** Stamps the moment the form became interactive; set after mount so SSR and client agree. */
function useStartedAtRef() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.value = String(Date.now());
  }, []);
  return ref;
}

function SuccessPanel({ title, text }: { title: string; text: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <m.div
      className={styles.success}
      role="status"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
    >
      <CircleCheck size={28} aria-hidden="true" className={styles.successIcon} />
      <h3 className={styles.successTitle}>{title}</h3>
      <p className={styles.successText}>{text}</p>
    </m.div>
  );
}

function FormError({ state }: { state: InquiryFormState }) {
  return (
    <AnimatePresence initial={false}>
      {state.status === "error" && (
        <m.p
          key={state.message}
          role="alert"
          className={styles.formError}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
        >
          <CircleAlert size={16} aria-hidden="true" />
          {state.message}
        </m.p>
      )}
    </AnimatePresence>
  );
}

function fieldError(state: InquiryFormState, name: string): string | undefined {
  return state.status === "error" ? state.fieldErrors?.[name] : undefined;
}

function TrapAndTimer() {
  const startedAtRef = useStartedAtRef();
  return (
    <>
      <InquiryBotGuards />
      <input ref={startedAtRef} type="hidden" name="startedAt" defaultValue="" />
    </>
  );
}

/**
 * `full` for the contact page; `compact` for side columns: name, email and message only, labels
 * carried by the placeholders, and the topic fixed to a general inquiry.
 */
export function ContactForm({ variant = "full" }: { variant?: "full" | "compact" }) {
  const [state, formAction, isPending] = useActionState(submitContactInquiryAction, INITIAL_STATE);
  const isCompact = variant === "compact";

  if (state.status === "success") {
    return (
      <SuccessPanel
        title="¡Mensaje enviado!"
        text="Gracias por escribirnos. Te responderemos al correo que nos dejaste."
      />
    );
  }

  return (
    <form
      action={formAction}
      className={isCompact ? `${styles.form} ${styles.compact}` : styles.form}
      noValidate
    >
      <TrapAndTimer />
      {isCompact ? (
        <>
          <input type="hidden" name="topic" value={CONTACT_TOPICS[CONTACT_TOPICS.length - 1]} />
          <InquiryInput
            label="Nombre"
            placeholder="Nombre"
            name="name"
            autoComplete="name"
            required
            hideLabel
            error={fieldError(state, "name")}
          />
          <InquiryInput
            label="Correo electrónico"
            placeholder="Correo electrónico"
            name="email"
            type="email"
            autoComplete="email"
            required
            hideLabel
            error={fieldError(state, "email")}
          />
          <InquiryTextarea
            label="Mensaje"
            placeholder="Mensaje"
            name="message"
            required
            hideLabel
            error={fieldError(state, "message")}
          />
        </>
      ) : (
        <>
          <div className={styles.row}>
            <InquiryInput
              label="Nombre"
              name="name"
              autoComplete="name"
              required
              error={fieldError(state, "name")}
            />
            <InquiryInput
              label="Correo electrónico"
              name="email"
              type="email"
              autoComplete="email"
              required
              error={fieldError(state, "email")}
            />
          </div>
          <div className={styles.row}>
            <InquiryInput
              label="Teléfono"
              name="phone"
              type="tel"
              autoComplete="tel"
              error={fieldError(state, "phone")}
            />
            <InquirySelect
              label="Tema"
              name="topic"
              required
              placeholder="Elige un tema"
              options={CONTACT_TOPICS}
              error={fieldError(state, "topic")}
            />
          </div>
          <InquiryTextarea
            label="Mensaje"
            name="message"
            required
            placeholder="Cuéntanos en qué te ayudamos. Si es sobre un pedido, incluye su número."
            error={fieldError(state, "message")}
          />
        </>
      )}
      <FormError state={state} />
      <DomeButton tone="dark" type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Enviando..." : "Enviar mensaje"}
      </DomeButton>
    </form>
  );
}

export function DistributorForm() {
  const [state, formAction, isPending] = useActionState(
    submitDistributorInquiryAction,
    INITIAL_STATE
  );

  if (state.status === "success") {
    return (
      <SuccessPanel
        title="¡Solicitud recibida!"
        text="Revisaremos los datos de tu negocio y te contactaremos para conversar sobre la distribución."
      />
    );
  }

  return (
    <form action={formAction} className={styles.form} noValidate>
      <TrapAndTimer />
      <div className={styles.row}>
        <InquiryInput
          label="Empresa o razón social"
          name="company"
          autoComplete="organization"
          required
          error={fieldError(state, "company")}
        />
        <InquiryInput
          label="RUC"
          name="ruc"
          inputMode="numeric"
          maxLength={11}
          error={fieldError(state, "ruc")}
        />
      </div>
      <div className={styles.row}>
        <InquiryInput
          label="Nombre de contacto"
          name="name"
          autoComplete="name"
          required
          error={fieldError(state, "name")}
        />
        <InquiryInput
          label="Correo electrónico"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={fieldError(state, "email")}
        />
      </div>
      <div className={styles.row}>
        <InquiryInput
          label="Teléfono"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          error={fieldError(state, "phone")}
        />
        <InquiryInput
          label="Ciudad"
          name="city"
          autoComplete="address-level2"
          required
          error={fieldError(state, "city")}
        />
      </div>
      <InquirySelect
        label="Tipo de negocio"
        name="businessType"
        required
        placeholder="Elige el tipo de negocio"
        options={BUSINESS_TYPES}
        error={fieldError(state, "businessType")}
      />
      <InquiryTextarea
        label="Cuéntanos sobre tu negocio"
        name="message"
        placeholder="Marcas y productos que te interesan, volumen estimado, canales de venta..."
        error={fieldError(state, "message")}
      />
      <FormError state={state} />
      <DomeButton tone="dark" type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Enviando..." : "Enviar solicitud"}
      </DomeButton>
    </form>
  );
}

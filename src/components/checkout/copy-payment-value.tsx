"use client";
import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import styles from "./manual-payment-card.module.css";
export function CopyPaymentValue({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState("");
  return (
    <>
      <button
        type="button"
        className={styles.copyButton}
        aria-label={`Copiar ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setMessage(`${label} copiado`);
          } catch {
            setMessage(`No se pudo copiar ${label}. Puedes seleccionar el texto.`);
          }
        }}
      >
        {message.endsWith(" copiado") ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Copy size={14} aria-hidden="true" />
        )}
        Copiar
      </button>
      <span role="status" className={styles.copyFeedback}>
        {message}
      </span>
    </>
  );
}

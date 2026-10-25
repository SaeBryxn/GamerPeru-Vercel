"use client";

import React from "react";
import { m, useReducedMotion } from "framer-motion";
import { BrandGlyph } from "@/components/ui";
import { buildWhatsAppHref } from "@/lib/support/whatsapp";
import styles from "./whatsapp-button.module.css";

const SUPPORT_MESSAGE = "Hola, tengo una consulta sobre un producto de Gamer Perú.";

/**
 * Floating contact button: a person answers on WhatsApp. It replaces a chat widget that only
 * ever replied "not connected", and renders nothing until the store number is configured.
 */
export function WhatsAppButton() {
  const reduceMotion = useReducedMotion();
  const href = buildWhatsAppHref(SUPPORT_MESSAGE);
  if (!href) return null;

  return (
    <m.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.button}
      aria-label="Escríbenos por WhatsApp"
      initial={{ opacity: 0, y: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      data-testid="whatsapp-button"
    >
      <BrandGlyph id="whatsapp" size={20} />
      <span className={styles.label}>WhatsApp</span>
    </m.a>
  );
}

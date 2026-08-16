/**
 * Static non-secret application constants and metadata.
 *
 * NOTE: Statutory and legal entity disclosures (e.g. legal company name, RUC, fiscal address)
 * must originate from an explicit approved owner/legal decision and are not invented here.
 */
export const APP_CONFIG = {
  name: "Gamer Perú",
  defaultLocale: "es-PE",
  defaultCurrency: "PEN",
  canonicalHost: "gamerperu.com",
  publicTitle: "Gamer Perú — Periféricos Gamer Premium en Perú",
  publicDescription:
    "E-commerce de periféricos gamer de alto rendimiento en Perú. Mouses, teclados, mousepads y accesorios para esports.",
} as const;

export type AppConfig = typeof APP_CONFIG;

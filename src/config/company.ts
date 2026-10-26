/**
 * Public company details shown on the support and legal pages.
 *
 * Fields left empty are simply not rendered, so a page never shows an address or inbox that is
 * not real. WhatsApp comes from STORE_WHATSAPP (src/config/features.ts) and social profiles from
 * src/config/social-links.ts.
 */
export const COMPANY = {
  legalName: "Experiencia Creativa SAC",
  tradeName: "Gamer Perú",
  /** Registro Único de Contribuyentes. */
  ruc: "",
  /** Public inbox for customers, e.g. hola@gamerperu.com. */
  contactEmail: "",
  /** Fiscal or showroom address, one line. */
  address: "",
  /** Customer service hours, e.g. "Lunes a sábado, 10:00 a 19:00". */
  serviceHours: "",
} as const;

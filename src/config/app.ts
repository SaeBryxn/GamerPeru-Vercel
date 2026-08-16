export const APP_CONFIG = {
  name: "Gamer Perú",
  legalName: "Gamer Perú S.A.C.",
  defaultLocale: "es-PE",
  defaultCurrency: "PEN",
  canonicalHost: "gamerperu.com",
  publicTitle: "Gamer Perú — Periféricos Gamer Premium en Perú",
  publicDescription:
    "E-commerce especializado en periféricos gamer premium y de alta competencia en Perú. Mouse, teclados, audio y accesorios de alto rendimiento.",
} as const;

export type AppConfig = typeof APP_CONFIG;

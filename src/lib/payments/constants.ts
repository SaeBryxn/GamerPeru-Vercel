/**
 * Gamer Perú — Payment Domain Constants
 */

export const PAYMENT_SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Secure-gp_payment_session" : "gp_payment_session";

export const PAYMENT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days technical session TTL

export const UPLOAD_INTENT_TTL_SECONDS = 15 * 60; // 15 minutes transient intent TTL

/**
 * Gamer Perú — Canonical Cart Constants & Configuration
 *
 * Defines domain parameters, TTL windows, cookie contracts, token format specifications,
 * and boundary constraints established in GP-017 / CART4.
 */

export const ANONYMOUS_CART_COOKIE_NAME_DEV = "gp_cart_session";
export const ANONYMOUS_CART_COOKIE_NAME_PROD = "__Secure-gp_cart_session";

export const CART_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days in seconds
export const CART_COOKIE_PATH = "/";
export const CART_COOKIE_SAME_SITE = "lax" as const;

export const ANONYMOUS_CART_TTL_DAYS = 30;
export const ANONYMOUS_CART_TTL_MS = ANONYMOUS_CART_TTL_DAYS * 24 * 60 * 60 * 1000;

export const AUTHENTICATED_CART_TTL_DAYS = 60;
export const AUTHENTICATED_CART_TTL_MS = AUTHENTICATED_CART_TTL_DAYS * 24 * 60 * 60 * 1000;

export const MIN_CART_LINE_QUANTITY = 1;
export const MAX_CART_LINE_QUANTITY = 10;

export const CANONICAL_CART_CURRENCY = "PEN";

export const ANONYMOUS_TOKEN_BYTES = 32;
export const ANONYMOUS_TOKEN_BASE64URL_LENGTH = 43;
export const ANONYMOUS_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

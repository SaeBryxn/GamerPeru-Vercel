import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export const GUEST_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
export function guestAccessCookieName(orderNumber: string) {
  const prefix = process.env.NODE_ENV === "production" ? "__Secure-" : "";
  return `${prefix}gp_order_${createHash("sha256").update(orderNumber).digest("hex").slice(0, 20)}`;
}
export function createGuestAccessToken(
  orderId: string,
  email: string,
  secret: string,
  issuedAt = Date.now()
) {
  if (secret.length < 32) throw new Error("GUEST_ACCESS_UNAVAILABLE");
  const payload = Buffer.from(
    JSON.stringify({ orderId, expiresAt: issuedAt + GUEST_ACCESS_TTL_MS })
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`guest_order_access:v1:${email.trim().toLowerCase()}:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyGuestAccessToken(
  token: string,
  orderId: string,
  email: string,
  secret: string,
  now = Date.now()
): number | null {
  if (secret.length < 32 || token.length > 512) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts as [string, string];
    const expected = createHmac("sha256", secret)
      .update(`guest_order_access:v1:${email.trim().toLowerCase()}:${payload}`)
      .digest();
    const received = Buffer.from(signature, "base64url");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      orderId?: unknown;
      expiresAt?: unknown;
    };
    if (
      value.orderId !== orderId ||
      typeof value.expiresAt !== "number" ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt > now + GUEST_ACCESS_TTL_MS
    )
      return null;
    return value.expiresAt;
  } catch {
    return null;
  }
}

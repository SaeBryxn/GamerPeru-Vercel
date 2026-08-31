/**
 * Generates a cryptographically secure UUIDv4 for checkout attempt idempotency.
 *
 * Invariants:
 * 1. Secure Browser/Node Entropy Only: Uses crypto.randomUUID() or crypto.getRandomValues().
 * 2. Strict Prohibition: Never uses Math.random(), Date.now(), or sequential counters.
 * 3. Fail-Closed: Throws an explicit error if a cryptographically secure random source is unavailable.
 */
export function generateSecureCheckoutAttemptId(): string {
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // Set UUIDv4 version (0100 -> 4) and variant (10xx -> RFC 4122)
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }
  }
  throw new Error(
    "SECURE_CRYPTO_UNAVAILABLE: Cryptographically secure random generator (crypto.randomUUID or crypto.getRandomValues) is required for checkout attempt IDs."
  );
}

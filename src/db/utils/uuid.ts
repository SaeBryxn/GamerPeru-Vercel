import { randomBytes } from "node:crypto";

/**
 * Generates a standard RFC 9562 UUIDv7.
 *
 * Layout:
 * - 48 bits: `unix_ts_ms` (Unix epoch timestamp in milliseconds)
 * - 4 bits: `ver` = 0111 (version 7)
 * - 12 bits: `rand_a` (cryptographically secure pseudo-random bits)
 * - 2 bits: `var` = 10 (RFC 4122/9562 variant)
 * - 62 bits: `rand_b` (cryptographically secure pseudo-random bits)
 *
 * @param customTimestampMs Optional timestamp in milliseconds (internal/testing only)
 * @returns Canonical 36-character hyphenated UUID string (lowercase)
 */
export function generateUuidV7(customTimestampMs?: number): string {
  const timestamp = customTimestampMs ?? Date.now();
  const buffer = Buffer.alloc(16);

  // Bytes 0-5: 48-bit timestamp in big-endian
  const high = Math.floor(timestamp / 0x100000000);
  const low = timestamp >>> 0;
  buffer.writeUInt16BE(high, 0);
  buffer.writeUInt32BE(low, 2);

  // Bytes 6-15: 10 random bytes
  const rand = randomBytes(10);
  rand.copy(buffer, 6);

  // Byte 6: version 7 (0b0111_xxxx)
  const b6 = buffer.readUInt8(6);
  buffer.writeUInt8(0x70 | (b6 & 0x0f), 6);

  // Byte 8: variant 10 (0b10xx_xxxx)
  const b8 = buffer.readUInt8(8);
  buffer.writeUInt8(0x80 | (b8 & 0x3f), 8);

  const hex = buffer.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

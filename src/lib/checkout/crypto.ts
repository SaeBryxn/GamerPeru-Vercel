import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { CheckoutDeliveryAddressInput } from "./types";

const ORDER_NUMBER_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generates a public unguessable Order reference number.
 * Format: GP-XXXXXXXX (e.g. GP-7K9M2026).
 * Invariants:
 * 1. Non-sequential: Generated from cryptographically secure random bytes.
 * 2. Uniqueness: 36^8 (> 2.8 trillion) possible combinations; database UNIQUE is final collision authority.
 * 3. Business Privacy: Leaks zero customer count, timestamp, or order volume information.
 */
export function generateOrderNumber(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      code += ORDER_NUMBER_ALPHABET[byte % ORDER_NUMBER_ALPHABET.length];
    }
  }
  return `GP-${code}`;
}

export type AuthorityDigestInput =
  { type: "AUTHENTICATED"; customerProfileId: string } | { type: "GUEST"; guestToken: string };

/**
 * Produces the canonical 64-character hex authority binding digest.
 *
 * Invariants:
 * 1. Domain Separation: Uses distinct prefixes for authenticated and guest authorities.
 * 2. Privacy: Never exposes or persists raw guest tokens or customer identifiers.
 * 3. Determinism: Produces identical 64-char hex strings for identical authority inputs.
 */
export function computeAuthorityBindingDigest(
  authority: AuthorityDigestInput,
  secret: string
): string {
  const hmac = createHmac("sha256", secret);
  if (authority.type === "AUTHENTICATED") {
    hmac.update(`checkout-authority:v1:authenticated:${authority.customerProfileId}`);
  } else {
    hmac.update(`checkout-authority:v1:guest:${authority.guestToken}`);
  }
  return hmac.digest("hex");
}

export interface RequestFingerprintInput {
  sourceCartId: string;
  shippingMethodCode: string;
  paymentMethodCode: string;
  customerEmail: string;
  deliveryAddress: CheckoutDeliveryAddressInput;
}

function deterministicStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(deterministicStringify).join(",")}]`;
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${deterministicStringify(val)}`;
  });
  return `{${pairs.join(",")}}`;
}

/**
 * Produces the canonical 64-character hex request fingerprint.
 *
 * Invariants:
 * 1. Domain Separation: Prefixed with 'checkout-intent:v1:'.
 * 2. Normalization: Email normalized to lowercase/trimmed; address fields normalized deterministically.
 * 3. Salted HMAC: Prevents rainbow-table or pre-computation attacks on low-entropy contact PII.
 */
export function computeRequestFingerprint(input: RequestFingerprintInput, secret: string): string {
  const normalizedEmail = input.customerEmail.trim().toLowerCase();
  const normalizedShipping = input.shippingMethodCode.trim();
  const normalizedPayment = input.paymentMethodCode.trim();

  let addressPayload: Record<string, unknown>;
  if (input.deliveryAddress.mode === "SAVED_ADDRESS") {
    addressPayload = {
      mode: "SAVED_ADDRESS",
      addressId: input.deliveryAddress.addressId.trim(),
    };
  } else {
    const addr = input.deliveryAddress.address;
    addressPayload = {
      mode: "INLINE",
      recipientName: addr.recipientName.trim(),
      phone: addr.phone.trim(),
      streetAddress: addr.streetAddress.trim(),
      apartmentSuite: addr.apartmentSuite?.trim() ?? null,
      department: addr.department.trim(),
      province: addr.province.trim(),
      district: addr.district.trim(),
      postalCode: addr.postalCode?.trim() ?? null,
      referenceNotes: addr.referenceNotes?.trim() ?? null,
    };
  }

  const payloadObject = {
    sourceCartId: input.sourceCartId,
    shippingMethodCode: normalizedShipping,
    paymentMethodCode: normalizedPayment,
    customerEmail: normalizedEmail,
    deliveryAddress: addressPayload,
  };

  const serialized = deterministicStringify(payloadObject);
  return createHmac("sha256", secret).update(`checkout-intent:v1:${serialized}`).digest("hex");
}

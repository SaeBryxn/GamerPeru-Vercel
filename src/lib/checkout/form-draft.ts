import { z } from "zod";

const text = z.string().max(500);
export const checkoutFormDraftSchema = z
  .object({
    email: text,
    deliveryMode: z.enum(["INLINE", "SAVED_ADDRESS"]),
    selectedAddressId: text,
    selectedShippingCode: text,
    selectedPaymentCode: text,
    inlineAddress: z
      .object({
        recipientName: text,
        phone: text,
        streetAddress: text,
        apartmentSuite: text,
        department: text,
        province: text,
        district: text,
        postalCode: text,
        referenceNotes: text,
      })
      .strict(),
  })
  .strict();
export type CheckoutFormDraft = z.infer<typeof checkoutFormDraftSchema>;
export const CHECKOUT_DRAFT_KEY = "gp:checkout-form:v1";
export const CHECKOUT_DRAFT_TTL = 2 * 60 * 60 * 1000;

/** A tab-scoped draft contains form fields only: no tokens, payment proofs or attempt IDs. */
export function readCheckoutDraft(
  raw: string | null,
  scope: string,
  now = Date.now()
): CheckoutFormDraft | null {
  try {
    const saved = z
      .object({ scope: z.string(), expiresAt: z.number(), form: checkoutFormDraftSchema })
      .parse(JSON.parse(raw ?? "null"));
    return saved.scope === scope &&
      saved.expiresAt > now &&
      saved.expiresAt <= now + CHECKOUT_DRAFT_TTL
      ? saved.form
      : null;
  } catch {
    return null;
  }
}
export function serializeCheckoutDraft(scope: string, form: CheckoutFormDraft, now = Date.now()) {
  return JSON.stringify({
    scope,
    expiresAt: now + CHECKOUT_DRAFT_TTL,
    form: checkoutFormDraftSchema.parse(form),
  });
}

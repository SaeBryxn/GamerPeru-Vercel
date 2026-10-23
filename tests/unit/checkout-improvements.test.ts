import { expect, it } from "vitest";
import {
  CHECKOUT_DRAFT_TTL,
  readCheckoutDraft,
  serializeCheckoutDraft,
} from "@/lib/checkout/form-draft";
import { describeCheckoutChanges } from "@/lib/checkout/review-changes";
import type { CheckoutCartDTO } from "@/lib/checkout/types";
const form = {
  email: "buyer@example.test",
  deliveryMode: "INLINE" as const,
  selectedAddressId: "",
  selectedShippingCode: "ship",
  selectedPaymentCode: "pay",
  inlineAddress: {
    recipientName: "Ana",
    phone: "999999999",
    streetAddress: "Calle 1",
    apartmentSuite: "",
    department: "Lima",
    province: "Lima",
    district: "Lima",
    postalCode: "",
    referenceNotes: "",
  },
};
it("recupera los campos solo en la misma identidad, carrito y plazo", () => {
  const raw = serializeCheckoutDraft("guest:cart", form, 1000);
  expect(readCheckoutDraft(raw, "guest:cart", 2000)).toEqual(form);
  expect(readCheckoutDraft(raw, "other:cart", 2000)).toBeNull();
  expect(readCheckoutDraft(raw, "guest:cart", 1000 + CHECKOUT_DRAFT_TTL)).toBeNull();
  expect(readCheckoutDraft("broken", "guest:cart")).toBeNull();
  expect(() =>
    serializeCheckoutDraft("guest:cart", { ...form, token: "secret" } as typeof form)
  ).toThrow();
});
it("detalla diferencias de cantidad, precio y envío", () => {
  const item = {
    variantId: "v1",
    productId: "p1",
    productSlug: "mouse",
    productName: "Mouse",
    sku: "M",
    priceCents: 10000,
    quantity: 1,
    lineTotalCents: 10000,
    attributes: {},
    primaryMedia: null,
  };
  const before: CheckoutCartDTO = {
    items: [item],
    subtotalCents: 10000,
    itemCount: 1,
    currency: "PEN",
  };
  const after: CheckoutCartDTO = {
    ...before,
    items: [{ ...item, priceCents: 12000, quantity: 2, lineTotalCents: 24000 }],
    subtotalCents: 24000,
    itemCount: 2,
  };
  expect(describeCheckoutChanges(before, after, 1000, 1500)).toHaveLength(3);
  expect(describeCheckoutChanges(before, before, 1000, 1000)).toEqual([]);
  expect(describeCheckoutChanges(before, null, 0, 0)).toContain("Mouse: retirado del carrito.");
});

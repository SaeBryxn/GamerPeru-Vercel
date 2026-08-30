import "server-only";
import { z } from "zod";
import { baseAddressSchema } from "@/lib/account/address-validation";
import type { CheckoutSubmitInput } from "./types";

export const inlineDeliveryAddressSchema = z.object({
  mode: z.literal("INLINE"),
  address: baseAddressSchema,
});

export const savedDeliveryAddressSchema = z.object({
  mode: z.literal("SAVED_ADDRESS"),
  addressId: z.string().uuid("Identificador de dirección inválido."),
});

export const deliveryAddressInputSchema = z.discriminatedUnion("mode", [
  inlineDeliveryAddressSchema,
  savedDeliveryAddressSchema,
]);

export const checkoutSubmitSchema = z.object({
  checkoutAttemptId: z.string().uuid("Identificador de intento de compra inválido."),
  customerEmail: z
    .string({ required_error: "El correo electrónico es obligatorio." })
    .trim()
    .toLowerCase()
    .email("El formato del correo electrónico es inválido.")
    .max(255, "El correo no puede exceder 255 caracteres."),
  deliveryAddress: deliveryAddressInputSchema,
  shippingMethodCode: z
    .string({ required_error: "El método de envío es obligatorio." })
    .trim()
    .min(1, "El método de envío es obligatorio.")
    .max(50, "El código de método de envío no puede exceder 50 caracteres."),
  paymentMethodCode: z
    .string({ required_error: "El método de pago es obligatorio." })
    .trim()
    .min(1, "El método de pago es obligatorio.")
    .max(50, "El código de método de pago no puede exceder 50 caracteres."),
  reviewedSubtotalCents: z
    .number({ required_error: "El subtotal revisado es obligatorio." })
    .int("El subtotal debe ser un número entero.")
    .nonnegative("El subtotal no puede ser negativo."),
  reviewedShippingCents: z
    .number({ required_error: "El costo de envío revisado es obligatorio." })
    .int("El costo de envío debe ser un número entero.")
    .nonnegative("El costo de envío no puede ser negativo."),
  reviewedTotalCents: z
    .number({ required_error: "El total revisado es obligatorio." })
    .int("El total debe ser un número entero.")
    .nonnegative("El total no puede ser negativo."),
});

export function validateCheckoutSubmitInput(
  rawInput: unknown
): { success: true; data: CheckoutSubmitInput } | { success: false; error: string } {
  const result = checkoutSubmitSchema.safeParse(rawInput);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstIssue = result.error.issues[0];
  const errorMessage = firstIssue ? firstIssue.message : "Datos de compra inválidos.";
  return { success: false, error: errorMessage };
}

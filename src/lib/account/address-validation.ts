import { z } from "zod";
import type { AddressActionValidationErrors } from "./types";

export const createAddressSchema = z.object({
  recipientName: z
    .string({ required_error: "El nombre del destinatario es obligatorio." })
    .trim()
    .min(1, "El nombre del destinatario es obligatorio.")
    .max(150, "El nombre no puede exceder 150 caracteres."),
  phone: z
    .string({ required_error: "El teléfono es obligatorio." })
    .trim()
    .min(1, "El teléfono es obligatorio.")
    .max(20, "El teléfono no puede exceder 20 caracteres."),
  streetAddress: z
    .string({ required_error: "La dirección es obligatoria." })
    .trim()
    .min(1, "La dirección es obligatoria.")
    .max(255, "La dirección no puede exceder 255 caracteres."),
  apartmentSuite: z
    .string()
    .trim()
    .max(100, "El departamento o interior no puede exceder 100 caracteres.")
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val.trim().length === 0) return null;
      return val.trim();
    }),
  department: z
    .string({ required_error: "El departamento es obligatorio." })
    .trim()
    .min(1, "El departamento es obligatorio.")
    .max(100, "El departamento no puede exceder 100 caracteres."),
  province: z
    .string({ required_error: "La provincia es obligatoria." })
    .trim()
    .min(1, "La provincia es obligatoria.")
    .max(100, "La provincia no puede exceder 100 caracteres."),
  district: z
    .string({ required_error: "El distrito es obligatorio." })
    .trim()
    .min(1, "El distrito es obligatorio.")
    .max(100, "El distrito no puede exceder 100 caracteres."),
  postalCode: z
    .string()
    .trim()
    .max(20, "El código postal no puede exceder 20 caracteres.")
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val.trim().length === 0) return null;
      return val.trim();
    }),
  referenceNotes: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val.trim().length === 0) return null;
      return val.trim();
    }),
  setAsDefault: z
    .union([z.boolean(), z.string().transform((v) => v === "true" || v === "on")])
    .optional()
    .transform((v) => Boolean(v)),
});

export const updateAddressSchema = createAddressSchema.extend({
  addressId: z.string().uuid("Identificador de dirección inválido."),
});

export const addressIdOnlySchema = z.object({
  addressId: z.string().uuid("Identificador de dirección inválido."),
});

export type ValidatedCreateAddressData = z.infer<typeof createAddressSchema>;
export type ValidatedUpdateAddressData = z.infer<typeof updateAddressSchema>;

export function validateCreateAddressInput(
  input: unknown
):
  | { success: true; data: ValidatedCreateAddressData }
  | { success: false; errors: AddressActionValidationErrors } {
  const result = createAddressSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: AddressActionValidationErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof AddressActionValidationErrors;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }

  return { success: false, errors };
}

export function validateUpdateAddressInput(
  input: unknown
):
  | { success: true; data: ValidatedUpdateAddressData }
  | { success: false; errors: AddressActionValidationErrors } {
  const result = updateAddressSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: AddressActionValidationErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof AddressActionValidationErrors;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }

  return { success: false, errors };
}

export function validateAddressIdOnly(
  input: unknown
):
  | { success: true; data: { addressId: string } }
  | { success: false; errors: AddressActionValidationErrors } {
  const result = addressIdOnlySchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: AddressActionValidationErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof AddressActionValidationErrors;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }

  return { success: false, errors };
}

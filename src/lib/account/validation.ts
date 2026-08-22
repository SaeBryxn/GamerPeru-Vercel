import { z } from "zod";
import type { DocumentTypeEnum, UpdateProfileInput, UpdateProfileValidationErrors } from "./types";

export const CANONICAL_DOCUMENT_TYPES: readonly DocumentTypeEnum[] = [
  "DNI",
  "CE",
  "RUC",
  "PASSPORT",
] as const;

export const updateProfileSchema = z
  .object({
    firstName: z
      .string({ required_error: "El nombre es obligatorio." })
      .trim()
      .min(1, "El nombre no puede estar vacío.")
      .max(100, "El nombre no puede exceder 100 caracteres."),
    lastName: z
      .string({ required_error: "El apellido es obligatorio." })
      .trim()
      .min(1, "El apellido no puede estar vacío.")
      .max(100, "El apellido no puede exceder 100 caracteres."),
    phone: z
      .string()
      .trim()
      .max(20, "El teléfono no puede exceder 20 caracteres.")
      .optional()
      .nullable()
      .transform((val) => {
        if (!val || val.trim().length === 0) return null;
        return val.trim();
      }),
    documentType: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((val) => {
        if (!val || val.trim().length === 0) return null;
        return val.trim();
      }),
    documentNumber: z
      .string()
      .trim()
      .max(20, "El número de documento no puede exceder 20 caracteres.")
      .optional()
      .nullable()
      .transform((val) => {
        if (!val || val.trim().length === 0) return null;
        return val.trim();
      }),
  })
  .superRefine((data, ctx) => {
    const hasType = Boolean(data.documentType);
    const hasNumber = Boolean(data.documentNumber);

    if (hasType && !hasNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debes ingresar el número de documento si seleccionas un tipo.",
        path: ["documentNumber"],
      });
    } else if (!hasType && hasNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debes seleccionar un tipo de documento si ingresas un número.",
        path: ["documentType"],
      });
    } else if (hasType && hasNumber) {
      if (!CANONICAL_DOCUMENT_TYPES.includes(data.documentType as DocumentTypeEnum)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Tipo de documento no válido.",
          path: ["documentType"],
        });
      }
    }
  });

export interface NormalizedProfileData {
  firstName: string;
  lastName: string;
  phone: string | null;
  documentType: DocumentTypeEnum | null;
  documentNumber: string | null;
}

export function validateUpdateProfileInput(
  raw: UpdateProfileInput
):
  | { success: true; data: NormalizedProfileData }
  | { success: false; errors: UpdateProfileValidationErrors } {
  const result = updateProfileSchema.safeParse(raw);

  if (!result.success) {
    const fieldErrors: UpdateProfileValidationErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof UpdateProfileValidationErrors;
      if (field && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { success: false, errors: fieldErrors };
  }

  const { firstName, lastName, phone, documentType, documentNumber } = result.data;

  return {
    success: true,
    data: {
      firstName,
      lastName,
      phone: phone ?? null,
      documentType: (documentType as DocumentTypeEnum) ?? null,
      documentNumber: documentNumber ?? null,
    },
  };
}

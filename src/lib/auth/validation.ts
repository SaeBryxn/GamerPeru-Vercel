import { z } from "zod";

/**
 * Validation schema for customer registration.
 *
 * Rules:
 * - first_name: trimmed, non-empty, max 100. Single-character names are allowed.
 * - last_name: trimmed, non-empty, max 100.
 * - email: normalized email format, max 255.
 * - password: min 8 characters (application-level rule), max 128 characters.
 * - confirmPassword: must match password.
 */
export const signupSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, "El nombre es obligatorio")
      .max(100, "El nombre no puede exceder 100 caracteres"),
    lastName: z
      .string()
      .trim()
      .min(1, "El apellido es obligatorio")
      .max(100, "El apellido no puede exceder 100 caracteres"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Ingresa un correo electrónico válido")
      .max(255, "El correo no puede exceder 255 caracteres"),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      .max(128, "La contraseña no puede exceder 128 caracteres"),
    confirmPassword: z.string().min(1, "Confirma tu contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Validation schema for email/password login.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Ingresa un correo electrónico válido")
    .max(255, "El correo no puede exceder 255 caracteres"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Validation schema for password recovery request.
 */
export const recoveryRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Ingresa un correo electrónico válido")
    .max(255, "El correo no puede exceder 255 caracteres"),
});

export type RecoveryRequestInput = z.infer<typeof recoveryRequestSchema>;

/**
 * Validation schema for password change after verified recovery.
 */
export const passwordChangeSchema = z
  .object({
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      .max(128, "La contraseña no puede exceder 128 caracteres"),
    confirmPassword: z.string().min(1, "Confirma tu nueva contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

/**
 * Validation schema for TokenHash confirmation payload.
 */
export const confirmOtpSchema = z.object({
  tokenHash: z.string().min(1, "Token no válido"),
  type: z.enum(["email", "recovery"], {
    errorMap: () => ({ message: "Tipo de verificación no soportado" }),
  }),
});

export type ConfirmOtpInput = z.infer<typeof confirmOtpSchema>;

import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(2, "Escribe tu nombre.")
  .max(120, "El nombre es demasiado largo.");
const email = z.string().trim().email("Revisa tu correo electrónico.").max(160);
const phone = z
  .string()
  .trim()
  .max(20, "El teléfono es demasiado largo.")
  .regex(/^[+\d\s()-]*$/, "Usa solo números en el teléfono.");

export const CONTACT_TOPICS = [
  "Consulta sobre un producto",
  "Estado de un pedido",
  "Pagos con Yape o Plin",
  "Otro tema",
] as const;

export const contactInquirySchema = z.object({
  name,
  email,
  phone: phone.optional().default(""),
  topic: z.enum(CONTACT_TOPICS, { errorMap: () => ({ message: "Elige un tema." }) }),
  message: z
    .string()
    .trim()
    .min(10, "Cuéntanos un poco más (al menos 10 caracteres).")
    .max(4000, "El mensaje es demasiado largo."),
});

export const BUSINESS_TYPES = [
  "Tienda física",
  "Tienda online",
  "Centro gamer o LAN",
  "Equipo o club de esports",
  "Otro",
] as const;

export const distributorInquirySchema = z.object({
  company: z.string().trim().min(2, "Escribe el nombre de tu empresa.").max(160),
  ruc: z
    .string()
    .trim()
    .regex(/^(\d{11})?$/, "El RUC tiene 11 dígitos.")
    .optional()
    .default(""),
  name,
  email,
  phone: phone.min(6, "Déjanos un teléfono de contacto."),
  city: z.string().trim().min(2, "Indica tu ciudad.").max(80),
  businessType: z.enum(BUSINESS_TYPES, {
    errorMap: () => ({ message: "Elige un tipo de negocio." }),
  }),
  message: z.string().trim().max(4000, "El mensaje es demasiado largo.").optional().default(""),
});

export type ContactInquiry = z.infer<typeof contactInquirySchema>;
export type DistributorInquiry = z.infer<typeof distributorInquirySchema>;

export type InquiryFormState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

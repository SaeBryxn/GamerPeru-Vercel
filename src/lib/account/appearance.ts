import { z } from "zod";

/** Presentation preferences only. Never used for identity, permissions or order recipients. */
export const customerAppearanceSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .max(40, "Usa hasta 40 caracteres.")
      .refine(
        (value) => !/[<>\u0000-\u001f]/.test(value),
        "Usa un nombre sin etiquetas ni caracteres de control."
      ),
    avatarSeed: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z0-9_-]*$/),
    accent: z.enum(["red", "neutral"]),
  })
  .strict();
export type CustomerAppearance = z.infer<typeof customerAppearanceSchema>;
export const defaultCustomerAppearance = (): CustomerAppearance => ({
  displayName: "",
  avatarSeed: "",
  accent: "red",
});
export function readCustomerAppearance(metadata: unknown): CustomerAppearance {
  const value =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).gamerperu_profile
      : null;
  const parsed = customerAppearanceSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultCustomerAppearance();
}

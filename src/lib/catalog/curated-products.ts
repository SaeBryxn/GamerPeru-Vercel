import { z } from "zod";

export const ProductSelectionSchema = z
  .object({
    mode: z.enum(["automatic", "manual"]).default("automatic"),
    productSlugs: z
      .array(
        z
          .string()
          .max(200)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      )
      .max(24)
      .refine((slugs) => new Set(slugs).size === slugs.length, "No repitas productos.")
      .default([]),
  })
  .strict();

export type ProductSelection = z.infer<typeof ProductSelectionSchema>;

/** Manual selections never fill gaps with products the operator did not choose. */
export function selectProducts<T extends { slug: string }>(
  items: readonly T[],
  selection?: ProductSelection
): T[] {
  if (!selection || selection.mode === "automatic") return [...items];
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  return selection.productSlugs.flatMap((slug) => {
    const item = bySlug.get(slug);
    return item ? [item] : [];
  });
}

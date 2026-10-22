import { z } from "zod";
import { IDENTITY_STATUSES } from "./types";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const jsonScalarSchema = z.union([z.string().max(2_000), z.number().finite(), z.boolean()]);
const forbiddenAuthorityTokens = new Set([
  "authorization",
  "cost",
  "costo",
  "existencias",
  "inventory",
  "inventario",
  "msrp",
  "permission",
  "price",
  "precio",
  "pvp",
  "publication",
  "publish",
  "published",
  "quantity",
  "role",
  "status",
  "stock",
]);

function isNonAuthoritativeFieldName(value: string): boolean {
  const tokens = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return !tokens.some((token) => forbiddenAuthorityTokens.has(token));
}

const evidenceFieldNameSchema = boundedText(100)
  .regex(/^[a-zA-Z0-9_.-]+$/)
  .refine(isNonAuthoritativeFieldName, "Operational or commerce-authority fields are forbidden.");
const evidenceRecordSchema = z.record(evidenceFieldNameSchema, jsonScalarSchema);

const proposedVariantSchema = z
  .object({
    sku: z.string().trim().min(1).max(100).nullable().optional(),
    identifiers: z
      .object({
        ean: z.string().trim().min(1).max(100).optional(),
        gtin: z.string().trim().min(1).max(100).optional(),
        model: z.string().trim().min(1).max(200).optional(),
        mpn: z.string().trim().min(1).max(100).optional(),
        partNumber: z.string().trim().min(1).max(100).optional(),
        upc: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .default({}),
    attributes: evidenceRecordSchema.default({}),
  })
  .strict();

export const profileSnapshotSchema = z
  .object({
    profileKey: boundedText(50),
    providerId: z.string().uuid(),
    modelId: boundedText(100),
    temperature: z.number().finite().min(0).max(2),
    maxTokens: z.number().int().positive().max(1_000_000),
  })
  .strict();

export const researchItemInputSchema = z
  .object({
    query: boundedText(500).transform((value) => value.replace(/\s+/g, " ")),
    mode: z.enum(["CREATE", "ENRICH"]).default("CREATE"),
    targetProductId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasTargetId = value.targetProductId != null;
    if ((value.mode === "CREATE" && hasTargetId) || (value.mode === "ENRICH" && !hasTargetId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CREATE must not have a target; ENRICH requires a target product.",
      });
    }
  });

export const createResearchJobInputSchema = z
  .object({
    mutationRequestId: boundedText(256),
    selectedProfileId: z.string().uuid(),
    items: z.array(researchItemInputSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const enrichCount = value.items.filter((item) => item.mode === "ENRICH").length;
    if (enrichCount > 0 && value.items.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Batch ENRICH is not available in CHK2.",
      });
    }
  });

export const identityResolutionSchema = z
  .object({
    status: z.enum(IDENTITY_STATUSES),
    brandName: z.string().trim().max(100).nullable(),
    modelName: z.string().trim().max(200).nullable(),
    rationale: z.string().trim().max(1_000),
  })
  .strict();

const sourceIndexesSchema = z.array(z.number().int().nonnegative()).min(1).max(10);
const optionalMeasurement = z.number().finite().positive().max(3000).nullable().optional();
const handMeasurement = z.number().finite().min(15).max(22).nullable().optional();
const sourcedText = (maximum: number) =>
  z.object({ value: boundedText(maximum), sourceIndexes: sourceIndexesSchema }).strict();

export const storePageSchema = z
  .object({
    sizes: z
      .array(
        z
          .object({
            name: boundedText(40),
            lengthMm: optionalMeasurement,
            widthMm: optionalMeasurement,
            heightMm: optionalMeasurement,
            weight: boundedText(50).optional(),
            handMin: handMeasurement,
            handMax: handMeasurement,
            sourceIndexes: sourceIndexesSchema,
          })
          .strict()
          .refine(
            (size) => size.handMin == null || size.handMax == null || size.handMin < size.handMax,
            "La longitud mínima debe ser menor que la máxima."
          )
      )
      .max(6)
      .optional(),
    packageContents: z
      .array(
        z
          .object({
            edition: boundedText(80),
            sourceIndexes: sourceIndexesSchema,
            items: z
              .array(
                z
                  .object({
                    name: boundedText(100),
                    quantity: boundedText(20).optional(),
                    note: boundedText(160).optional(),
                    sourceIndexes: sourceIndexesSchema,
                  })
                  .strict()
              )
              .min(1)
              .max(30),
          })
          .strict()
      )
      .max(2)
      .optional(),
    support: z
      .object({
        warranty: sourcedText(120).optional(),
        manualUrl: z
          .object({ value: z.string().url().max(500), sourceIndexes: sourceIndexesSchema })
          .strict()
          .optional(),
        driverUrl: z
          .object({ value: z.string().url().max(500), sourceIndexes: sourceIndexesSchema })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    highlights: z
      .array(
        z
          .object({
            label: boundedText(80),
            value: boundedText(300),
            note: boundedText(180).optional(),
            sourceIndexes: sourceIndexesSchema,
          })
          .strict()
      )
      .max(60)
      .optional(),
  })
  .strict();

/** One review per block or support field, linked only to its actual evidence. */
export function storePageReviewFields(page: z.infer<typeof storePageSchema> | undefined): Array<{
  fieldPath: string;
  proposedValue: unknown;
  sourceIndexes: number[];
}> {
  if (!page) return [];
  const fields = [];
  if (page.sizes?.length)
    fields.push({
      fieldPath: "pdp.sizes",
      proposedValue: page.sizes.map(({ sourceIndexes: _sources, ...size }) => size),
      sourceIndexes: [...new Set(page.sizes.flatMap((size) => size.sourceIndexes))],
    });
  if (page.packageContents?.length)
    fields.push({
      fieldPath: "pdp.packageContents",
      proposedValue: page.packageContents.map(({ sourceIndexes: _sources, items, ...edition }) => ({
        ...edition,
        items: items.map(({ sourceIndexes: _itemSources, ...item }) => item),
      })),
      sourceIndexes: [
        ...new Set(
          page.packageContents.flatMap((edition) => [
            ...edition.sourceIndexes,
            ...edition.items.flatMap((item) => item.sourceIndexes),
          ])
        ),
      ],
    });
  for (const [key, field] of Object.entries(page.support ?? {})) {
    if (field)
      fields.push({
        fieldPath: `pdp.support.${key}`,
        proposedValue: field.value,
        sourceIndexes: field.sourceIndexes,
      });
  }
  if (page.highlights?.length)
    fields.push({
      fieldPath: "pdp.highlights",
      proposedValue: page.highlights.map(({ sourceIndexes: _sources, ...row }) => row),
      sourceIndexes: [...new Set(page.highlights.flatMap((row) => row.sourceIndexes))],
    });
  return fields;
}

export const specificationExtractionSchema = z
  .object({
    specifications: z
      .array(
        z
          .object({
            fieldPath: evidenceFieldNameSchema,
            value: jsonScalarSchema,
            sourceIndexes: z.array(z.number().int().nonnegative()).min(1).max(10),
            conflictingValues: z
              .array(
                z
                  .object({
                    value: jsonScalarSchema,
                    sourceIndexes: z.array(z.number().int().nonnegative()).min(1).max(10),
                  })
                  .strict()
              )
              .max(10)
              .default([]),
          })
          .strict()
      )
      .max(100)
      .superRefine((specifications, context) => {
        const fieldPaths = new Set<string>();
        for (const [index, specification] of specifications.entries()) {
          if (fieldPaths.has(specification.fieldPath)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, "fieldPath"],
              message: "Duplicate specification field path.",
            });
          }
          fieldPaths.add(specification.fieldPath);
        }
      }),
    unmappedSpecifications: evidenceRecordSchema.default({}),
    variants: z.array(proposedVariantSchema).max(50).default([]),
    mediaCandidates: z.array(z.string().url().max(2_000)).max(20).default([]),
    storePage: storePageSchema.optional(),
  })
  .strict();

export const copyGenerationSchema = z
  .object({
    name: boundedText(200),
    subtitle: z.string().trim().max(255).nullable(),
    description: z.string().trim().max(8_000).nullable(),
    seoTitle: z.string().trim().max(70).nullable(),
    seoDescription: z.string().trim().max(170).nullable(),
  })
  .strict();

export type CreateResearchJobInput = z.input<typeof createResearchJobInputSchema>;
export type IdentityResolution = z.infer<typeof identityResolutionSchema>;
export type SpecificationExtraction = z.infer<typeof specificationExtractionSchema>;
export type CopyGeneration = z.infer<typeof copyGenerationSchema>;

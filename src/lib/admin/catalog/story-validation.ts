import { z } from "zod";
import { CatalogDomainError } from "./types";

export const MAX_AUTHORED_STORY_BLOCKS = 30;

export interface StoryValidationIssue {
  code: string;
  path: string;
  message: string;
}

export class StoryValidationError extends CatalogDomainError {
  readonly issues: StoryValidationIssue[];

  constructor(issues: StoryValidationIssue[]) {
    super("La historia contiene campos inválidos.", "STORY_VALIDATION_ERROR", 422);
    this.name = "StoryValidationError";
    this.issues = issues;
  }
}

const HTML_OR_EXECUTABLE_PATTERN =
  /<[^>]*>|(?:javascript|vbscript|data)\s*:|\bon[a-z]+\s*=|```|<\/?(?:script|style|iframe|object|embed)\b/i;
const MARKDOWN_PATTERN =
  /(^|\n)\s{0,3}(?:#{1,6}\s|[-+*]\s|\d+\.\s|>\s)|!?\[[^\]]*\]\([^)]*\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__/m;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function plainText(minimum: number, maximum: number) {
  return z
    .string({ invalid_type_error: "Debe ser texto." })
    .trim()
    .min(minimum, "El texto no puede quedar vacío.")
    .max(maximum, `El texto no puede exceder ${maximum} caracteres.`)
    .refine(
      (value) =>
        !HTML_OR_EXECUTABLE_PATTERN.test(value) &&
        !MARKDOWN_PATTERN.test(value) &&
        !CONTROL_CHARACTER_PATTERN.test(value),
      "Solo se permite texto plano; HTML, Markdown y contenido ejecutable están prohibidos."
    );
}

const BlockIdSchema = z
  .string({ invalid_type_error: "El identificador del bloque debe ser texto." })
  .trim()
  .min(1, "El identificador del bloque es obligatorio.")
  .max(100, "El identificador del bloque no puede exceder 100 caracteres.");

const SelectorIdSchema = z
  .string({ invalid_type_error: "La selección debe usar una identidad válida." })
  .trim()
  .uuid("La selección debe usar una identidad UUID válida.");

const OptionalTitleSchema = plainText(1, 200).optional();

const StatItemSchema = z
  .object({
    value: plainText(1, 50),
    label: plainText(1, 100),
    unit: plainText(1, 20).optional(),
  })
  .strict();

const GalleryAuthoringItemSchema = z
  .object({
    mediaId: SelectorIdSchema,
    altText: plainText(1, 200).optional(),
    caption: plainText(1, 300).optional(),
  })
  .strict();

const GalleryPersistedItemSchema = z
  .object({
    mediaKey: plainText(1, 300),
    altText: plainText(1, 200).optional(),
    caption: plainText(1, 300).optional(),
  })
  .strict();

function comparisonPayloadSchema() {
  return z
    .object({
      title: OptionalTitleSchema,
      headers: z.array(plainText(1, 100)).min(2).max(6),
      rows: z
        .array(z.array(plainText(1, 200)).min(2).max(6))
        .min(1)
        .max(20),
    })
    .strict()
    .superRefine((payload, context) => {
      payload.rows.forEach((row, rowIndex) => {
        if (row.length !== payload.headers.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["rows", rowIndex],
            message: "Cada fila debe tener exactamente el mismo ancho que los encabezados.",
          });
        }
      });
    });
}

const AuthoringDimensionsPayloadSchema = z
  .object({
    blueprintMediaId: SelectorIdSchema.optional(),
    lengthMm: z.number().positive().max(1000).optional(),
    widthMm: z.number().positive().max(1000).optional(),
    heightMm: z.number().positive().max(1000).optional(),
    gripTypes: z.array(plainText(1, 50)).min(1).max(10).optional(),
  })
  .strict()
  .refine(
    (payload) =>
      payload.blueprintMediaId !== undefined ||
      payload.lengthMm !== undefined ||
      payload.widthMm !== undefined ||
      payload.heightMm !== undefined ||
      (payload.gripTypes !== undefined && payload.gripTypes.length > 0),
    "El bloque de dimensiones requiere un plano, una medida o un tipo de agarre."
  );

const PersistedDimensionsPayloadSchema = z
  .object({
    blueprintMediaKey: plainText(1, 300).optional(),
    lengthMm: z.number().positive().max(1000).optional(),
    widthMm: z.number().positive().max(1000).optional(),
    heightMm: z.number().positive().max(1000).optional(),
    gripTypes: z.array(plainText(1, 50)).min(1).max(10).optional(),
  })
  .strict()
  .refine(
    (payload) =>
      payload.blueprintMediaKey !== undefined ||
      payload.lengthMm !== undefined ||
      payload.widthMm !== undefined ||
      payload.heightMm !== undefined ||
      (payload.gripTypes !== undefined && payload.gripTypes.length > 0),
    "El bloque de dimensiones requiere un plano, una medida o un tipo de agarre."
  );

const BoxAuthoringItemSchema = z
  .object({
    title: plainText(1, 100),
    mediaId: SelectorIdSchema.optional(),
    count: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const BoxPersistedItemSchema = z
  .object({
    title: plainText(1, 100),
    mediaKey: plainText(1, 300).optional(),
    count: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const TechnicalSpecSchema = z
  .object({
    label: plainText(1, 100),
    value: plainText(1, 200),
  })
  .strict();

const TechnicalGroupSchema = z
  .object({
    groupName: plainText(1, 100),
    specs: z.array(TechnicalSpecSchema).min(1).max(20),
  })
  .strict();

const FaqItemSchema = z
  .object({
    question: plainText(1, 300),
    answer: plainText(1, 2000),
  })
  .strict();

const AuthoringPayloadSchemas = {
  hero_media: z
    .object({
      headline: plainText(1, 200),
      tagline: plainText(1, 500).optional(),
      body: plainText(1, 1000).optional(),
      mediaId: SelectorIdSchema.optional(),
      posterMediaId: SelectorIdSchema.optional(),
      videoMediaId: SelectorIdSchema.optional(),
    })
    .strict(),
  full_bleed_image: z
    .object({
      mediaId: SelectorIdSchema,
      altText: plainText(1, 200).optional(),
      caption: plainText(1, 300).optional(),
    })
    .strict(),
  image_text: z
    .object({
      headline: plainText(1, 200),
      body: plainText(1, 2000),
      mediaId: SelectorIdSchema,
      imagePosition: z.enum(["left", "right"]).optional().default("left"),
    })
    .strict(),
  stat_highlight: z
    .object({ title: OptionalTitleSchema, stats: z.array(StatItemSchema).min(1).max(6) })
    .strict(),
  spec_feature: z
    .object({
      title: plainText(1, 200),
      description: plainText(1, 2000),
      mediaId: SelectorIdSchema.optional(),
      badge: plainText(1, 50).optional(),
    })
    .strict(),
  video: z
    .object({
      videoMediaId: SelectorIdSchema,
      posterMediaId: SelectorIdSchema.optional(),
      title: OptionalTitleSchema,
      caption: plainText(1, 500).optional(),
    })
    .strict(),
  gallery: z
    .object({
      title: OptionalTitleSchema,
      items: z.array(GalleryAuthoringItemSchema).min(3).max(6),
    })
    .strict(),
  comparison: comparisonPayloadSchema(),
  dimensions: AuthoringDimensionsPayloadSchema,
  box_contents: z
    .object({ title: OptionalTitleSchema, items: z.array(BoxAuthoringItemSchema).min(1).max(12) })
    .strict(),
  technical_specs: z
    .object({ title: OptionalTitleSchema, groups: z.array(TechnicalGroupSchema).min(1).max(10) })
    .strict(),
  faq: z
    .object({ title: OptionalTitleSchema, items: z.array(FaqItemSchema).min(1).max(15) })
    .strict(),
  related_products: z
    .object({
      title: OptionalTitleSchema,
      productIds: z.array(SelectorIdSchema).min(1).max(10),
    })
    .strict()
    .superRefine((payload, context) => {
      const seen = new Set<string>();
      payload.productIds.forEach((productId, index) => {
        if (seen.has(productId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["productIds", index],
            message: "No se permiten productos relacionados duplicados.",
          });
        }
        seen.add(productId);
      });
    }),
} as const;

const PersistedPayloadSchemas = {
  hero_media: z
    .object({
      headline: plainText(1, 200),
      tagline: plainText(1, 500).optional(),
      body: plainText(1, 1000).optional(),
      mediaKey: plainText(1, 300).optional(),
      posterKey: plainText(1, 300).optional(),
      videoKey: plainText(1, 300).optional(),
    })
    .strict(),
  full_bleed_image: z
    .object({
      mediaKey: plainText(1, 300),
      altText: plainText(1, 200).optional(),
      caption: plainText(1, 300).optional(),
    })
    .strict(),
  image_text: z
    .object({
      headline: plainText(1, 200),
      body: plainText(1, 2000),
      mediaKey: plainText(1, 300),
      imagePosition: z.enum(["left", "right"]).optional().default("left"),
    })
    .strict(),
  stat_highlight: z
    .object({ title: OptionalTitleSchema, stats: z.array(StatItemSchema).min(1).max(6) })
    .strict(),
  spec_feature: z
    .object({
      title: plainText(1, 200),
      description: plainText(1, 2000),
      mediaKey: plainText(1, 300).optional(),
      badge: plainText(1, 50).optional(),
    })
    .strict(),
  video: z
    .object({
      videoKey: plainText(1, 300),
      posterKey: plainText(1, 300).optional(),
      title: OptionalTitleSchema,
      caption: plainText(1, 500).optional(),
    })
    .strict(),
  gallery: z
    .object({
      title: OptionalTitleSchema,
      items: z.array(GalleryPersistedItemSchema).min(3).max(6),
    })
    .strict(),
  comparison: comparisonPayloadSchema(),
  dimensions: PersistedDimensionsPayloadSchema,
  box_contents: z
    .object({ title: OptionalTitleSchema, items: z.array(BoxPersistedItemSchema).min(1).max(12) })
    .strict(),
  technical_specs: z
    .object({ title: OptionalTitleSchema, groups: z.array(TechnicalGroupSchema).min(1).max(10) })
    .strict(),
  faq: z
    .object({ title: OptionalTitleSchema, items: z.array(FaqItemSchema).min(1).max(15) })
    .strict(),
  related_products: z
    .object({ title: OptionalTitleSchema, productSlugs: z.array(plainText(1, 100)).min(1).max(10) })
    .strict()
    .superRefine((payload, context) => {
      const seen = new Set<string>();
      payload.productSlugs.forEach((slug, index) => {
        if (seen.has(slug)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["productSlugs", index],
            message: "No se permiten productos relacionados duplicados.",
          });
        }
        seen.add(slug);
      });
    }),
} as const;

type StoryType = keyof typeof AuthoringPayloadSchemas;

function authoringBlockSchema<TType extends StoryType>(type: TType) {
  return z
    .object({
      blockId: BlockIdSchema,
      type: z.literal(type),
      payload: AuthoringPayloadSchemas[type],
    })
    .strict();
}

function persistedBlockSchema<TType extends StoryType>(type: TType) {
  return z
    .object({
      block_id: BlockIdSchema,
      type: z.literal(type),
      order: z.number().int().min(1).max(MAX_AUTHORED_STORY_BLOCKS),
      payload: PersistedPayloadSchemas[type],
    })
    .strict();
}

const AuthoringStoryBlockSchema = z.discriminatedUnion("type", [
  authoringBlockSchema("hero_media"),
  authoringBlockSchema("full_bleed_image"),
  authoringBlockSchema("image_text"),
  authoringBlockSchema("stat_highlight"),
  authoringBlockSchema("spec_feature"),
  authoringBlockSchema("video"),
  authoringBlockSchema("gallery"),
  authoringBlockSchema("comparison"),
  authoringBlockSchema("dimensions"),
  authoringBlockSchema("box_contents"),
  authoringBlockSchema("technical_specs"),
  authoringBlockSchema("faq"),
  authoringBlockSchema("related_products"),
]);

const PersistedStoryBlockSchema = z.discriminatedUnion("type", [
  persistedBlockSchema("hero_media"),
  persistedBlockSchema("full_bleed_image"),
  persistedBlockSchema("image_text"),
  persistedBlockSchema("stat_highlight"),
  persistedBlockSchema("spec_feature"),
  persistedBlockSchema("video"),
  persistedBlockSchema("gallery"),
  persistedBlockSchema("comparison"),
  persistedBlockSchema("dimensions"),
  persistedBlockSchema("box_contents"),
  persistedBlockSchema("technical_specs"),
  persistedBlockSchema("faq"),
  persistedBlockSchema("related_products"),
]);

const AuthoringStoryDocumentSchema = z
  .array(AuthoringStoryBlockSchema)
  .max(MAX_AUTHORED_STORY_BLOCKS);
const PersistedStoryDocumentSchema = z
  .array(PersistedStoryBlockSchema)
  .max(MAX_AUTHORED_STORY_BLOCKS);

export type AuthoringStoryBlock = z.infer<typeof AuthoringStoryBlockSchema>;
export type AuthoringStoryDocument = AuthoringStoryBlock[];
export type StrictPersistedStoryBlock = z.infer<typeof PersistedStoryBlockSchema>;
export type StrictPersistedStoryDocument = StrictPersistedStoryBlock[];

function renderPath(path: (string | number)[]): string {
  let rendered = "blocks";
  for (const segment of path) {
    rendered += typeof segment === "number" ? `[${segment}]` : `.${segment}`;
  }
  return rendered;
}

function mapZodIssues(error: z.ZodError): StoryValidationIssue[] {
  const issues: StoryValidationIssue[] = [];

  for (const issue of error.issues) {
    if (issue.code === z.ZodIssueCode.unrecognized_keys) {
      for (const key of [...issue.keys].sort()) {
        issues.push({
          code: "UNKNOWN_KEY",
          path: renderPath([...issue.path, key]),
          message: "Este campo no está permitido.",
        });
      }
      continue;
    }

    issues.push({
      code: issue.code === z.ZodIssueCode.custom ? "INVALID_VALUE" : issue.code.toUpperCase(),
      path: renderPath(issue.path),
      message: issue.message,
    });
  }

  return issues;
}

function assertUniqueBlockIds(document: readonly { blockId?: string; block_id?: string }[]): void {
  const seen = new Set<string>();
  document.forEach((block, index) => {
    const blockId = block.blockId ?? block.block_id ?? "";
    if (seen.has(blockId)) {
      throw new StoryValidationError([
        {
          code: "DUPLICATE_BLOCK_ID",
          path: `blocks[${index}].${block.blockId !== undefined ? "blockId" : "block_id"}`,
          message: "El identificador del bloque está duplicado.",
        },
      ]);
    }
    seen.add(blockId);
  });
}

export function validateAuthoringStoryDocument(
  rawDocument: unknown,
  options: { allowEmpty: boolean }
): AuthoringStoryDocument {
  const result = AuthoringStoryDocumentSchema.safeParse(rawDocument);
  if (!result.success) {
    throw new StoryValidationError(mapZodIssues(result.error));
  }

  assertUniqueBlockIds(result.data);
  if (!options.allowEmpty && result.data.length === 0) {
    throw new StoryValidationError([
      {
        code: "EMPTY_STORY",
        path: "blocks",
        message: "La historia debe contener al menos un bloque para publicarse.",
      },
    ]);
  }

  return result.data;
}

export function validatePersistedStoryDocument(
  rawDocument: unknown,
  options: { allowEmpty: boolean }
): StrictPersistedStoryDocument {
  const result = PersistedStoryDocumentSchema.safeParse(rawDocument);
  if (!result.success) {
    throw new StoryValidationError(mapZodIssues(result.error));
  }

  assertUniqueBlockIds(result.data);
  const invalidOrderIndex = result.data.findIndex((block, index) => block.order !== index + 1);
  if (invalidOrderIndex >= 0) {
    throw new StoryValidationError([
      {
        code: "INVALID_BLOCK_ORDER",
        path: `blocks[${invalidOrderIndex}].order`,
        message: "El orden persistido debe ser contiguo y comenzar en 1.",
      },
    ]);
  }

  if (!options.allowEmpty && result.data.length === 0) {
    throw new StoryValidationError([
      {
        code: "EMPTY_STORY",
        path: "blocks",
        message: "La historia debe contener al menos un bloque para publicarse.",
      },
    ]);
  }

  return result.data;
}

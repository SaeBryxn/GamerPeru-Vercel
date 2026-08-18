import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ValidatedSpecificationField, ValidatedSpecificationSchema } from "./types";

const IDENTIFIER_REGEX = /^[a-z][a-z0-9_]{1,40}$/;

const EnumOptionSchema = z.object({
  value: z.string().min(1).max(80),
  label: z.string().min(1).max(100),
});

const SpecificationFieldDefinitionSchema = z
  .object({
    key: z.string().regex(IDENTIFIER_REGEX),
    label: z.string().min(1).max(100),
    dataType: z.enum(["enum", "number", "boolean", "string"]),
    unit: z.string().max(20).nullable().optional(),
    filterable: z.boolean(),
    filterKind: z.enum(["ENUM_MULTI", "NUMBER_RANGE", "BOOLEAN"]).optional(),
    publicParam: z.string().regex(IDENTIFIER_REGEX).optional(),
    displayOrder: z.number().int().min(0).default(0),
    options: z.array(EnumOptionSchema).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.filterable) {
      if (!val.filterKind) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Filterable field ${val.key} requires filterKind`,
          path: ["filterKind"],
        });
      }
      if (!val.publicParam) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Filterable field ${val.key} requires publicParam`,
          path: ["publicParam"],
        });
      }
      if (val.dataType === "enum" && val.filterKind !== "ENUM_MULTI") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Enum field ${val.key} must have filterKind ENUM_MULTI`,
          path: ["filterKind"],
        });
      }
      if (val.dataType === "enum" && (!val.options || val.options.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Enum field ${val.key} must provide options`,
          path: ["options"],
        });
      }
      if (val.dataType === "number" && val.filterKind !== "NUMBER_RANGE") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Number field ${val.key} must have filterKind NUMBER_RANGE`,
          path: ["filterKind"],
        });
      }
      if (val.dataType === "boolean" && val.filterKind !== "BOOLEAN") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Boolean field ${val.key} must have filterKind BOOLEAN`,
          path: ["filterKind"],
        });
      }
      if (val.dataType === "string") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `String field ${val.key} is not public-filterable in GP-013 V1`,
          path: ["dataType"],
        });
      }
    }
  });

const FieldDefinitionsArraySchema = z.array(SpecificationFieldDefinitionSchema);

/**
 * Validates raw category specification field definitions from the database.
 * Returns validated fields or null if validation fails.
 */
export function validateSpecificationFieldDefinitions(
  rawDefs: unknown,
  diagnosticContext?: { categoryId?: string; schemaId?: string }
): ValidatedSpecificationField[] | null {
  if (!rawDefs || !Array.isArray(rawDefs)) {
    return null;
  }

  const parseResult = FieldDefinitionsArraySchema.safeParse(rawDefs);
  if (!parseResult.success) {
    logger.warn({
      event: "specification_schema_validation_failed",
      categoryId: diagnosticContext?.categoryId,
      schemaId: diagnosticContext?.schemaId,
      issueCount: parseResult.error.issues.length,
      firstIssue: parseResult.error.issues[0]?.message,
    });
    return null;
  }

  const validated: ValidatedSpecificationField[] = [];
  const seenKeys = new Set<string>();
  const seenParams = new Set<string>();

  for (const item of parseResult.data) {
    if (seenKeys.has(item.key)) {
      logger.warn({
        event: "specification_schema_duplicate_key",
        key: item.key,
        categoryId: diagnosticContext?.categoryId,
      });
      return null;
    }
    seenKeys.add(item.key);

    if (item.filterable && item.publicParam) {
      if (seenParams.has(item.publicParam)) {
        logger.warn({
          event: "specification_schema_duplicate_public_param",
          publicParam: item.publicParam,
          categoryId: diagnosticContext?.categoryId,
        });
        return null;
      }
      seenParams.add(item.publicParam);
    }

    validated.push({
      key: item.key,
      label: item.label,
      dataType: item.dataType,
      unit: item.unit ?? null,
      filterable: item.filterable,
      filterKind: item.filterKind ?? "ENUM_MULTI",
      publicParam: item.publicParam ?? item.key,
      displayOrder: item.displayOrder,
      options: item.options,
      min: item.min,
      max: item.max,
      step: item.step,
    });
  }

  return validated.sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Builds a validated specification schema structure from raw database record.
 */
export function validateSpecificationSchema(
  rawSchema: {
    id: string;
    categoryId: string;
    schemaVersion: number;
    fieldDefinitions: unknown;
  } | null
): ValidatedSpecificationSchema | null {
  if (!rawSchema) return null;

  const validFields = validateSpecificationFieldDefinitions(rawSchema.fieldDefinitions, {
    categoryId: rawSchema.categoryId,
    schemaId: rawSchema.id,
  });

  if (!validFields) return null;

  return {
    id: rawSchema.id,
    categoryId: rawSchema.categoryId,
    schemaVersion: rawSchema.schemaVersion,
    fieldDefinitions: validFields,
  };
}

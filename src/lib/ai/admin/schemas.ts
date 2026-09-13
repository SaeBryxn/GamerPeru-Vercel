import { z } from "zod";
import { ADMIN_AI_PROFILE_KEYS, ADMIN_AI_PROVIDER_KEYS } from "./types";

const uuid = z.string().uuid();
const isoTimestamp = z.string().datetime({ offset: true });

export const adminResearchJobReadSchema = z.object({ jobId: uuid }).strict();

export const adminResearchSubmissionSchema = z
  .object({
    mutationRequestId: z.string().uuid(),
    selectedProfileId: uuid,
    items: z
      .array(
        z
          .object({
            query: z.string().trim().min(1).max(500),
            mode: z.enum(["CREATE", "ENRICH"]),
            targetProductId: uuid.nullable().optional(),
          })
          .strict()
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const enrichCount = value.items.filter((item) => item.mode === "ENRICH").length;
    for (const [index, item] of value.items.entries()) {
      const hasTarget = Boolean(item.targetProductId);
      if ((item.mode === "ENRICH" && !hasTarget) || (item.mode === "CREATE" && hasTarget)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "targetProductId"],
          message: "ENRICH requires a target; CREATE forbids one.",
        });
      }
    }
    if (enrichCount > 0 && value.items.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Batch ENRICH is not supported by the frozen research contract.",
      });
    }
  });

export const adminProposalReadSchema = z.object({ proposalId: uuid }).strict();

export const adminProposalVersionSchema = z
  .object({ proposalId: uuid, expectedProposalUpdatedAt: isoTimestamp })
  .strict();

export const adminProposalFieldDecisionSchema = adminProposalVersionSchema
  .extend({
    fieldPath: z.string().trim().min(1).max(100),
    decision: z.enum(["PENDING", "ACCEPTED", "REJECTED", "MANUALLY_EDITED"]),
    selectedValue: z.unknown().optional(),
    preferredSourceId: uuid.nullable().optional(),
  })
  .strict();

export const adminVariantPlanSchema = adminProposalVersionSchema
  .extend({
    variants: z
      .array(
        z
          .object({
            sku: z.string().max(100),
            title: z.string().max(200),
            pricePen: z.string().max(32),
            compareAtPricePen: z.string().max(32).optional(),
            costPen: z.string().max(32).optional(),
            weightGrams: z.number().int().positive().max(2_147_483_647).nullable().optional(),
            attributes: z.record(z.string()).optional(),
          })
          .strict()
      )
      .min(1)
      .max(100),
  })
  .strict();

export const adminProviderConfigurationSchema = z
  .object({
    providerKey: z.enum(ADMIN_AI_PROVIDER_KEYS),
    displayName: z.string().trim().min(1).max(100),
    isEnabled: z.boolean(),
    isDefault: z.boolean(),
    settingsJson: z.string().trim().max(10_000),
  })
  .strict();

export const adminCredentialSaveSchema = z
  .object({
    providerId: uuid,
    plaintextApiKey: z.string().trim().min(8).max(10_000),
  })
  .strict();

export const adminCredentialMutationSchema = z.object({ credentialId: uuid }).strict();
export const adminProviderOperationSchema = z.object({ providerId: uuid }).strict();

export const adminProfileConfigurationSchema = z
  .object({
    profileKey: z.enum(ADMIN_AI_PROFILE_KEYS),
    providerId: uuid,
    modelId: z.string().trim().min(1).max(100),
    temperature: z
      .string()
      .trim()
      .regex(/^(?:0(?:\.\d{1,2})?|1(?:\.\d{1,2})?|2(?:\.0{1,2})?)$/),
    maxTokens: z.number().int().positive().max(1_000_000),
    isEnabled: z.boolean(),
  })
  .strict();

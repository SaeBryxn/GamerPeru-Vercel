import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { aiProfiles, aiProviders, auditEvents } from "@/db/schema";
import { assertAiCredentialPermission } from "./credential-service";
import { AI_AUDIT_ACTIONS } from "./audit-actions";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

export interface ProfileExecutionSnapshot {
  profileKey: string;
  providerId: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
}

/**
 * Builds an immutable execution snapshot from a profile entity.
 * Frozen into research jobs and provider attempt records.
 * Temperature is converted to a validated finite number between 0 and 2.
 */
export function createProfileSnapshot(
  profile: typeof aiProfiles.$inferSelect
): ProfileExecutionSnapshot {
  const parsedTemperature = Number(profile.temperature);
  if (!Number.isFinite(parsedTemperature) || parsedTemperature < 0 || parsedTemperature > 2) {
    throw new Error(
      `INVALID_PROFILE_TEMPERATURE: Profile temperature "${profile.temperature}" must be a finite number between 0.00 and 2.00.`
    );
  }

  return {
    profileKey: profile.profileKey,
    providerId: profile.providerId,
    modelId: profile.modelId,
    temperature: parsedTemperature,
    maxTokens: profile.maxTokens,
  };
}

export interface ConfigureProfileInput {
  profileKey: string;
  providerId: string;
  modelId: string;
  temperature?: string;
  maxTokens?: number;
  isEnabled?: boolean;
}

export interface ProfileServiceOptions {
  authContext?: VerifiedAuthContextReady;
  requestId?: string;
  dbClient?: typeof db;
}

/**
 * Creates or updates an AI profile.
 * Requires ai:manage_credentials permission.
 * Emits AI_PROFILE_UPDATED.
 */
export async function configureProfile(
  input: ConfigureProfileInput,
  options?: ProfileServiceOptions
): Promise<typeof aiProfiles.$inferSelect> {
  const caller = await assertAiCredentialPermission(options?.authContext);
  const client = options?.dbClient ?? db;

  return await client.transaction(async (tx) => {
    // Verify provider exists
    const [provider] = await tx
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, input.providerId))
      .limit(1);

    if (!provider) {
      throw new Error(`PROVIDER_NOT_FOUND: Provider "${input.providerId}" does not exist.`);
    }

    const [existing] = await tx
      .select()
      .from(aiProfiles)
      .where(eq(aiProfiles.profileKey, input.profileKey))
      .limit(1);

    const temperature = input.temperature ?? "0.20";
    const maxTokens = input.maxTokens ?? 4096;
    const isEnabled = input.isEnabled ?? true;

    let savedProfile: typeof aiProfiles.$inferSelect;

    if (existing) {
      const [updated] = await tx
        .update(aiProfiles)
        .set({
          providerId: input.providerId,
          modelId: input.modelId,
          temperature,
          maxTokens,
          isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(aiProfiles.id, existing.id))
        .returning();
      if (!updated) {
        throw new Error("PROFILE_UPDATE_FAILED: Failed to update profile.");
      }
      savedProfile = updated;
    } else {
      const [inserted] = await tx
        .insert(aiProfiles)
        .values({
          id: generateUuidV7(),
          profileKey: input.profileKey,
          providerId: input.providerId,
          modelId: input.modelId,
          temperature,
          maxTokens,
          isEnabled,
        })
        .returning();
      if (!inserted) {
        throw new Error("PROFILE_INSERT_FAILED: Failed to insert profile.");
      }
      savedProfile = inserted;
    }

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: caller.authUserId,
      action: AI_AUDIT_ACTIONS.AI_PROFILE_UPDATED,
      targetType: "ai_profile",
      targetId: savedProfile.id,
      metadata: {
        profile_key: savedProfile.profileKey,
        provider_id: savedProfile.providerId,
        model_id: savedProfile.modelId,
        is_enabled: savedProfile.isEnabled,
      },
      requestId: options?.requestId,
    });

    return savedProfile;
  });
}

/**
 * Retrieves a profile by profile_key.
 */
export async function getProfileByKey(
  profileKey: string,
  options?: { dbClient?: typeof db }
): Promise<typeof aiProfiles.$inferSelect | null> {
  const client = options?.dbClient ?? db;
  const [profile] = await client
    .select()
    .from(aiProfiles)
    .where(eq(aiProfiles.profileKey, profileKey))
    .limit(1);

  return profile ?? null;
}

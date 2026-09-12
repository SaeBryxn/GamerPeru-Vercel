import "server-only";
import { eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { aiProviders, auditEvents } from "@/db/schema";
import { assertAiCredentialPermission } from "@/lib/ai/credential-service";
import { AI_AUDIT_ACTIONS } from "./audit-actions";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

export const FORBIDDEN_SETTINGS_KEY_REGEX =
  /^(apikey|api_key|accesstoken|access_token|token|secret|password|credential|credentials|privatekey|private_key)$/i;

/**
 * Recursively validates that provider settings contain ZERO credential-bearing
 * or secret keys. Fails closed with an explicit error.
 */
export function validateNonSecretSettings(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined) {
    return {};
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("INVALID_PROVIDER_SETTINGS: Provider settings must be a non-null object.");
  }

  function checkNode(node: unknown, path = ""): void {
    if (node === null || node === undefined || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        checkNode(node[i], `${path}[${i}]`);
      }
      return;
    }
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      const normalizedKey = key.replace(/[-_]/g, "").toLowerCase();
      if (
        FORBIDDEN_SETTINGS_KEY_REGEX.test(key) ||
        FORBIDDEN_SETTINGS_KEY_REGEX.test(normalizedKey)
      ) {
        throw new Error(
          `REJECTED_SECRET_SETTINGS_KEY: Provider settings must not contain credential-bearing key "${key}" at "${path || key}".`
        );
      }
      checkNode(val, path ? `${path}.${key}` : key);
    }
  }

  checkNode(input);
  return input as Record<string, unknown>;
}

export interface ConfigureProviderInput {
  providerKey: string;
  displayName: string;
  isEnabled?: boolean;
  isDefault?: boolean;
  settings?: Record<string, unknown>;
}

export interface ProviderServiceOptions {
  authContext?: VerifiedAuthContextReady;
  requestId?: string;
  dbClient?: typeof db;
}

/**
 * Creates or updates an AI provider configuration.
 * Requires ai:manage_credentials permission.
 * Serializes default-provider mutations using PostgreSQL advisory transaction lock
 * to prevent multiple concurrent defaults.
 */
export async function configureProvider(
  input: ConfigureProviderInput,
  options?: ProviderServiceOptions
): Promise<typeof aiProviders.$inferSelect> {
  const caller = await assertAiCredentialPermission(options?.authContext);
  const client = options?.dbClient ?? db;

  const cleanSettings = validateNonSecretSettings(input.settings ?? {});
  const isDefault = input.isDefault ?? false;
  const isEnabled = input.isEnabled ?? true;

  return await client.transaction(async (tx) => {
    if (isDefault) {
      // Serialize competing default provider updates across all concurrent transactions
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ai_providers_default_lock'))`);
    }

    // Find existing by providerKey
    const [existing] = await tx
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.providerKey, input.providerKey))
      .limit(1);

    const providerId = existing ? existing.id : generateUuidV7();

    if (isDefault) {
      // Clear other defaults
      await tx
        .update(aiProviders)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(ne(aiProviders.id, providerId));
    }

    let savedProvider: typeof aiProviders.$inferSelect;

    if (existing) {
      const [updated] = await tx
        .update(aiProviders)
        .set({
          displayName: input.displayName,
          isEnabled,
          isDefault,
          settings: cleanSettings,
          updatedAt: new Date(),
        })
        .where(eq(aiProviders.id, existing.id))
        .returning();
      if (!updated) {
        throw new Error("PROVIDER_UPDATE_FAILED: Failed to update provider.");
      }
      savedProvider = updated;
    } else {
      const [inserted] = await tx
        .insert(aiProviders)
        .values({
          id: providerId,
          providerKey: input.providerKey,
          displayName: input.displayName,
          isEnabled,
          isDefault,
          settings: cleanSettings,
        })
        .returning();
      if (!inserted) {
        throw new Error("PROVIDER_INSERT_FAILED: Failed to insert provider.");
      }
      savedProvider = inserted;
    }

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: caller.authUserId,
      action: AI_AUDIT_ACTIONS.AI_PROVIDER_CONFIG_UPDATED,
      targetType: "ai_provider",
      targetId: savedProvider.id,
      metadata: {
        provider_key: savedProvider.providerKey,
        is_enabled: savedProvider.isEnabled,
        is_default: savedProvider.isDefault,
      },
      requestId: options?.requestId,
    });

    return savedProvider;
  });
}

/**
 * Retrieves an AI provider by provider_key.
 */
export async function getProviderByKey(
  providerKey: string,
  options?: { dbClient?: typeof db }
): Promise<typeof aiProviders.$inferSelect | null> {
  const client = options?.dbClient ?? db;
  const [provider] = await client
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.providerKey, providerKey))
    .limit(1);
  return provider ?? null;
}

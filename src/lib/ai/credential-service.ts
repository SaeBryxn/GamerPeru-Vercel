import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { aiProviderCredentials, aiProviders, auditEvents } from "@/db/schema";
import {
  decryptCredential,
  encryptCredential,
  getActiveAiEncryptionKeyVersion,
} from "./credential-crypto";
import { AI_AUDIT_ACTIONS } from "./audit-actions";
import { getAiAdapter } from "./gateway/registry";
import { ForbiddenError, requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";

/**
 * Asserts the caller has the canonical ai:manage_credentials permission.
 * Never hardcodes role names.
 */
export async function assertAiCredentialPermission(
  authContext?: VerifiedAuthContextReady
): Promise<VerifiedAuthContextReady> {
  if (authContext) {
    if (!authContext.permissions.has("ai:manage_credentials")) {
      throw new ForbiddenError("Missing required permission: ai:manage_credentials");
    }
    return authContext;
  }
  return await requirePermission("ai:manage_credentials");
}

export interface SafeCredentialDto {
  id: string;
  providerId: string;
  maskedKey: string;
  status: "ACTIVE" | "REVOKED";
  keyVersion: number;
  lastHealthStatus: "HEALTHY" | "UNHEALTHY" | "UNTESTED" | null;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toSafeCredentialDto(
  row: typeof aiProviderCredentials.$inferSelect
): SafeCredentialDto {
  return {
    id: row.id,
    providerId: row.providerId,
    maskedKey: row.maskedKey,
    status: row.status as "ACTIVE" | "REVOKED",
    keyVersion: row.keyVersion,
    lastHealthStatus: row.lastHealthStatus as SafeCredentialDto["lastHealthStatus"],
    lastTestedAt: row.lastTestedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface CredentialServiceOptions {
  authContext?: VerifiedAuthContextReady;
  requestId?: string;
  dbClient?: typeof db;
}

export interface SaveCredentialInput {
  providerId: string;
  plaintextApiKey: string;
}

/**
 * Saves a credential for an AI provider.
 * Always resolves and encrypts with the active AI encryption key version.
 * If provider already has an ACTIVE credential:
 * - atomically revokes existing ACTIVE credential
 * - inserts new ACTIVE credential
 * - emits AI_CREDENTIAL_UPDATED
 * If provider has NO existing ACTIVE credential:
 * - inserts new ACTIVE credential
 * - emits AI_CREDENTIAL_CREATED
 */
export async function saveCredential(
  input: SaveCredentialInput,
  options?: CredentialServiceOptions
): Promise<SafeCredentialDto> {
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

    // Lock existing ACTIVE credential for update
    const [existingActive] = await tx
      .select()
      .from(aiProviderCredentials)
      .where(
        and(
          eq(aiProviderCredentials.providerId, input.providerId),
          eq(aiProviderCredentials.status, "ACTIVE")
        )
      )
      .for("update");

    const activeKeyVersion = getActiveAiEncryptionKeyVersion();
    const newCredentialId = generateUuidV7();
    const encrypted = encryptCredential({
      credentialId: newCredentialId,
      providerId: input.providerId,
      plaintext: input.plaintextApiKey,
      keyVersion: activeKeyVersion,
    });

    if (existingActive) {
      // Atomic replacement: revoke old active
      await tx
        .update(aiProviderCredentials)
        .set({
          status: "REVOKED",
          updatedAt: new Date(),
        })
        .where(eq(aiProviderCredentials.id, existingActive.id));

      const [inserted] = await tx
        .insert(aiProviderCredentials)
        .values({
          id: newCredentialId,
          providerId: input.providerId,
          keyVersion: encrypted.keyVersion,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          maskedKey: encrypted.maskedKey,
          status: "ACTIVE",
          lastHealthStatus: "UNTESTED",
        })
        .returning();

      if (!inserted) {
        throw new Error("CREDENTIAL_INSERT_FAILED: Failed to insert credential.");
      }

      await tx.insert(auditEvents).values({
        actorType: "ADMIN",
        actorId: caller.authUserId,
        action: AI_AUDIT_ACTIONS.AI_CREDENTIAL_UPDATED,
        targetType: "ai_credential",
        targetId: inserted.id,
        metadata: {
          provider_id: input.providerId,
          credential_id: inserted.id,
          previous_credential_id: existingActive.id,
          key_version: inserted.keyVersion,
        },
        requestId: options?.requestId,
      });

      return toSafeCredentialDto(inserted);
    } else {
      // Initial creation
      const [inserted] = await tx
        .insert(aiProviderCredentials)
        .values({
          id: newCredentialId,
          providerId: input.providerId,
          keyVersion: encrypted.keyVersion,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          maskedKey: encrypted.maskedKey,
          status: "ACTIVE",
          lastHealthStatus: "UNTESTED",
        })
        .returning();

      if (!inserted) {
        throw new Error("CREDENTIAL_INSERT_FAILED: Failed to insert credential.");
      }

      await tx.insert(auditEvents).values({
        actorType: "ADMIN",
        actorId: caller.authUserId,
        action: AI_AUDIT_ACTIONS.AI_CREDENTIAL_CREATED,
        targetType: "ai_credential",
        targetId: inserted.id,
        metadata: {
          provider_id: input.providerId,
          credential_id: inserted.id,
          key_version: inserted.keyVersion,
        },
        requestId: options?.requestId,
      });

      return toSafeCredentialDto(inserted);
    }
  });
}

export interface RevokeCredentialInput {
  credentialId: string;
}

/**
 * Revokes a credential explicitly.
 * Emits AI_CREDENTIAL_REVOKED.
 */
export async function revokeCredential(
  input: RevokeCredentialInput,
  options?: CredentialServiceOptions
): Promise<SafeCredentialDto> {
  const caller = await assertAiCredentialPermission(options?.authContext);
  const client = options?.dbClient ?? db;

  return await client.transaction(async (tx) => {
    const [credential] = await tx
      .select()
      .from(aiProviderCredentials)
      .where(eq(aiProviderCredentials.id, input.credentialId))
      .for("update");

    if (!credential) {
      throw new Error(`CREDENTIAL_NOT_FOUND: Credential "${input.credentialId}" does not exist.`);
    }

    if (credential.status === "REVOKED") {
      return toSafeCredentialDto(credential);
    }

    const [updated] = await tx
      .update(aiProviderCredentials)
      .set({
        status: "REVOKED",
        updatedAt: new Date(),
      })
      .where(eq(aiProviderCredentials.id, credential.id))
      .returning();

    if (!updated) {
      throw new Error("CREDENTIAL_REVOKE_FAILED: Failed to revoke credential.");
    }

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: caller.authUserId,
      action: AI_AUDIT_ACTIONS.AI_CREDENTIAL_REVOKED,
      targetType: "ai_credential",
      targetId: updated.id,
      metadata: {
        credential_id: updated.id,
        provider_id: updated.providerId,
      },
      requestId: options?.requestId,
    });

    return toSafeCredentialDto(updated);
  });
}

export interface RotateCredentialKeyInput {
  credentialId: string;
}

/**
 * Rotates the encryption master key of an active credential.
 * Re-encrypts strictly with the active AI encryption key version.
 * If already on the active key version, returns a safe no-op to avoid unnecessary ciphertext churn.
 * Emits AI_CREDENTIAL_UPDATED with non-secret rotation metadata.
 */
export async function rotateCredentialKey(
  input: RotateCredentialKeyInput,
  options?: CredentialServiceOptions
): Promise<SafeCredentialDto> {
  const caller = await assertAiCredentialPermission(options?.authContext);
  const client = options?.dbClient ?? db;

  return await client.transaction(async (tx) => {
    const [credential] = await tx
      .select()
      .from(aiProviderCredentials)
      .where(eq(aiProviderCredentials.id, input.credentialId))
      .for("update");

    if (!credential) {
      throw new Error(`CREDENTIAL_NOT_FOUND: Credential "${input.credentialId}" does not exist.`);
    }

    if (credential.status !== "ACTIVE") {
      throw new Error(`CANNOT_ROTATE_REVOKED_CREDENTIAL: Only ACTIVE credentials can be rotated.`);
    }

    const oldKeyVersion = credential.keyVersion;
    const activeKeyVersion = getActiveAiEncryptionKeyVersion();

    if (oldKeyVersion === activeKeyVersion) {
      // Safe no-op: already on active key version, avoid unnecessary ciphertext churn
      return toSafeCredentialDto(credential);
    }

    // Decrypt old payload server-side
    const decrypted = decryptCredential({
      credentialId: credential.id,
      providerId: credential.providerId,
      keyVersion: oldKeyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    });

    // Re-encrypt with target active version and fresh IV + auth tag
    const reencrypted = encryptCredential({
      credentialId: credential.id,
      providerId: credential.providerId,
      plaintext: decrypted,
      keyVersion: activeKeyVersion,
    });

    const [updated] = await tx
      .update(aiProviderCredentials)
      .set({
        keyVersion: reencrypted.keyVersion,
        ciphertext: reencrypted.ciphertext,
        iv: reencrypted.iv,
        authTag: reencrypted.authTag,
        updatedAt: new Date(),
      })
      .where(eq(aiProviderCredentials.id, credential.id))
      .returning();

    if (!updated) {
      throw new Error("CREDENTIAL_ROTATION_FAILED: Failed to rotate credential.");
    }

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: caller.authUserId,
      action: AI_AUDIT_ACTIONS.AI_CREDENTIAL_UPDATED,
      targetType: "ai_credential",
      targetId: updated.id,
      metadata: {
        operation: "KEY_ROTATION",
        credential_id: updated.id,
        provider_id: updated.providerId,
        old_key_version: oldKeyVersion,
        new_key_version: activeKeyVersion,
      },
      requestId: options?.requestId,
    });

    return toSafeCredentialDto(updated);
  });
}

/**
 * Internal helper for unguarded server-side lookup of an active credential row.
 */
async function getActiveCredentialRow(
  providerId: string,
  client: typeof db = db
): Promise<typeof aiProviderCredentials.$inferSelect | null> {
  const [credential] = await client
    .select()
    .from(aiProviderCredentials)
    .where(
      and(
        eq(aiProviderCredentials.providerId, providerId),
        eq(aiProviderCredentials.status, "ACTIVE")
      )
    )
    .limit(1);

  return credential ?? null;
}

export class NoActiveProviderCredentialError extends Error {
  constructor() {
    super("Provider has no active credential.");
    this.name = "NoActiveProviderCredentialError";
  }
}

export async function withActiveProviderCredential<T>(
  providerId: string,
  operation: (apiKey: string) => Promise<T>,
  client: typeof db = db
): Promise<T> {
  const credential = await getActiveCredentialRow(providerId, client);
  if (!credential) {
    throw new NoActiveProviderCredentialError();
  }
  const apiKey = decryptCredential({
    credentialId: credential.id,
    providerId: credential.providerId,
    keyVersion: credential.keyVersion,
    ciphertext: credential.ciphertext,
    iv: credential.iv,
    authTag: credential.authTag,
  });
  return await operation(apiKey);
}

/**
 * Returns safe DTO for the currently ACTIVE credential of a provider, or null.
 * Strictly asserts ai:manage_credentials permission on caller.
 */
export async function getActiveCredentialSafe(
  providerId: string,
  options?: CredentialServiceOptions
): Promise<SafeCredentialDto | null> {
  await assertAiCredentialPermission(options?.authContext);
  const client = options?.dbClient ?? db;
  const credential = await getActiveCredentialRow(providerId, client);

  return credential ? toSafeCredentialDto(credential) : null;
}

export interface HealthCheckExecutionResult {
  ok: boolean;
  status: "HEALTHY" | "UNHEALTHY";
  code:
    | "AI_PROVIDER_HEALTH_CHECK_OK"
    | "AI_PROVIDER_HEALTH_CHECK_FAILED"
    | "CREDENTIAL_CHANGED_DURING_HEALTH_CHECK";
  message: string;
}

/**
 * Executes a privileged health check against the active provider credential.
 * - Resolves exact provider adapter (fails closed if unsupported)
 * - Decrypts credential server-side only
 * - Executes adapter health check outside DB transaction
 * - Discards raw provider/adapter errors to prevent credential or network payload leaks
 * - Persists safe health status and AI_HEALTH_CHECK_EXECUTED atomically in short post-call transaction
 * - Protects against concurrent replacement/revocation (CREDENTIAL_CHANGED_DURING_HEALTH_CHECK)
 * - Creates ZERO ai_provider_attempts rows
 */
export async function executeCredentialHealthCheck(
  providerId: string,
  options?: CredentialServiceOptions
): Promise<HealthCheckExecutionResult> {
  const caller = await assertAiCredentialPermission(options?.authContext);
  const client = options?.dbClient ?? db;

  // Load provider
  const [provider] = await client
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.id, providerId))
    .limit(1);

  if (!provider) {
    throw new Error(`PROVIDER_NOT_FOUND: Provider "${providerId}" does not exist.`);
  }

  // Load ACTIVE credential row initially
  const credential = await getActiveCredentialRow(providerId, client);

  if (!credential) {
    throw new Error(
      `NO_ACTIVE_CREDENTIAL: Provider "${provider.displayName}" has no active credential.`
    );
  }

  // Resolve adapter (fails closed with UNSUPPORTED_AI_PROVIDER if not registered)
  const adapter = getAiAdapter(provider.providerKey);

  // Decrypt credential server-side only
  const decryptedApiKey = decryptCredential({
    credentialId: credential.id,
    providerId: credential.providerId,
    keyVersion: credential.keyVersion,
    ciphertext: credential.ciphertext,
    iv: credential.iv,
    authTag: credential.authTag,
  });

  let healthCheckPassed = false;

  try {
    const healthResult = await adapter.healthCheck(decryptedApiKey);
    healthCheckPassed = Boolean(healthResult.ok);
  } catch {
    // Deliberately discard raw exception to prevent leaking sensitive provider payloads
    healthCheckPassed = false;
  }

  const finalStatus: "HEALTHY" | "UNHEALTHY" = healthCheckPassed ? "HEALTHY" : "UNHEALTHY";
  const now = new Date();

  // Commit health status and AuditEvent atomically in a short post-call transaction
  return await client.transaction(async (tx) => {
    // Lock and verify the tested credential is still the relevant ACTIVE credential
    const [currentCred] = await tx
      .select()
      .from(aiProviderCredentials)
      .where(eq(aiProviderCredentials.id, credential.id))
      .for("update");

    if (!currentCred || currentCred.status !== "ACTIVE") {
      // Credential was replaced or revoked while the external check was running.
      // Record privileged health attempt in audit trail targeting tested credential
      // without mutating health status on tested or replacement credential.
      await tx.insert(auditEvents).values({
        actorType: "ADMIN",
        actorId: caller.authUserId,
        action: AI_AUDIT_ACTIONS.AI_HEALTH_CHECK_EXECUTED,
        targetType: "ai_credential",
        targetId: credential.id,
        metadata: {
          provider_id: provider.id,
          provider_key: provider.providerKey,
          credential_id: credential.id,
          status: "UNHEALTHY",
          ok: false,
          result_code: "CREDENTIAL_CHANGED_DURING_HEALTH_CHECK",
          state_write_applied: false,
        },
        requestId: options?.requestId,
      });

      return {
        ok: false,
        status: "UNHEALTHY" as const,
        code: "CREDENTIAL_CHANGED_DURING_HEALTH_CHECK" as const,
        message: "Credential was modified or revoked during health check.",
      };
    }

    await tx
      .update(aiProviderCredentials)
      .set({
        lastHealthStatus: finalStatus,
        lastTestedAt: now,
        updatedAt: now,
      })
      .where(eq(aiProviderCredentials.id, currentCred.id));

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: caller.authUserId,
      action: AI_AUDIT_ACTIONS.AI_HEALTH_CHECK_EXECUTED,
      targetType: "ai_credential",
      targetId: currentCred.id,
      metadata: {
        provider_id: provider.id,
        provider_key: provider.providerKey,
        credential_id: currentCred.id,
        status: finalStatus,
        ok: healthCheckPassed,
      },
      requestId: options?.requestId,
    });

    return {
      ok: healthCheckPassed,
      status: finalStatus,
      code: healthCheckPassed
        ? ("AI_PROVIDER_HEALTH_CHECK_OK" as const)
        : ("AI_PROVIDER_HEALTH_CHECK_FAILED" as const),
      message: healthCheckPassed
        ? "Provider health check passed."
        : "Provider health check failed.",
    };
  });
}

import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const HISTORICAL_INSECURE_SENTINEL =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Lazily resolves the active AI encryption key version from environment.
 * Fails closed only when an AI credential operation requires it.
 */
export function getActiveAiEncryptionKeyVersion(): number {
  const raw = process.env.AI_ENCRYPTION_ACTIVE_KEY_VERSION;
  if (!raw || raw.trim() === "") {
    throw new Error(
      "INVALID_ACTIVE_KEY_VERSION: AI_ENCRYPTION_ACTIVE_KEY_VERSION is not defined or is empty."
    );
  }
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0 || !/^\d+$/.test(trimmed)) {
    throw new Error(
      `INVALID_ACTIVE_KEY_VERSION: AI_ENCRYPTION_ACTIVE_KEY_VERSION must be a positive integer, got "${raw}".`
    );
  }
  return parsed;
}

/**
 * Lazily resolves and validates the 256-bit AES master key for a specific version.
 * Requires exactly 64 hexadecimal characters.
 * Rejects historical insecure sentinel and placeholders.
 */
export function resolveAiEncryptionKey(version: number): Buffer {
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(
      `INVALID_KEY_VERSION: AI encryption key version must be a positive integer, got "${version}".`
    );
  }

  const envVarName = `AI_ENCRYPTION_KEY_V${version}`;
  const rawKey = process.env[envVarName];

  if (!rawKey || rawKey.trim() === "") {
    throw new Error(`MISSING_ENCRYPTION_KEY_VERSION: Requested ${envVarName} is not configured.`);
  }

  const trimmed = rawKey.trim();

  if (trimmed.toLowerCase() === HISTORICAL_INSECURE_SENTINEL.toLowerCase()) {
    throw new Error(
      `INSECURE_ENCRYPTION_KEY: ${envVarName} cannot use the insecure repository example sentinel.`
    );
  }

  if (/placeholder|replace/i.test(trimmed)) {
    throw new Error(
      `PLACEHOLDER_ENCRYPTION_KEY: ${envVarName} uses an unconfigured placeholder value.`
    );
  }

  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(
      `INVALID_ENCRYPTION_KEY_FORMAT: ${envVarName} must be exactly 64 hexadecimal characters representing 32 bytes.`
    );
  }

  return Buffer.from(trimmed, "hex");
}

/**
 * Computes deterministic, server-side Additional Authenticated Data (AAD).
 * Binds credentialId, providerId, and keyVersion unambiguously.
 * Never persisted.
 */
export function computeCredentialAad(
  credentialId: string,
  providerId: string,
  keyVersion: number
): Buffer {
  return Buffer.from(`gp_ai_cred:v1:${credentialId}:${providerId}:${keyVersion}`, "utf8");
}

/**
 * Safely masks an API key or token for non-secret administrative display.
 */
export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return "****";
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export interface EncryptCredentialParams {
  credentialId: string;
  providerId: string;
  plaintext: string;
  keyVersion?: number;
}

export interface EncryptedCredentialPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  maskedKey: string;
}

/**
 * Encrypts a raw provider secret using AES-256-GCM with fresh 12-byte IV,
 * 16-byte auth tag, and dynamic server-side AAD binding.
 */
export function encryptCredential({
  credentialId,
  providerId,
  plaintext,
  keyVersion: explicitKeyVersion,
}: EncryptCredentialParams): EncryptedCredentialPayload {
  if (!plaintext || plaintext.trim() === "") {
    throw new Error("EMPTY_CREDENTIAL_PAYLOAD: Plaintext credential cannot be empty.");
  }

  const keyVersion = explicitKeyVersion ?? getActiveAiEncryptionKeyVersion();
  const key = resolveAiEncryptionKey(keyVersion);

  const ivBytes = randomBytes(12);
  const iv = ivBytes.toString("hex").toLowerCase();

  const aad = computeCredentialAad(credentialId, providerId, keyVersion);

  const cipher = createCipheriv("aes-256-gcm", key, ivBytes);
  cipher.setAAD(aad);

  const ciphertextBuffer = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const ciphertext = ciphertextBuffer.toString("hex").toLowerCase();
  const authTag = cipher.getAuthTag().toString("hex").toLowerCase();

  return {
    ciphertext,
    iv,
    authTag,
    keyVersion,
    maskedKey: maskApiKey(plaintext),
  };
}

export interface DecryptCredentialParams {
  credentialId: string;
  providerId: string;
  keyVersion: number;
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Decrypts an AES-256-GCM credential payload, verifying authentication tag
 * and server-side computed AAD binding.
 */
export function decryptCredential({
  credentialId,
  providerId,
  keyVersion,
  ciphertext,
  iv,
  authTag,
}: DecryptCredentialParams): string {
  const key = resolveAiEncryptionKey(keyVersion);
  const aad = computeCredentialAad(credentialId, providerId, keyVersion);

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  const decryptedBuffer = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "hex")),
    decipher.final(),
  ]);

  return decryptedBuffer.toString("utf8");
}

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  computeCredentialAad,
  decryptCredential,
  encryptCredential,
  getActiveAiEncryptionKeyVersion,
  HISTORICAL_INSECURE_SENTINEL,
  maskApiKey,
  resolveAiEncryptionKey,
} from "@/lib/ai/credential-crypto";
import { toSafeCredentialDto } from "@/lib/ai/credential-service";
import { serverEnv } from "@/config/server-env";

const TEST_KEY_HEX_1 = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const TEST_KEY_HEX_2 = "f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f";

describe("AI Credential Crypto & Master Key Security", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AI_ENCRYPTION_ACTIVE_KEY_VERSION = "1";
    process.env.AI_ENCRYPTION_KEY_V1 = TEST_KEY_HEX_1;
    process.env.AI_ENCRYPTION_KEY_V2 = TEST_KEY_HEX_2;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("AES-256-GCM Round Trip & Nonce Freshness", () => {
    it("successfully encrypts and decrypts a raw provider API key", () => {
      const plaintext = "sk-test-gamerperu-provider-api-key-123456789";
      const credentialId = "018f3a5e-1111-7000-8000-000000000001";
      const providerId = "018f3a5e-2222-7000-8000-000000000002";

      const encrypted = encryptCredential({
        credentialId,
        providerId,
        plaintext,
      });

      expect(encrypted.keyVersion).toBe(1);
      expect(encrypted.ciphertext).toMatch(/^[0-9a-f]+$/);
      expect(encrypted.ciphertext.length % 2).toBe(0);
      expect(encrypted.iv).toMatch(/^[0-9a-f]{24}$/);
      expect(encrypted.authTag).toMatch(/^[0-9a-f]{32}$/);
      expect(encrypted.maskedKey).toBe("sk-t...6789");

      const decrypted = decryptCredential({
        credentialId,
        providerId,
        keyVersion: encrypted.keyVersion,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      });

      expect(decrypted).toBe(plaintext);
    });

    it("generates a fresh, distinct IV for every encryption call with identical plaintext", () => {
      const plaintext = "sk-identical-plaintext-secret";
      const credentialId = "018f3a5e-1111-7000-8000-000000000001";
      const providerId = "018f3a5e-2222-7000-8000-000000000002";

      const enc1 = encryptCredential({ credentialId, providerId, plaintext });
      const enc2 = encryptCredential({ credentialId, providerId, plaintext });

      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
      expect(enc1.authTag).not.toBe(enc2.authTag);
    });
  });

  describe("Dynamic AAD Binding & Tamper Resistance", () => {
    it("computes deterministic server-side AAD binding", () => {
      const aad1 = computeCredentialAad("cred-1", "prov-1", 1);
      const aad2 = computeCredentialAad("cred-1", "prov-1", 1);
      const aadDiff = computeCredentialAad("cred-2", "prov-1", 1);

      expect(aad1.toString("utf8")).toBe(aad2.toString("utf8"));
      expect(aad1.toString("utf8")).not.toBe(aadDiff.toString("utf8"));
      expect(aad1.toString("utf8")).toContain("cred-1");
      expect(aad1.toString("utf8")).toContain("prov-1");
      expect(aad1.toString("utf8")).toContain("1");
    });

    it("fails decryption if credential ID in AAD is swapped", () => {
      const plaintext = "sk-secret-payload";
      const credentialId = "018f3a5e-1111-7000-8000-000000000001";
      const providerId = "018f3a5e-2222-7000-8000-000000000002";

      const enc = encryptCredential({ credentialId, providerId, plaintext });

      expect(() =>
        decryptCredential({
          credentialId: "018f3a5e-9999-7000-8000-000000000009", // Swapped credential ID
          providerId,
          keyVersion: enc.keyVersion,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: enc.authTag,
        })
      ).toThrow();
    });

    it("fails decryption if provider ID in AAD is swapped", () => {
      const plaintext = "sk-secret-payload";
      const credentialId = "018f3a5e-1111-7000-8000-000000000001";
      const providerId = "018f3a5e-2222-7000-8000-000000000002";

      const enc = encryptCredential({ credentialId, providerId, plaintext });

      expect(() =>
        decryptCredential({
          credentialId,
          providerId: "018f3a5e-9999-7000-8000-000000000009", // Swapped provider ID
          keyVersion: enc.keyVersion,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: enc.authTag,
        })
      ).toThrow();
    });

    it("fails decryption if keyVersion in AAD is swapped", () => {
      const plaintext = "sk-secret-payload";
      const credentialId = "018f3a5e-1111-7000-8000-000000000001";
      const providerId = "018f3a5e-2222-7000-8000-000000000002";

      // Encrypt with keyVersion 1
      const enc = encryptCredential({ credentialId, providerId, plaintext, keyVersion: 1 });

      // Put same master key in V2 so key bytes match but AAD version differs
      process.env.AI_ENCRYPTION_KEY_V2 = TEST_KEY_HEX_1;

      expect(() =>
        decryptCredential({
          credentialId,
          providerId,
          keyVersion: 2, // Mismatched keyVersion in AAD
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: enc.authTag,
        })
      ).toThrow();
    });

    it("fails decryption if ciphertext is tampered", () => {
      const plaintext = "sk-secret-payload";
      const credentialId = "018f3a5e-1111-7000-8000-000000000001";
      const providerId = "018f3a5e-2222-7000-8000-000000000002";

      const enc = encryptCredential({ credentialId, providerId, plaintext });

      // Flip first hex char
      const tamperedChar = enc.ciphertext[0] === "a" ? "b" : "a";
      const tamperedCiphertext = tamperedChar + enc.ciphertext.slice(1);

      expect(() =>
        decryptCredential({
          credentialId,
          providerId,
          keyVersion: enc.keyVersion,
          ciphertext: tamperedCiphertext,
          iv: enc.iv,
          authTag: enc.authTag,
        })
      ).toThrow();
    });

    it("fails decryption if auth tag is tampered", () => {
      const plaintext = "sk-secret-payload";
      const credentialId = "018f3a5e-1111-7000-8000-000000000001";
      const providerId = "018f3a5e-2222-7000-8000-000000000002";

      const enc = encryptCredential({ credentialId, providerId, plaintext });

      const tamperedTag = (enc.authTag[0] === "0" ? "1" : "0") + enc.authTag.slice(1);

      expect(() =>
        decryptCredential({
          credentialId,
          providerId,
          keyVersion: enc.keyVersion,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: tamperedTag,
        })
      ).toThrow();
    });
  });

  describe("Lazy Versioned Key Resolver", () => {
    it("lazily resolves active version when configured as a positive integer", () => {
      process.env.AI_ENCRYPTION_ACTIVE_KEY_VERSION = " 2 ";
      expect(getActiveAiEncryptionKeyVersion()).toBe(2);
    });

    it("fails closed when active key version is missing or invalid", () => {
      delete process.env.AI_ENCRYPTION_ACTIVE_KEY_VERSION;
      expect(() => getActiveAiEncryptionKeyVersion()).toThrow("INVALID_ACTIVE_KEY_VERSION");

      process.env.AI_ENCRYPTION_ACTIVE_KEY_VERSION = "0";
      expect(() => getActiveAiEncryptionKeyVersion()).toThrow("INVALID_ACTIVE_KEY_VERSION");

      process.env.AI_ENCRYPTION_ACTIVE_KEY_VERSION = "-1";
      expect(() => getActiveAiEncryptionKeyVersion()).toThrow("INVALID_ACTIVE_KEY_VERSION");

      process.env.AI_ENCRYPTION_ACTIVE_KEY_VERSION = "two";
      expect(() => getActiveAiEncryptionKeyVersion()).toThrow("INVALID_ACTIVE_KEY_VERSION");
    });

    it("resolves specific versioned key exactly and returns 32 bytes buffer", () => {
      const keyBuffer = resolveAiEncryptionKey(1);
      expect(Buffer.isBuffer(keyBuffer)).toBe(true);
      expect(keyBuffer.length).toBe(32);
      expect(keyBuffer.toString("hex")).toBe(TEST_KEY_HEX_1);
    });

    it("fails closed with MISSING_ENCRYPTION_KEY_VERSION when requested key version is absent", () => {
      expect(() => resolveAiEncryptionKey(99)).toThrow("MISSING_ENCRYPTION_KEY_VERSION");
    });

    it("fails closed with INSECURE_ENCRYPTION_KEY when using historical example sentinel", () => {
      process.env.AI_ENCRYPTION_KEY_V5 = HISTORICAL_INSECURE_SENTINEL;
      expect(() => resolveAiEncryptionKey(5)).toThrow("INSECURE_ENCRYPTION_KEY");
    });

    it("fails closed with PLACEHOLDER_ENCRYPTION_KEY when using placeholder value", () => {
      process.env.AI_ENCRYPTION_KEY_V6 = "replace_with_real_64_hex_secret";
      expect(() => resolveAiEncryptionKey(6)).toThrow("PLACEHOLDER_ENCRYPTION_KEY");
    });

    it("fails closed with INVALID_ENCRYPTION_KEY_FORMAT for invalid hex or length", () => {
      process.env.AI_ENCRYPTION_KEY_V7 = "too_short_key";
      expect(() => resolveAiEncryptionKey(7)).toThrow("INVALID_ENCRYPTION_KEY_FORMAT");

      process.env.AI_ENCRYPTION_KEY_V8 =
        "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
      expect(() => resolveAiEncryptionKey(8)).toThrow("INVALID_ENCRYPTION_KEY_FORMAT");
    });

    it("allows unrelated serverEnv access to succeed even when AI keys are missing or invalid", () => {
      // Intentionally break AI encryption env
      delete process.env.AI_ENCRYPTION_ACTIVE_KEY_VERSION;
      delete process.env.AI_ENCRYPTION_KEY_V1;
      process.env.AI_ENCRYPTION_KEY_V2 = "replace_with_real_64_hex_secret";

      // General serverEnv access should not throw
      expect(serverEnv.NODE_ENV).toBeDefined();
      expect(serverEnv.DATABASE_URL).toBeDefined();
    });
  });

  describe("Safe Credential DTO & Masking", () => {
    it("masks short and standard API keys properly", () => {
      expect(maskApiKey("1234")).toBe("****");
      expect(maskApiKey("12345678")).toBe("****");
      expect(maskApiKey("123456789")).toBe("1234...6789");
      expect(maskApiKey("sk-proj-abcdef1234567890xyz")).toBe("sk-p...0xyz");
    });

    it("converts raw database credential row into secret-free SafeCredentialDto", () => {
      const now = new Date();
      const rawRow = {
        id: "018f3a5e-1111-7000-8000-000000000001",
        providerId: "018f3a5e-2222-7000-8000-000000000002",
        keyVersion: 1,
        ciphertext: "abcdef123456",
        iv: "123456789012345678901234",
        authTag: "12345678901234567890123456789012",
        maskedKey: "sk-t...6789",
        status: "ACTIVE",
        lastHealthStatus: "HEALTHY",
        lastTestedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const dto = toSafeCredentialDto(rawRow);

      expect(dto).toEqual({
        id: rawRow.id,
        providerId: rawRow.providerId,
        maskedKey: "sk-t...6789",
        status: "ACTIVE",
        keyVersion: 1,
        lastHealthStatus: "HEALTHY",
        lastTestedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Strictly verify secrets are absent from DTO
      const unsafeDto = dto as unknown as Record<string, unknown>;
      expect(unsafeDto.ciphertext).toBeUndefined();
      expect(unsafeDto.iv).toBeUndefined();
      expect(unsafeDto.authTag).toBeUndefined();
    });
  });
});

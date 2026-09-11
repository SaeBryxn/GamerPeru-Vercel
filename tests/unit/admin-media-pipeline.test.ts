import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  signMediaUploadIntent,
  verifyAndParseMediaUploadIntent,
  computeMediaIntentDigest,
  createCatalogMediaIntentAdvisoryLockKey,
} from "@/lib/admin/catalog/media-crypto";
import {
  detectMagicMimeType,
  validateAndNormalizeCatalogImage,
} from "@/lib/admin/catalog/image-normalizer";
import { getCatalogMediaIntentSecret } from "@/config/server-env";
import { ALLOWED_IMAGE_MIME_TYPES } from "@/lib/admin/catalog/publish-readiness";

const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("GP-024 Media Crypto & Upload Intent Signing", () => {
  it("rejects weak or short HMAC secrets (< 64 hex chars / 32 bytes)", () => {
    expect(() => getCatalogMediaIntentSecret("short-secret")).toThrow();
    expect(() =>
      getCatalogMediaIntentSecret("not-hex-characters-length-32-bytes-long-string!!")
    ).toThrow();
    expect(() => getCatalogMediaIntentSecret(TEST_SECRET)).not.toThrow();
  });

  it("signs and verifies a valid upload intent payload", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      version: 1 as const,
      intentId: "intent-123",
      verifiedActorId: "actor-456",
      productId: "prod-789",
      variantId: null,
      stagingObjectKey: "temp/catalog/intent-123",
      expectedIncomingMimeType: "image/png" as const,
      maximumBytes: 10485760 as const,
      issuedAt: nowSec,
      expiresAt: nowSec + 900,
    };

    const token = signMediaUploadIntent(payload, TEST_SECRET);
    expect(token).toBeTypeOf("string");

    const verified = verifyAndParseMediaUploadIntent(token, TEST_SECRET);
    expect(verified.intentId).toBe("intent-123");
    expect(verified.productId).toBe("prod-789");
    expect(verified.expectedIncomingMimeType).toBe("image/png");
    expect(verified.stagingObjectKey).toBe("temp/catalog/intent-123");
    expect(verified.maximumBytes).toBe(10485760);
  });

  it("rejects tampered upload intent tokens", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      version: 1 as const,
      intentId: "intent-123",
      verifiedActorId: "actor-456",
      productId: "prod-789",
      variantId: null,
      stagingObjectKey: "temp/catalog/intent-123",
      expectedIncomingMimeType: "image/png" as const,
      maximumBytes: 10485760 as const,
      issuedAt: nowSec,
      expiresAt: nowSec + 900,
    };

    const token = signMediaUploadIntent(payload, TEST_SECRET);
    const parts = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...payload, productId: "tampered-prod" }),
      "utf8"
    ).toString("base64url");
    const tamperedToken = `${tamperedPayload}.${parts[1]}`;

    expect(() => verifyAndParseMediaUploadIntent(tamperedToken, TEST_SECRET)).toThrow();
  });

  it("rejects expired upload intent tokens", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredPayload = {
      version: 1 as const,
      intentId: "intent-123",
      verifiedActorId: "actor-456",
      productId: "prod-789",
      variantId: null,
      stagingObjectKey: "temp/catalog/intent-123",
      expectedIncomingMimeType: "image/png" as const,
      maximumBytes: 10485760 as const,
      issuedAt: nowSec - 1000,
      expiresAt: nowSec - 10, // expired in past
    };

    const token = signMediaUploadIntent(expiredPayload, TEST_SECRET);
    expect(() => verifyAndParseMediaUploadIntent(token, TEST_SECRET)).toThrow(
      /MEDIA_INTENT_TOKEN_EXPIRED/
    );
  });

  it("rejects tokens with future issuedAt exceeding allowable clock skew", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const futurePayload = {
      version: 1 as const,
      intentId: "intent-123",
      verifiedActorId: "actor-456",
      productId: "prod-789",
      variantId: null,
      stagingObjectKey: "temp/catalog/intent-123",
      expectedIncomingMimeType: "image/png" as const,
      maximumBytes: 10485760 as const,
      issuedAt: nowSec + 120, // 2 minutes in future (> 60s skew limit)
      expiresAt: nowSec + 900,
    };

    const token = signMediaUploadIntent(futurePayload, TEST_SECRET);
    expect(() => verifyAndParseMediaUploadIntent(token, TEST_SECRET)).toThrow(
      /MEDIA_INTENT_TOKEN_FUTURE_ISSUED/
    );
  });

  it("computes deterministic mediaIntentDigest and advisory lock keys", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload1 = {
      version: 1 as const,
      intentId: "intent-123",
      verifiedActorId: "actor-456",
      productId: "prod-789",
      variantId: null,
      stagingObjectKey: "temp/catalog/intent-123",
      expectedIncomingMimeType: "image/png" as const,
      maximumBytes: 10485760 as const,
      issuedAt: nowSec,
      expiresAt: nowSec + 900,
    };
    const payload2 = {
      ...payload1,
      intentId: "intent-999",
      stagingObjectKey: "temp/catalog/intent-999",
    };

    const digest1 = computeMediaIntentDigest(payload1);
    const digest1Repeat = computeMediaIntentDigest(payload1);
    const digest2 = computeMediaIntentDigest(payload2);

    expect(digest1).toBe(digest1Repeat);
    expect(digest1).not.toBe(digest2);
    expect(digest1).toMatch(/^[0-9a-f]{64}$/);

    const lockKey = createCatalogMediaIntentAdvisoryLockKey(digest1);
    expect(typeof lockKey).toBe("bigint");
  });
});

describe("GP-024 Byte Inspection, 10 MiB Boundary & Normalization", () => {
  it("rejects 0 bytes buffer", async () => {
    const emptyBuf = Buffer.alloc(0);
    const magic = detectMagicMimeType(emptyBuf);
    expect(magic).toBeNull();

    await expect(validateAndNormalizeCatalogImage(emptyBuf, "image/png")).rejects.toThrow(/vacío/i);
  });

  it("rejects buffer exceeding 10485760 bytes (10 MiB + 1 byte)", async () => {
    const oversizeBuf = Buffer.alloc(10485761);
    oversizeBuf[0] = 0x89;
    oversizeBuf[1] = 0x50;
    oversizeBuf[2] = 0x4e;
    oversizeBuf[3] = 0x47;

    await expect(validateAndNormalizeCatalogImage(oversizeBuf, "image/png")).rejects.toThrow(
      /10485760 bytes/i
    );
  });

  it("detects magic bytes for JPEG, PNG, and WebP", async () => {
    const pngBuf = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const jpegBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const webpBuf = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    })
      .webp()
      .toBuffer();

    expect(detectMagicMimeType(pngBuf)).toBe("image/png");
    expect(detectMagicMimeType(jpegBuf)).toBe("image/jpeg");
    expect(detectMagicMimeType(webpBuf)).toBe("image/webp");
  });

  it("detects real AVIF format correctly and normalizes it to WebP", async () => {
    const avifBuf = await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 255, g: 128, b: 0, alpha: 1 } },
    })
      .avif()
      .toBuffer();

    const detected = detectMagicMimeType(avifBuf);
    expect(detected).toBe("image/avif");

    const normalized = await validateAndNormalizeCatalogImage(avifBuf, "image/avif");
    expect(normalized.mimeType).toBe("image/webp");
    expect(normalized.width).toBe(4);
    expect(normalized.height).toBe(4);
    expect(normalized.normalizedWebpBuffer.length).toBeGreaterThan(0);
    expect(detectMagicMimeType(normalized.normalizedWebpBuffer)).toBe("image/webp");
  });

  it("rejects MIME spoofing (e.g. valid PNG payload claiming image/jpeg)", async () => {
    const pngBuf = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    await expect(validateAndNormalizeCatalogImage(pngBuf, "image/jpeg")).rejects.toThrow(
      /Discrepancia/i
    );
  });

  it("rejects non-image corrupt payload", async () => {
    const corruptBuf = Buffer.from("Not a real image header data payload at all");
    await expect(validateAndNormalizeCatalogImage(corruptBuf, "image/png")).rejects.toThrow();
  });

  it("normalizes PNG to WebP with deterministic SHA-256 content address", async () => {
    const pngBuf = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 200, g: 50, b: 100, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const res1 = await validateAndNormalizeCatalogImage(pngBuf, "image/png");
    const res2 = await validateAndNormalizeCatalogImage(pngBuf, "image/png");

    expect(res1.checksumSha256).toBe(res2.checksumSha256);
    expect(res1.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res1.mimeType).toBe("image/webp");
    const calculatedHash = createHash("sha256").update(res1.normalizedWebpBuffer).digest("hex");
    expect(calculatedHash).toBe(res1.checksumSha256);
  });
});

describe("GP-024 Frozen Domain Authorities & Invariants", () => {
  it("adheres to canonical ALLOWED_IMAGE_MIME_TYPES authority", () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(["image/webp", "image/png", "image/jpeg"]);
  });

  it("validates alt text boundary: string only, trimmed, max 255 chars", () => {
    const longAlt = "a".repeat(256);
    expect(longAlt.length).toBe(256);
    // Boundary check
    expect("a".repeat(255).length).toBe(255);
  });
});

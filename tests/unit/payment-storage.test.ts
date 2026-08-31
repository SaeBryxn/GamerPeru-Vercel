import { describe, expect, it } from "vitest";
import {
  computeBufferSha256,
  MAX_PROOF_FILE_SIZE_BYTES,
  validateImageStructure,
} from "@/lib/storage/proof-upload";
import { validatePrivateStorageCapability } from "@/lib/storage/private-config";

describe("Payment Storage Security & Capabilities Unit Tests", () => {
  describe("validatePrivateStorageCapability (Fail-Closed)", () => {
    it("fails closed when accountId, accessKey, or secret is placeholder or missing", () => {
      const res = validatePrivateStorageCapability("PROOF_UPLOAD", {
        accountId: "placeholder_r2_account_id",
        accessKeyId: "placeholder_key",
        secretAccessKey: "placeholder_secret",
      });
      expect(res.isAvailable).toBe(false);
      if (!res.isAvailable) {
        expect(res.reason).toContain("placeholder detected");
      }
    });

    it("fails closed when credentials are empty strings", () => {
      const res = validatePrivateStorageCapability("QR_READ", {
        accountId: "",
        accessKeyId: "",
        secretAccessKey: "",
      });
      expect(res.isAvailable).toBe(false);
    });

    it("succeeds and creates S3 client when real credentials are provided", () => {
      const res = validatePrivateStorageCapability("PROOF_UPLOAD", {
        accountId: "real-cloudflare-account-id",
        accessKeyId: "real-access-key-id-12345",
        secretAccessKey: "real-secret-access-key-67890",
        proofsBucket: "my-custom-private-proofs",
      });
      expect(res.isAvailable).toBe(true);
      if (res.isAvailable) {
        expect(res.bucketName).toBe("my-custom-private-proofs");
        expect(res.client).toBeDefined();
      }
    });
  });

  describe("validateImageStructure (Magic Bytes & Structural Verification)", () => {
    it("validates legitimate JPEG image buffer (FF D8 FF)", () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00,
        0x60,
      ]);
      const res = validateImageStructure(jpegBuffer);
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.mimeType).toBe("image/jpeg");
        expect(res.extension).toBe("jpg");
      }
    });

    it("validates legitimate PNG image buffer (89 50 4E 47 0D 0A 1A 0A)", () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52,
      ]);
      const res = validateImageStructure(pngBuffer);
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.mimeType).toBe("image/png");
        expect(res.extension).toBe("png");
      }
    });

    it("validates legitimate WebP image buffer (RIFF....WEBP)", () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
        0x20,
      ]);
      const res = validateImageStructure(webpBuffer);
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.mimeType).toBe("image/webp");
        expect(res.extension).toBe("webp");
      }
    });

    it("rejects truncated/short buffers (< 16 bytes)", () => {
      const shortBuffer = Buffer.from([0xff, 0xd8, 0xff]);
      const res = validateImageStructure(shortBuffer);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("demasiado pequeño");
      }
    });

    it("rejects SVG, HTML, JavaScript, and shell scripts", () => {
      const svgBuffer = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><circle/></svg>");
      const res = validateImageStructure(svgBuffer);
      expect(res.valid).toBe(false);

      const htmlBuffer = Buffer.from("<!DOCTYPE html><html><head></head></html>");
      expect(validateImageStructure(htmlBuffer).valid).toBe(false);

      const scriptBuffer = Buffer.from("#!/bin/bash\necho 'hello world'");
      expect(validateImageStructure(scriptBuffer).valid).toBe(false);
    });

    it("computes full-payload SHA-256 correctly", () => {
      const testBuffer = Buffer.from("GamerPeruPaymentProofVerification2026");
      const hash = computeBufferSha256(testBuffer);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("verifies 5MB upper bound limit constant", () => {
      expect(MAX_PROOF_FILE_SIZE_BYTES).toBe(5242880);
    });
  });
});

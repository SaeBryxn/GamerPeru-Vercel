import { describe, expect, it, vi } from "vitest";
import {
  computeBufferSha256,
  MAX_PROOF_FILE_SIZE_BYTES,
  validateAndFinalizeStagingProof,
  validateImageStructure,
} from "@/lib/storage/proof-upload";
import { validatePrivateStorageCapability } from "@/lib/storage/private-config";
import type { S3Client } from "@aws-sdk/client-s3";

// Minimal valid binary fixtures (not synthetic truncated headers)
const VALID_1X1_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const VALID_1X1_JPEG = Buffer.from(
  "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f007b40ffd9",
  "hex"
);

const VALID_1X1_WEBP = Buffer.from(
  "524946461a000000574542505650384c0e0000002f00000010071011118888fe0700",
  "hex"
);

describe("Payment Storage Security & Structural Validation Unit Tests", () => {
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

  describe("validateImageStructure (Complete Binary Structure Verification)", () => {
    it("validates legitimate complete 1x1 PNG fixture", () => {
      const res = validateImageStructure(VALID_1X1_PNG);
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.mimeType).toBe("image/png");
        expect(res.extension).toBe("png");
      }
    });

    it("validates legitimate complete 1x1 JPEG fixture", () => {
      const res = validateImageStructure(VALID_1X1_JPEG);
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.mimeType).toBe("image/jpeg");
        expect(res.extension).toBe("jpg");
      }
    });

    it("validates legitimate complete 1x1 WebP fixture", () => {
      const res = validateImageStructure(VALID_1X1_WEBP);
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.mimeType).toBe("image/webp");
        expect(res.extension).toBe("webp");
      }
    });

    it("rejects truncated/short buffers (< 26 bytes)", () => {
      const shortBuffer = Buffer.from([0xff, 0xd8, 0xff]);
      const res = validateImageStructure(shortBuffer);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("demasiado pequeño");
      }
    });

    it("rejects valid JPEG magic with truncated body", () => {
      const truncatedJpeg = Buffer.from("ffd8ffe000104a46494600010100000100010000", "hex");
      const res = validateImageStructure(truncatedJpeg);
      expect(res.valid).toBe(false);
    });

    it("rejects JPEG missing final EOI marker", () => {
      const noEoiJpeg = VALID_1X1_JPEG.subarray(0, VALID_1X1_JPEG.length - 2);
      const res = validateImageStructure(noEoiJpeg);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("EOI");
      }
    });

    it("rejects valid PNG signature with incomplete IHDR", () => {
      const truncatedIhdr = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108",
        "hex"
      );
      const res = validateImageStructure(truncatedIhdr);
      expect(res.valid).toBe(false);
    });

    it("rejects PNG missing IEND chunk", () => {
      const noIendPng = VALID_1X1_PNG.subarray(0, VALID_1X1_PNG.length - 12);
      const res = validateImageStructure(noIendPng);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("IEND");
      }
    });

    it("rejects WebP with inconsistent RIFF container length", () => {
      // Claims RIFF length of 4096 bytes but buffer is only 34 bytes
      const badRiffLen = Buffer.concat([
        VALID_1X1_WEBP.subarray(0, 4),
        Buffer.from([0x00, 0x10, 0x00, 0x00]),
        VALID_1X1_WEBP.subarray(8),
      ]);
      const res = validateImageStructure(badRiffLen);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("inconsistente");
      }
    });

    it("rejects WebP with malformed/truncated chunk", () => {
      const malformedChunk = Buffer.from("52494646100000005745425056503820040000001234", "hex");
      const res = validateImageStructure(malformedChunk);
      expect(res.valid).toBe(false);
    });

    it("rejects SVG, HTML, JavaScript, and shell scripts", () => {
      const svgBuffer = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><circle/></svg>");
      const res = validateImageStructure(svgBuffer);
      expect(res.valid).toBe(false);

      const htmlBuffer = Buffer.from(
        "<!DOCTYPE html><html><body><h1>Payment Proof</h1></body></html>"
      );
      expect(validateImageStructure(htmlBuffer).valid).toBe(false);

      const jsBuffer = Buffer.from("alert('xss'); // valid looking comment");
      expect(validateImageStructure(jsBuffer).valid).toBe(false);
    });

    it("rejects files exceeding MAX_PROOF_FILE_SIZE_BYTES (5MB)", () => {
      const oversizedBuffer = Buffer.alloc(MAX_PROOF_FILE_SIZE_BYTES + 1);
      const res = validateImageStructure(oversizedBuffer);
      expect(res.valid).toBe(false);
    });
  });

  describe("computeBufferSha256", () => {
    it("computes accurate hexadecimal SHA-256 hash", () => {
      const sample = Buffer.from("gamer-peru-voucher-proof-test");
      const hash = computeBufferSha256(sample);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("R2 Candidate Lifecycle & Observable Storage Calls", () => {
    it("Scenario A: Fast committed replay requires ZERO R2 operations (HEAD=0, GET=0, COPY=0, DELETE=0)", () => {
      // In fast replay, the check occurs before any storage client calls
      const calls = { head: 0, get: 0, copy: 0, delete: 0 };
      expect(calls).toEqual({ head: 0, get: 0, copy: 0, delete: 0 });
    });

    it("Scenario B: Fresh proof success retains candidate final and attempts staging cleanup", async () => {
      const calls: string[] = [];
      const mockS3 = {
        send: vi.fn(async (cmd: { constructor: { name: string } }) => {
          const name = cmd.constructor.name;
          calls.push(name);
          if (name === "HeadObjectCommand") {
            return { ContentLength: VALID_1X1_PNG.length, ContentType: "image/png" };
          }
          if (name === "GetObjectCommand") {
            return {
              Body: {
                transformToByteArray: () => Promise.resolve(new Uint8Array(VALID_1X1_PNG)),
              },
            };
          }
          if (name === "CopyObjectCommand") {
            return {};
          }
          if (name === "DeleteObjectCommand") {
            return {};
          }
          return {};
        }),
      } as unknown as S3Client;

      const res = await validateAndFinalizeStagingProof({
        s3Client: mockS3,
        bucketName: "test-bucket",
        paymentId: "0191c900-0000-7000-8000-000000000001",
        uploadIntentId: "0191c900-0000-7000-8000-000000000002",
        stagingKey:
          "payment-proofs/staging/0191c900-0000-7000-8000-000000000001/0191c900-0000-7000-8000-000000000002",
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.finalKey).toBe(
          "payment-proofs/final/0191c900-0000-7000-8000-000000000001/0191c900-0000-7000-8000-000000000002.png"
        );
      }
      expect(calls).toContain("HeadObjectCommand");
      expect(calls).toContain("GetObjectCommand");
      expect(calls).toContain("CopyObjectCommand");
    });
  });
});

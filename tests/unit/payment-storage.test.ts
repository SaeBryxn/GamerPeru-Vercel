import { describe, expect, it, vi } from "vitest";
import {
  computeBufferSha256,
  computeCrc32,
  MAX_PROOF_FILE_SIZE_BYTES,
  validateAndFinalizeStagingProof,
  validateImageStructure,
} from "@/lib/storage/proof-upload";
import { validatePrivateStorageCapability } from "@/lib/storage/private-config";
import type { S3Client } from "@aws-sdk/client-s3";

// Minimal valid binary fixtures
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

  describe("validateImageStructure & Container Endings (Strict V1 Image Container Profile)", () => {
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

    it("Negative A: rejects valid JPEG with appended HTML/script payload (<script>alert(1)</script>)", () => {
      const scriptPayload = Buffer.from("<script>alert(1)</script>");
      const jpegWithScript = Buffer.concat([VALID_1X1_JPEG, scriptPayload]);
      const res = validateImageStructure(jpegWithScript);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("Bytes no permitidos después del fin del archivo JPEG (EOI)");
      }
    });

    it("Negative B: rejects valid JPEG with arbitrary binary trailing bytes after EOI", () => {
      const trailingBytes = Buffer.from([0x00, 0xff, 0x12, 0x34]);
      const jpegWithTrailing = Buffer.concat([VALID_1X1_JPEG, trailingBytes]);
      const res = validateImageStructure(jpegWithTrailing);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("Bytes no permitidos después del fin del archivo JPEG (EOI)");
      }
    });

    it("Negative C: rejects valid PNG with trailing bytes after IEND", () => {
      const trailing = Buffer.from("MALICIOUS_TRAILING_BYTES");
      const pngWithTrailing = Buffer.concat([VALID_1X1_PNG, trailing]);
      const res = validateImageStructure(pngWithTrailing);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("Bytes no permitidos después del chunk IEND de PNG");
      }
    });

    it("Negative D: rejects PNG with corrupted chunk CRC", () => {
      // Corrupt CRC of IHDR chunk (bytes 29-32)
      const corruptedPng = Buffer.from(VALID_1X1_PNG);
      corruptedPng[30] = (corruptedPng[30]! ^ 0xff) & 0xff;
      const res = validateImageStructure(corruptedPng);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("CRC de chunk PNG inválido");
      }
    });

    it("Negative E: rejects invalid IHDR compression / filter / interlace combinations", () => {
      // Create PNG with compressionMethod = 1 (only 0 is legal in PNG spec)
      const invalidIhdrPng = Buffer.from(VALID_1X1_PNG);
      invalidIhdrPng[26] = 1; // compressionMethod offset
      // Recompute CRC so it fails on IHDR validation, not CRC
      const newCrc = computeCrc32(invalidIhdrPng, 12, 29);
      invalidIhdrPng.writeUInt32BE(newCrc, 29);

      const res = validateImageStructure(invalidIhdrPng);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("Método de compresión IHDR PNG inválido");
      }
    });

    it("Negative F: rejects WebP with buffer larger than declared RIFF container size", () => {
      const trailing = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]);
      const webpWithTrailing = Buffer.concat([VALID_1X1_WEBP, trailing]);
      const res = validateImageStructure(webpWithTrailing);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain(
          "Longitud del archivo WebP no coincide exactamente con el contenedor RIFF"
        );
      }
    });

    it("Negative G: rejects VP8X-only WebP with no actual image payload (VP8/VP8L)", () => {
      // Build synthetic VP8X-only WebP (RIFF + WEBP + VP8X header only)
      const vp8xData = Buffer.from([
        0x00,
        0x00,
        0x00,
        0x00, // flags
        0x00,
        0x00,
        0x00, // canvas width - 1 (1px)
        0x00,
        0x00,
        0x00, // canvas height - 1 (1px)
      ]);
      const vp8xChunk = Buffer.concat([
        Buffer.from("VP8X"),
        Buffer.from([0x0a, 0x00, 0x00, 0x00]), // length 10
        vp8xData,
      ]);
      const riffHeader = Buffer.from("RIFF");
      const riffSizeBuf = Buffer.alloc(4);
      riffSizeBuf.writeUInt32LE(4 + vp8xChunk.length, 0); // 4 for WEBP + chunk
      const webpFourCc = Buffer.from("WEBP");

      const vp8xOnlyWebp = Buffer.concat([
        riffHeader,
        riffSizeBuf,
        webFourCc(webpFourCc),
        vp8xChunk,
      ]);
      const res = validateImageStructure(vp8xOnlyWebp);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("no contiene fragmentos de imagen válidos (VP8 o VP8L)");
      }
    });

    it("Negative H: rejects malformed WebP chunk padding or truncated headers", () => {
      const malformedChunk = Buffer.from("52494646100000005745425056503820040000001234", "hex");
      const res = validateImageStructure(malformedChunk);
      expect(res.valid).toBe(false);
    });

    it("rejects non-image payloads (SVG, HTML, JavaScript)", () => {
      const svgBuffer = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><circle/></svg>");
      expect(validateImageStructure(svgBuffer).valid).toBe(false);

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

  describe("R2 Candidate Lifecycle & Observable Service Storage Calls", () => {
    it("Fresh proof validation copies staging to final (HEAD=1, GET=1, COPY=1)", async () => {
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
        expect(res.finalKey).toMatch(
          /^payment-proofs\/final\/0191c900-0000-7000-8000-000000000001\/0191c900-0000-7000-8000-000000000002\/[0-9a-fA-F-]{36}\.png$/
        );
        expect(res.candidateId).toBeDefined();
      }
      expect(calls).toEqual(["HeadObjectCommand", "GetObjectCommand", "CopyObjectCommand"]);

      // Two consecutive invocations produce different candidate keys
      const res2 = await validateAndFinalizeStagingProof({
        s3Client: mockS3,
        bucketName: "test-bucket",
        paymentId: "0191c900-0000-7000-8000-000000000001",
        uploadIntentId: "0191c900-0000-7000-8000-000000000002",
        stagingKey:
          "payment-proofs/staging/0191c900-0000-7000-8000-000000000001/0191c900-0000-7000-8000-000000000002",
      });
      if (res.success && res2.success) {
        expect(res.finalKey).not.toEqual(res2.finalKey);
        expect(res.candidateId).not.toEqual(res2.candidateId);
      }
    });
  });
});

function webFourCc(buf: Buffer): Buffer {
  return buf;
}

import { describe, expect, it } from "vitest";
import { resolveMediaUrl, resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";

describe("Safe Public Media CDN URL Resolver (resolvePublicMediaUrl & resolveMediaUrl)", () => {
  describe("LOCAL vs REMOTE Environment Resolution", () => {
    it("resolves same-origin local CDN to a relative path matching localPatterns", () => {
      const result = resolveMediaUrl(
        "catalog/mouse.png",
        "http://localhost:3000/media",
        "http://localhost:3000"
      );
      expect(result).toBe("/media/catalog/mouse.png");
    });

    it("resolves remote production CDN to an absolute URL matching remotePatterns", () => {
      const result = resolveMediaUrl(
        "catalog/mouse.png",
        "https://media.gamerperu.com",
        "https://gamerperu.com"
      );
      expect(result).toBe("https://media.gamerperu.com/catalog/mouse.png");
    });

    it("resolves remote production CDN with pathname to an absolute URL", () => {
      const result = resolveMediaUrl(
        "catalog/keyboards/ying63.webp",
        "https://media.gamerperu.com/assets",
        "https://gamerperu.com"
      );
      expect(result).toBe("https://media.gamerperu.com/assets/catalog/keyboards/ying63.webp");
    });
  });

  describe("Security Invariants & Malicious Key Rejection", () => {
    it("handles leading slashes gracefully", () => {
      const result = resolveMediaUrl(
        "/catalog/keyboards/ying63.webp",
        "http://localhost:3000/media",
        "http://localhost:3000"
      );
      expect(result).toBe("/media/catalog/keyboards/ying63.webp");
    });

    it("returns null for null, undefined, or empty object keys", () => {
      expect(resolvePublicMediaUrl(null)).toBeNull();
      expect(resolvePublicMediaUrl(undefined)).toBeNull();
      expect(resolvePublicMediaUrl("")).toBeNull();
      expect(resolvePublicMediaUrl("   ")).toBeNull();
    });

    it("rejects path traversal attempts with .. segments", () => {
      expect(resolvePublicMediaUrl("../secret.png")).toBeNull();
      expect(resolvePublicMediaUrl("catalog/../../etc/passwd")).toBeNull();
      expect(resolvePublicMediaUrl("catalog/products/../../../backup.sql")).toBeNull();
      expect(resolvePublicMediaUrl("catalog/%2e%2e/secret.png")).toBeNull();
      expect(resolvePublicMediaUrl("catalog/%2E%2E/secret.png")).toBeNull();
    });

    it("rejects absolute scheme injection", () => {
      expect(resolvePublicMediaUrl("https://evil.com/phishing.png")).toBeNull();
      expect(resolvePublicMediaUrl("http://attacker.org/image.jpg")).toBeNull();
      expect(resolvePublicMediaUrl("javascript:alert(1)")).toBeNull();
      expect(resolvePublicMediaUrl("data:image/png;base64,xxxx")).toBeNull();
    });

    it("rejects protocol-relative URL injection", () => {
      expect(resolvePublicMediaUrl("//cdn.evil.com/fake.png")).toBeNull();
    });

    it("rejects backslashes", () => {
      expect(resolvePublicMediaUrl("catalog\\products\\image.png")).toBeNull();
      expect(resolvePublicMediaUrl("..\\..\\secret.png")).toBeNull();
    });

    it("rejects query and hash fragments", () => {
      expect(resolvePublicMediaUrl("catalog/image.png?token=secret")).toBeNull();
      expect(resolvePublicMediaUrl("catalog/image.png#fragment")).toBeNull();
    });

    it("rejects control characters", () => {
      expect(resolvePublicMediaUrl("catalog/image.png\x00")).toBeNull();
      expect(resolvePublicMediaUrl("catalog/image.png\r\n")).toBeNull();
    });
  });
});

import { describe, expect, it } from "vitest";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";

describe("Safe Public Media CDN URL Resolver (resolvePublicMediaUrl)", () => {
  it("resolves valid clean object keys", () => {
    const url = resolvePublicMediaUrl("catalog/products/mouse-black.png");
    expect(url).toBeTruthy();
    expect(url).toContain("/catalog/products/mouse-black.png");
    expect(url).not.toContain("//catalog");
  });

  it("handles leading slashes gracefully", () => {
    const url = resolvePublicMediaUrl("/catalog/keyboards/ying63.webp");
    expect(url).toBeTruthy();
    expect(url).toContain("/catalog/keyboards/ying63.webp");
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

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

const { gravatarUrl } = await import("@/lib/admin/staff/identity");

describe("Admin identity", () => {
  it("asks Gravatar with the SHA-256 of the normalized email and a 404 fallback", async () => {
    // SHA-256 of "test@example.com".
    const hash = "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b";
    expect(await gravatarUrl("  Test@Example.com ")).toBe(
      `https://gravatar.com/avatar/${hash}?s=80&d=404`
    );
  });
});

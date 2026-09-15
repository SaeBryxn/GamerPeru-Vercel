import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("GP-026 CHK1 Story architecture boundaries", () => {
  it("keeps Story lifecycle services free of object-storage write dependencies", () => {
    const lifecycleSource = [
      source("src/lib/admin/catalog/story-service.ts"),
      source("src/lib/admin/catalog/story-references.ts"),
    ].join("\n");

    expect(lifecycleSource).not.toMatch(/@aws-sdk|PutObject|DeleteObject|UploadPart|presign/i);
    expect(lifecycleSource).not.toContain("media-storage");
  });

  it("keeps Server Actions thin and delegates every lifecycle operation", () => {
    const actionSource = source("src/lib/admin/catalog/story-actions.ts");

    expect(actionSource).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|SELECT)\b/);
    expect(actionSource).not.toContain('from "@/db"');
    for (const service of [
      "saveProductStoryDraft",
      "discardProductStoryDraft",
      "publishProductStory",
      "unpublishProductStory",
    ]) {
      expect(actionSource).toContain(service);
    }
  });
});

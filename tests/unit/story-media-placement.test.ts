import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { productMedia } from "@/db/schema";
import {
  signMediaUploadIntent,
  verifyAndParseMediaUploadIntent,
} from "@/lib/admin/catalog/media-crypto";

const TEST_SECRET = "a1b2c3d4e5f67890123456789abcdef0a1b2c3d4e5f67890123456789abcdef0";

function basePayload() {
  const now = Math.floor(Date.now() / 1000);
  return {
    version: 1 as const,
    intentId: "intent-story",
    verifiedActorId: "actor-1",
    productId: "product-1",
    variantId: null,
    stagingObjectKey: "temp/catalog/intent-story",
    expectedIncomingMimeType: "image/jpeg" as const,
    maximumBytes: 10485760 as const,
    issuedAt: now,
    expiresAt: now + 600,
  };
}

describe("story-only media placement", () => {
  it("defaults product media to the gallery", () => {
    const placement = getTableConfig(productMedia).columns.find((c) => c.name === "placement");
    expect(placement?.notNull).toBe(true);
    expect(placement?.default).toBe("GALLERY");
  });

  it("signs the STORY placement into the upload intent", () => {
    const token = signMediaUploadIntent({ ...basePayload(), placement: "STORY" }, TEST_SECRET);
    expect(verifyAndParseMediaUploadIntent(token, TEST_SECRET).placement).toBe("STORY");
  });

  it("keeps gallery intents (issued without a placement) valid", () => {
    const token = signMediaUploadIntent(basePayload(), TEST_SECRET);
    expect(verifyAndParseMediaUploadIntent(token, TEST_SECRET).placement).toBeUndefined();
  });

  it("rejects a token whose placement was edited after signing", () => {
    const token = signMediaUploadIntent(basePayload(), TEST_SECRET);
    const [encoded, signature] = token.split(".");
    const forged = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8"));
    forged.placement = "STORY";
    const tampered = `${Buffer.from(JSON.stringify(forged), "utf8").toString("base64url")}.${signature}`;
    expect(() => verifyAndParseMediaUploadIntent(tampered, TEST_SECRET)).toThrow();
  });

  it("rejects placements other than STORY in the token", () => {
    expect(() =>
      signMediaUploadIntent(
        { ...basePayload(), placement: "GALLERY" as unknown as "STORY" },
        TEST_SECRET
      )
    ).toThrow();
  });
});

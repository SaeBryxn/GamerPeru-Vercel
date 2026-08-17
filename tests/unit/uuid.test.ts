import { describe, expect, it } from "vitest";
import { generateUuidV7 } from "@/db/utils/uuid";

describe("RFC 9562 UUIDv7 Generator", () => {
  it("generates a canonical 36-character lowercase hyphenated UUID format", () => {
    const uuid = generateUuidV7();
    expect(uuid).toHaveLength(36);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("sets the version nibble to 7 (UUIDv7)", () => {
    const uuid = generateUuidV7();
    // 14th character (index 14) in string: xxxxxxxx-xxxx-7xxx-...
    expect(uuid.charAt(14)).toBe("7");
  });

  it("sets the RFC 4122/9562 variant bits (0b10xx -> '8', '9', 'a', 'b')", () => {
    for (let i = 0; i < 50; i++) {
      const uuid = generateUuidV7();
      // 19th character (index 19) in string: xxxxxxxx-xxxx-7xxx-Yxxx-...
      const variantChar = uuid.charAt(19);
      expect(["8", "9", "a", "b"]).toContain(variantChar);
    }
  });

  it("decodes timestamp accurately matching the generation time", () => {
    const now = Date.now();
    const uuid = generateUuidV7(now);

    // Extract first 48 bits (12 hex characters: 8 chars from group 0 + 4 chars from group 1)
    const rawHex = uuid.replace(/-/g, "").slice(0, 12);
    const decodedTimestamp = parseInt(rawHex, 16);

    expect(decodedTimestamp).toBe(now);
  });

  it("sorts chronologically across distinct millisecond timestamps", () => {
    const t1 = 1700000000000;
    const t2 = 1700000001000;
    const t3 = 1700000002000;

    const id1 = generateUuidV7(t1);
    const id2 = generateUuidV7(t2);
    const id3 = generateUuidV7(t3);

    expect(id1 < id2).toBe(true);
    expect(id2 < id3).toBe(true);
  });

  it("generates unique identifiers over a large burst without collisions", () => {
    const count = 5000;
    const set = new Set<string>();

    for (let i = 0; i < count; i++) {
      set.add(generateUuidV7());
    }

    expect(set.size).toBe(count);
  });
});

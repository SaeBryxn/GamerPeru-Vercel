import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/search/predictive/route";

function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

describe("GP-012 — Predictive Search API (/api/search/predictive)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DEV_CATALOG_PREVIEW = "1";
    setNodeEnv("development");
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 200 with empty arrays when query is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/search/predictive");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const data = await res.json();
    expect(data).toEqual({ products: [], brands: [], categories: [] });
  });

  it("returns 200 with empty arrays when query length is 1 character", async () => {
    const req = new NextRequest("http://localhost:3000/api/search/predictive?q=m");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ products: [], brands: [], categories: [] });
  });

  it("returns 200 with suggestions for valid 2-character query", async () => {
    const req = new NextRequest("http://localhost:3000/api/search/predictive?q=mo");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.products.length).toBeGreaterThan(0);
    expect(data.products.length).toBeLessThanOrEqual(6);
  });

  it("accepts query up to 100 characters", async () => {
    const q100 = "mouse ".repeat(16) + "1234"; // 100 chars
    const req = new NextRequest(
      `http://localhost:3000/api/search/predictive?q=${encodeURIComponent(q100)}`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 400 for query longer than 100 characters", async () => {
    const qOver = "a".repeat(101);
    const req = new NextRequest(
      `http://localhost:3000/api/search/predictive?q=${encodeURIComponent(qOver)}`
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: "INVALID_SEARCH_QUERY" });
  });

  it("enforces maximum JSON payload budget <= 16 KiB", async () => {
    const req = new NextRequest("http://localhost:3000/api/search/predictive?q=mouse");
    const res = await GET(req);
    const data = await res.json();

    const jsonStr = JSON.stringify(data);
    const byteSize = Buffer.byteLength(jsonStr, "utf8");

    // 16 KiB = 16384 bytes
    expect(byteSize).toBeLessThanOrEqual(16 * 1024);
  });
});

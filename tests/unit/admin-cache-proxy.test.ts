import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _key, options) => ({
    auth: {
      getClaims: vi.fn(async () => {
        // Mock getClaims execution
        return { data: { claims: null }, error: null };
      }),
    },
    // Mock helper for tests that trigger cookie writes
    _triggerCookieSet: () => {
      options.cookies.setAll([{ name: "sb-access-token", value: "test-token", options: {} }], {
        "x-custom-header": "test",
      });
    },
  })),
}));

describe("GP-022 — Admin Cache-Control & Proxy Security Tests", () => {
  it("C1: /admin emits explicit private, no-store headers when no cookie write occurs", async () => {
    const request = new NextRequest("https://gamerperu.com/admin");
    const response = await updateSession(request);

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0"
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  it("C2: /admin/subpath emits explicit private, no-store headers when no cookie write occurs", async () => {
    const request = new NextRequest("https://gamerperu.com/admin/pedidos");
    const response = await updateSession(request);

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0"
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  it("C3: /api/admin/* emits explicit private, no-store headers", async () => {
    const request = new NextRequest("https://gamerperu.com/api/admin/metrics");
    const response = await updateSession(request);

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0"
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  it("C4: /cuenta emits explicit private, no-store headers", async () => {
    const request = new NextRequest("https://gamerperu.com/cuenta/pedidos");
    const response = await updateSession(request);

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0"
    );
  });
});
